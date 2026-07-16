use crate::db::Database;
use reqwest::blocking::Client;
use serde::Deserialize;
use std::collections::HashSet;
use std::sync::{OnceLock, RwLock};
use std::time::{Duration, Instant};

const META_VIX_EMBED_HOST: &str = "sc_vix_embed_host";
const DEFAULT_VIX_HOST: &str = "vixsrc.to";
const REMOTE_CONFIG_URL: &str =
    "https://raw.githubusercontent.com/MichelBranche/progetto-infanzia/main/config/vix-embed-hosts.json";
const REMOTE_REFRESH_INTERVAL: Duration = Duration::from_secs(6 * 3600);

/// Host noti incorporati nell'app: provati in automatico senza intervento dell'utente.
const DEFAULT_FALLBACK_HOSTS: &[&str] = &[
    DEFAULT_VIX_HOST,
    "vixsrc.co",
    "vixsrc.net",
    "vixsrc.xyz",
];
const DEFAULT_LEGACY_HOSTS: &[&str] = &["vixcloud.co", "www.vixcloud.co"];
const HEURISTIC_VIX_HOSTS: &[&str] = &[
    "vixsrc.to",
    "vixsrc.co",
    "vixsrc.net",
    "vixsrc.xyz",
    "vixcloud.to",
    "vixcloud.net",
];

const USER_AGENT: &str = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 \
     (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Branchefy/0.1";

#[derive(Debug, Deserialize)]
struct VixEmbedConfig {
    #[serde(default)]
    hosts: Vec<String>,
    #[serde(default)]
    legacy: Vec<String>,
}

struct RemoteCatalog {
    fetched_at: Option<Instant>,
    hosts: Vec<String>,
    legacy: Vec<String>,
}

static RUNTIME_HOST: RwLock<Option<String>> = RwLock::new(None);
static REMOTE_CATALOG: OnceLock<RwLock<RemoteCatalog>> = OnceLock::new();

fn remote_catalog() -> &'static RwLock<RemoteCatalog> {
    REMOTE_CATALOG.get_or_init(|| {
        RwLock::new(RemoteCatalog {
            fetched_at: None,
            hosts: Vec::new(),
            legacy: Vec::new(),
        })
    })
}

fn http_client() -> Result<Client, String> {
    let builder = Client::builder()
        .timeout(Duration::from_secs(12))
        .user_agent(USER_AGENT);
    crate::sc_proxy::apply_blocking(builder)
        .build()
        .map_err(|e| e.to_string())
}

fn remote_config_url() -> String {
    std::env::var("BRANCHEFY_VIX_EMBED_CONFIG_URL")
        .ok()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| REMOTE_CONFIG_URL.to_string())
}

fn normalize_host(host: &str) -> String {
    host.trim()
        .trim_start_matches("https://")
        .trim_start_matches("http://")
        .trim_start_matches("www.")
        .trim_end_matches('/')
        .to_ascii_lowercase()
}

fn push_unique_host(out: &mut Vec<String>, seen: &mut HashSet<String>, host: &str) {
    let normalized = normalize_host(host);
    if normalized.is_empty() || seen.contains(&normalized) {
        return;
    }
    seen.insert(normalized.clone());
    out.push(normalized);
}

pub fn is_legacy_host(host: &str) -> bool {
    let normalized = normalize_host(host);
    if DEFAULT_LEGACY_HOSTS
        .iter()
        .any(|legacy| normalize_host(legacy) == normalized)
    {
        return true;
    }
    if let Ok(guard) = remote_catalog().read() {
        return guard
            .legacy
            .iter()
            .any(|legacy| normalize_host(legacy) == normalized);
    }
    false
}

fn fallback_hosts() -> Vec<String> {
    let mut out = Vec::new();
    let mut seen = HashSet::new();

    if let Ok(guard) = remote_catalog().read() {
        for host in &guard.hosts {
            push_unique_host(&mut out, &mut seen, host);
        }
    }
    for host in DEFAULT_FALLBACK_HOSTS {
        push_unique_host(&mut out, &mut seen, host);
    }
    out
}

fn refresh_remote_hosts_if_stale() {
    let needs_fetch = remote_catalog()
        .read()
        .ok()
        .map(|guard| {
            guard
                .fetched_at
                .is_none_or(|at| at.elapsed() > REMOTE_REFRESH_INTERVAL)
        })
        .unwrap_or(true);
    if !needs_fetch {
        return;
    }
    refresh_remote_hosts_force();
}

fn refresh_remote_hosts_force() {
    let Ok(client) = http_client() else {
        return;
    };
    let url = remote_config_url();
    let Ok(resp) = client.get(&url).send() else {
        return;
    };
    if !resp.status().is_success() {
        return;
    };
    let Ok(cfg) = resp.json::<VixEmbedConfig>() else {
        return;
    };

    if let Ok(mut guard) = remote_catalog().write() {
        guard.fetched_at = Some(Instant::now());
        guard.hosts = cfg
            .hosts
            .into_iter()
            .map(|h| normalize_host(&h))
            .filter(|h| !h.is_empty())
            .collect();
        guard.legacy = cfg
            .legacy
            .into_iter()
            .map(|h| normalize_host(&h))
            .filter(|h| !h.is_empty())
            .collect();
    }
}

fn heuristic_hosts_for(dead_host: &str) -> Vec<String> {
    let dead = normalize_host(dead_host);
    let mut out = Vec::new();
    let mut seen = HashSet::new();

    if dead.contains("vixcloud") || dead.contains("vixsrc") || dead.contains("vix") {
        for host in HEURISTIC_VIX_HOSTS {
            push_unique_host(&mut out, &mut seen, host);
        }
    }

    if let Some(stem) = dead.split('.').next() {
        for tld in ["to", "co", "net", "xyz", "io", "site"] {
            push_unique_host(&mut out, &mut seen, &format!("{stem}.{tld}"));
        }
    }

    out
}

/// Primo URL `/embed/` trovato in HTML (iframe SC o pagina player).
pub fn extract_embed_url_from_html(html: &str) -> Option<String> {
    for marker in ["https://", "http://"] {
        for chunk in html.split(marker).skip(1) {
            let end = chunk
                .find(|c: char| c == '"' || c == '\'' || c == ' ' || c == '<' || c == '\\')
                .unwrap_or(chunk.len());
            let url = format!("{marker}{}", &chunk[..end]);
            if url.contains("/embed/") {
                return Some(
                    url.replace("&amp;", "&")
                        .replace("&#39;", "'")
                        .replace("&quot;", "\""),
                );
            }
        }
    }
    None
}

/// Estrae host embed/playlist citati in HTML (pagina iframe SC, pagine errore, ecc.).
pub fn discover_hosts_from_html(html: &str) -> Vec<String> {
    let mut hosts = HashSet::new();
    for marker in ["https://", "http://"] {
        for chunk in html.split(marker).skip(1) {
            let end = chunk
                .find(|c: char| c == '"' || c == '\'' || c == ' ' || c == '<' || c == '\\')
                .unwrap_or(chunk.len());
            let url = format!("{marker}{}", &chunk[..end]);
            if !url.contains("/embed/") && !url.contains("/playlist/") {
                continue;
            }
            if let Some(host) = host_from_url(&url) {
                if !is_legacy_host(&host) {
                    hosts.insert(host);
                }
            }
        }
    }
    hosts.into_iter().collect()
}

pub fn probe_host(client: &Client, host: &str) -> bool {
    let host = normalize_host(host);
    if host.is_empty() {
        return false;
    }
    let url = format!("https://{host}/");
    client
        .get(&url)
        .header("Referer", format!("https://{host}/"))
        .header("Origin", format!("https://{host}"))
        .send()
        .map(|resp| {
            let status = resp.status();
            status.is_success() || status.as_u16() == 403 || status.as_u16() == 404
        })
        .unwrap_or(false)
}

pub fn remember_working_host(db: &Database, host: &str) {
    let host = normalize_host(host);
    if host.is_empty() || is_legacy_host(&host) {
        return;
    }
    let _ = db.set_meta(META_VIX_EMBED_HOST, &host);
    if let Ok(mut guard) = RUNTIME_HOST.write() {
        *guard = Some(host);
    }
}

pub fn working_host(db: &Database) -> String {
    if let Ok(guard) = RUNTIME_HOST.read() {
        if let Some(host) = guard.as_ref().filter(|h| !h.is_empty()) {
            return host.clone();
        }
    }
    if let Ok(Some(cached)) = db.get_meta(META_VIX_EMBED_HOST) {
        let cached = normalize_host(&cached);
        if !cached.is_empty() {
            return cached;
        }
    }
    DEFAULT_VIX_HOST.to_string()
}

pub fn discover_working_host(db: &Database) -> String {
    refresh_remote_hosts_if_stale();

    let Ok(client) = http_client() else {
        return DEFAULT_VIX_HOST.to_string();
    };

    if let Ok(Some(cached)) = db.get_meta(META_VIX_EMBED_HOST) {
        let cached = normalize_host(&cached);
        if !cached.is_empty() && probe_host(&client, &cached) {
            remember_working_host(db, &cached);
            return cached;
        }
        let _ = db.set_meta(META_VIX_EMBED_HOST, "");
    }

    for host in fallback_hosts() {
        if probe_host(&client, &host) {
            remember_working_host(db, &host);
            return host;
        }
    }

    DEFAULT_VIX_HOST.to_string()
}

/// All'avvio: aggiorna lista remota e verifica quale host embed risponde.
pub fn bootstrap(db: &Database) {
    refresh_remote_hosts_if_stale();
    let host = discover_working_host(db);
    remember_working_host(db, &host);
}

pub fn host_from_url(url: &str) -> Option<String> {
    reqwest::Url::parse(url)
        .ok()
        .and_then(|parsed| parsed.host_str().map(normalize_host))
        .filter(|host| !host.is_empty())
}

pub fn replace_url_host(url: &str, new_host: &str) -> Option<String> {
    let mut parsed = reqwest::Url::parse(url).ok()?;
    let new_host = normalize_host(new_host);
    if new_host.is_empty() {
        return None;
    }
    parsed.set_host(Some(&new_host)).ok()?;
    Some(parsed.to_string())
}

pub fn rewrite_embed_url(url: &str, db: &Database) -> String {
    let Some(current_host) = host_from_url(url) else {
        return url.to_string();
    };
    if !is_legacy_host(&current_host) {
        return url.to_string();
    }
    replace_url_host(url, &working_host(db)).unwrap_or_else(|| url.to_string())
}

pub fn candidate_embed_urls(
    embed_url: &str,
    db: &Database,
    html_hints: Option<&str>,
) -> Vec<String> {
    refresh_remote_hosts_if_stale();

    let mut out = Vec::new();
    let mut seen = HashSet::new();
    let mut push = |candidate: String| {
        if seen.insert(candidate.clone()) {
            out.push(candidate);
        }
    };

    push(embed_url.to_string());

    if let Some(html) = html_hints {
        for host in discover_hosts_from_html(html) {
            if let Some(candidate) = replace_url_host(embed_url, &host) {
                push(candidate);
            }
        }
    }

    if let Some(dead_host) = host_from_url(embed_url) {
        if is_legacy_host(&dead_host) || !probe_host_quick(&dead_host) {
            for host in heuristic_hosts_for(&dead_host) {
                if let Some(candidate) = replace_url_host(embed_url, &host) {
                    push(candidate);
                }
            }
        }
    }

    push(rewrite_embed_url(embed_url, db));

    let mut hosts = Vec::new();
    if let Ok(Some(cached)) = db.get_meta(META_VIX_EMBED_HOST) {
        push_unique_host(&mut hosts, &mut HashSet::new(), &cached);
    }
    hosts.extend(fallback_hosts());
    if let Some(dead_host) = host_from_url(embed_url) {
        hosts.extend(heuristic_hosts_for(&dead_host));
    }

    for host in hosts {
        if let Some(candidate) = replace_url_host(embed_url, &host) {
            push(candidate);
        }
    }

    out
}

fn probe_host_quick(host: &str) -> bool {
    http_client()
        .ok()
        .map(|client| probe_host(&client, host))
        .unwrap_or(false)
}

fn is_valid_vix_embed_html(html: &str) -> bool {
    html.contains("masterPlaylist")
        || html.contains("window.player")
        || html.contains("/playlist/")
}

fn try_fetch_embed_html(
    client: &Client,
    embed_url: &str,
    referer_url: &str,
    db: &Database,
    html_hints: Option<&str>,
) -> Result<String, String> {
    let candidates = candidate_embed_urls(embed_url, db, html_hints);

    for url in candidates {
        let host = host_from_url(&url).unwrap_or_default();
        let response = client
            .get(&url)
            .header("Accept", "text/html,application/xhtml+xml")
            .header("Referer", referer_url)
            .send();

        match response {
            Ok(resp) if resp.status().is_success() => match resp.text() {
                Ok(html) if is_valid_vix_embed_html(&html) => {
                    remember_working_host(db, &host);
                    return Ok(html);
                }
                Ok(html) => {
                    for discovered in discover_hosts_from_html(&html) {
                        if let Some(retry_url) = replace_url_host(embed_url, &discovered) {
                            if let Ok(retry_html) =
                                try_single_embed(client, &retry_url, referer_url, db)
                            {
                                return Ok(retry_html);
                            }
                        }
                    }
                }
                Err(_) => {}
            },
            Ok(_) => {}
            Err(_) => {}
        }
    }

    Err("retry".into())
}

fn try_single_embed(
    client: &Client,
    url: &str,
    referer_url: &str,
    db: &Database,
) -> Result<String, String> {
    let host = host_from_url(url).unwrap_or_default();
    let resp = client
        .get(url)
        .header("Accept", "text/html,application/xhtml+xml")
        .header("Referer", referer_url)
        .send()
        .map_err(|e| e.to_string())?;
    if !resp.status().is_success() {
        return Err(format!("HTTP {}", resp.status()));
    }
    let html = resp.text().map_err(|e| e.to_string())?;
    if !is_valid_vix_embed_html(&html) {
        return Err("invalid embed".into());
    }
    remember_working_host(db, &host);
    Ok(html)
}

pub fn fetch_embed_html(
    client: &Client,
    embed_url: &str,
    referer: Option<&str>,
    db: &Database,
    html_hints: Option<&str>,
) -> Result<String, String> {
    let referer_url = referer.unwrap_or("https://streamingcommunityz.tech/");

    if let Ok(html) = try_fetch_embed_html(client, embed_url, referer_url, db, html_hints) {
        return Ok(html);
    }

    // Secondo tentativo: aggiorna lista remota, scarta cache obsoleta, riscopri host.
    refresh_remote_hosts_force();
    let _ = db.set_meta(META_VIX_EMBED_HOST, "");
    if let Ok(mut guard) = RUNTIME_HOST.write() {
        *guard = None;
    }
    let discovered = discover_working_host(db);
    remember_working_host(db, &discovered);

    if let Ok(html) = try_fetch_embed_html(client, embed_url, referer_url, db, html_hints) {
        return Ok(html);
    }

    Err(
        "Riproduzione temporaneamente non disponibile. L'app riproverà automaticamente al prossimo tentativo."
            .into(),
    )
}

pub fn rewrite_playlist_url(url: &str, db: &Database) -> String {
    let Some(host) = host_from_url(url) else {
        return url.to_string();
    };
    if is_legacy_host(&host) {
        return replace_url_host(url, &working_host(db)).unwrap_or_else(|| url.to_string());
    }
    url.to_string()
}

pub fn request_headers(db: &Database) -> std::collections::HashMap<String, String> {
    let host = working_host(db);
    let origin = format!("https://{host}");
    let mut headers = std::collections::HashMap::new();
    headers.insert("Referer".to_string(), format!("{origin}/"));
    headers.insert("Origin".to_string(), origin);
    headers.insert("User-Agent".to_string(), USER_AGENT.to_string());
    headers
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rewrite_embed_url_replaces_legacy_host() {
        let db = crate::db::Database::open(std::path::Path::new(":memory:")).expect("db");
        remember_working_host(&db, "vixsrc.to");
        let raw = "https://vixcloud.co/embed/123?token=abc";
        assert_eq!(
            rewrite_embed_url(raw, &db),
            "https://vixsrc.to/embed/123?token=abc"
        );
    }

    #[test]
    fn candidate_urls_include_fallback_hosts() {
        let db = crate::db::Database::open(std::path::Path::new(":memory:")).expect("db");
        remember_working_host(&db, "vixsrc.to");
        let raw = "https://vixcloud.co/embed/9?token=abc";
        let candidates = candidate_embed_urls(raw, &db, None);
        assert!(candidates.iter().any(|u| u.contains("vixsrc.to")));
        assert!(candidates.iter().any(|u| u.contains("vixcloud.co")));
    }

    #[test]
    fn discover_hosts_from_html_finds_playlist_host() {
        let html = r#"window.masterPlaylist = { url: 'https://nuovo-host.example/playlist/1' }"#;
        let hosts = discover_hosts_from_html(html);
        assert!(hosts.contains(&"nuovo-host.example".to_string()));
    }
}
