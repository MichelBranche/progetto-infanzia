use reqwest::blocking::Client;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::time::Duration;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InstalledAddon {
    pub id: String,
    pub manifest_url: String,
    pub transport_url: String,
    pub addon_id: String,
    pub name: String,
    pub description: String,
    pub version: String,
    pub resources: Vec<String>,
    pub types: Vec<String>,
    pub catalogs: Vec<StremioCatalog>,
    pub enabled: bool,
    pub installed_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StremioCatalog {
    pub r#type: String,
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub extra: Vec<StremioExtra>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StremioExtra {
    pub name: String,
    #[serde(default)]
    pub is_required: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StremioMetaPreview {
    pub id: String,
    pub r#type: String,
    pub name: String,
    #[serde(default)]
    pub poster: Option<String>,
    #[serde(default)]
    pub poster_shape: Option<String>,
    #[serde(default)]
    pub description: Option<String>,
    #[serde(default)]
    pub release_info: Option<String>,
    #[serde(default)]
    pub catalog_prefix: Option<String>,
    #[serde(default)]
    pub slug: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StreamingContinueItem {
    pub catalog_prefix: String,
    pub content_type: String,
    pub title_id: String,
    pub slug: String,
    pub video_id: String,
    pub title_name: String,
    #[serde(default)]
    pub episode_label: Option<String>,
    #[serde(default)]
    pub poster: Option<String>,
    pub position_secs: f64,
    #[serde(default)]
    pub duration_secs: Option<f64>,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StreamingEpisodeProgress {
    pub video_id: String,
    pub position_secs: f64,
    #[serde(default)]
    pub duration_secs: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StreamingWatchProgressInput {
    pub catalog_prefix: String,
    pub content_type: String,
    pub title_id: String,
    pub slug: String,
    pub video_id: String,
    pub title_name: String,
    #[serde(default)]
    pub episode_label: Option<String>,
    #[serde(default)]
    pub poster: Option<String>,
    pub position_secs: f64,
    #[serde(default)]
    pub duration_secs: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StremioVideo {
    pub id: String,
    pub title: String,
    #[serde(default)]
    pub season: Option<i32>,
    #[serde(default)]
    pub episode: Option<i32>,
    #[serde(default)]
    pub thumbnail: Option<String>,
    #[serde(default)]
    pub released: Option<String>,
    #[serde(default)]
    pub description: Option<String>,
    #[serde(default)]
    pub runtime: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StremioMeta {
    pub id: String,
    pub r#type: String,
    pub name: String,
    #[serde(default)]
    pub poster: Option<String>,
    #[serde(default)]
    pub background: Option<String>,
    #[serde(default)]
    pub description: Option<String>,
    #[serde(default)]
    pub release_info: Option<String>,
    #[serde(default)]
    pub genres: Vec<String>,
    #[serde(default)]
    pub videos: Vec<StremioVideo>,
    #[serde(default)]
    pub runtime: Option<String>,
    #[serde(default)]
    pub logo: Option<String>,
    #[serde(default)]
    pub rating: Option<String>,
    #[serde(default)]
    pub cast: Vec<String>,
    #[serde(default)]
    pub directors: Vec<String>,
    #[serde(default)]
    pub view_count: Option<i64>,
    #[serde(default)]
    pub quality: Option<String>,
    #[serde(default)]
    pub has_preview: bool,
    #[serde(default)]
    pub season_numbers: Vec<i32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlayableStream {
    pub url: String,
    #[serde(default)]
    pub name: Option<String>,
    #[serde(default)]
    pub description: Option<String>,
    #[serde(default)]
    pub addon_id: String,
    #[serde(default)]
    pub addon_name: String,
    #[serde(default)]
    pub is_hls: bool,
    #[serde(default)]
    pub proxied: bool,
    /// True when this stream is a torrent that must be resolved through a
    /// debrid provider before it can be played.
    #[serde(default)]
    pub needs_debrid: bool,
    #[serde(default)]
    pub info_hash: Option<String>,
    #[serde(default)]
    pub file_idx: Option<i32>,
    #[serde(default)]
    pub sources: Vec<String>,
}

#[derive(Debug, Deserialize)]
pub(crate) struct ManifestResponse {
    pub id: String,
    pub name: String,
    pub description: String,
    pub version: String,
    #[serde(default)]
    pub resources: Vec<serde_json::Value>,
    #[serde(default)]
    pub types: Vec<String>,
    #[serde(default)]
    pub catalogs: Vec<StremioCatalog>,
}

#[derive(Debug, Deserialize)]
struct CatalogResponse {
    #[serde(default)]
    metas: Vec<StremioMetaPreview>,
}

#[derive(Debug, Deserialize)]
struct MetaResponse {
    meta: StremioMeta,
}

#[derive(Debug, Deserialize)]
struct StreamResponse {
    #[serde(default)]
    streams: Vec<RawStream>,
}

#[derive(Debug, Deserialize, Default)]
struct StreamBehaviorHints {
    #[serde(rename = "notWebReady", default)]
    not_web_ready: bool,
    #[serde(rename = "proxyHeaders", default)]
    proxy_headers: Option<ProxyHeadersWrap>,
}

#[derive(Debug, Deserialize, Default)]
struct ProxyHeadersWrap {
    #[serde(default)]
    request: HashMap<String, String>,
}

#[derive(Debug, Deserialize)]
pub(crate) struct RawStream {
    #[serde(default)]
    url: Option<String>,
    #[serde(default)]
    name: Option<String>,
    #[serde(default)]
    title: Option<String>,
    #[serde(default)]
    description: Option<String>,
    #[serde(default, rename = "infoHash")]
    info_hash: Option<String>,
    #[serde(default, rename = "fileIdx")]
    file_idx: Option<i32>,
    #[serde(default)]
    sources: Vec<String>,
    #[serde(default, rename = "behaviorHints")]
    behavior_hints: StreamBehaviorHints,
}

fn http_client() -> Result<Client, String> {
    Client::builder()
        .timeout(Duration::from_secs(25))
        .user_agent("Branchefy/0.1 Stremio-Addon-Client")
        .build()
        .map_err(|e| e.to_string())
}

pub fn normalize_transport_url(manifest_url: &str) -> String {
    let trimmed = manifest_url.trim();
    let without_manifest = trimmed
        .strip_suffix("/manifest.json")
        .or_else(|| trimmed.strip_suffix("manifest.json"))
        .unwrap_or(trimmed);
    without_manifest.trim_end_matches('/').to_string()
}

pub(crate) fn parse_resources(raw: &[serde_json::Value]) -> Vec<String> {
    raw.iter()
        .filter_map(|v| {
            if let Some(s) = v.as_str() {
                Some(s.to_string())
            } else if let Some(obj) = v.as_object() {
                obj.get("name").and_then(|n| n.as_str()).map(str::to_string)
            } else {
                None
            }
        })
        .collect()
}

pub fn fetch_manifest(manifest_url: &str) -> Result<(String, ManifestResponse), String> {
    let client = http_client()?;
    let url = manifest_url.trim();
    let resp = client
        .get(url)
        .send()
        .map_err(|e| format!("Impossibile scaricare manifest: {e}"))?;
    if !resp.status().is_success() {
        return Err(format!("Manifest HTTP {}", resp.status()));
    }
    let manifest: ManifestResponse = resp
        .json()
        .map_err(|e| format!("Manifest non valido: {e}"))?;
    let transport = normalize_transport_url(url);
    Ok((transport, manifest))
}

fn build_resource_path(
    base: &str,
    resource: &str,
    typ: &str,
    id: &str,
    extra: &HashMap<String, String>,
) -> String {
    if extra.is_empty() {
        return format!("{base}/{resource}/{typ}/{id}.json");
    }
    let mut parts: Vec<String> = extra
        .iter()
        .map(|(k, v)| format!("{k}={}", urlencoding::encode(v)))
        .collect();
    parts.sort();
    let extra_seg = parts.join("&");
    format!("{base}/{resource}/{typ}/{id}/{extra_seg}.json")
}

pub fn fetch_catalog(
    transport_url: &str,
    typ: &str,
    catalog_id: &str,
    extra: &HashMap<String, String>,
) -> Result<Vec<StremioMetaPreview>, String> {
    let client = http_client()?;
    let path = build_resource_path(transport_url, "catalog", typ, catalog_id, extra);
    let resp = client
        .get(&path)
        .send()
        .map_err(|e| format!("Catalogo non disponibile: {e}"))?;
    if !resp.status().is_success() {
        return Err(format!("Catalogo HTTP {}", resp.status()));
    }
    let body: CatalogResponse = resp
        .json()
        .map_err(|e| format!("Risposta catalogo non valida: {e}"))?;
    Ok(body.metas)
}

pub fn fetch_meta(transport_url: &str, typ: &str, meta_id: &str) -> Result<StremioMeta, String> {
    let client = http_client()?;
    let path = build_resource_path(transport_url, "meta", typ, meta_id, &HashMap::new());
    let resp = client
        .get(&path)
        .send()
        .map_err(|e| format!("Meta non disponibile: {e}"))?;
    if !resp.status().is_success() {
        return Err(format!("Meta HTTP {}", resp.status()));
    }
    let body: MetaResponse = resp
        .json()
        .map_err(|e| format!("Risposta meta non valida: {e}"))?;
    Ok(body.meta)
}

pub fn fetch_streams(
    transport_url: &str,
    typ: &str,
    video_id: &str,
) -> Result<Vec<RawStream>, String> {
    let client = http_client()?;
    let path = build_resource_path(transport_url, "stream", typ, video_id, &HashMap::new());
    let resp = client
        .get(&path)
        .send()
        .map_err(|e| format!("Stream non disponibile: {e}"))?;
    if !resp.status().is_success() {
        return Ok(Vec::new());
    }
    let body: StreamResponse = resp.json().unwrap_or(StreamResponse { streams: vec![] });
    Ok(body.streams)
}

pub fn raw_to_playable(
    streams: Vec<RawStream>,
    addon_id: &str,
    addon_name: &str,
    proxy: Option<&crate::addon_proxy::AddonProxyRegistry>,
) -> Vec<PlayableStream> {
    streams
        .into_iter()
        .filter_map(|s| {
            // Torrent stream (no direct url): needs debrid resolution.
            if s.url.as_deref().map(str::is_empty).unwrap_or(true) {
                let info_hash = s.info_hash.clone()?;
                if info_hash.is_empty() {
                    return None;
                }
                return Some(PlayableStream {
                    url: String::new(),
                    name: s.name,
                    description: s.description.or(s.title),
                    addon_id: addon_id.to_string(),
                    addon_name: addon_name.to_string(),
                    is_hls: false,
                    proxied: false,
                    needs_debrid: true,
                    info_hash: Some(info_hash.to_lowercase()),
                    file_idx: s.file_idx,
                    sources: s.sources,
                });
            }

            let url = s.url?;
            let lower = url.to_lowercase();
            let is_hls = lower.contains(".m3u8") || lower.contains("application/vnd.apple.mpegurl");
            let request_headers = s
                .behavior_hints
                .proxy_headers
                .as_ref()
                .map(|p| p.request.clone())
                .unwrap_or_default();
            let needs_proxy = crate::addon_proxy::stream_needs_proxy(
                s.behavior_hints.not_web_ready,
                &request_headers,
            );

            let (playback_url, proxied) = if needs_proxy {
                if let Some(registry) = proxy {
                    let id = registry.register(url.clone(), request_headers, is_hls);
                    (registry.playback_url(&id), true)
                } else {
                    (url.clone(), false)
                }
            } else {
                (url.clone(), false)
            };

            Some(PlayableStream {
                url: playback_url,
                name: s.name,
                description: s.description.or(s.title),
                addon_id: addon_id.to_string(),
                addon_name: addon_name.to_string(),
                is_hls,
                proxied,
                needs_debrid: false,
                info_hash: None,
                file_idx: None,
                sources: Vec::new(),
            })
        })
        .collect()
}

pub fn manifest_to_installed(
    row_id: &str,
    manifest_url: &str,
    transport_url: &str,
    manifest: ManifestResponse,
    installed_at: &str,
) -> InstalledAddon {
    InstalledAddon {
        id: row_id.to_string(),
        manifest_url: manifest_url.to_string(),
        transport_url: transport_url.to_string(),
        addon_id: manifest.id,
        name: manifest.name,
        description: manifest.description,
        version: manifest.version,
        resources: parse_resources(&manifest.resources),
        types: manifest.types,
        catalogs: manifest.catalogs,
        enabled: true,
        installed_at: installed_at.to_string(),
    }
}

pub fn has_resource(addon: &InstalledAddon, resource: &str) -> bool {
    addon.resources.iter().any(|r| r == resource)
}
