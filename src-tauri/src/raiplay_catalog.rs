use crate::db::Database;
use crate::html_text::decode_html_entities;
use crate::sc_catalog::ScCatalogRow;
use crate::stremio::StremioMetaPreview;
use regex::Regex;
use reqwest::blocking::Client;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

const META_INDEX: &str = "raiplay_catalog_index";
const META_INDEX_TS: &str = "raiplay_catalog_index_ts";
const META_INDEX_VERSION: &str = "raiplay_catalog_index_version";
/// v7: Sport con righe da blocchi tipologia (Slider/Hero)
const INDEX_VERSION: &str = "7";
const META_ENABLED: &str = "raiplay_catalog_enabled";
const META_SPORT_ROWS: &str = "raiplay_sport_rows";
const INDEX_TTL_SECS: i64 = 12 * 3600;
const HTTP_TIMEOUT_SECS: u64 = 45;
const APP_ORIGIN: &str = "https://www.raiplay.it";
const ROW_LIMIT: usize = 60;
const USER_AGENT: &str = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 \
     (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Branchefy/0.1";

pub const KIND_BAMBINI: &str = "bambini";
pub const KIND_FILM: &str = "film";
pub const KIND_SERIE: &str = "serie";
pub const KIND_SPORT: &str = "sport";
pub const KIND_LIVE: &str = "live";

const ROW_BAMBINI: &str = "raiplay-bambini";
const ROW_FILM: &str = "raiplay-film";
const ROW_SERIE: &str = "raiplay-serie";
const ROW_SPORT: &str = "raiplay-sport";
const ROW_LIVE: &str = "raiplay-live";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CachedProgram {
    /// bambini | film | serie | sport | live
    kind: String,
    slug: String,
    name: String,
    poster: Option<String>,
    background: Option<String>,
    description: Option<String>,
    /// Solo live: icona canale
    #[serde(default)]
    logo: Option<String>,
    /// Solo live: titolo programma in onda (es. "Capri")
    #[serde(default)]
    live_title: Option<String>,
    /// Solo live: orario inizio "15:00"
    #[serde(default)]
    live_start_hour: Option<String>,
    /// Solo live: durata in minuti
    #[serde(default)]
    live_duration_mins: Option<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CachedSportRow {
    key: String,
    title: String,
    slugs: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RaiplayCatalogResponse {
    pub rows: Vec<ScCatalogRow>,
    pub index: Vec<StremioMetaPreview>,
    pub synced_at: i64,
    pub total_count: usize,
}

fn now_ts() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0)
}

fn http_client() -> Result<Client, String> {
    Client::builder()
        .timeout(Duration::from_secs(HTTP_TIMEOUT_SECS))
        .user_agent(USER_AGENT)
        .build()
        .map_err(|e| e.to_string())
}

pub fn ensure_defaults(db: &Database) -> Result<(), String> {
    if db.get_meta(META_ENABLED)?.is_none() {
        db.set_meta(META_ENABLED, "1")?;
    }
    Ok(())
}

pub fn enabled(db: &Database) -> bool {
    db.get_meta(META_ENABLED)
        .ok()
        .flatten()
        .map(|v| {
            let t = v.trim();
            t != "0" && !t.eq_ignore_ascii_case("false")
        })
        .unwrap_or(true)
}

pub fn absolute_media_url(path: &str) -> String {
    let trimmed = path.trim();
    if trimmed.starts_with("http://") || trimmed.starts_with("https://") {
        return trimmed.to_string();
    }
    if trimmed.starts_with("//") {
        return format!("https:{trimmed}");
    }
    format!(
        "{APP_ORIGIN}{}",
        if trimmed.starts_with('/') {
            trimmed.to_string()
        } else {
            format!("/{trimmed}")
        }
    )
}

pub fn is_live_slug(slug: &str) -> bool {
    slug.trim().starts_with("live-")
}

/// Clip / video singolo (highlights) dal catalogo Sport.
pub fn is_video_slug(slug: &str) -> bool {
    let s = slug.trim().trim_start_matches('/');
    s.starts_with("video/") || s.starts_with("vid:")
}

pub fn video_json_path_from_slug(slug: &str) -> String {
    let s = slug.trim().trim_start_matches('/');
    let path = s.strip_prefix("vid:").unwrap_or(s);
    if path.ends_with(".json") {
        format!("/{path}")
    } else {
        format!("/{path}.json")
    }
}

pub fn live_channel_from_slug(slug: &str) -> Option<&str> {
    slug.trim().strip_prefix("live-").filter(|s| !s.is_empty())
}

fn stremio_type_for_kind(kind: &str) -> &'static str {
    match kind {
        KIND_FILM | KIND_LIVE => "movie",
        _ => "series",
    }
}

fn genres_for_kind(kind: &str) -> Vec<String> {
    match kind {
        KIND_BAMBINI => vec![
            "Animazione".to_string(),
            "Bambini".to_string(),
            "Cartoni".to_string(),
        ],
        KIND_FILM => vec!["Film".to_string()],
        KIND_SERIE => vec!["Serie".to_string(), "Fiction".to_string()],
        KIND_SPORT => vec!["Sport".to_string()],
        KIND_LIVE => vec!["Live".to_string(), "Diretta".to_string()],
        _ => vec!["RaiPlay".to_string()],
    }
}

fn row_meta(kind: &str) -> (&'static str, &'static str) {
    match kind {
        KIND_BAMBINI => (ROW_BAMBINI, "RaiPlay Bambini"),
        KIND_FILM => (ROW_FILM, "RaiPlay Film"),
        KIND_SERIE => (ROW_SERIE, "RaiPlay Serie"),
        KIND_SPORT => (ROW_SPORT, "RaiPlay Sport"),
        KIND_LIVE => (ROW_LIVE, "In diretta · RaiPlay"),
        _ => ("raiplay", "RaiPlay"),
    }
}

fn preview_from_cached(p: &CachedProgram) -> StremioMetaPreview {
    let (row_key, row_title) = row_meta(&p.kind);
    let release_info = if p.kind == KIND_LIVE {
        match (&p.live_start_hour, p.live_duration_mins) {
            (Some(hour), Some(mins)) => Some(format!("live|{hour}|{mins}")),
            _ => Some("In diretta".to_string()),
        }
    } else {
        Some("RaiPlay".to_string())
    };
    let description = if p.kind == KIND_LIVE {
        p.live_title
            .clone()
            .or_else(|| p.description.clone())
    } else {
        p.description.clone()
    };
    StremioMetaPreview {
        id: p.slug.clone(),
        r#type: if is_video_slug(&p.slug) {
            "movie".to_string()
        } else {
            stremio_type_for_kind(&p.kind).to_string()
        },
        name: p.name.clone(),
        poster: p.poster.clone(),
        background: p.background.clone().or_else(|| p.poster.clone()),
        logo: p.logo.clone(),
        poster_shape: Some("poster".to_string()),
        description,
        release_info,
        catalog_prefix: Some("raiplay".to_string()),
        slug: Some(p.slug.clone()),
        genres: genres_for_kind(&p.kind),
        cast: Vec::new(),
        directors: Vec::new(),
        streaming_services: Some(vec!["raiplay".to_string()]),
        source_row_key: Some(row_key.to_string()),
        source_row_title: Some(row_title.to_string()),
        resume_video_id: None,
    }
}

fn load_cached_programs(db: &Database) -> Vec<CachedProgram> {
    let Ok(Some(raw)) = db.get_meta(META_INDEX) else {
        return Vec::new();
    };
    serde_json::from_str::<Vec<CachedProgram>>(&raw).unwrap_or_default()
}

fn cache_fresh(db: &Database) -> bool {
    let Ok(Some(ver)) = db.get_meta(META_INDEX_VERSION) else {
        return false;
    };
    if ver.trim() != INDEX_VERSION {
        return false;
    }
    let Ok(Some(ts_raw)) = db.get_meta(META_INDEX_TS) else {
        return false;
    };
    let Ok(ts) = ts_raw.trim().parse::<i64>() else {
        return false;
    };
    now_ts().saturating_sub(ts) < INDEX_TTL_SECS && !load_cached_programs(db).is_empty()
}

fn save_cache(db: &Database, programs: &[CachedProgram]) -> Result<(), String> {
    let json = serde_json::to_string(programs).map_err(|e| e.to_string())?;
    db.set_meta(META_INDEX, &json)?;
    db.set_meta(META_INDEX_TS, &now_ts().to_string())?;
    db.set_meta(META_INDEX_VERSION, INDEX_VERSION)?;
    Ok(())
}

fn title_case_slug(slug: &str) -> String {
    slug.split('-')
        .filter(|s| !s.is_empty())
        .map(|part| {
            let mut chars = part.chars();
            match chars.next() {
                Some(c) => format!("{}{}", c.to_uppercase(), chars.as_str()),
                None => String::new(),
            }
        })
        .collect::<Vec<_>>()
        .join(" ")
}

/// Parse lineare (niente regex “greedy” su HTML da 10–20MB).
fn parse_listing_html(html: &str, kind: &str) -> Vec<CachedProgram> {
    let mut by_slug: HashMap<String, CachedProgram> = HashMap::new();
    let marker = "\"path_id\":\"/programmi/";
    let mut search_from = 0usize;

    while let Some(rel) = html[search_from..].find(marker) {
        let start = search_from + rel + marker.len();
        let rest = &html[start..];
        let Some(end) = rest.find(".json\"") else {
            break;
        };
        let slug = rest[..end].to_ascii_lowercase();
        search_from = start + end + 6;
        if slug.is_empty() || !slug.chars().all(|c| c.is_ascii_alphanumeric() || c == '-') {
            continue;
        }

        let window = &html[search_from..search_from.saturating_add(900).min(html.len())];
        let mut name = String::new();
        let mut poster = None;
        let mut background = None;

        if let Some(n0) = window.find("\"name\":\"") {
            let after = &window[n0 + 8..];
            if let Some(n1) = after.find('"') {
                let raw = &after[..n1];
                if !raw.is_empty() && raw.len() < 120 && !raw.contains('\\') {
                    name = decode_html_entities(raw);
                } else if !raw.is_empty() && raw.len() < 120 {
                    name = decode_html_entities(
                        &raw.replace("\\u0027", "'").replace("\\'", "'"),
                    );
                }
            }
        }

        for (key, is_portrait) in [
            ("\"portrait\":\"", true),
            ("\"portrait_logo\":\"", true),
            ("\"square\":\"", true),
            ("\"landscape\":\"", false),
        ] {
            if let Some(i0) = window.find(key) {
                let after = &window[i0 + key.len()..];
                if after.starts_with("null") {
                    continue;
                }
                if let Some(i1) = after.find('"') {
                    let path = &after[..i1];
                    if path.starts_with('/') || path.starts_with("http") {
                        let url = absolute_media_url(path);
                        if is_portrait {
                            if poster.is_none() {
                                poster = Some(url);
                            }
                        } else {
                            if background.is_none() {
                                background = Some(url.clone());
                            }
                            if poster.is_none() {
                                poster = Some(url);
                            }
                        }
                    }
                }
            }
        }

        by_slug.entry(slug.clone()).or_insert_with(|| CachedProgram {
            kind: kind.to_string(),
            slug,
            name,
            poster,
            background,
            description: None,
            logo: None,
            live_title: None,
            live_start_hour: None,
            live_duration_mins: None,
        });
    }

    let mut out: Vec<CachedProgram> = by_slug.into_values().collect();
    for p in &mut out {
        if p.name.trim().is_empty() {
            p.name = title_case_slug(&p.slug);
        }
    }
    out.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    out
}

fn fetch_json_page(client: &Client, path: &str) -> Result<serde_json::Value, String> {
    let url = if path.starts_with("http") {
        path.to_string()
    } else {
        format!("{APP_ORIGIN}{path}")
    };
    let text = client
        .get(&url)
        .header("Accept", "application/json, text/plain, */*")
        .header("Referer", APP_ORIGIN)
        .send()
        .map_err(|e| format!("Rete RaiPlay: {e}"))?
        .error_for_status()
        .map_err(|e| format!("Risorsa RaiPlay non disponibile ({path}): {e}"))?
        .text()
        .map_err(|e| e.to_string())?;
    let trimmed = text.trim();
    if trimmed.starts_with('<') {
        return Err(format!("HTML invece di JSON ({path})"));
    }
    serde_json::from_str(trimmed).map_err(|e| format!("JSON non valido ({path}): {e}"))
}

fn image_from_item(images: &serde_json::Value) -> (Option<String>, Option<String>) {
    let pick = |keys: &[&str]| -> Option<String> {
        for key in keys {
            if let Some(path) = images.get(*key).and_then(|v| v.as_str()) {
                let trimmed = path.trim();
                if !trimmed.is_empty() && trimmed != "null" {
                    return Some(absolute_media_url(trimmed));
                }
            }
        }
        None
    };
    let poster = pick(&[
        "portrait43",
        "portrait_logo",
        "portrait",
        "square",
        "landscape_logo",
        "landscape",
    ]);
    let background = pick(&[
        "landscape_logo",
        "landscape",
        "landscape43",
        "portrait43",
        "portrait",
    ]);
    (poster, background)
}

fn slug_from_program_path(path: &str) -> Option<String> {
    let trimmed = path.trim().trim_end_matches(".json").trim_end_matches('/');
    let slug = trimmed
        .rsplit('/')
        .next()
        .unwrap_or("")
        .trim()
        .to_ascii_lowercase();
    if slug.is_empty() {
        None
    } else {
        Some(slug)
    }
}

fn walk_tipologia_items(
    value: &serde_json::Value,
    kind: &str,
    out: &mut HashMap<String, CachedProgram>,
) {
    match value {
        serde_json::Value::Array(arr) => {
            for item in arr {
                walk_tipologia_items(item, kind, out);
            }
        }
        serde_json::Value::Object(map) => {
            let path = map
                .get("program_path_id")
                .or_else(|| map.get("path_id"))
                .and_then(|v| v.as_str())
                .unwrap_or("");
            if path.contains("/programmi/") && path.ends_with(".json") {
                if let Some(slug) = slug_from_program_path(path) {
                    let name = map
                        .get("name")
                        .and_then(|v| v.as_str())
                        .map(decode_html_entities)
                        .filter(|s| !s.trim().is_empty())
                        .unwrap_or_else(|| title_case_slug(&slug));
                    let description = map
                        .get("description")
                        .or_else(|| map.get("vanity"))
                        .and_then(|v| v.as_str())
                        .map(decode_html_entities);
                    let (poster, background) = map
                        .get("images")
                        .map(image_from_item)
                        .unwrap_or((None, None));
                    out.entry(slug.clone()).or_insert_with(|| CachedProgram {
                        kind: kind.to_string(),
                        slug,
                        name,
                        poster,
                        background,
                        description,
                        logo: None,
                        live_title: None,
                        live_start_hour: None,
                        live_duration_mins: None,
                    });
                }
            }
            for (_k, child) in map {
                walk_tipologia_items(child, kind, out);
            }
        }
        _ => {}
    }
}

fn parse_tipologia_index(json: &serde_json::Value, kind: &str) -> Vec<CachedProgram> {
    let mut by_slug = HashMap::new();
    if let Some(contents) = json.get("contents") {
        walk_tipologia_items(contents, kind, &mut by_slug);
    } else {
        walk_tipologia_items(json, kind, &mut by_slug);
    }
    let mut out: Vec<CachedProgram> = by_slug.into_values().collect();
    out.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    out
}

fn slugify_block_title(title: &str) -> String {
    let mut out = String::new();
    for ch in title.chars() {
        let lower = ch.to_ascii_lowercase();
        if lower.is_ascii_alphanumeric() {
            out.push(lower);
        } else if (lower == ' ' || lower == '-' || lower == '|' || lower == '–' || lower == '—')
            && !out.ends_with('-')
        {
            out.push('-');
        }
    }
    let trimmed = out.trim_matches('-').to_string();
    if trimmed.is_empty() {
        "row".into()
    } else {
        trimmed.chars().take(48).collect()
    }
}

fn program_from_tipologia_card(map: &serde_json::Map<String, serde_json::Value>, kind: &str) -> Option<CachedProgram> {
    let path = map
        .get("program_path_id")
        .or_else(|| map.get("path_id"))
        .and_then(|v| v.as_str())
        .unwrap_or("");
    let (slug, prefer_landscape) = if path.contains("/programmi/") && path.ends_with(".json") {
        (slug_from_program_path(path)?, false)
    } else if path.contains("/video/") && path.ends_with(".json") {
        let trimmed = path.trim().trim_start_matches('/');
        let slug = trimmed
            .strip_suffix(".json")
            .unwrap_or(trimmed)
            .to_ascii_lowercase();
        if slug.is_empty() {
            return None;
        }
        (slug, true)
    } else {
        return None;
    };

    let name = map
        .get("name")
        .and_then(|v| v.as_str())
        .map(decode_html_entities)
        .filter(|s| !s.trim().is_empty())
        .unwrap_or_else(|| title_case_slug(slug.rsplit('/').next().unwrap_or(&slug)));
    let description = map
        .get("description")
        .or_else(|| map.get("vanity"))
        .and_then(|v| v.as_str())
        .map(decode_html_entities);
    let (poster, background) = map
        .get("images")
        .map(|imgs| {
            if prefer_landscape {
                let landscape = imgs
                    .get("landscape")
                    .or_else(|| imgs.get("landscape43"))
                    .and_then(|v| v.as_str())
                    .map(absolute_media_url);
                let portrait = imgs
                    .get("portrait")
                    .or_else(|| imgs.get("square"))
                    .and_then(|v| v.as_str())
                    .map(absolute_media_url);
                (
                    landscape.clone().or(portrait.clone()),
                    landscape.or(portrait),
                )
            } else {
                image_from_item(imgs)
            }
        })
        .unwrap_or((None, None));

    Some(CachedProgram {
        kind: kind.to_string(),
        slug,
        name,
        poster,
        background,
        description,
        logo: None,
        live_title: None,
        live_start_hour: None,
        live_duration_mins: None,
    })
}

fn collect_programs_from_value(
    value: &serde_json::Value,
    kind: &str,
    out: &mut Vec<CachedProgram>,
    seen: &mut std::collections::HashSet<String>,
) {
    match value {
        serde_json::Value::Array(arr) => {
            for item in arr {
                collect_programs_from_value(item, kind, out, seen);
            }
        }
        serde_json::Value::Object(map) => {
            if let Some(program) = program_from_tipologia_card(map, kind) {
                if seen.insert(program.slug.clone()) {
                    out.push(program);
                }
            }
            for (_k, child) in map {
                collect_programs_from_value(child, kind, out, seen);
            }
        }
        _ => {}
    }
}

/// Blocchi Slider/Hero della tipologia Sport → righe nominate + indice piatto.
fn parse_sport_tipologia(json: &serde_json::Value) -> (Vec<CachedProgram>, Vec<CachedSportRow>) {
    let mut index_by_slug: HashMap<String, CachedProgram> = HashMap::new();
    let mut rows: Vec<CachedSportRow> = Vec::new();
    let Some(contents) = json.get("contents").and_then(|v| v.as_array()) else {
        let flat = parse_tipologia_index(json, KIND_SPORT);
        return (flat, Vec::new());
    };

    for block in contents {
        let typ = block
            .get("type")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_ascii_lowercase();
        if !typ.contains("slider") && !typ.contains("hero") {
            continue;
        }
        let title = block
            .get("name")
            .and_then(|v| v.as_str())
            .map(decode_html_entities)
            .unwrap_or_default();
        let title_trim = title.trim();
        if title_trim.is_empty() {
            continue;
        }
        // Hero RaiPlay: solo seed per l'index/hero UI, non come riga carousel.
        let is_hero = typ.contains("hero");
        let mut block_items = Vec::new();
        let mut seen = std::collections::HashSet::new();
        if let Some(inner) = block.get("contents") {
            collect_programs_from_value(inner, KIND_SPORT, &mut block_items, &mut seen);
        }
        if block_items.is_empty() {
            continue;
        }
        for program in &block_items {
            index_by_slug
                .entry(program.slug.clone())
                .or_insert_with(|| program.clone());
        }
        if is_hero {
            continue;
        }
        let key = format!("raiplay-sport-{}", slugify_block_title(title_trim));
        rows.push(CachedSportRow {
            key,
            title: title_trim.to_string(),
            slugs: block_items.into_iter().map(|p| p.slug).collect(),
        });
    }

    let mut programs: Vec<CachedProgram> = index_by_slug.into_values().collect();
    if programs.is_empty() {
        programs = parse_tipologia_index(json, KIND_SPORT);
    }
    programs.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    (programs, rows)
}

fn fetch_tipologia_section(client: &Client, path: &str, kind: &str) -> Result<Vec<CachedProgram>, String> {
    let json = fetch_json_page(client, path)?;
    let programs = parse_tipologia_index(&json, kind);
    if programs.is_empty() {
        return Err(format!("Nessun programma in {path}"));
    }
    Ok(programs)
}

fn fetch_sport_section(
    client: &Client,
) -> Result<(Vec<CachedProgram>, Vec<CachedSportRow>), String> {
    let json = fetch_json_page(client, "/tipologia/sport/index.json")?;
    let (programs, rows) = parse_sport_tipologia(&json);
    if programs.is_empty() {
        return Err("Nessun programma in /tipologia/sport/index.json".into());
    }
    Ok((programs, rows))
}

fn save_sport_rows(db: &Database, rows: &[CachedSportRow]) -> Result<(), String> {
    let raw = serde_json::to_string(rows).map_err(|e| e.to_string())?;
    db.set_meta(META_SPORT_ROWS, &raw)
}

fn load_sport_rows(db: &Database) -> Vec<CachedSportRow> {
    let Ok(Some(raw)) = db.get_meta(META_SPORT_ROWS) else {
        return Vec::new();
    };
    serde_json::from_str::<Vec<CachedSportRow>>(&raw).unwrap_or_default()
}

fn fetch_html_page(client: &Client, path: &str) -> Result<String, String> {
    let url = format!("{APP_ORIGIN}{path}");
    client
        .get(&url)
        .header("Accept", "text/html,application/xhtml+xml")
        .header("Referer", APP_ORIGIN)
        .send()
        .map_err(|e| format!("Rete RaiPlay: {e}"))?
        .error_for_status()
        .map_err(|e| format!("Pagina RaiPlay non disponibile ({path}): {e}"))?
        .text()
        .map_err(|e| e.to_string())
}

fn channel_id_matches(channel_name: &str, live_id: &str) -> bool {
    let normalized_ch = channel_name
        .to_ascii_lowercase()
        .replace(' ', "")
        .replace('-', "");
    let normalized_id = live_id.to_ascii_lowercase().replace('-', "");
    normalized_ch == normalized_id
        || normalized_ch == format!("rai{normalized_id}")
        || normalized_ch.ends_with(&normalized_id)
}

/// Path media RaiPlay non vuoto → URL assoluto.
fn nonempty_media_url(path: Option<&str>) -> Option<String> {
    path.map(str::trim)
        .filter(|s| !s.is_empty() && *s != "null")
        .map(absolute_media_url)
}

/// Poster live da currentItem onAir: ignora `landscape`/`image` vuoti
/// (Rai 4 / Rai News 24 spesso hanno landscape="" e solo `image`).
fn live_on_air_poster(current: &serde_json::Value) -> Option<String> {
    if let Some(images) = current.get("images") {
        for key in [
            "landscape",
            "landscape_logo",
            "landscape43",
            "portrait",
            "portrait43",
            "square",
        ] {
            if let Some(url) = nonempty_media_url(images.get(key).and_then(|v| v.as_str())) {
                return Some(url);
            }
        }
    }
    nonempty_media_url(current.get("image").and_then(|v| v.as_str()))
}

fn parse_duration_mins(raw: &str) -> Option<u32> {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return None;
    }
    if let Some(mins) = trimmed
        .strip_suffix(" min")
        .or_else(|| trimmed.strip_suffix("min"))
        .and_then(|s| s.trim().parse().ok())
    {
        return Some(mins);
    }
    let parts: Vec<&str> = trimmed.split(':').collect();
    match parts.as_slice() {
        [h, m, s] => {
            let hours: u32 = h.parse().ok()?;
            let minutes: u32 = m.parse().ok()?;
            let seconds: u32 = s.parse().ok()?;
            Some(hours * 60 + minutes + if seconds >= 30 { 1 } else { 0 })
        }
        [m, s] => {
            let minutes: u32 = m.parse().ok()?;
            let seconds: u32 = s.parse().ok()?;
            Some(minutes + if seconds >= 30 { 1 } else { 0 })
        }
        _ => None,
    }
}

fn enrich_live_from_on_air(client: &Client, channels: &mut [CachedProgram]) {
    let Ok(json) = fetch_json_page(client, "/palinsesto/onAir.json") else {
        return;
    };
    let Some(arr) = json.get("on_air").and_then(|v| v.as_array()) else {
        return;
    };

    for item in arr {
        let channel_name = item
            .get("channel")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .trim();
        if channel_name.is_empty() {
            continue;
        }
        let current = item.get("currentItem");
        let program_name = current
            .and_then(|c| c.pointer("/program/name"))
            .or_else(|| current.and_then(|c| c.get("name")))
            .and_then(|v| v.as_str())
            .map(decode_html_entities);
        let episode_name = current
            .and_then(|c| c.get("name"))
            .and_then(|v| v.as_str())
            .map(decode_html_entities);
        let live_title = program_name.or(episode_name);
        let start_hour = current
            .and_then(|c| c.get("hour"))
            .and_then(|v| v.as_str())
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty());
        let duration_mins = current
            .and_then(|c| c.get("duration"))
            .and_then(|v| v.as_str())
            .and_then(parse_duration_mins)
            .or_else(|| {
                current
                    .and_then(|c| c.get("duration_in_minutes"))
                    .and_then(|v| v.as_str())
                    .and_then(parse_duration_mins)
            });
        let poster = current.and_then(live_on_air_poster);

        for ch in channels.iter_mut() {
            let id = ch.slug.strip_prefix("live-").unwrap_or(&ch.slug);
            if !ch.name.eq_ignore_ascii_case(channel_name) && !channel_id_matches(channel_name, id)
            {
                continue;
            }
            if let Some(title) = live_title.clone() {
                ch.live_title = Some(title.clone());
                ch.description = Some(format!("In onda: {title}"));
            }
            ch.live_start_hour = start_hour.clone();
            ch.live_duration_mins = duration_mins;
            if let Some(p) = poster.clone() {
                ch.poster = Some(p.clone());
                ch.background = Some(p);
            }
            break;
        }
    }
}

fn live_display_name(id: &str) -> String {
    match id {
        "rai1" => "Rai 1".into(),
        "rai2" => "Rai 2".into(),
        "rai3" => "Rai 3".into(),
        "rai4" => "Rai 4".into(),
        "rai5" => "Rai 5".into(),
        "raimovie" => "Rai Movie".into(),
        "raipremium" => "Rai Premium".into(),
        "raiyoyo" => "Rai Yoyo".into(),
        "raigulp" => "Rai Gulp".into(),
        "raistoria" => "Rai Storia".into(),
        "raiscuola" => "Rai Scuola".into(),
        "rainews24" => "Rai News 24".into(),
        "raisport" | "raisportpiuhd" | "raisporthd" => "Rai Sport".into(),
        other => title_case_slug(other),
    }
}

/// Elenco canali senza N round-trip JSON (altrimenti il sync supera i timeout boot).
fn fetch_live_channels(client: &Client) -> Result<Vec<CachedProgram>, String> {
    let mut channels: Vec<String> = Vec::new();
    if let Ok(html) = fetch_html_page(client, "/dirette") {
        let re = Regex::new(r#"/dirette/([a-z0-9-]+)\.json"#).expect("live re");
        let mut seen = std::collections::HashSet::new();
        for cap in re.captures_iter(&html) {
            let id = cap[1].to_ascii_lowercase();
            if id.contains("radio") || id == "raiplay" || id.starts_with("raiplay") {
                continue;
            }
            if seen.insert(id.clone()) {
                channels.push(id);
            }
        }
    }
    if channels.is_empty() {
        channels = [
            "rai1",
            "rai2",
            "rai3",
            "rai4",
            "rai5",
            "raimovie",
            "raipremium",
            "raiyoyo",
            "raigulp",
            "raistoria",
            "raiscuola",
            "rainews24",
            "raisport",
        ]
        .into_iter()
        .map(str::to_string)
        .collect();
    }

    // Arricchisci poster/logo per i primi canali (home row).
    let enrich_limit = 8usize;
    let mut out = Vec::with_capacity(channels.len());
    for (idx, id) in channels.into_iter().enumerate() {
        let mut name = live_display_name(&id);
        let mut description = None;
        let mut poster = None;
        let mut background = None;
        let mut logo = None;

        if idx < enrich_limit {
            if let Ok(json) = fetch_json_page(client, &format!("/dirette/{id}.json")) {
                if let Some(ch) = json.get("channel").and_then(|v| v.as_str()) {
                    name = ch.to_string();
                } else if let Some(n) = json.get("name").and_then(|v| v.as_str()) {
                    name = decode_html_entities(n);
                }
                description = json
                    .get("description")
                    .and_then(|v| v.as_str())
                    .map(decode_html_entities);
                if let Some(icon) = json.get("transparent_icon").and_then(|v| v.as_str()) {
                    logo = Some(absolute_media_url(icon));
                }
                if let Some(still) = json.get("still_frame").and_then(|v| v.as_str()) {
                    let url = absolute_media_url(still);
                    poster = Some(url.clone());
                    background = Some(url);
                }
            }
        }

        out.push(CachedProgram {
            kind: KIND_LIVE.to_string(),
            slug: format!("live-{id}"),
            name,
            poster,
            background,
            description,
            logo,
            live_title: None,
            live_start_hour: None,
            live_duration_mins: None,
        });
    }

    enrich_live_from_on_air(client, &mut out);
    Ok(out)
}

/// Snapshot fresco delle dirette (Home UI): canali + programma/orario da onAir.
pub fn fetch_on_air_live(db: &Database) -> Result<Vec<StremioMetaPreview>, String> {
    if !enabled(db) {
        return Ok(Vec::new());
    }
    let client = http_client()?;
    let channels = fetch_live_channels(&client)?;
    Ok(channels.into_iter().map(|p| preview_from_cached(&p)).collect())
}

fn merge_section(all: &mut Vec<CachedProgram>, seen: &mut std::collections::HashSet<String>, section: Vec<CachedProgram>) {
    for program in section {
        if program.kind == KIND_BAMBINI {
            seen.insert(program.slug.clone());
            all.retain(|p| p.slug != program.slug);
            all.push(program);
            continue;
        }
        if seen.contains(&program.slug) {
            continue;
        }
        seen.insert(program.slug.clone());
        all.push(program);
    }
}

fn fetch_all_programs(client: &Client) -> Result<(Vec<CachedProgram>, Vec<CachedSportRow>), String> {
    let mut all = Vec::new();
    let mut seen = std::collections::HashSet::new();
    let mut sport_rows = Vec::new();

    // Live prima: piccolo e serve la Home.
    match fetch_live_channels(client) {
        Ok(live) => merge_section(&mut all, &mut seen, live),
        Err(err) => eprintln!("raiplay live: {err}"),
    }

    // Endpoint ufficiali dal dump sito (menu/top.json): JSON leggeri, non HTML 20–70MB.
    let sections = [
        ("/tipologia/bambini/index.json", KIND_BAMBINI),
        ("/tipologia/film/index.json", KIND_FILM),
        ("/tipologia/serieitaliane/index.json", KIND_SERIE),
        ("/tipologia/serieinternazionali/index.json", KIND_SERIE),
    ];

    for (path, kind) in sections {
        match fetch_tipologia_section(client, path, kind) {
            Ok(programs) => merge_section(&mut all, &mut seen, programs),
            Err(err) => {
                eprintln!("raiplay section {path}: {err}");
                let html_path = match kind {
                    KIND_BAMBINI => "/bambini",
                    KIND_FILM => "/film",
                    KIND_SERIE if path.contains("internazionali") => "/serieinternazionali",
                    KIND_SERIE => "/serieitaliane",
                    _ => continue,
                };
                if let Ok(html) = fetch_html_page(client, html_path) {
                    merge_section(&mut all, &mut seen, parse_listing_html(&html, kind));
                }
            }
        }
    }

    match fetch_sport_section(client) {
        Ok((programs, rows)) => {
            merge_section(&mut all, &mut seen, programs);
            sport_rows = rows;
        }
        Err(err) => {
            eprintln!("raiplay sport: {err}");
            if let Ok(html) = fetch_html_page(client, "/sport") {
                merge_section(&mut all, &mut seen, parse_listing_html(&html, KIND_SPORT));
            }
        }
    }

    if all.is_empty() {
        return Err("Nessun contenuto RaiPlay trovato".into());
    }
    Ok((all, sport_rows))
}

fn preview_for_sport_row(p: &CachedProgram, row_key: &str, row_title: &str) -> StremioMetaPreview {
    let mut preview = preview_from_cached(p);
    preview.source_row_key = Some(row_key.to_string());
    preview.source_row_title = Some(row_title.to_string());
    preview
}

fn response_from_programs(
    programs: Vec<CachedProgram>,
    sport_rows: &[CachedSportRow],
    synced_at: i64,
) -> RaiplayCatalogResponse {
    let index: Vec<StremioMetaPreview> = programs.iter().map(preview_from_cached).collect();
    let by_slug: HashMap<&str, &CachedProgram> =
        programs.iter().map(|p| (p.slug.as_str(), p)).collect();

    let mut rows = Vec::new();
    for (kind, key, title, subtitle) in [
        (
            KIND_LIVE,
            ROW_LIVE,
            "In diretta · RaiPlay",
            "Canali TV Rai in streaming",
        ),
        (
            KIND_BAMBINI,
            ROW_BAMBINI,
            "RaiPlay Bambini",
            "Rai Yoyo · Rai Gulp",
        ),
        (KIND_FILM, ROW_FILM, "RaiPlay Film", "Film free RaiPlay"),
        (
            KIND_SERIE,
            ROW_SERIE,
            "RaiPlay Serie",
            "Fiction e serie TV",
        ),
    ] {
        let items: Vec<StremioMetaPreview> = programs
            .iter()
            .filter(|p| p.kind == kind)
            .take(ROW_LIMIT)
            .map(preview_from_cached)
            .collect();
        if !items.is_empty() {
            rows.push(ScCatalogRow {
                key: key.to_string(),
                title: title.to_string(),
                subtitle: subtitle.to_string(),
                items,
            });
        }
    }

    // Righe Sport nominate dai blocchi tipologia (ordine RaiPlay).
    let mut sport_emitted = false;
    for row in sport_rows {
        let items: Vec<StremioMetaPreview> = row
            .slugs
            .iter()
            .filter_map(|slug| by_slug.get(slug.as_str()).copied())
            .take(ROW_LIMIT)
            .map(|p| preview_for_sport_row(p, &row.key, &row.title))
            .collect();
        if items.len() < 3 {
            continue;
        }
        sport_emitted = true;
        rows.push(ScCatalogRow {
            key: row.key.clone(),
            title: row.title.clone(),
            subtitle: "RaiPlay Sport".to_string(),
            items,
        });
    }

    if !sport_emitted {
        let items: Vec<StremioMetaPreview> = programs
            .iter()
            .filter(|p| p.kind == KIND_SPORT)
            .take(ROW_LIMIT)
            .map(preview_from_cached)
            .collect();
        if !items.is_empty() {
            rows.push(ScCatalogRow {
                key: ROW_SPORT.to_string(),
                title: "RaiPlay Sport".to_string(),
                subtitle: "Eventi e programmi sportivi".to_string(),
                items,
            });
        }
    }

    let total_count = index.len();
    RaiplayCatalogResponse {
        rows,
        index,
        synced_at,
        total_count,
    }
}

pub fn fetch_catalog(db: &Database) -> Result<RaiplayCatalogResponse, String> {
    if !enabled(db) {
        return Ok(RaiplayCatalogResponse {
            rows: Vec::new(),
            index: Vec::new(),
            synced_at: 0,
            total_count: 0,
        });
    }

    if cache_fresh(db) {
        let programs = load_cached_programs(db);
        let sport_rows = load_sport_rows(db);
        let synced_at = db
            .get_meta(META_INDEX_TS)
            .ok()
            .flatten()
            .and_then(|s| s.parse().ok())
            .unwrap_or_else(now_ts);
        return Ok(response_from_programs(programs, &sport_rows, synced_at));
    }

    refresh_catalog_index(db)
}

pub fn refresh_catalog_index(db: &Database) -> Result<RaiplayCatalogResponse, String> {
    if !enabled(db) {
        return Ok(RaiplayCatalogResponse {
            rows: Vec::new(),
            index: Vec::new(),
            synced_at: 0,
            total_count: 0,
        });
    }

    let client = http_client()?;
    let (programs, sport_rows) = fetch_all_programs(&client)?;
    save_cache(db, &programs)?;
    save_sport_rows(db, &sport_rows)?;
    Ok(response_from_programs(programs, &sport_rows, now_ts()))
}

pub fn search_titles(db: &Database, query: &str) -> Vec<StremioMetaPreview> {
    if !enabled(db) {
        return Vec::new();
    }
    let q = query.trim().to_lowercase();
    if q.is_empty() {
        return Vec::new();
    }
    load_cached_programs(db)
        .into_iter()
        .filter(|p| {
            p.name.to_lowercase().contains(&q) || p.slug.to_lowercase().contains(&q)
        })
        .map(|p| preview_from_cached(&p))
        .take(40)
        .collect()
}

pub fn program_url(slug: &str) -> String {
    if let Some(channel) = live_channel_from_slug(slug) {
        return format!("{APP_ORIGIN}/dirette/{channel}.json");
    }
    if is_video_slug(slug) {
        return format!("{APP_ORIGIN}{}", video_json_path_from_slug(slug));
    }
    format!(
        "{APP_ORIGIN}/programmi/{}.json",
        slug.trim().trim_matches('/')
    )
}

pub fn cached_kind_for_slug(db: &Database, slug: &str) -> Option<String> {
    let slug = slug.trim().to_ascii_lowercase();
    load_cached_programs(db)
        .into_iter()
        .find(|p| p.slug == slug)
        .map(|p| p.kind)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_program_paths_and_images() {
        let html = r#"
          "path_id":"/programmi/bing.json","name":"Bing","images":{"portrait":"/dl/img/bing-poster.jpg","landscape":"/dl/img/bing-bg.jpg"}
        "#;
        let programs = parse_listing_html(html, KIND_BAMBINI);
        let bing = programs.iter().find(|p| p.slug == "bing").unwrap();
        assert_eq!(bing.kind, KIND_BAMBINI);
        assert_eq!(bing.name, "Bing");
        assert!(bing.poster.as_ref().unwrap().contains("raiplay.it"));
    }

    #[test]
    fn parses_tipologia_index_json() {
        let json = serde_json::json!({
            "contents": [{
                "name": "Hero",
                "contents": [{
                    "path_id": "/programmi/bluey.json",
                    "name": "Bluey",
                    "description": "Cuccioli",
                    "images": {
                        "portrait43": "/dl/img/bluey.jpg",
                        "landscape": "/dl/img/bluey-bg.jpg"
                    }
                }]
            }]
        });
        let programs = parse_tipologia_index(&json, KIND_BAMBINI);
        assert_eq!(programs.len(), 1);
        assert_eq!(programs[0].slug, "bluey");
        assert_eq!(programs[0].name, "Bluey");
        assert!(programs[0].poster.as_ref().unwrap().contains("bluey.jpg"));
    }

    #[test]
    fn live_on_air_poster_skips_empty_landscape() {
        let current = serde_json::json!({
            "images": { "landscape": "" },
            "image": "/dl/img/2019/11/22/rai4.jpg"
        });
        let url = live_on_air_poster(&current).expect("fallback image");
        assert!(url.ends_with("/dl/img/2019/11/22/rai4.jpg"));
        assert!(url.starts_with("https://www.raiplay.it/"));

        let news = serde_json::json!({
            "images": { "landscape": "   " },
            "image": "/dl/img/2023/01/19/news.jpg"
        });
        let news_url = live_on_air_poster(&news).expect("news image");
        assert!(news_url.contains("news.jpg"));

        let with_landscape = serde_json::json!({
            "images": { "landscape": "/dl/img/ok.jpg" },
            "image": "/dl/img/fallback.jpg"
        });
        assert!(
            live_on_air_poster(&with_landscape)
                .unwrap()
                .ends_with("/dl/img/ok.jpg")
        );
    }

    #[test]
    fn live_slug_helpers() {
        assert!(is_live_slug("live-rai1"));
        assert_eq!(live_channel_from_slug("live-rai1"), Some("rai1"));
        assert!(!is_live_slug("bing"));
    }

    #[test]
    fn parses_sport_blocks_into_named_rows() {
        let json = serde_json::json!({
            "contents": [
                {
                    "type": "RaiPlay Hero Block",
                    "name": "Sport Hero Block",
                    "contents": [{
                        "name": "Mondiali",
                        "program_path_id": "/programmi/mondialidicalcio2026.json",
                        "images": { "landscape": "/dl/img/hero.jpg" }
                    }]
                },
                {
                    "type": "RaiPlay Slider Block",
                    "name": "Grandi storie di calcio",
                    "contents": [
                        {
                            "name": "Copa 71",
                            "program_path_id": "/programmi/copa71.json",
                            "images": { "portrait": "/dl/img/copa.jpg" }
                        },
                        {
                            "name": "Pelé",
                            "program_path_id": "/programmi/pele.json",
                            "images": { "portrait": "/dl/img/pele.jpg" }
                        },
                        {
                            "name": "Maradona",
                            "program_path_id": "/programmi/maradona.json",
                            "images": { "portrait": "/dl/img/mara.jpg" }
                        }
                    ]
                },
                {
                    "type": "RaiPlay Slider Video Block",
                    "name": "Mondiali di Calcio – Gol ed emozioni",
                    "contents": [
                        {
                            "name": "Gol 1",
                            "path_id": "/video/2024/01/gol1.json",
                            "images": { "landscape": "/dl/img/g1.jpg" }
                        },
                        {
                            "name": "Gol 2",
                            "path_id": "/video/2024/01/gol2.json",
                            "images": { "landscape": "/dl/img/g2.jpg" }
                        },
                        {
                            "name": "Gol 3",
                            "path_id": "/video/2024/01/gol3.json",
                            "images": { "landscape": "/dl/img/g3.jpg" }
                        }
                    ]
                }
            ]
        });
        let (programs, rows) = parse_sport_tipologia(&json);
        assert!(programs.iter().any(|p| p.slug == "copa71"));
        assert!(programs.iter().any(|p| p.slug == "video/2024/01/gol1"));
        assert_eq!(rows.len(), 2);
        assert!(rows.iter().any(|r| r.title.contains("Grandi storie")));
        assert!(rows.iter().any(|r| r.title.contains("Gol ed emozioni")));
        assert!(!rows.iter().any(|r| r.title.contains("Hero")));
    }
}
