use crate::models::STREAM_PORT;
use crate::network::stream_http_base;
use librqbit::{AddTorrent, AddTorrentOptions, AddTorrentResponse, ManagedTorrent, Session};
use parking_lot::Mutex;
use std::collections::hash_map::DefaultHasher;
use std::collections::HashMap;
use std::hash::{Hash, Hasher};
use std::path::PathBuf;
use std::sync::Arc;
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tokio::sync::OnceCell;

/// One playable file inside a managed torrent.
#[derive(Clone)]
pub struct TorrentEntry {
    pub handle: Arc<ManagedTorrent>,
    pub file_id: usize,
    pub file_len: u64,
    pub mime: String,
}

/// Embedded BitTorrent engine (librqbit) used to stream torrents in-app
/// without relying on a debrid provider.
pub struct TorrentEngine {
    download_dir: PathBuf,
    session: OnceCell<Arc<Session>>,
    entries: Mutex<HashMap<String, TorrentEntry>>,
}

impl TorrentEngine {
    pub fn new(download_dir: PathBuf) -> Self {
        Self {
            download_dir,
            session: OnceCell::new(),
            entries: Mutex::new(HashMap::new()),
        }
    }

    async fn session(&self) -> Result<Arc<Session>, String> {
        self.session
            .get_or_try_init(|| async {
                let _ = std::fs::create_dir_all(&self.download_dir);
                Session::new(self.download_dir.clone())
                    .await
                    .map_err(|e| format!("Motore torrent non avviabile: {e}"))
            })
            .await
            .cloned()
    }

    pub fn get(&self, id: &str) -> Option<TorrentEntry> {
        self.entries.lock().get(id).cloned()
    }

    pub fn playback_url(id: &str) -> String {
        format!("{}/torrent/{id}", stream_http_base())
    }

    /// Add a torrent (by info hash + optional trackers) and pick the file to
    /// stream. Returns the local playback URL served by our stream server.
    pub async fn resolve(
        &self,
        info_hash: &str,
        file_idx: Option<i32>,
        sources: &[String],
    ) -> Result<String, String> {
        let session = self.session().await?;
        let magnet = build_magnet(info_hash, sources);

        let resp = session
            .add_torrent(
                AddTorrent::from_url(&magnet),
                Some(AddTorrentOptions {
                    overwrite: true,
                    ..Default::default()
                }),
            )
            .await
            .map_err(|e| format!("Aggiunta torrent fallita: {e}"))?;

        let handle = match resp {
            AddTorrentResponse::Added(_, h) => h,
            AddTorrentResponse::AlreadyManaged(_, h) => h,
            AddTorrentResponse::ListOnly(_) => {
                return Err("Torrent senza metadati riproducibili".into())
            }
        };

        // Wait for the metadata (file list) to become available. For magnets
        // this requires connecting to a few peers first.
        let mut metadata = None;
        for _ in 0..100 {
            if let Some(m) = handle.metadata.load_full() {
                metadata = Some(m);
                break;
            }
            tokio::time::sleep(Duration::from_millis(300)).await;
        }
        let metadata = metadata.ok_or_else(|| {
            "Timeout nel recupero dei metadati del torrent (pochi o nessun peer).".to_string()
        })?;

        let files: Vec<(usize, String, u64)> = metadata
            .file_infos
            .iter()
            .enumerate()
            .map(|(i, fi)| {
                (
                    i,
                    fi.relative_filename.to_string_lossy().to_string(),
                    fi.len,
                )
            })
            .collect();

        if files.is_empty() {
            return Err("Il torrent non contiene file".into());
        }

        let (file_id, name, file_len) = match file_idx {
            Some(idx) if (idx as usize) < files.len() => files[idx as usize].clone(),
            _ => files
                .iter()
                .filter(|(_, name, _)| is_video(name))
                .max_by_key(|(_, _, len)| *len)
                .cloned()
                .or_else(|| files.iter().max_by_key(|(_, _, len)| *len).cloned())
                .ok_or_else(|| "Nessun file riproducibile nel torrent".to_string())?,
        };

        let mime = mime_for(&name);
        let id = make_id(info_hash, file_id);
        self.entries.lock().insert(
            id.clone(),
            TorrentEntry {
                handle,
                file_id,
                file_len,
                mime,
            },
        );

        Ok(Self::playback_url(&id))
    }
}

fn build_magnet(info_hash: &str, sources: &[String]) -> String {
    let mut magnet = format!("magnet:?xt=urn:btih:{info_hash}");
    for src in sources {
        let trimmed = src.trim();
        let tracker = trimmed.strip_prefix("tracker:").unwrap_or(trimmed);
        if tracker.starts_with("http") || tracker.starts_with("udp") {
            magnet.push_str("&tr=");
            magnet.push_str(&urlencoding::encode(tracker));
        } else if let Some(peer) = trimmed.strip_prefix("dht:") {
            let _ = peer;
        }
    }
    // A handful of reliable public trackers so single-hash magnets can find peers.
    for tr in DEFAULT_TRACKERS {
        magnet.push_str("&tr=");
        magnet.push_str(&urlencoding::encode(tr));
    }
    magnet
}

const DEFAULT_TRACKERS: &[&str] = &[
    "udp://tracker.opentrackr.org:1337/announce",
    "udp://open.demonii.com:1337/announce",
    "udp://tracker.openbittorrent.com:6969/announce",
    "udp://exodus.desync.com:6969/announce",
    "udp://tracker.torrent.eu.org:451/announce",
];

fn is_video(name: &str) -> bool {
    let n = name.to_lowercase();
    [
        ".mp4", ".mkv", ".avi", ".mov", ".m4v", ".webm", ".ts", ".flv", ".wmv", ".mpg", ".mpeg",
    ]
    .iter()
    .any(|ext| n.ends_with(ext))
}

fn mime_for(name: &str) -> String {
    let n = name.to_lowercase();
    if n.ends_with(".mp4") || n.ends_with(".m4v") {
        "video/mp4".into()
    } else if n.ends_with(".mkv") {
        "video/x-matroska".into()
    } else if n.ends_with(".webm") {
        "video/webm".into()
    } else if n.ends_with(".avi") {
        "video/x-msvideo".into()
    } else if n.ends_with(".mov") {
        "video/quicktime".into()
    } else if n.ends_with(".ts") || n.ends_with(".m2ts") {
        "video/mp2t".into()
    } else {
        "application/octet-stream".into()
    }
}

fn make_id(info_hash: &str, file_id: usize) -> String {
    let mut h = DefaultHasher::new();
    info_hash.hash(&mut h);
    file_id.hash(&mut h);
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos()
        .hash(&mut h);
    format!("{:016x}", h.finish())
}
