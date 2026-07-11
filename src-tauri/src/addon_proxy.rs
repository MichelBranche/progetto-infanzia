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
    ) -> String {
        let absolute = resolve_url(base, reference);
        let rewrite = is_hls_playlist_url(&absolute);
        let id = self.register(absolute, request_headers.clone(), rewrite);
        self.playback_url(&id)
    }

    fn rewrite_uri_attributes(
        &self,
        line: &str,
        base: Option<&url::Url>,
        request_headers: &HashMap<String, String>,
    ) -> String {
        let mut result = line.to_string();
        let mut search_from = 0;
        while let Some(rel) = result[search_from..].find("URI=\"") {
            let url_start = search_from + rel + 5;
            let Some(end_off) = result[url_start..].find('"') else {
                break;
            };
            let url_end = url_start + end_off;
            let reference = &result[url_start..url_end];
            let proxied = self.proxy_reference(reference, base, request_headers);
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
    ) -> String {
        let base = url::Url::parse(manifest_url).ok();
        manifest_body
            .lines()
            .map(|line| {
                let trimmed = line.trim();
                if trimmed.is_empty() {
                    return line.to_string();
                }
                let with_uris = self.rewrite_uri_attributes(line, base.as_ref(), request_headers);
                let trimmed = with_uris.trim();
                if trimmed.starts_with('#') {
                    return with_uris;
                }
                self.proxy_reference(trimmed, base.as_ref(), request_headers)
            })
            .collect::<Vec<_>>()
            .join("\n")
    }
}

fn is_hls_playlist_url(url: &str) -> bool {
    url.contains("/playlist/")
        || url.ends_with(".m3u8")
        || url.contains(".m3u8?")
        || url.contains("type=audio")
        || url.contains("type=subtitle")
        || url.contains("type=video")
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
            proxy.rewrite_hls_manifest(master, "https://vixcloud.co/playlist/1?b=1", &headers);

        assert!(!rewritten.contains("vixcloud.co/playlist"), "{rewritten}");
        assert!(rewritten.contains("/remote/"));
        assert_eq!(rewritten.matches("/remote/").count(), 2);
    }
}
