use crate::network::stream_remote_url;
use std::collections::hash_map::DefaultHasher;
use std::collections::HashMap;
use std::hash::{Hash, Hasher};
use std::sync::Mutex;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

const ENTRY_TTL: Duration = Duration::from_secs(4 * 3600);

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

        // Chiave + segmenti tutti via /remote/ (Referer applicato dal proxy).
        assert_eq!(rewritten.matches("/remote/").count(), 3, "{rewritten}");
        assert!(!rewritten.contains("cdn.example/seg/"), "{rewritten}");
        assert!(!rewritten.contains("vixcloud.co/key/"), "{rewritten}");

        // La chiave è proxata ma NON come rewrite_manifest (body binario).
        let key_id = rewritten
            .lines()
            .find_map(|line| {
                let start = line.find("/remote/")?;
                let rest = &line[start + "/remote/".len()..];
                let end = rest
                    .find(|c: char| !c.is_ascii_hexdigit())
                    .unwrap_or(rest.len());
                if line.contains("EXT-X-KEY") {
                    Some(rest[..end].to_string())
                } else {
                    None
                }
            })
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
        // VixCloud mette spesso le chiavi sotto /playlist/… — non sono m3u8.
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
            .find_map(|line| {
                if !line.contains("EXT-X-KEY") {
                    return None;
                }
                let start = line.find("/remote/")?;
                let rest = &line[start + "/remote/".len()..];
                let end = rest
                    .find(|c: char| !c.is_ascii_hexdigit())
                    .unwrap_or(rest.len());
                Some(rest[..end].to_string())
            })
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
}
