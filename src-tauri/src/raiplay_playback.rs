use crate::addon_proxy::AddonProxyRegistry;
use crate::db::Database;
use crate::html_text::decode_html_entities;
use crate::raiplay_catalog::{self, absolute_media_url, program_url};
use crate::stremio::{PlayableStream, StremioMeta, StremioVideo};
use regex::Regex;
use reqwest::blocking::Client;
use serde_json::Value;
use std::collections::HashMap;
use std::time::Duration;

const APP_ORIGIN: &str = "https://www.raiplay.it";
const USER_AGENT: &str = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 \
     (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Branchefy/0.1";
const HTTP_TIMEOUT_SECS: u64 = 45;
const MAX_CONTENT_SETS: usize = 12;
const MAX_EPISODES: usize = 400;

fn http_client() -> Result<Client, String> {
    Client::builder()
        .timeout(Duration::from_secs(HTTP_TIMEOUT_SECS))
        .user_agent(USER_AGENT)
        .redirect(reqwest::redirect::Policy::limited(8))
        .build()
        .map_err(|e| e.to_string())
}

fn fetch_json(client: &Client, url: &str) -> Result<Value, String> {
    let text = client
        .get(url)
        .header("Accept", "application/json, text/plain, */*")
        .header("Referer", APP_ORIGIN)
        .header("Origin", APP_ORIGIN)
        .send()
        .map_err(|e| format!("Rete RaiPlay: {e}"))?
        .error_for_status()
        .map_err(|e| format!("Risorsa RaiPlay non disponibile: {e}"))?
        .text()
        .map_err(|e| e.to_string())?;

    let trimmed = text.trim();
    if trimmed.starts_with('<') {
        return Err("Risposta HTML invece di JSON (geo-block o pagina errore)".into());
    }
    serde_json::from_str(trimmed).map_err(|e| format!("JSON RaiPlay non valido: {e}"))
}

fn drm_blocked(value: &Value) -> bool {
    let candidates = [
        value.pointer("/rights_management/rights/drm"),
        value.pointer("/program_info/rights_management/rights/drm"),
        value.pointer("/video/rights_management/rights/drm"),
    ];
    for drm in candidates.into_iter().flatten() {
        if let Some(obj) = drm.as_object() {
            if !obj.is_empty() {
                return true;
            }
        } else if drm.as_bool() == Some(true) {
            return true;
        } else if let Some(s) = drm.as_str() {
            if !s.trim().is_empty() && !s.eq_ignore_ascii_case("false") {
                return true;
            }
        }
    }
    false
}

fn image_from_map(images: &Value, prefer: &[&str]) -> Option<String> {
    let obj = images.as_object()?;
    for key in prefer {
        if let Some(path) = obj.get(*key).and_then(|v| v.as_str()) {
            let trimmed = path.trim();
            if !trimmed.is_empty() {
                return Some(absolute_media_url(trimmed));
            }
        }
    }
    for (_k, v) in obj {
        if let Some(path) = v.as_str() {
            let trimmed = path.trim();
            if !trimmed.is_empty() {
                return Some(absolute_media_url(trimmed));
            }
        }
    }
    None
}

fn normalize_video_path(path: &str) -> String {
    let trimmed = path.trim();
    if trimmed.starts_with("http://") || trimmed.starts_with("https://") {
        if let Some(idx) = trimmed.find("/video/") {
            return trimmed[idx..].trim_end_matches(".html").to_string();
        }
        return trimmed.to_string();
    }
    let with_slash = if trimmed.starts_with('/') {
        trimmed.to_string()
    } else {
        format!("/{trimmed}")
    };
    if with_slash.ends_with(".json") {
        with_slash
    } else if with_slash.ends_with(".html") {
        format!("{}.json", with_slash.trim_end_matches(".html"))
    } else {
        format!("{with_slash}.json")
    }
}

fn video_json_url(path_or_id: &str) -> String {
    let path = normalize_video_path(path_or_id);
    if path.starts_with("http://") || path.starts_with("https://") {
        if path.ends_with(".json") {
            path
        } else {
            format!("{}.json", path.trim_end_matches(".html"))
        }
    } else {
        format!(
            "{APP_ORIGIN}{}",
            if path.ends_with(".json") {
                path
            } else {
                format!("{path}.json")
            }
        )
    }
}

fn parse_season_number(raw: Option<&str>) -> Option<i32> {
    let s = raw?.trim();
    if let Ok(n) = s.parse::<i32>() {
        return Some(n.max(0));
    }
    let re = Regex::new(r"(?i)(?:stagione|st|season)\s*(\d{1,3})").ok()?;
    re.captures(s)
        .and_then(|c| c.get(1))
        .and_then(|m| m.as_str().parse().ok())
}

fn collect_episodes(client: &Client, program: &Value) -> Result<Vec<StremioVideo>, String> {
    let mut videos = Vec::new();
    let mut seen = HashSetLike::default();

    let blocks = program.get("blocks").and_then(|v| v.as_array());
    let Some(blocks) = blocks else {
        return Ok(videos);
    };

    let mut sets_fetched = 0usize;
    for block in blocks {
        let sets = block.get("sets").and_then(|v| v.as_array());
        let Some(sets) = sets else { continue };
        for set in sets {
            if sets_fetched >= MAX_CONTENT_SETS || videos.len() >= MAX_EPISODES {
                break;
            }
            let path_id = set
                .get("path_id")
                .and_then(|v| v.as_str())
                .map(str::trim)
                .filter(|s| !s.is_empty());
            let Some(path_id) = path_id else { continue };
            let set_url = if path_id.starts_with("http") {
                path_id.to_string()
            } else {
                format!(
                    "{APP_ORIGIN}{}",
                    if path_id.starts_with('/') {
                        path_id.to_string()
                    } else {
                        format!("/{path_id}")
                    }
                )
            };
            sets_fetched += 1;
            let Ok(set_json) = fetch_json(client, &set_url) else {
                continue;
            };
            let season_hint = set
                .get("name")
                .and_then(|v| v.as_str())
                .and_then(|s| parse_season_number(Some(s)));

            let items = set_json.get("items").and_then(|v| v.as_array());
            let Some(items) = items else { continue };
            for item in items {
                if videos.len() >= MAX_EPISODES {
                    break;
                }
                if drm_blocked(item) {
                    continue;
                }
                let path = item
                    .get("path_id")
                    .and_then(|v| v.as_str())
                    .map(str::trim)
                    .filter(|s| !s.is_empty());
                let Some(path) = path else { continue };
                let video_id = normalize_video_path(path);
                if !seen.insert(video_id.clone()) {
                    continue;
                }

                let title = item
                    .get("name")
                    .or_else(|| item.get("episode_title"))
                    .and_then(|v| v.as_str())
                    .map(|s| decode_html_entities(s))
                    .filter(|s| !s.trim().is_empty())
                    .unwrap_or_else(|| "Puntata".to_string());

                let season = item
                    .get("season")
                    .and_then(|v| v.as_str())
                    .and_then(|s| parse_season_number(Some(s)))
                    .or(season_hint);
                let episode = item
                    .get("episode")
                    .and_then(|v| {
                        v.as_i64()
                            .map(|n| n as i32)
                            .or_else(|| v.as_str().and_then(|s| s.parse().ok()))
                    });

                let thumb = item
                    .get("images")
                    .and_then(|imgs| image_from_map(imgs, &["portrait", "landscape", "square"]));

                videos.push(StremioVideo {
                    id: video_id,
                    title,
                    season,
                    episode,
                    thumbnail: thumb,
                    released: None,
                    description: item
                        .get("description")
                        .and_then(|v| v.as_str())
                        .map(decode_html_entities),
                    runtime: item
                        .get("duration")
                        .and_then(|v| v.as_str())
                        .map(|s| s.to_string()),
                });
            }
        }
    }

    Ok(videos)
}

#[derive(Default)]
struct HashSetLike(std::collections::HashSet<String>);
impl HashSetLike {
    fn insert(&mut self, v: String) -> bool {
        self.0.insert(v)
    }
}

fn genres_for_cached_kind(kind: Option<&str>) -> Vec<String> {
    match kind {
        Some(raiplay_catalog::KIND_FILM) => vec!["Film".to_string()],
        Some(raiplay_catalog::KIND_SERIE) => {
            vec!["Serie".to_string(), "Fiction".to_string()]
        }
        Some(raiplay_catalog::KIND_SPORT) => vec!["Sport".to_string()],
        Some(raiplay_catalog::KIND_LIVE) => {
            vec!["Live".to_string(), "Diretta".to_string()]
        }
        _ => vec![
            "Bambini".to_string(),
            "Animazione".to_string(),
            "Cartoni".to_string(),
        ],
    }
}

fn meta_type_for_kind(kind: Option<&str>, has_many_episodes: bool) -> String {
    match kind {
        Some(raiplay_catalog::KIND_FILM) | Some(raiplay_catalog::KIND_LIVE) => {
            "movie".to_string()
        }
        Some(raiplay_catalog::KIND_SERIE) | Some(raiplay_catalog::KIND_SPORT) => {
            "series".to_string()
        }
        _ if has_many_episodes => "series".to_string(),
        _ => "series".to_string(),
    }
}

fn fetch_live_meta(client: &Client, slug: &str) -> Result<StremioMeta, String> {
    let channel = raiplay_catalog::live_channel_from_slug(slug)
        .ok_or_else(|| "Canale live RaiPlay non valido".to_string())?;
    let program = fetch_json(client, &program_url(slug))?;
    if drm_blocked(&program) {
        return Err("Questo canale RaiPlay è protetto da DRM".into());
    }

    let name = program
        .get("channel")
        .or_else(|| program.get("name"))
        .and_then(|v| v.as_str())
        .map(decode_html_entities)
        .filter(|s| !s.trim().is_empty())
        .unwrap_or_else(|| channel.to_string());

    let description = program
        .get("description")
        .and_then(|v| v.as_str())
        .map(decode_html_entities);

    let poster = program
        .get("still_frame")
        .and_then(|v| v.as_str())
        .map(absolute_media_url)
        .or_else(|| {
            program
                .get("transparent_icon")
                .and_then(|v| v.as_str())
                .map(absolute_media_url)
        });

    let content_url = program
        .pointer("/video/content_url")
        .or_else(|| program.get("content_url"))
        .and_then(|v| v.as_str())
        .map(str::trim)
        .filter(|s| !s.is_empty());
    if content_url.is_none() {
        return Err("Stream live RaiPlay non disponibile".into());
    }

    // video id punta al JSON /dirette/{channel}.json così resolve_playback lo riconosce
    let video_id = format!("/dirette/{channel}.json");

    Ok(StremioMeta {
        id: slug.to_string(),
        r#type: "movie".to_string(),
        name: name.clone(),
        poster: poster.clone(),
        background: poster.clone(),
        description,
        release_info: Some("In diretta".to_string()),
        genres: genres_for_cached_kind(Some(raiplay_catalog::KIND_LIVE)),
        videos: vec![StremioVideo {
            id: video_id,
            title: format!("{name} · Diretta"),
            season: None,
            episode: None,
            thumbnail: poster,
            released: None,
            description: None,
            runtime: None,
        }],
        runtime: None,
        logo: None,
        rating: None,
        cast: Vec::new(),
        directors: Vec::new(),
        view_count: None,
        quality: None,
        has_preview: false,
        season_numbers: Vec::new(),
        coming_soon: false,
    })
}

fn fetch_standalone_video_meta(client: &Client, slug: &str) -> Result<StremioMeta, String> {
    let path = raiplay_catalog::video_json_path_from_slug(slug);
    let video = fetch_json(client, &format!("{APP_ORIGIN}{path}"))?;
    if drm_blocked(&video) {
        return Err("Questo video RaiPlay è protetto da DRM".into());
    }

    let name = video
        .get("name")
        .or_else(|| video.pointer("/video/name"))
        .and_then(|v| v.as_str())
        .map(decode_html_entities)
        .filter(|s| !s.trim().is_empty())
        .unwrap_or_else(|| slug.rsplit('/').next().unwrap_or(slug).to_string());

    let description = video
        .get("description")
        .or_else(|| video.pointer("/video/description"))
        .and_then(|v| v.as_str())
        .map(decode_html_entities);

    let images = video.get("images").or_else(|| video.pointer("/video/images"));
    let poster = images.and_then(|imgs| image_from_map(imgs, &["landscape", "portrait", "square"]));
    let background = poster.clone();
    let video_id = normalize_video_path(&path);

    Ok(StremioMeta {
        id: slug.to_string(),
        r#type: "movie".to_string(),
        name: name.clone(),
        poster: poster.clone(),
        background,
        description,
        release_info: Some("RaiPlay Sport".to_string()),
        genres: genres_for_cached_kind(Some(raiplay_catalog::KIND_SPORT)),
        videos: vec![StremioVideo {
            id: video_id,
            title: name,
            season: None,
            episode: None,
            thumbnail: poster,
            released: None,
            description: None,
            runtime: video
                .get("duration")
                .or_else(|| video.pointer("/video/duration"))
                .and_then(|v| v.as_str())
                .map(|s| s.to_string()),
        }],
        runtime: None,
        logo: None,
        rating: None,
        cast: Vec::new(),
        directors: Vec::new(),
        view_count: None,
        quality: None,
        has_preview: false,
        season_numbers: Vec::new(),
        coming_soon: false,
    })
}

pub fn fetch_title_meta(db: &Database, slug: &str) -> Result<StremioMeta, String> {
    if !raiplay_catalog::enabled(db) {
        return Err("Catalogo RaiPlay disabilitato".into());
    }
    let slug = slug.trim().trim_matches('/').to_ascii_lowercase();
    if slug.is_empty() {
        return Err("Programma RaiPlay non specificato".into());
    }

    let client = http_client()?;
    if raiplay_catalog::is_live_slug(&slug) {
        return fetch_live_meta(&client, &slug);
    }
    if raiplay_catalog::is_video_slug(&slug) {
        return fetch_standalone_video_meta(&client, &slug);
    }

    let kind = raiplay_catalog::cached_kind_for_slug(db, &slug);
    let program = fetch_json(&client, &program_url(&slug))?;
    if drm_blocked(&program) {
        return Err("Questo titolo RaiPlay è protetto da DRM e non è riproducibile in Branchefy".into());
    }

    let info = program.get("program_info").unwrap_or(&program);
    let name = info
        .get("name")
        .or_else(|| program.get("name"))
        .and_then(|v| v.as_str())
        .map(decode_html_entities)
        .filter(|s| !s.trim().is_empty())
        .unwrap_or_else(|| slug.clone());

    let description = info
        .get("description")
        .and_then(|v| v.as_str())
        .map(decode_html_entities);

    let images = info.get("images").or_else(|| program.get("images"));
    let poster = images.and_then(|imgs| image_from_map(imgs, &["portrait", "square", "landscape"]));
    let background =
        images.and_then(|imgs| image_from_map(imgs, &["landscape", "portrait", "square"]));
    let genres = genres_for_cached_kind(kind.as_deref());

    let videos = collect_episodes(&client, &program)?;
    if videos.is_empty() {
        // fallback: first_item_path as single episode / film
        if let Some(first) = program
            .get("first_item_path")
            .and_then(|v| v.as_str())
            .map(str::trim)
            .filter(|s| !s.is_empty())
        {
            let video_id = normalize_video_path(first);
            let r#type = meta_type_for_kind(kind.as_deref(), false);
            return Ok(StremioMeta {
                id: slug.clone(),
                r#type,
                name: name.clone(),
                poster: poster.clone(),
                background: background.clone(),
                description: description.clone(),
                release_info: Some("RaiPlay".to_string()),
                genres,
                videos: vec![StremioVideo {
                    id: video_id,
                    title: name.clone(),
                    season: Some(1),
                    episode: Some(1),
                    thumbnail: poster.clone(),
                    released: None,
                    description: description.clone(),
                    runtime: program
                        .get("first_item_duration")
                        .and_then(|v| v.as_str())
                        .map(|s| s.to_string()),
                }],
                runtime: None,
                logo: None,
                rating: None,
                cast: Vec::new(),
                directors: Vec::new(),
                view_count: None,
                quality: None,
                has_preview: false,
                season_numbers: vec![1],
                coming_soon: false,
            });
        }
        return Err("Nessuna puntata free disponibile per questo programma".into());
    }

    let mut season_numbers: Vec<i32> = videos.iter().filter_map(|v| v.season).collect();
    season_numbers.sort_unstable();
    season_numbers.dedup();
    let r#type = meta_type_for_kind(kind.as_deref(), videos.len() > 1);

    Ok(StremioMeta {
        id: slug,
        r#type,
        name,
        poster,
        background,
        description,
        release_info: Some("RaiPlay".to_string()),
        genres,
        videos,
        runtime: None,
        logo: None,
        rating: None,
        cast: Vec::new(),
        directors: Vec::new(),
        view_count: None,
        quality: None,
        has_preview: false,
        season_numbers,
        coming_soon: false,
    })
}

fn extract_m3u8_from_relinker_xml(xml: &str) -> Option<String> {
    // CDATA or plain url type=content
    let cdata_re =
        Regex::new(r#"(?is)<url[^>]*type\s*=\s*"content"[^>]*>\s*<!\[CDATA\[(.*?)\]\]>"#).ok()?;
    if let Some(cap) = cdata_re.captures(xml) {
        let url = sanitize_relinker_m3u8(cap[1].trim());
        if url.contains(".m3u8") || url.starts_with("http") {
            return Some(url);
        }
    }
    let plain_re =
        Regex::new(r#"(?is)<url[^>]*type\s*=\s*"content"[^>]*>\s*([^<\s]+)"#).ok()?;
    if let Some(cap) = plain_re.captures(xml) {
        let url = sanitize_relinker_m3u8(cap[1].trim());
        if url.contains("http") {
            return Some(url);
        }
    }
    // fallback: first m3u8 in document
    let m3u8_re = Regex::new(r#"https?://[^\s"'<>]+\.m3u8[^\s"'<>]*"#).ok()?;
    m3u8_re
        .find(xml)
        .map(|m| sanitize_relinker_m3u8(&m.as_str().replace("&amp;", "&")))
}

fn sanitize_relinker_m3u8(raw: &str) -> String {
    let mut url = raw.trim().replace("&amp;", "&");
    // Il fallback regex può mangiare i `]]` di chiusura CDATA.
    while url.ends_with(']') {
        url.pop();
    }
    url
}

fn resolve_relinker_to_hls(client: &Client, relinker_url: &str) -> Result<String, String> {
    let mut url = relinker_url.trim().to_string();
    if url.starts_with("//") {
        url = format!("https:{url}");
    }
    if !url.contains("output=") {
        url = if url.contains('?') {
            format!("{url}&output=64")
        } else {
            format!("{url}?output=64")
        };
    }

    let resp = client
        .get(&url)
        .header("Accept", "*/*")
        .header("Referer", APP_ORIGIN)
        .header("Origin", APP_ORIGIN)
        .send()
        .map_err(|e| format!("Relinker RaiPlay: {e}"))?;

    let status = resp.status();
    let final_url = resp.url().clone();
    let body = resp.text().map_err(|e| e.to_string())?;

    if !status.is_success() {
        return Err(format!(
            "Relinker RaiPlay HTTP {} (spesso geo-block fuori Italia)",
            status.as_u16()
        ));
    }

    let final_s = final_url.as_str();
    if final_s.contains(".m3u8") {
        return Ok(final_s.to_string());
    }
    if body.contains("video_no_available") {
        return Err(
            "Stream RaiPlay non disponibile da questa rete (geo-Italia richiesta)".into(),
        );
    }
    if let Some(m3u8) = extract_m3u8_from_relinker_xml(&body) {
        if m3u8.contains("video_no_available") {
            return Err(
                "Stream RaiPlay non disponibile da questa rete (geo-Italia richiesta)".into(),
            );
        }
        return Ok(m3u8.replace("&amp;", "&"));
    }

    Err("Impossibile ottenere lo stream HLS da RaiPlay".into())
}

fn is_dirette_path(path: &str) -> bool {
    let lower = path.trim().to_ascii_lowercase();
    lower.contains("/dirette/") || lower.starts_with("live-")
}

pub fn resolve_playback(
    db: &Database,
    slug: &str,
    episode_id: Option<&str>,
    proxy: &AddonProxyRegistry,
) -> Result<PlayableStream, String> {
    if !raiplay_catalog::enabled(db) {
        return Err("Catalogo RaiPlay disabilitato".into());
    }
    let episode_id = episode_id
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .or_else(|| {
            if raiplay_catalog::is_video_slug(slug) || raiplay_catalog::is_live_slug(slug) {
                Some(slug.trim())
            } else {
                None
            }
        })
        .ok_or_else(|| "Seleziona una puntata RaiPlay da riprodurre".to_string())?;

    let client = http_client()?;
    let video = if is_dirette_path(episode_id) || raiplay_catalog::is_live_slug(slug) {
        let live_slug = if raiplay_catalog::is_live_slug(slug) {
            slug.trim().to_ascii_lowercase()
        } else if let Some(ch) = episode_id
            .split("/dirette/")
            .nth(1)
            .map(|s| s.trim_end_matches(".json"))
            .filter(|s| !s.is_empty())
        {
            format!("live-{ch}")
        } else {
            slug.trim().to_ascii_lowercase()
        };
        fetch_json(&client, &program_url(&live_slug))?
    } else {
        let video_url = if raiplay_catalog::is_video_slug(episode_id)
            || raiplay_catalog::is_video_slug(slug)
        {
            let path_slug = if raiplay_catalog::is_video_slug(episode_id) {
                episode_id
            } else {
                slug
            };
            format!(
                "{APP_ORIGIN}{}",
                raiplay_catalog::video_json_path_from_slug(path_slug)
            )
        } else {
            video_json_url(episode_id)
        };
        fetch_json(&client, &video_url)?
    };

    if drm_blocked(&video) {
        return Err("Questa puntata è protetta da DRM e non è riproducibile in Branchefy".into());
    }

    let content_url = video
        .pointer("/video/content_url")
        .or_else(|| video.get("content_url"))
        .or_else(|| video.get("video_url"))
        .and_then(|v| v.as_str())
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .ok_or_else(|| "URL stream assente nel JSON RaiPlay".to_string())?;

    let hls_url = resolve_relinker_to_hls(&client, content_url)?;

    let mut headers = HashMap::new();
    headers.insert("Referer".to_string(), format!("{APP_ORIGIN}/"));
    headers.insert("Origin".to_string(), APP_ORIGIN.to_string());
    headers.insert("User-Agent".to_string(), USER_AGENT.to_string());

    let proxy_id = proxy.register(hls_url, headers, true, false);
    let stream_name = if raiplay_catalog::is_live_slug(slug) || is_dirette_path(episode_id) {
        "RaiPlay Diretta"
    } else {
        "RaiPlay"
    };
    Ok(PlayableStream {
        url: proxy.playback_url(&proxy_id),
        name: Some(stream_name.to_string()),
        description: None,
        addon_id: "raiplay".to_string(),
        addon_name: "RaiPlay".to_string(),
        is_hls: true,
        is_dash: false,
        proxied: true,
        needs_debrid: false,
        info_hash: None,
        file_idx: None,
        sources: Vec::new(),
        drm_widevine_license_url: None,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn empty_drm_object_is_allowed() {
        let v: Value = serde_json::json!({
            "rights_management": { "rights": { "drm": {} } }
        });
        assert!(!drm_blocked(&v));
    }

    #[test]
    fn nonempty_drm_is_blocked() {
        let v: Value = serde_json::json!({
            "rights_management": { "rights": { "drm": { "Widevine": true } } }
        });
        assert!(drm_blocked(&v));
    }

    #[test]
    fn extracts_m3u8_from_cdata() {
        let xml = r#"<Mediapolis><url type="content"><![CDATA[https://cdn.example/playlist.m3u8?x=1]]></url></Mediapolis>"#;
        assert_eq!(
            extract_m3u8_from_relinker_xml(xml).as_deref(),
            Some("https://cdn.example/playlist.m3u8?x=1")
        );
    }

    #[test]
    fn normalizes_video_paths() {
        assert_eq!(
            normalize_video_path("/video/2018/02/bing.json"),
            "/video/2018/02/bing.json"
        );
        assert!(video_json_url("/video/2018/02/bing.json").contains("raiplay.it"));
    }
}
