use crate::network::stream_remote_url;
use std::collections::hash_map::DefaultHasher;
use std::collections::HashMap;
use std::hash::{Hash, Hasher};
use std::sync::Mutex;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

const ENTRY_TTL: Duration = Duration::from_secs(12 * 3600);
const CLEANUP_INTERVAL: Duration = Duration::from_secs(120);

#[derive(Debug, Clone)]
pub struct ProxyEntry {
    pub upstream_url: String,
    pub request_headers: HashMap<String, String>,
    pub rewrite_manifest: bool,
    /// Se true, fetch dell'entry via SOCKS/HTTP VPN SC.
    /// Il rewrite HLS passa comunque sempre dal proxy locale (Referer/Origin).
    pub use_proxy: bool,
    pub created_at: Instant,
}

/// Tipo di playlist HLS. Serve a capire cosa sono le righe "nude" (senza `#`):
/// nel master sono **varianti** (altre playlist, da riscrivere), nella media
/// sono **segmenti** (binari, da proxare opachi).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ManifestKind {
    Master,
    Media,
}

impl ManifestKind {
    fn detect(body: &str) -> Self {
        for line in body.lines() {
            let upper = line.trim().to_ascii_uppercase();
            if upper.starts_with("#EXT-X-STREAM-INF") || upper.starts_with("#EXT-X-I-FRAME-STREAM-INF")
            {
                return ManifestKind::Master;
            }
            if upper.starts_with("#EXTINF")
                || upper.starts_with("#EXT-X-TARGETDURATION")
                || upper.starts_with("#EXT-X-MEDIA-SEQUENCE")
            {
                return ManifestKind::Media;
            }
        }
        // Nel dubbio trattala da master: riscrivere una playlist di troppo è
        // recuperabile, lasciarne una grezza rompe la riproduzione.
        ManifestKind::Master
    }
}

pub struct AddonProxyRegistry {
    entries: Mutex<HashMap<String, ProxyEntry>>,
    last_cleanup: Mutex<Instant>,
}

impl AddonProxyRegistry {
    pub fn new() -> Self {
        Self {
            entries: Mutex::new(HashMap::new()),
            last_cleanup: Mutex::new(Instant::now()),
        }
    }

    /// Una media playlist può registrare centinaia di segmenti: fare il retain
    /// completo a ogni `register` è O(n²). Basta ripulire ogni due minuti.
    fn maybe_cleanup(&self) {
        {
            let mut last = self.last_cleanup.lock().expect("proxy cleanup lock");
            if last.elapsed() < CLEANUP_INTERVAL {
                return;
            }
            *last = Instant::now();
        }
        let mut guard = self.entries.lock().expect("proxy registry lock");
        let now = Instant::now();
        guard.retain(|_, entry| now.duration_since(entry.created_at) < ENTRY_TTL);
    }

    pub fn register(
        &self,
        upstream_url: String,
        request_headers: HashMap<String, String>,
        rewrite_manifest: bool,
        use_proxy: bool,
    ) -> String {
        self.maybe_cleanup();
        // ID corto (16 hex). I ticket firmati lunghi (0.2.23) inserivano URL
        // upstream + header in base64 dentro *ogni* segmento: una playlist da
        // 800 segmenti passava da ~130 KB a ~500 KB.
        let id = format!("{:016x}", {
            let mut h = DefaultHasher::new();
            upstream_url.hash(&mut h);
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap_or_default()
                .as_nanos()
                .hash(&mut h);
            h.finish()
        });
        let entry = ProxyEntry {
            upstream_url,
            request_headers,
            rewrite_manifest,
            use_proxy,
            created_at: Instant::now(),
        };
        self.entries
            .lock()
            .expect("proxy registry lock")
            .insert(id.clone(), entry);
        id
    }

    pub fn get(&self, id: &str) -> Option<ProxyEntry> {
        self.entries
            .lock()
            .expect("proxy registry lock")
            .get(id)
            .cloned()
    }

    pub fn playback_url(&self, id: &str) -> String {
        stream_remote_url(id)
    }

    fn proxy_reference(
        &self,
        reference: &str,
        base: Option<&url::Url>,
        request_headers: &HashMap<String, String>,
        use_proxy: bool,
        // Body binario (chiave AES, init map, segmento): proxy opaco, mai
        // riscritto come testo m3u8.
        opaque: bool,
    ) -> String {
        let absolute = resolve_url(base, reference);
        // Sempre proxy locale: i CDN VixCloud/SC richiedono Referer/Origin che
        // il browser non può impostare. `use_proxy` è solo l'hop SOCKS/VPN.
        let rewrite = !opaque && is_hls_playlist_url(&absolute);
        let id = self.register(absolute, request_headers.clone(), rewrite, use_proxy);
        self.playback_url(&id)
    }

    fn rewrite_uri_attributes(
        &self,
        line: &str,
        base: Option<&url::Url>,
        request_headers: &HashMap<String, String>,
        use_proxy: bool,
    ) -> String {
        let upper = line.to_ascii_uppercase();
        // Le chiavi AES e gli init segment sono binari: se venissero registrati
        // come playlist il proxy ne riscriverebbe il body come testo e la
        // decrittazione fallirebbe (regressione 0.2.19–0.2.21).
        let opaque_uri = upper.contains("EXT-X-KEY")
            || upper.contains("EXT-X-SESSION-KEY")
            || upper.contains("EXT-X-MAP");
        let mut result = line.to_string();
        let mut search_from = 0;
        while let Some(rel) = result[search_from..].find("URI=\"") {
            let url_start = search_from + rel + 5;
            let Some(end_off) = result[url_start..].find('"') else {
                break;
            };
            let url_end = url_start + end_off;
            let reference = &result[url_start..url_end];
            if reference.is_empty() {
                search_from = url_end + 1;
                continue;
            }
            let proxied =
                self.proxy_reference(reference, base, request_headers, use_proxy, opaque_uri);
            result = format!("{}{}{}", &result[..url_start], proxied, &result[url_end..]);
            search_from = url_start + proxied.len();
        }
        result
    }

    pub fn rewrite_hls_manifest(
        &self,
        manifest_body: &str,
        manifest_url: &str,
        request_headers: &HashMap<String, String>,
        use_proxy: bool,
    ) -> String {
        let base = url::Url::parse(manifest_url).ok();
        let kind = ManifestKind::detect(manifest_body);
        manifest_body
            .lines()
            .map(|line| {
                if line.trim().is_empty() {
                    return line.to_string();
                }
                let with_uris =
                    self.rewrite_uri_attributes(line, base.as_ref(), request_headers, use_proxy);
                let trimmed = with_uris.trim();
                if trimmed.starts_with('#') {
                    return with_uris;
                }
                // Riga nuda: nel master è una **variante** (altra playlist da
                // riscrivere), nella media è un **segmento** (opaco).
                // Marcare sempre opaco (regressione 0.2.22) lasciava le
                // varianti grezze: chiavi relative tipo `/storage/enc.key` e
                // segmenti diretti al CDN senza Referer → schermo nero.
                let opaque = match kind {
                    ManifestKind::Media => true,
                    ManifestKind::Master => false,
                };
                self.proxy_reference(trimmed, base.as_ref(), request_headers, use_proxy, opaque)
            })
            .collect::<Vec<_>>()
            .join("\n")
    }
}

/// Rete di sicurezza del proxy: qualunque cosa fosse stata registrata, se il
/// body è una playlist HLS va riscritta, altrimenti va servita intatta.
pub fn looks_like_hls_manifest(body: &[u8]) -> bool {
    let head = &body[..body.len().min(256)];
    let text = String::from_utf8_lossy(head);
    text.trim_start().starts_with("#EXTM3U")
}

fn is_hls_playlist_url(url: &str) -> bool {
    let lower = url.to_ascii_lowercase();
    // `type=key` è una chiave AES (binaria) anche se su VixCloud vive sotto
    // `/playlist/...`: non è mai una playlist.
    if lower.contains("type=key") {
        return false;
    }
    lower.contains("/playlist/")
        || lower.ends_with(".m3u8")
        || lower.contains(".m3u8?")
        || lower.contains("type=audio")
        || lower.contains("type=subtitle")
        || lower.contains("type=video")
}

/// True quando vale la pena bufferizzare la risposta per capire se è una
/// playlist. Le playlist sono piccole; i segmenti restano in streaming.
pub fn should_sniff_manifest(entry: &ProxyEntry, content_type: Option<&str>) -> bool {
    if entry.rewrite_manifest {
        return true;
    }
    if is_hls_playlist_url(&entry.upstream_url) {
        return true;
    }
    match content_type {
        Some(ct) => {
            let lower = ct.to_ascii_lowercase();
            lower.contains("mpegurl") || lower.contains("m3u")
        }
        None => false,
    }
}

fn resolve_url(base: Option<&url::Url>, reference: &str) -> String {
    if let Ok(abs) = url::Url::parse(reference) {
        return abs.to_string();
    }
    if let Some(base) = base {
        if let Ok(joined) = base.join(reference) {
            return joined.to_string();
        }
    }
    reference.to_string()
}

pub fn stream_needs_proxy(not_web_ready: bool, request_headers: &HashMap<String, String>) -> bool {
    not_web_ready || !request_headers.is_empty()
}

#[cfg(test)]
fn remote_id_from_line(line: &str) -> Option<String> {
    let start = line.find("/remote/")? + "/remote/".len();
    let rest = &line[start..];
    let end = rest
        .find(|c: char| c == '"' || c.is_whitespace() || c == ',')
        .unwrap_or(rest.len());
    Some(rest[..end].to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn headers() -> HashMap<String, String> {
        HashMap::from([("Referer".to_string(), "https://vixcloud.cc/".to_string())])
    }

    #[test]
    fn rewrites_media_uris_and_variants() {
        let proxy = AddonProxyRegistry::new();
        let master = r#"#EXTM3U
#EXT-X-MEDIA:TYPE=AUDIO,URI="https://vixcloud.cc/playlist/1?type=audio&token=abc"
#EXT-X-STREAM-INF:BANDWIDTH=1000
https://vixcloud.cc/playlist/1?type=video&rendition=720p&token=def"#;

        let rewritten = proxy.rewrite_hls_manifest(
            master,
            "https://vixcloud.cc/playlist/1?b=1",
            &headers(),
            false,
        );

        assert!(!rewritten.contains("vixcloud.cc/playlist"), "{rewritten}");
        assert_eq!(rewritten.matches("/remote/").count(), 2);
    }

    /// Regressione 0.2.22: le varianti nude del master venivano registrate
    /// opache, quindi servite grezze. Il player riceveva chiavi relative e
    /// segmenti diretti al CDN → schermo nero.
    #[test]
    fn master_variants_are_rewritten_not_opaque() {
        let proxy = AddonProxyRegistry::new();
        let master = r#"#EXTM3U
#EXT-X-STREAM-INF:BANDWIDTH=3000000,RESOLUTION=1280x720
https://vixcloud.cc/playlist/775090?type=video&rendition=720p&token=def"#;

        let rewritten = proxy.rewrite_hls_manifest(
            master,
            "https://vixcloud.cc/playlist/775090?token=t",
            &headers(),
            false,
        );

        let variant_id = rewritten
            .lines()
            .find(|l| !l.starts_with('#') && l.contains("/remote/"))
            .and_then(remote_id_from_line)
            .expect("variant id");
        let entry = proxy.get(&variant_id).expect("variant entry");
        assert!(
            entry.rewrite_manifest,
            "una variante del master deve essere riscritta, non servita grezza"
        );
    }

    /// Regressione gemella: la chiave relativa `/storage/enc.key` deve essere
    /// risolta sull'upstream e proxata, mai lasciata relativa (si risolverebbe
    /// sull'origin del proxy → 404).
    #[test]
    fn relative_key_uri_is_resolved_against_upstream() {
        let proxy = AddonProxyRegistry::new();
        let media = r#"#EXTM3U
#EXT-X-TARGETDURATION:8
#EXT-X-KEY:METHOD=AES-128,URI="/storage/enc.key",IV=0x43A6D967D5C17290
#EXTINF:8,
https://sc-u9-01.vix-content.net/hls/34/video/720p/0000.ts?token=x"#;

        let rewritten = proxy.rewrite_hls_manifest(
            media,
            "https://vixcloud.cc/playlist/775090?type=video&rendition=720p",
            &headers(),
            false,
        );

        assert!(
            !rewritten.contains("\"/storage/enc.key\""),
            "chiave relativa non riscritta: {rewritten}"
        );
        assert!(
            !rewritten.contains("vix-content.net"),
            "segmento lasciato sul CDN: {rewritten}"
        );

        let key_id = rewritten
            .lines()
            .find(|l| l.contains("EXT-X-KEY"))
            .and_then(remote_id_from_line)
            .expect("key id");
        let key_entry = proxy.get(&key_id).expect("key entry");
        assert_eq!(key_entry.upstream_url, "https://vixcloud.cc/storage/enc.key");
        assert!(
            !key_entry.rewrite_manifest,
            "la chiave AES è binaria: deve restare opaca"
        );
    }

    #[test]
    fn proxies_media_segments_without_vpn() {
        let proxy = AddonProxyRegistry::new();
        let media = r#"#EXTM3U
#EXTINF:4.0,
https://cdn.example/seg/001.ts?token=s1
#EXTINF:4.0,
https://cdn.example/seg/002.m4s?token=s2"#;

        let rewritten = proxy.rewrite_hls_manifest(
            media,
            "https://vixcloud.cc/playlist/1?type=video",
            &headers(),
            false,
        );

        assert_eq!(rewritten.matches("/remote/").count(), 2, "{rewritten}");
        assert!(!rewritten.contains("cdn.example/seg/"), "{rewritten}");

        let seg_id = rewritten
            .lines()
            .find(|l| !l.starts_with('#') && l.contains("/remote/"))
            .and_then(remote_id_from_line)
            .expect("seg id");
        assert!(!proxy.get(&seg_id).expect("seg entry").rewrite_manifest);
    }

    /// Regressione 0.2.19–0.2.21: le chiavi su `/playlist/...?type=key`
    /// finivano registrate come m3u8 e il body veniva corrotto.
    #[test]
    fn vixcloud_playlist_path_keys_stay_opaque() {
        let proxy = AddonProxyRegistry::new();
        let media = r#"#EXTM3U
#EXT-X-TARGETDURATION:8
#EXT-X-KEY:METHOD=AES-128,URI="https://vixcloud.cc/playlist/abcd?type=key&token=k"
#EXTINF:4.0,
https://cdn.example/seg/001.ts"#;

        let rewritten = proxy.rewrite_hls_manifest(
            media,
            "https://vixcloud.cc/playlist/1?type=video",
            &headers(),
            false,
        );
        let key_id = rewritten
            .lines()
            .find(|l| l.contains("EXT-X-KEY"))
            .and_then(remote_id_from_line)
            .expect("key id");
        let entry = proxy.get(&key_id).expect("key entry");
        assert!(!entry.rewrite_manifest);
        assert!(entry.upstream_url.contains("type=key"));
    }

    /// Regressione 0.2.19: i segmenti restavano sul CDN e il browser non poteva
    /// impostare il Referer richiesto.
    #[test]
    fn proxies_segments_when_vpn_enabled() {
        let proxy = AddonProxyRegistry::new();
        let media = r#"#EXTM3U
#EXTINF:4.0,
https://cdn.example/seg/001.ts"#;

        let rewritten = proxy.rewrite_hls_manifest(
            media,
            "https://vixcloud.cc/playlist/1?type=video",
            &HashMap::new(),
            true,
        );

        assert!(!rewritten.contains("cdn.example"), "{rewritten}");
        let id = remote_id_from_line(
            rewritten.lines().find(|l| l.contains("/remote/")).expect("seg"),
        )
        .expect("id");
        assert!(proxy.get(&id).expect("entry").use_proxy);
    }

    /// Regressione 0.2.23: i ticket firmati gonfiavano ogni URL di segmento.
    #[test]
    fn segment_urls_stay_short() {
        let proxy = AddonProxyRegistry::new();
        let id = proxy.register(
            "https://cdn.example/seg/001.ts".into(),
            headers(),
            false,
            false,
        );
        assert_eq!(id.len(), 16, "id proxy troppo lungo: {id}");
        assert!(id.chars().all(|c| c.is_ascii_hexdigit()));
    }

    #[test]
    fn detects_manifest_kind() {
        assert_eq!(
            ManifestKind::detect("#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=1\nhttp://a/b"),
            ManifestKind::Master
        );
        assert_eq!(
            ManifestKind::detect("#EXTM3U\n#EXT-X-TARGETDURATION:8\n#EXTINF:8,\nhttp://a/b.ts"),
            ManifestKind::Media
        );
    }

    #[test]
    fn sniffing_catches_misclassified_playlists() {
        assert!(looks_like_hls_manifest(b"#EXTM3U\n#EXT-X-VERSION:3"));
        assert!(looks_like_hls_manifest(b"\n  #EXTM3U\n"));
        // Chiave AES binaria: mai scambiata per una playlist.
        assert!(!looks_like_hls_manifest(&[0xb2, 0x07, 0x82, 0xcb, 0xc3, 0x2a]));
        assert!(!looks_like_hls_manifest(b""));

        let entry = ProxyEntry {
            upstream_url: "https://cdn.example/seg/001.ts".into(),
            request_headers: HashMap::new(),
            rewrite_manifest: false,
            use_proxy: false,
            created_at: Instant::now(),
        };
        // Segmento normale: nessun buffering.
        assert!(!should_sniff_manifest(&entry, Some("video/mp2t")));
        // Ma se l'upstream dichiara una playlist, il proxy la ricontrolla
        // comunque anche se era stata registrata opaca.
        assert!(should_sniff_manifest(&entry, Some("application/vnd.apple.mpegurl")));

        let key = ProxyEntry {
            upstream_url: "https://vixcloud.cc/playlist/1?type=key".into(),
            request_headers: HashMap::new(),
            rewrite_manifest: false,
            use_proxy: false,
            created_at: Instant::now(),
        };
        assert!(!should_sniff_manifest(&key, Some("application/octet-stream")));
    }
}
