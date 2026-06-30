use reqwest::blocking::Client;
use serde::{Deserialize, Serialize};
use std::thread::sleep;
use std::time::Duration;

const RD_BASE: &str = "https://api.real-debrid.com/rest/1.0";
const AD_BASE: &str = "https://api.alldebrid.com/v4";
const AD_AGENT: &str = "Branchefy";

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct DebridConfig {
    /// "none" | "realdebrid" | "alldebrid"
    pub provider: String,
    pub api_key: String,
}

impl DebridConfig {
    pub fn is_enabled(&self) -> bool {
        self.provider != "none" && !self.provider.is_empty() && !self.api_key.is_empty()
    }
}

fn client() -> Result<Client, String> {
    Client::builder()
        .timeout(Duration::from_secs(30))
        .user_agent("Branchefy/0.1")
        .build()
        .map_err(|e| e.to_string())
}

fn build_magnet(info_hash: &str, sources: &[String]) -> String {
    let mut magnet = format!("magnet:?xt=urn:btih:{info_hash}");
    for src in sources {
        let trimmed = src.trim();
        if let Some(tracker) = trimmed.strip_prefix("tracker:") {
            magnet.push_str("&tr=");
            magnet.push_str(&urlencoding::encode(tracker));
        } else if trimmed.starts_with("http") || trimmed.starts_with("udp") {
            magnet.push_str("&tr=");
            magnet.push_str(&urlencoding::encode(trimmed));
        }
    }
    magnet
}

/// Validate that the configured key works. Returns the account username.
pub fn validate(config: &DebridConfig) -> Result<String, String> {
    if !config.is_enabled() {
        return Err("Nessun provider debrid configurato".into());
    }
    match config.provider.as_str() {
        "realdebrid" => rd_validate(&config.api_key),
        "alldebrid" => ad_validate(&config.api_key),
        other => Err(format!("Provider debrid sconosciuto: {other}")),
    }
}

/// Resolve a torrent (by info hash) into a directly playable HTTP url.
pub fn resolve(
    config: &DebridConfig,
    info_hash: &str,
    file_idx: Option<i32>,
    sources: &[String],
) -> Result<String, String> {
    if !config.is_enabled() {
        return Err("Nessun provider debrid configurato".into());
    }
    match config.provider.as_str() {
        "realdebrid" => rd_resolve(&config.api_key, info_hash, file_idx, sources),
        "alldebrid" => ad_resolve(&config.api_key, info_hash, file_idx, sources),
        other => Err(format!("Provider debrid sconosciuto: {other}")),
    }
}

// ---------------------------------------------------------------------------
// Real-Debrid
// ---------------------------------------------------------------------------

#[derive(Deserialize)]
struct RdUser {
    username: String,
}

#[derive(Deserialize)]
struct RdAddMagnet {
    id: String,
}

#[derive(Deserialize)]
struct RdFile {
    id: i64,
    #[serde(default)]
    bytes: i64,
    #[serde(default)]
    path: String,
}

#[derive(Deserialize)]
struct RdTorrentInfo {
    #[serde(default)]
    status: String,
    #[serde(default)]
    files: Vec<RdFile>,
    #[serde(default)]
    links: Vec<String>,
}

#[derive(Deserialize)]
struct RdUnrestrict {
    download: String,
}

fn rd_validate(key: &str) -> Result<String, String> {
    let c = client()?;
    let resp = c
        .get(format!("{RD_BASE}/user"))
        .bearer_auth(key)
        .send()
        .map_err(|e| e.to_string())?;
    if !resp.status().is_success() {
        return Err(format!(
            "Real-Debrid: chiave non valida (HTTP {})",
            resp.status()
        ));
    }
    let user: RdUser = resp.json().map_err(|e| e.to_string())?;
    Ok(user.username)
}

fn is_video_path(path: &str) -> bool {
    let p = path.to_lowercase();
    [
        ".mp4", ".mkv", ".avi", ".mov", ".m4v", ".webm", ".ts", ".flv", ".wmv",
    ]
    .iter()
    .any(|ext| p.ends_with(ext))
}

fn rd_resolve(
    key: &str,
    info_hash: &str,
    file_idx: Option<i32>,
    sources: &[String],
) -> Result<String, String> {
    let c = client()?;
    let magnet = build_magnet(info_hash, sources);

    let add: RdAddMagnet = c
        .post(format!("{RD_BASE}/torrents/addMagnet"))
        .bearer_auth(key)
        .form(&[("magnet", magnet.as_str())])
        .send()
        .map_err(|e| e.to_string())?
        .error_for_status()
        .map_err(|e| format!("Real-Debrid addMagnet: {e}"))?
        .json()
        .map_err(|e| e.to_string())?;

    let torrent_id = add.id;

    let info: RdTorrentInfo = c
        .get(format!("{RD_BASE}/torrents/info/{torrent_id}"))
        .bearer_auth(key)
        .send()
        .map_err(|e| e.to_string())?
        .json()
        .map_err(|e| e.to_string())?;

    // Pick the target file.
    let target_id: i64 = match file_idx {
        Some(idx) if (idx as usize) < info.files.len() => info.files[idx as usize].id,
        _ => info
            .files
            .iter()
            .filter(|f| is_video_path(&f.path))
            .max_by_key(|f| f.bytes)
            .or_else(|| info.files.iter().max_by_key(|f| f.bytes))
            .map(|f| f.id)
            .ok_or_else(|| "Nessun file nel torrent".to_string())?,
    };

    c.post(format!("{RD_BASE}/torrents/selectFiles/{torrent_id}"))
        .bearer_auth(key)
        .form(&[("files", target_id.to_string().as_str())])
        .send()
        .map_err(|e| e.to_string())?
        .error_for_status()
        .map_err(|e| format!("Real-Debrid selectFiles: {e}"))?;

    // Poll for cached availability (cached torrents become "downloaded" fast).
    let mut links: Vec<String> = Vec::new();
    for attempt in 0..12 {
        let info: RdTorrentInfo = c
            .get(format!("{RD_BASE}/torrents/info/{torrent_id}"))
            .bearer_auth(key)
            .send()
            .map_err(|e| e.to_string())?
            .json()
            .map_err(|e| e.to_string())?;

        if info.status == "downloaded" && !info.links.is_empty() {
            links = info.links;
            break;
        }
        if matches!(
            info.status.as_str(),
            "error" | "magnet_error" | "virus" | "dead"
        ) {
            return Err(format!(
                "Real-Debrid: torrent non utilizzabile ({})",
                info.status
            ));
        }
        if attempt >= 6 && info.status != "downloaded" {
            // Not cached: avoid waiting for a real download.
            let _ = c
                .delete(format!("{RD_BASE}/torrents/delete/{torrent_id}"))
                .bearer_auth(key)
                .send();
            return Err(
                "Questo torrent non è già nella cache del tuo Real-Debrid. Prova un'altra fonte."
                    .into(),
            );
        }
        sleep(Duration::from_millis(700));
    }

    let restricted = links
        .first()
        .ok_or_else(|| "Real-Debrid non ha restituito link".to_string())?;

    let un: RdUnrestrict = c
        .post(format!("{RD_BASE}/unrestrict/link"))
        .bearer_auth(key)
        .form(&[("link", restricted.as_str())])
        .send()
        .map_err(|e| e.to_string())?
        .error_for_status()
        .map_err(|e| format!("Real-Debrid unrestrict: {e}"))?
        .json()
        .map_err(|e| e.to_string())?;

    Ok(un.download)
}

// ---------------------------------------------------------------------------
// AllDebrid
// ---------------------------------------------------------------------------

#[derive(Deserialize)]
struct AdEnvelope<T> {
    #[serde(default)]
    status: String,
    data: Option<T>,
    #[serde(default)]
    error: Option<AdError>,
}

#[derive(Deserialize)]
struct AdError {
    #[serde(default)]
    message: String,
}

#[derive(Deserialize)]
struct AdUserData {
    user: AdUser,
}

#[derive(Deserialize)]
struct AdUser {
    username: String,
}

#[derive(Deserialize)]
struct AdUploadData {
    magnets: Vec<AdUploadMagnet>,
}

#[derive(Deserialize)]
struct AdUploadMagnet {
    #[serde(default)]
    id: serde_json::Value,
}

#[derive(Deserialize)]
struct AdStatusData {
    magnets: AdStatusMagnet,
}

#[derive(Deserialize)]
struct AdStatusMagnet {
    #[serde(rename = "statusCode", default)]
    status_code: i64,
    #[serde(default)]
    status: String,
    #[serde(default)]
    links: Vec<AdLink>,
}

#[derive(Deserialize)]
struct AdLink {
    link: String,
    #[serde(default)]
    filename: String,
    #[serde(default)]
    size: i64,
}

#[derive(Deserialize)]
struct AdUnlockData {
    link: String,
}

fn ad_check<T>(env: AdEnvelope<T>, what: &str) -> Result<T, String> {
    if env.status == "success" {
        env.data
            .ok_or_else(|| format!("AllDebrid {what}: risposta vuota"))
    } else {
        let msg = env.error.map(|e| e.message).unwrap_or_default();
        Err(format!("AllDebrid {what}: {msg}"))
    }
}

fn ad_validate(key: &str) -> Result<String, String> {
    let c = client()?;
    let env: AdEnvelope<AdUserData> = c
        .get(format!("{AD_BASE}/user"))
        .query(&[("agent", AD_AGENT), ("apikey", key)])
        .send()
        .map_err(|e| e.to_string())?
        .json()
        .map_err(|e| e.to_string())?;
    let data = ad_check(env, "user")?;
    Ok(data.user.username)
}

fn ad_resolve(
    key: &str,
    info_hash: &str,
    file_idx: Option<i32>,
    _sources: &[String],
) -> Result<String, String> {
    let c = client()?;

    let upload: AdEnvelope<AdUploadData> = c
        .get(format!("{AD_BASE}/magnet/upload"))
        .query(&[
            ("agent", AD_AGENT),
            ("apikey", key),
            ("magnets[]", info_hash),
        ])
        .send()
        .map_err(|e| e.to_string())?
        .json()
        .map_err(|e| e.to_string())?;
    let upload = ad_check(upload, "upload")?;
    let magnet = upload
        .magnets
        .into_iter()
        .next()
        .ok_or_else(|| "AllDebrid: nessun magnet creato".to_string())?;
    let id = match magnet.id {
        serde_json::Value::Number(n) => n.to_string(),
        serde_json::Value::String(s) => s,
        _ => return Err("AllDebrid: id magnet non valido".into()),
    };

    let mut links: Vec<AdLink> = Vec::new();
    for attempt in 0..12 {
        let env: AdEnvelope<AdStatusData> = c
            .get(format!("{AD_BASE}/magnet/status"))
            .query(&[("agent", AD_AGENT), ("apikey", key), ("id", id.as_str())])
            .send()
            .map_err(|e| e.to_string())?
            .json()
            .map_err(|e| e.to_string())?;
        let data = ad_check(env, "status")?;
        // statusCode 4 = Ready
        if data.magnets.status_code == 4 && !data.magnets.links.is_empty() {
            links = data.magnets.links;
            break;
        }
        if data.magnets.status_code >= 5 {
            return Err(format!(
                "AllDebrid: torrent non utilizzabile ({})",
                data.magnets.status
            ));
        }
        if attempt >= 6 {
            return Err(
                "Questo torrent non è già nella cache del tuo AllDebrid. Prova un'altra fonte."
                    .into(),
            );
        }
        sleep(Duration::from_millis(700));
    }

    let chosen = match file_idx {
        Some(idx) if (idx as usize) < links.len() => &links[idx as usize],
        _ => links
            .iter()
            .filter(|l| is_video_path(&l.filename))
            .max_by_key(|l| l.size)
            .or_else(|| links.iter().max_by_key(|l| l.size))
            .ok_or_else(|| "AllDebrid: nessun link disponibile".to_string())?,
    };

    let unlock: AdEnvelope<AdUnlockData> = c
        .get(format!("{AD_BASE}/link/unlock"))
        .query(&[
            ("agent", AD_AGENT),
            ("apikey", key),
            ("link", chosen.link.as_str()),
        ])
        .send()
        .map_err(|e| e.to_string())?
        .json()
        .map_err(|e| e.to_string())?;
    let unlock = ad_check(unlock, "unlock")?;
    Ok(unlock.link)
}
