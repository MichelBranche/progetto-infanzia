use crate::network::stream_remote_url;
use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use std::sync::Mutex;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

const ENTRY_TTL: Duration = Duration::from_secs(4 * 3600);
const TICKET_PREFIX: &str = "t1.";

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

#[derive(Debug, Serialize, Deserialize)]
struct ProxyTicketV1 {
    u: String,
    h: Vec<(String, String)>,
    r: bool,
    p: bool,
    e: u64,
}

pub struct AddonProxyRegistry {
    entries: Mutex<HashMap<String, ProxyEntry>>,
}

impl AddonProxyRegistry {
    pub fn new() -> Self {
        Self {
            entries: Mutex::new(HashMap::new()),
        }
    }

    fn cleanup_old(&self) {
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
        self.cleanup_old();
        let entry = ProxyEntry {
            upstream_url,
            request_headers,
            rewrite_manifest,
            use_proxy,
            created_at: Instant::now(),
        };
        // Ticket firmato: qualsiasi replica Railway può servire /remote/…
        // anche dopo un redeploy (niente più 404 su ID solo in-memory).
        let id = encode_ticket(&entry);
        self.entries
            .lock()
            .expect("proxy registry lock")
            .insert(id.clone(), entry);
        id
    }

    pub fn get(&self, id: &str) -> Option<ProxyEntry> {
        if let Some(entry) = self
            .entries
            .lock()
            .expect("proxy registry lock")
            .get(id)
            .cloned()
        {
            return Some(entry);
        }
        decode_ticket(id)
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
        // Body binario (chiave AES, init map): proxy opaco, mai rewrite m3u8.
        opaque: bool,
    ) -> String {
        let absolute = resolve_url(base, reference);
        // Sempre proxy locale: i CDN VixCloud/SC richiedono Referer/Origin.
        // `use_proxy` = hop SOCKS/VPN. `rewrite_manifest` solo playlist testuali.
        // Attenzione: le chiavi VixCloud spesso stanno su `/playlist/...` quindi
        // `is_hls_playlist_url` da solo non basta — serve il flag `opaque`.
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
        manifest_body
            .lines()
            .map(|line| {
                let trimmed = line.trim();
                if trimmed.is_empty() {
                    return line.to_string();
                }
                let with_uris =
                    self.rewrite_uri_attributes(line, base.as_ref(), request_headers, use_proxy);
                let trimmed = with_uris.trim();
                if trimmed.starts_with('#') {
                    return with_uris;
                }
                // Segmenti media (.ts/.m4s/…): sempre opachi.
                self.proxy_reference(trimmed, base.as_ref(), request_headers, use_proxy, true)
            })
            .collect::<Vec<_>>()
            .join("\n")
    }
}

fn proxy_signing_secret() -> Vec<u8> {
    match std::env::var("BRANCHEFY_PROXY_SECRET") {
        Ok(value) if !value.trim().is_empty() => value.into_bytes(),
        _ => b"branchefy-proxy-v1".to_vec(),
    }
}

fn unix_now() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
}

fn encode_ticket(entry: &ProxyEntry) -> String {
    let mut headers: Vec<(String, String)> = entry
        .request_headers
        .iter()
        .map(|(k, v)| (k.clone(), v.clone()))
        .collect();
    headers.sort_by(|a, b| a.0.cmp(&b.0));
    let ticket = ProxyTicketV1 {
        u: entry.upstream_url.clone(),
        h: headers,
        r: entry.rewrite_manifest,
        p: entry.use_proxy,
        e: unix_now().saturating_add(ENTRY_TTL.as_secs()),
    };
    let payload = serde_json::to_vec(&ticket).unwrap_or_default();
    let body = URL_SAFE_NO_PAD.encode(payload);
    let mac = ticket_mac(body.as_bytes());
    format!("{TICKET_PREFIX}{body}.{mac}")
}

fn decode_ticket(id: &str) -> Option<ProxyEntry> {
    let raw = id.strip_prefix(TICKET_PREFIX)?;
    let (body, mac) = raw.rsplit_once('.')?;
    if body.is_empty() || mac.is_empty() {
        return None;
    }
    if ticket_mac(body.as_bytes()) != mac {
        return None;
    }
    let bytes = URL_SAFE_NO_PAD.decode(body.as_bytes()).ok()?;
    let ticket: ProxyTicketV1 = serde_json::from_slice(&bytes).ok()?;
    if ticket.e < unix_now() {
        return None;
    }
    Some(ProxyEntry {
        upstream_url: ticket.u,
        request_headers: ticket.h.into_iter().collect(),
        rewrite_manifest: ticket.r,
        use_proxy: ticket.p,
        created_at: Instant::now(),
    })
}

fn ticket_mac(body: &[u8]) -> String {
    let mut hasher = Sha256::new();
    hasher.update(proxy_signing_secret());
    hasher.update(b"|");
    hasher.update(body);
    let digest = hasher.finalize();
    URL_SAFE_NO_PAD.encode(&digest[..16])
}

fn is_hls_playlist_url(url: &str) -> bool {
    let lower = url.to_ascii_lowercase();
    // type=key è una chiave AES (binaria), non una playlist — anche se
    // spesso vive sotto /playlist/ su VixCloud.
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

    #[test]
    fn rewrites_media_uris_and_variants() {
        let proxy = AddonProxyRegistry::new();
        let headers = HashMap::from([("Referer".to_string(), "https://vixcloud.co/".to_string())]);
        let master = r#"#EXTM3U
#EXT-X-MEDIA:TYPE=AUDIO,URI="https://vixcloud.co/playlist/1?type=audio&token=abc"
#EXT-X-STREAM-INF:BANDWIDTH=1000
https://vixcloud.co/playlist/1?type=video&rendition=720p&token=def"#;

        let rewritten =
            proxy.rewrite_hls_manifest(master, "https://vixcloud.co/playlist/1?b=1", &headers, false);

        assert!(!rewritten.contains("vixcloud.co/playlist"), "{rewritten}");
        assert!(rewritten.contains("/remote/"));
        assert_eq!(rewritten.matches("/remote/").count(), 2);
    }

    #[test]
    fn proxies_media_segments_without_vpn() {
        let proxy = AddonProxyRegistry::new();
        let headers = HashMap::from([("Referer".to_string(), "https://vixcloud.co/".to_string())]);
        let media = r#"#EXTM3U
#EXT-X-KEY:METHOD=AES-128,URI="https://vixcloud.co/key/abc?token=k"
#EXTINF:4.0,
https://cdn.example/seg/001.ts?token=s1
#EXTINF:4.0,
https://cdn.example/seg/002.m4s?token=s2"#;

        let rewritten = proxy.rewrite_hls_manifest(
            media,
            "https://vixcloud.co/playlist/1?type=video",
            &headers,
            false,
        );

        assert_eq!(rewritten.matches("/remote/").count(), 3, "{rewritten}");
        assert!(!rewritten.contains("cdn.example/seg/"), "{rewritten}");
        assert!(!rewritten.contains("vixcloud.co/key/"), "{rewritten}");

        let key_id = rewritten
            .lines()
            .find(|line| line.contains("EXT-X-KEY"))
            .and_then(remote_id_from_line)
            .expect("key remote id");
        let key_entry = proxy.get(&key_id).expect("key entry");
        assert!(
            !key_entry.rewrite_manifest,
            "AES keys must be proxied opaque, not rewritten as m3u8"
        );
    }

    #[test]
    fn vixcloud_playlist_path_keys_stay_opaque() {
        let proxy = AddonProxyRegistry::new();
        let headers = HashMap::new();
        let media = r#"#EXTM3U
#EXT-X-KEY:METHOD=AES-128,URI="https://vixcloud.co/playlist/abcd?type=key&token=k"
#EXTINF:4.0,
https://cdn.example/seg/001.ts"#;

        let rewritten = proxy.rewrite_hls_manifest(
            media,
            "https://vixcloud.co/playlist/1?type=video",
            &headers,
            false,
        );
        let key_id = rewritten
            .lines()
            .find(|line| line.contains("EXT-X-KEY"))
            .and_then(remote_id_from_line)
            .expect("key id");
        let entry = proxy.get(&key_id).expect("key entry");
        assert!(!entry.rewrite_manifest);
        assert!(entry.upstream_url.contains("type=key"));
    }

    #[test]
    fn proxies_segments_when_vpn_enabled() {
        let proxy = AddonProxyRegistry::new();
        let headers = HashMap::new();
        let media = r#"#EXTM3U
#EXTINF:4.0,
https://cdn.example/seg/001.ts"#;

        let rewritten = proxy.rewrite_hls_manifest(
            media,
            "https://vixcloud.co/playlist/1?type=video",
            &headers,
            true,
        );

        assert!(!rewritten.contains("cdn.example"), "{rewritten}");
        assert!(rewritten.contains("/remote/"), "{rewritten}");
    }

    #[test]
    fn ticket_survives_without_memory() {
        let proxy = AddonProxyRegistry::new();
        let headers = HashMap::from([("Referer".to_string(), "https://vixsrc.to/".to_string())]);
        let id = proxy.register(
            "https://cdn.example/seg/001.ts".into(),
            headers.clone(),
            false,
            false,
        );
        assert!(id.starts_with(TICKET_PREFIX));
        // Simula altra replica / processo fresco.
        let cold = AddonProxyRegistry::new();
        let entry = cold.get(&id).expect("decode ticket");
        assert_eq!(entry.upstream_url, "https://cdn.example/seg/001.ts");
        assert_eq!(
            entry.request_headers.get("Referer").map(String::as_str),
            Some("https://vixsrc.to/")
        );
        assert!(!entry.rewrite_manifest);
    }
}
