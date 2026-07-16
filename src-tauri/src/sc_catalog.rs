use crate::db::Database;
use crate::html_text::decode_html_entities;
use crate::stremio::StremioMetaPreview;
use flate2::read::GzDecoder;
use flate2::write::GzEncoder;
use flate2::Compression;
use reqwest::blocking::Client;
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::io::{Read, Write};
use std::path::Path;
use std::sync::Mutex;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

/// Snapshot gzip del catalogo SC incluso nella release (generato da `export-sc-catalog-seed`).
const BUNDLED_SC_CATALOG_SEED_GZ: &[u8] =
    include_bytes!("../resources/sc_catalog_seed.json.gz");

const DEFAULT_APP_URL: &str = "https://streamingcommunityz.tech";
const DEFAULT_CDN_URL: &str = "https://cdn.streamingcommunityz.tech";
const DEFAULT_LANG: &str = "it";
const META_SC_RESOLVED_APP: &str = "sc_resolved_app_url";
const FALLBACK_APP_URLS: &[&str] = &["https://streamingunity.dog"];

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScCatalogRow {
    pub key: String,
    pub title: String,
    pub subtitle: String,
    pub items: Vec<StremioMetaPreview>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScCatalogResponse {
    pub rows: Vec<ScCatalogRow>,
    pub index: Vec<StremioMetaPreview>,
    pub synced_at: i64,
    pub total_count: usize,
    /// Indice completo o metadati da aggiornare in background (non bloccare il boot).
    pub needs_background_sync: bool,
}

const META_SC_INDEX: &str = "sc_catalog_index";
const META_SC_INDEX_TS: &str = "sc_catalog_index_ts";
const META_SC_INDEX_VERSION: &str = "sc_catalog_index_version";
const CURRENT_INDEX_VERSION: &str = "14";
const INDEX_TTL_SECS: i64 = 2 * 3600;
const SLIDER_ROW_LIMIT: usize = 60;
const MAX_GENRE_ARCHIVE_PAGES: usize = 40;
/// Catalogo considerato “completo” per passare al solo delta all’avvio.
const COMPLETE_MOVIE_MIN: usize = 8_000;
const MIN_USABLE_INDEX: usize = 800;
const ARCHIVE_PROGRESS_SAVE_EVERY: usize = 200;
/// L’archivio SC risponde 503 oltre page=20 (~1200 titoli). La search no.
const ARCHIVE_HARD_MAX_PAGE: u32 = 20;
const SEARCH_HARD_MAX_PAGE: u32 = 80;
/// Titoli per ciclo di arricchimento parallelo (pagina dettaglio).
pub const TITLE_META_ENRICH_BATCH: usize = 60;
/// Poche connessioni contemporanee: traffico più simile a un browser, meno
/// probabilità di attivare l'anti-bot di SC. Il catalogo si completa un filo
/// più lentamente ma in modo del tutto trasparente all'utente (c'è il seed).
const TITLE_META_ENRICH_WORKERS: usize = 3;
const TITLE_META_ENRICH_SAVE_EVERY: usize = 40;
const META_SC_META_ENRICH_CURSOR: &str = "sc_catalog_meta_enrich_cursor";

static META_ENRICH_RUNNING: Mutex<bool> = Mutex::new(false);
static CATALOG_BOOT_RUNNING: Mutex<bool> = Mutex::new(false);
/// Cache in-process dell'indice (evita di riparsare ~10MB JSON ad ogni fetch).
static INDEX_MEM_CACHE: Mutex<Option<(i64, String, Vec<StremioMetaPreview>)>> = Mutex::new(None);

#[derive(Serialize)]
struct SliderFetchItem {
    name: String,
}

#[derive(Serialize)]
struct SliderFetchRequest {
    sliders: Vec<SliderFetchItem>,
}

#[derive(Deserialize)]
struct ScSlider {
    name: String,
    label: String,
    titles: Vec<ScTitle>,
}

#[derive(Deserialize)]
struct ScGenre {
    name: String,
}

#[derive(Deserialize, Default, Clone)]
struct ScEpisodeSnippet {
    #[serde(default)]
    id: Option<i64>,
    #[serde(default)]
    name: Option<String>,
    #[serde(default)]
    images: Vec<ScImage>,
}

#[derive(Deserialize, Default, Clone)]
struct ScCredit {
    #[serde(default)]
    name: Option<String>,
}

#[derive(Deserialize)]
struct ScTitle {
    id: i64,
    name: String,
    slug: String,
    #[serde(rename = "type")]
    title_type: String,
    #[serde(default)]
    last_air_date: Option<String>,
    #[serde(default)]
    images: Vec<ScImage>,
    #[serde(default)]
    genres: Vec<ScGenre>,
    #[serde(default)]
    main_actors: Vec<ScCredit>,
    #[serde(default)]
    main_directors: Vec<ScCredit>,
    #[serde(default)]
    episode_id: Option<i64>,
    #[serde(default)]
    episode: Option<ScEpisodeSnippet>,
}

fn preview_dedupe_key(preview: &StremioMetaPreview) -> String {
    if let Some(episode_id) = preview.resume_video_id.as_deref() {
        return format!("{}:{}:{}", preview.r#type, preview.id, episode_id);
    }
    format!("{}:{}", preview.r#type, preview.id)
}

fn episode_context_from_title(title: &ScTitle) -> (Option<i64>, Option<String>, Vec<ScImage>) {
    if let Some(episode) = &title.episode {
        if let Some(id) = episode.id {
            return (Some(id), episode.name.clone(), episode.images.clone());
        }
    }
    (title.episode_id, None, Vec::new())
}

fn episode_context_from_value(
    title: &serde_json::Value,
) -> (Option<i64>, Option<String>, Vec<ScImage>) {
    let episode_id = title
        .get("episode_id")
        .and_then(|v| v.as_i64())
        .or_else(|| {
            title
                .get("episode")
                .and_then(|ep| ep.get("id"))
                .and_then(|v| v.as_i64())
        })
        .or_else(|| {
            title
                .get("latest_episode")
                .and_then(|ep| ep.get("id"))
                .and_then(|v| v.as_i64())
        });
    let episode_name = title
        .get("episode")
        .or_else(|| title.get("latest_episode"))
        .and_then(|ep| ep.get("name"))
        .and_then(|v| v.as_str())
        .map(decode_text);
    let episode_images = title
        .get("episode")
        .or_else(|| title.get("latest_episode"))
        .and_then(|ep| ep.get("images"))
        .and_then(|v| serde_json::from_value::<Vec<ScImage>>(v.clone()).ok())
        .unwrap_or_default();
    (episode_id, episode_name, episode_images)
}

#[derive(Deserialize, Clone)]
struct ScImage {
    filename: String,
    #[serde(rename = "type")]
    image_type: String,
}

fn http_client() -> Result<Client, String> {
    http_client_with_timeout(30)
}

fn http_client_with_timeout(secs: u64) -> Result<Client, String> {
    let builder = Client::builder()
        .timeout(Duration::from_secs(secs))
        .cookie_store(true)
        .user_agent(
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 \
             (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Branchefy/0.1",
        );
    crate::sc_proxy::apply_blocking(builder)
        .build()
        .map_err(|e| e.to_string())
}

/// Laravel requires a session cookie plus `X-XSRF-TOKEN` on POST requests.
fn bootstrap_csrf(client: &Client, app_base: &str) -> Result<String, String> {
    let resp = client
        .get(format!("{app_base}/"))
        .header("Accept", "text/html,application/xhtml+xml")
        .send()
        .map_err(|e| format!("Sessione catalogo: {e}"))?;

    for value in resp.headers().get_all(reqwest::header::SET_COOKIE) {
        let header = value.to_str().map_err(|e| e.to_string())?;
        let cookie = header.split(';').next().unwrap_or(header).trim();
        if let Some(raw) = cookie.strip_prefix("XSRF-TOKEN=") {
            return urlencoding::decode(raw)
                .map(|token| token.into_owned())
                .map_err(|e| e.to_string());
        }
    }

    Err("Token CSRF del catalogo non disponibile".into())
}

const FALLBACK_SLIDER_NAMES: &[&str] = &["trending", "latest", "top10"];

struct HtmlPageClient {
    client: Client,
    app_base: String,
}

impl HtmlPageClient {
    fn new(client: Client, app_base: &str) -> Self {
        Self {
            client,
            app_base: app_base.trim_end_matches('/').to_string(),
        }
    }

    fn fetch_page(&self, path: &str) -> Option<(String, Vec<serde_json::Value>)> {
        self.fetch_page_with_retries(path, 12)
    }

    fn fetch_page_with_retries(
        &self,
        path: &str,
        attempts: u32,
    ) -> Option<(String, Vec<serde_json::Value>)> {
        for attempt in 0..attempts.max(1) {
            match self.fetch_page_once(path) {
                FetchPageResult::Ok(payload) => return Some(payload),
                FetchPageResult::Empty => {
                    // Challenge/HTML senza inertia: riprova prima di dichiarare fine pagina.
                    let sleep_ms = 800 + attempt * 600;
                    std::thread::sleep(Duration::from_millis(sleep_ms as u64));
                }
                FetchPageResult::Transient => {
                    // 429/503: backoff lungo, altrimenti SC taglia il crawl a ~20 pagine.
                    let sleep_ms = 3_000 + attempt * attempt * 1_500;
                    std::thread::sleep(Duration::from_millis(sleep_ms.min(45_000) as u64));
                }
            }
        }
        None
    }

    fn fetch_page_once(&self, path: &str) -> FetchPageResult {
        let response = match self
            .client
            .get(format!("{}{}", self.app_base, path))
            .header("Accept", "text/html,application/xhtml+xml")
            .send()
        {
            Ok(resp) => resp,
            Err(_) => return FetchPageResult::Transient,
        };
        let status = response.status();
        if status.as_u16() == 429
            || status.as_u16() == 503
            || status.is_server_error()
        {
            return FetchPageResult::Transient;
        }
        if !status.is_success() {
            return FetchPageResult::Empty;
        }
        let html = match response.text() {
            Ok(text) => text,
            Err(_) => return FetchPageResult::Transient,
        };
        let Some(page) = parse_inertia_from_html(&html) else {
            return FetchPageResult::Empty;
        };
        let Some(props) = page.get("props") else {
            return FetchPageResult::Empty;
        };
        let Some(titles_val) = props.get("titles") else {
            return FetchPageResult::Empty;
        };
        let Some(titles) = extract_titles(titles_val) else {
            return FetchPageResult::Empty;
        };
        let label = props
            .get("label")
            .and_then(|v| v.as_str())
            .map(str::to_string)
            .unwrap_or_else(|| "Catalogo".to_string());
        FetchPageResult::Ok((label, titles))
    }
}

enum FetchPageResult {
    Ok((String, Vec<serde_json::Value>)),
    Empty,
    Transient,
}

fn extract_titles(value: &serde_json::Value) -> Option<Vec<serde_json::Value>> {
    if let Some(arr) = value.as_array() {
        return Some(arr.clone());
    }
    value.get("data").and_then(|v| v.as_array()).cloned()
}

fn now_ts() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0)
}

fn build_rows_from_sliders(
    cdn: &str,
    sliders: Vec<ScSlider>,
    seen_titles: &mut HashSet<String>,
) -> Vec<ScCatalogRow> {
    let mut rows = Vec::new();
    for slider in sliders {
        if slider.titles.is_empty() {
            continue;
        }
        let items: Vec<StremioMetaPreview> = slider
            .titles
            .into_iter()
            .take(SLIDER_ROW_LIMIT)
            .filter_map(|t| {
                let preview = map_title(cdn, t);
                let dedupe_key = preview_dedupe_key(&preview);
                if seen_titles.insert(dedupe_key) {
                    Some(preview)
                } else {
                    None
                }
            })
            .collect();
        if items.is_empty() {
            continue;
        }
        rows.push(ScCatalogRow {
            key: format!("sc-{}", slider.name),
            title: slider.label.clone(),
            subtitle: slider.label,
            items,
        });
    }
    rows
}

fn fetch_sliders_from_base(
    client: &Client,
    app_base: &str,
    cdn: &str,
    locale: &str,
) -> Result<Vec<ScCatalogRow>, String> {
    let cdn = cdn.trim_end_matches('/');
    let mut seen_titles = HashSet::new();

    let sliders = if let Ok(sliders) = fetch_embedded_home_sliders(client, app_base, locale) {
        if sliders.iter().any(|s| !s.titles.is_empty()) {
            sliders
        } else if let Ok(xsrf) = bootstrap_csrf(client, app_base) {
            let slider_names = discover_slider_names(client, app_base, locale);
            fetch_slider_batch(client, app_base, &xsrf, locale, &slider_names).or_else(|_| {
                let fallback: Vec<String> = FALLBACK_SLIDER_NAMES
                    .iter()
                    .map(|name| (*name).to_string())
                    .collect();
                fetch_slider_batch(client, app_base, &xsrf, locale, &fallback)
            })?
        } else {
            return Err("Impossibile connettersi al catalogo".into());
        }
    } else if let Ok(xsrf) = bootstrap_csrf(client, app_base) {
        let slider_names = discover_slider_names(client, app_base, locale);
        fetch_slider_batch(client, app_base, &xsrf, locale, &slider_names).or_else(|_| {
            let fallback: Vec<String> = FALLBACK_SLIDER_NAMES
                .iter()
                .map(|name| (*name).to_string())
                .collect();
            fetch_slider_batch(client, app_base, &xsrf, locale, &fallback)
        })?
    } else {
        return Err("Impossibile connettersi al catalogo".into());
    };

    let mut rows = build_rows_from_sliders(cdn, sliders, &mut seen_titles);
    rows.extend(fetch_hub_slider_rows(
        client,
        app_base,
        cdn,
        locale,
        &format!("/{locale}/movies"),
        "sc-movies",
        &mut seen_titles,
    ));
    rows.extend(fetch_hub_slider_rows(
        client,
        app_base,
        cdn,
        locale,
        &format!("/{locale}/tv-shows"),
        "sc-shows",
        &mut seen_titles,
    ));

    if rows.is_empty() {
        return Err("Slider del catalogo non disponibili".into());
    }
    Ok(rows)
}

fn app_url_candidates(db: &Database) -> Vec<String> {
    let mut out = Vec::new();
    let mut seen = HashSet::new();
    let mut push = |value: &str| {
        let url = value.trim().trim_end_matches('/').to_string();
        if !url.is_empty() && seen.insert(url.clone()) {
            out.push(url);
        }
    };

    if let Ok(Some(resolved)) = db.get_meta(META_SC_RESOLVED_APP) {
        push(&resolved);
    }
    if let Ok(Some(custom)) = db.get_meta("sc_app_url") {
        push(&custom);
    }
    push(DEFAULT_APP_URL);
    for fallback in FALLBACK_APP_URLS {
        push(fallback);
    }
    out
}

fn probe_app_reachable(client: &Client, app_base: &str, locale: &str) -> bool {
    for path in [format!("/{locale}"), "/".to_string()] {
        let Ok(resp) = client
            .get(format!("{app_base}{path}"))
            .header("Accept", "text/html,application/xhtml+xml")
            .send()
        else {
            continue;
        };
        if !resp.status().is_success() {
            continue;
        }
        if let Ok(html) = resp.text() {
            if parse_inertia_from_html(&html).is_some() {
                return true;
            }
        }
    }
    false
}

pub fn discover_app_url(db: &Database) -> Result<String, String> {
    let client = http_client()?;
    for base in app_url_candidates(db) {
        if probe_app_reachable(&client, &base, &lang(db)) {
            let _ = db.set_meta(META_SC_RESOLVED_APP, &base);
            return Ok(base);
        }
    }
    let _ = db.set_meta(META_SC_RESOLVED_APP, "");
    Err("Nessun server catalogo Streaming Community raggiungibile".into())
}

pub fn resolve_app_url(db: &Database) -> Result<String, String> {
    if let Ok(Some(cached)) = db.get_meta(META_SC_RESOLVED_APP) {
        if !cached.trim().is_empty() {
            let base = cached.trim_end_matches('/').to_string();
            if let Ok(client) = http_client() {
                if probe_app_reachable(&client, &base, &lang(db)) {
                    return Ok(base);
                }
            }
            let _ = db.set_meta(META_SC_RESOLVED_APP, "");
        }
    }
    discover_app_url(db)
}

pub fn fetch_sliders_for_db(
    db: &Database,
    cdn: &str,
    locale: &str,
) -> Result<Vec<ScCatalogRow>, String> {
    let client = http_client()?;
    let mut last_err = None;

    for base in app_url_candidates(db) {
        match fetch_sliders_from_base(&client, &base, cdn, locale) {
            Ok(rows) if !rows.is_empty() => {
                let _ = db.set_meta(META_SC_RESOLVED_APP, &base);
                return Ok(rows);
            }
            Ok(_) => last_err = Some("Catalogo vuoto".into()),
            Err(err) => last_err = Some(err),
        }
    }

    let _ = db.set_meta(META_SC_RESOLVED_APP, "");
    Err(last_err.unwrap_or_else(|| "Catalogo non disponibile".into()))
}

pub fn fetch_sliders(app: &str, cdn: &str, locale: &str) -> Result<Vec<ScCatalogRow>, String> {
    let client = http_client()?;
    let mut candidates = vec![app.trim_end_matches('/').to_string()];
    for fallback in FALLBACK_APP_URLS {
        let url = fallback.trim_end_matches('/').to_string();
        if !candidates.contains(&url) {
            candidates.push(url);
        }
    }

    let mut last_err = None;
    for base in candidates {
        match fetch_sliders_from_base(&client, &base, cdn, locale) {
            Ok(rows) if !rows.is_empty() => return Ok(rows),
            Ok(_) => last_err = Some("Catalogo vuoto".into()),
            Err(err) => last_err = Some(err),
        }
    }

    Err(last_err.unwrap_or_else(|| "Catalogo non disponibile".into()))
}

fn discover_slider_names(client: &Client, app_base: &str, locale: &str) -> Vec<String> {
    for path in [format!("/{locale}"), "/".to_string()] {
        let Ok(html) = client
            .get(format!("{app_base}{path}"))
            .header("Accept", "text/html,application/xhtml+xml")
            .send()
            .and_then(|r| r.error_for_status())
            .and_then(|r| r.text())
        else {
            continue;
        };
        let Some(page) = parse_inertia_from_html(&html) else {
            continue;
        };
        let names: Vec<String> = page
            .get("props")
            .and_then(|props| props.get("sliders"))
            .and_then(|v| v.as_array())
            .map(|sliders| {
                sliders
                    .iter()
                    .filter_map(|slider| {
                        slider
                            .get("name")
                            .and_then(|v| v.as_str())
                            .map(str::to_string)
                    })
                    .collect()
            })
            .unwrap_or_default();
        if !names.is_empty() {
            return names;
        }
    }

    FALLBACK_SLIDER_NAMES
        .iter()
        .map(|name| (*name).to_string())
        .collect()
}

fn fetch_slider_batch(
    client: &Client,
    app_base: &str,
    xsrf: &str,
    locale: &str,
    slider_names: &[String],
) -> Result<Vec<ScSlider>, String> {
    if slider_names.is_empty() {
        return Ok(Vec::new());
    }

    let url = format!(
        "{}/api/sliders/fetch?lang={}",
        app_base,
        urlencoding::encode(locale)
    );
    let body = SliderFetchRequest {
        sliders: slider_names
            .iter()
            .map(|name| SliderFetchItem { name: name.clone() })
            .collect(),
    };

    client
        .post(&url)
        .header("Accept", "application/json")
        .header("Content-Type", "application/json")
        .header("X-XSRF-TOKEN", xsrf)
        .header("X-Requested-With", "XMLHttpRequest")
        .json(&body)
        .send()
        .map_err(|e| format!("Catalogo non raggiungibile: {e}"))?
        .error_for_status()
        .map_err(|e| format!("Catalogo HTTP: {e}"))?
        .json()
        .map_err(|e| format!("Risposta catalogo non valida: {e}"))
}

fn fetch_embedded_home_sliders(
    client: &Client,
    app_base: &str,
    locale: &str,
) -> Result<Vec<ScSlider>, String> {
    for path in [format!("/{locale}"), "/".to_string()] {
        let Ok(html) = client
            .get(format!("{app_base}{path}"))
            .header("Accept", "text/html,application/xhtml+xml")
            .send()
            .and_then(|r| r.error_for_status())
            .and_then(|r| r.text())
        else {
            continue;
        };
        let Some(page) = parse_inertia_from_html(&html) else {
            continue;
        };
        let sliders: Vec<ScSlider> = page
            .get("props")
            .and_then(|props| props.get("sliders"))
            .and_then(|v| serde_json::from_value(v.clone()).ok())
            .unwrap_or_default();
        if !sliders.is_empty() {
            return Ok(sliders);
        }
    }
    Err("Slider del catalogo non disponibili".into())
}

fn fetch_hub_slider_rows(
    client: &Client,
    app_base: &str,
    cdn: &str,
    _locale: &str,
    hub_path: &str,
    key_prefix: &str,
    seen_titles: &mut std::collections::HashSet<String>,
) -> Vec<ScCatalogRow> {
    let Ok(html) = client
        .get(format!("{app_base}{hub_path}"))
        .header("Accept", "text/html,application/xhtml+xml")
        .send()
        .and_then(|r| r.error_for_status())
        .and_then(|r| r.text())
    else {
        return Vec::new();
    };
    let Some(page) = parse_inertia_from_html(&html) else {
        return Vec::new();
    };
    let sliders: Vec<ScSlider> = page
        .get("props")
        .and_then(|props| props.get("sliders"))
        .and_then(|v| serde_json::from_value(v.clone()).ok())
        .unwrap_or_default();

    sliders
        .into_iter()
        .filter(|slider| !slider.titles.is_empty())
        .filter_map(|slider| {
            let items: Vec<StremioMetaPreview> = slider
                .titles
                .into_iter()
                .take(SLIDER_ROW_LIMIT)
                .filter_map(|t| {
                    let preview = map_title(cdn, t);
                    let dedupe_key = preview_dedupe_key(&preview);
                    if seen_titles.insert(dedupe_key) {
                        Some(preview)
                    } else {
                        None
                    }
                })
                .collect();
            if items.is_empty() {
                return None;
            }
            Some(ScCatalogRow {
                key: format!("{key_prefix}-{}", slider.name),
                title: slider.label.clone(),
                subtitle: slider.label,
                items,
            })
        })
        .collect()
}

fn discover_genres(client: &Client, app_base: &str, locale: &str) -> Vec<(u32, String)> {
    for path in [format!("/{locale}"), "/".to_string()] {
        let Ok(html) = client
            .get(format!("{app_base}{path}"))
            .header("Accept", "text/html,application/xhtml+xml")
            .send()
            .and_then(|r| r.error_for_status())
            .and_then(|r| r.text())
        else {
            continue;
        };
        let Some(page) = parse_inertia_from_html(&html) else {
            continue;
        };
        let genres: Vec<(u32, String)> = page
            .get("props")
            .and_then(|props| props.get("genres"))
            .and_then(|v| v.as_array())
            .map(|genres| {
                genres
                    .iter()
                    .filter_map(|genre| {
                        let id = genre.get("id")?.as_u64()? as u32;
                        let name = genre
                            .get("name")
                            .and_then(|v| v.as_str())
                            .map(str::to_string)?;
                        Some((id, name))
                    })
                    .collect()
            })
            .unwrap_or_default();
        if !genres.is_empty() {
            return genres;
        }
    }
    Vec::new()
}

fn is_animation_label(text: &str) -> bool {
    let t = text.to_lowercase();
    [
        "animazione",
        "animation",
        "cartoon",
        "carton",
        "anime",
        "bambin",
        "kids",
        "juvenile",
        "pixar",
        "dreamworks",
        "nickelodeon",
        "miyazaki",
        "sc-genre-animation",
        "sc-genre-kids",
    ]
    .iter()
    .any(|needle| t.contains(needle))
}

fn is_animation_genre_label(genre: &str) -> bool {
    let t = genre.trim().to_lowercase();
    matches!(
        t.as_str(),
        "animazione"
            | "animation"
            | "cartoon"
            | "anime"
            | "bambini"
            | "kids"
            | "juvenile"
    ) || t == "kid"
}

fn preview_is_animation(preview: &StremioMetaPreview) -> bool {
    let context = format!(
        "{} {}",
        preview.source_row_key.as_deref().unwrap_or(""),
        preview.source_row_title.as_deref().unwrap_or("")
    );
    if is_animation_label(&context) {
        return true;
    }
    preview
        .genres
        .iter()
        .any(|genre| is_animation_genre_label(genre))
}

fn apply_preview_metadata(
    existing: &mut StremioMetaPreview,
    incoming: &StremioMetaPreview,
    source_row_key: Option<&str>,
    source_row_title: Option<&str>,
) {
    existing.genres = merge_genres(&existing.genres, &incoming.genres);
    existing.cast = merge_string_lists(&existing.cast, &incoming.cast);
    existing.directors = merge_string_lists(&existing.directors, &incoming.directors);
    if let Some(services) = &incoming.streaming_services {
        existing.streaming_services = Some(merge_string_lists(
            existing.streaming_services.as_deref().unwrap_or(&[]),
            services,
        ));
    }
    let incoming_anim = preview_is_animation(incoming)
        || is_animation_label(source_row_key.unwrap_or(""))
        || is_animation_label(source_row_title.unwrap_or(""));
    let existing_anim = preview_is_animation(existing);

    if incoming_anim && !existing_anim {
        existing.source_row_key = incoming
            .source_row_key
            .clone()
            .or_else(|| source_row_key.map(str::to_string));
        existing.source_row_title = incoming
            .source_row_title
            .clone()
            .or_else(|| source_row_title.map(str::to_string));
        existing.genres = merge_genres(&existing.genres, &incoming.genres);
        if incoming.background.is_some() {
            existing.background = incoming.background.clone();
        }
        return;
    }

    let incoming_genre_row = source_row_key.is_some_and(|k| k.starts_with("sc-genre-"))
        || incoming
            .source_row_key
            .as_deref()
            .is_some_and(|k| k.starts_with("sc-genre-"));
    if incoming_genre_row {
        existing.source_row_key = incoming
            .source_row_key
            .clone()
            .or_else(|| source_row_key.map(str::to_string));
        existing.source_row_title = incoming
            .source_row_title
            .clone()
            .or_else(|| source_row_title.map(str::to_string));
        if let Some(genre) = source_row_title {
            // Evita dump di 10+ generi se un titolo compare in molti archivi SC.
            if existing.genres.len() < 5
                && !existing
                    .genres
                    .iter()
                    .any(|g| g.eq_ignore_ascii_case(genre))
            {
                existing.genres.push(decode_text(genre));
            }
        }
    }

    if existing.source_row_key.is_none() {
        existing.source_row_key = incoming
            .source_row_key
            .clone()
            .or_else(|| source_row_key.map(str::to_string));
    }
    if existing.source_row_title.is_none() {
        existing.source_row_title = incoming
            .source_row_title
            .clone()
            .or_else(|| source_row_title.map(str::to_string));
    }
    if incoming.description.as_ref().is_some_and(|v| !v.trim().is_empty())
        && existing
            .description
            .as_ref()
            .is_none_or(|v| v.trim().is_empty())
    {
        existing.description = incoming.description.clone();
    }
    if incoming.background.is_some() {
        existing.background = incoming.background.clone();
    }
    if incoming.poster.is_some() && existing.poster.is_none() {
        existing.poster = incoming.poster.clone();
    }
    if incoming.r#type != "movie" && incoming.resume_video_id.is_some() {
        existing.resume_video_id = incoming.resume_video_id.clone();
        if !incoming.name.trim().is_empty() {
            existing.name = incoming.name.clone();
        }
        if incoming.poster.is_some() {
            existing.poster = incoming.poster.clone();
        }
    }
}

fn insert_preview(
    index: &mut Vec<StremioMetaPreview>,
    seen: &mut HashSet<String>,
    mut preview: StremioMetaPreview,
    source_row_key: Option<&str>,
    source_row_title: Option<&str>,
) {
    if preview.source_row_key.is_none() {
        preview.source_row_key = source_row_key.map(str::to_string);
    }
    if preview.source_row_title.is_none() {
        preview.source_row_title = source_row_title.map(str::to_string);
    }
    let key = preview_dedupe_key(&preview);
    if seen.contains(&key) {
        if let Some(existing) = index
            .iter_mut()
            .find(|item| preview_dedupe_key(item) == key)
        {
            apply_preview_metadata(existing, &preview, source_row_key, source_row_title);
            repair_preview(existing);
        }
        return;
    }
    seen.insert(key);
    repair_preview(&mut preview);
    index.push(preview);
}

fn merge_string_lists(existing: &[String], incoming: &[String]) -> Vec<String> {
    let mut out = existing.to_vec();
    for item in incoming {
        let trimmed = item.trim();
        if trimmed.is_empty() {
            continue;
        }
        if !out.iter().any(|e| e.eq_ignore_ascii_case(trimmed)) {
            out.push(decode_text(trimmed));
        }
    }
    out
}

fn credits_from_value(title: &serde_json::Value, key: &str) -> Vec<String> {
    title
        .get(key)
        .and_then(|v| v.as_array())
        .map(|people| {
            people
                .iter()
                .filter_map(|person| {
                    person
                        .get("name")
                        .and_then(|v| v.as_str())
                        .map(|name| decode_text(name))
                })
                .collect()
        })
        .unwrap_or_default()
}

fn credits_from_title_struct(title: &ScTitle) -> (Vec<String>, Vec<String>) {
    let cast = title
        .main_actors
        .iter()
        .filter_map(|person| person.name.as_deref())
        .filter(|name| !name.trim().is_empty())
        .map(decode_text)
        .collect();
    let directors = title
        .main_directors
        .iter()
        .filter_map(|person| person.name.as_deref())
        .filter(|name| !name.trim().is_empty())
        .map(decode_text)
        .collect();
    (cast, directors)
}

fn genres_from_value(title: &serde_json::Value) -> Vec<String> {
    title
        .get("genres")
        .and_then(|v| v.as_array())
        .map(|genres| {
            genres
                .iter()
                .filter_map(|genre| {
                    genre
                        .get("name")
                        .and_then(|v| v.as_str())
                        .map(decode_text)
                })
                .collect()
        })
        .unwrap_or_default()
}

/// Provider ufficiali dal dettaglio SC (`netflix_id`, `prime_id`, …).
fn streaming_services_from_value(title: &serde_json::Value) -> Vec<String> {
    const PROVIDER_FIELDS: &[(&str, &str)] = &[
        ("netflix_id", "netflix"),
        ("prime_id", "prime"),
        ("disney_id", "disney"),
        ("apple_id", "apple"),
        ("paramount_id", "paramount"),
        ("now_id", "now"),
        ("hbo_id", "hbo"),
    ];

    let mut services = Vec::new();
    for (field, service_id) in PROVIDER_FIELDS {
        let Some(value) = title.get(*field) else {
            continue;
        };
        let present = match value {
            serde_json::Value::Null => false,
            serde_json::Value::Bool(flag) => *flag,
            serde_json::Value::Number(n) => n.as_i64().unwrap_or(0) != 0,
            serde_json::Value::String(s) => !s.trim().is_empty(),
            _ => !value.is_null(),
        };
        if present {
            services.push((*service_id).to_string());
        }
    }
    services
}

fn title_has_provider_fields(title: &serde_json::Value) -> bool {
    [
        "netflix_id",
        "prime_id",
        "disney_id",
        "apple_id",
        "paramount_id",
        "now_id",
        "hbo_id",
    ]
    .iter()
    .any(|field| title.get(*field).is_some())
}

fn merge_genres(existing: &[String], incoming: &[String]) -> Vec<String> {
    let mut merged: Vec<String> = existing.to_vec();
    for genre in incoming {
        if !merged.iter().any(|g| g.eq_ignore_ascii_case(genre)) {
            merged.push(genre.clone());
        }
    }
    merged
}

fn map_title_values_unlimited(
    cdn: &str,
    titles: &[serde_json::Value],
    seen: &mut HashSet<String>,
    index: &mut Vec<StremioMetaPreview>,
    source_row_key: Option<&str>,
    source_row_title: Option<&str>,
    archive_genre: Option<&str>,
) {
    for title in titles {
        if let Some(preview) = preview_from_value(cdn, title, archive_genre) {
            insert_preview(
                index,
                seen,
                preview,
                source_row_key,
                source_row_title,
            );
        }
    }
}

fn fetch_paginated_titles(
    html_client: &HtmlPageClient,
    cdn: &str,
    base_path: &str,
    seen: &mut HashSet<String>,
    index: &mut Vec<StremioMetaPreview>,
    source_row_key: Option<&str>,
    source_row_title: Option<&str>,
    archive_genre: Option<&str>,
    persist_db: Option<&Database>,
    stop_on_known_pages: Option<u32>,
) -> usize {
    let mut empty_streak = 0u32;
    let mut duplicate_streak = 0u32;
    let mut added = 0usize;
    let mut last_saved_len = index.len();
    // None = crawl completo: non fermarsi su pagine già note (solo pagine vuote).
    let max_dup_pages = stop_on_known_pages;
    let max_page: u32 = if archive_genre.is_some() {
        MAX_GENRE_ARCHIVE_PAGES as u32
    } else if base_path.contains("/archive") {
        ARCHIVE_HARD_MAX_PAGE
    } else if base_path.contains("/search") {
        SEARCH_HARD_MAX_PAGE
    } else {
        ARCHIVE_HARD_MAX_PAGE
    };

    let mut page: u32 = 1;
    let mut hard_fail_streak = 0u32;
    while page <= max_page {
        let path = if base_path.contains('?') {
            format!("{base_path}&page={page}")
        } else {
            format!("{base_path}?page={page}")
        };
        let fetched = html_client.fetch_page(&path);
        let Some((_, titles)) = fetched else {
            hard_fail_streak += 1;
            if hard_fail_streak >= 8 {
                break;
            }
            // Riprova la STESSA pagina dopo pausa (non saltare titoli).
            std::thread::sleep(Duration::from_secs(5 + hard_fail_streak as u64));
            continue;
        };
        hard_fail_streak = 0;
        if titles.is_empty() {
            empty_streak += 1;
            if empty_streak >= 2 {
                break;
            }
            page += 1;
            continue;
        }
        let before = index.len();
        map_title_values_unlimited(
            cdn,
            &titles,
            seen,
            index,
            source_row_key,
            source_row_title,
            archive_genre,
        );
        let page_added = index.len().saturating_sub(before);
        added += page_added;

        // Archivio ordinato per data desc: stop su duplicati solo se richiesto (delta).
        if archive_genre.is_none() && page_added == 0 {
            if let Some(max_dup) = max_dup_pages {
                duplicate_streak += 1;
                if duplicate_streak >= max_dup {
                    break;
                }
            }
        } else {
            duplicate_streak = 0;
        }
        empty_streak = 0;

        if let Some(db) = persist_db {
            if index.len().saturating_sub(last_saved_len) >= ARCHIVE_PROGRESS_SAVE_EVERY {
                let _ = save_cached_index(db, index, false);
                last_saved_len = index.len();
                let _ = std::fs::OpenOptions::new()
                    .create(true)
                    .append(true)
                    .open(".tmp-sc-sync.log")
                    .and_then(|mut f| {
                        use std::io::Write;
                        writeln!(
                            f,
                            "[sc-sync] progress {base_path} page={page} total={}",
                            index.len()
                        )
                    });
            }
        }

        page += 1;
        // Ritmo moderato + variazione: search fa molte query, archivio max 20 pagine.
        let delay_ms = if base_path.contains("/search") { 220 } else { 300 };
        std::thread::sleep(Duration::from_millis(jittered_ms(delay_ms)));
    }

    if let Some(db) = persist_db {
        if index.len() > last_saved_len {
            let _ = save_cached_index(db, index, false);
        }
    }
    added
}

pub fn sync_catalog_index(
    app: &str,
    cdn: &str,
    locale: &str,
    slider_names: &[String],
    seed: Vec<StremioMetaPreview>,
    persist_db: Option<&Database>,
) -> Result<Vec<StremioMetaPreview>, String> {
    sync_catalog_index_inner(app, cdn, locale, slider_names, seed, persist_db, true)
}

/// Solo archivi movie/tv (per seed release): senza crawl generi (lento + 503).
pub fn sync_catalog_index_archives(
    app: &str,
    cdn: &str,
    locale: &str,
    seed: Vec<StremioMetaPreview>,
    persist_db: Option<&Database>,
) -> Result<Vec<StremioMetaPreview>, String> {
    sync_catalog_index_inner(app, cdn, locale, &[], seed, persist_db, false)
}

fn sync_catalog_index_inner(
    app: &str,
    cdn: &str,
    locale: &str,
    slider_names: &[String],
    seed: Vec<StremioMetaPreview>,
    persist_db: Option<&Database>,
    with_genre_archives: bool,
) -> Result<Vec<StremioMetaPreview>, String> {
    let app_base = app.trim_end_matches('/');
    let client = http_client()?;
    let _ = client
        .get(format!("{app_base}/{locale}"))
        .header("Accept", "text/html,application/xhtml+xml")
        .send();
    let xsrf = bootstrap_csrf(&client, app_base).ok();
    let html_client = HtmlPageClient::new(client, app_base);
    let cdn = cdn.trim_end_matches('/');
    let mut index = seed;
    let mut seen: HashSet<String> = index.iter().map(preview_dedupe_key).collect();

    if let Some(token) = xsrf.as_ref() {
        if !slider_names.is_empty() {
            if let Ok(sliders) =
                fetch_slider_batch(&html_client.client, app_base, token, locale, slider_names)
            {
                for slider in sliders {
                    let source_key = format!("sc-{}", slider.name);
                    for title in slider.titles {
                        insert_preview(
                            &mut index,
                            &mut seen,
                            map_title(cdn, title),
                            Some(&source_key),
                            Some(&slider.label),
                        );
                    }
                }
            }
        }
    }
    // Solo movie/tv separati: crawl completo (nessuno stop su duplicati) + save a chunk.
    let archive_paths = [
        format!("/{locale}/archive?type=movie"),
        format!("/{locale}/archive?type=tv"),
    ];
    for path in &archive_paths {
        let before = index.len();
        fetch_paginated_titles(
            &html_client,
            cdn,
            path,
            &mut seen,
            &mut index,
            None,
            None,
            None,
            persist_db,
            None, // crawl completo fino a pagine vuote
        );
        let _ = std::fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(".tmp-sc-sync.log")
            .and_then(|mut f| {
                use std::io::Write;
                writeln!(
                    f,
                    "[sc-sync] archive {path}: +{} (total {})",
                    index.len().saturating_sub(before),
                    index.len()
                )
            });
    }

    // Search paginata (niente hard-cap page=20): solo se l’archivio (max 20 pagine) non basta.
    let movies = index.iter().filter(|p| p.r#type == "movie").count();
    if movies < COMPLETE_MOVIE_MIN {
        crawl_search_catalog(
            &html_client,
            cdn,
            locale,
            &mut seen,
            &mut index,
            persist_db,
        );
    }

    if with_genre_archives {
        // Tag categorie dagli archivi genere (i listing non espongono `genres` inline).
        enrich_index_with_genre_archives(
            &html_client,
            cdn,
            locale,
            &mut seen,
            &mut index,
            persist_db,
        );
    }

    // L'archivio paginato copre già il catalogo: evita N browse slider lenti.
    if with_genre_archives && index.len() < 800 {
        for slider_name in slider_names {
            let path = format!("/{locale}/browse/{slider_name}");
            let source_key = format!("sc-{slider_name}");
            fetch_paginated_titles(
                &html_client,
                cdn,
                &path,
                &mut seen,
                &mut index,
                Some(&source_key),
                None,
                None,
                persist_db,
                Some(25),
            );
        }
    }

    if with_genre_archives {
        for hub in [format!("/{locale}/movies"), format!("/{locale}/tv-shows")] {
            if index.len() >= 800 {
                break;
            }
            if let Ok(html) = html_client
                .client
                .get(format!("{app_base}{hub}"))
                .header("Accept", "text/html,application/xhtml+xml")
                .send()
                .and_then(|r| r.error_for_status())
                .and_then(|r| r.text())
            {
                if let Some(page) = parse_inertia_from_html(&html) {
                    if let Some(sliders_val) =
                        page.get("props").and_then(|props| props.get("sliders"))
                    {
                        if let Ok(sliders) =
                            serde_json::from_value::<Vec<ScSlider>>(sliders_val.clone())
                        {
                            for slider in sliders {
                                let source_key = format!("sc-{}", slider.name);
                                for title in slider.titles {
                                    insert_preview(
                                        &mut index,
                                        &mut seen,
                                        map_title(cdn, title),
                                        Some(&source_key),
                                        Some(&slider.label),
                                    );
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    if let Some(db) = persist_db {
        let _ = save_cached_index(db, &index, true);
    }

    Ok(index)
}

fn crawl_search_catalog(
    html_client: &HtmlPageClient,
    cdn: &str,
    locale: &str,
    seen: &mut HashSet<String>,
    index: &mut Vec<StremioMetaPreview>,
    persist_db: Option<&Database>,
) {
    let mut queries: Vec<(String, Option<u32>)> = Vec::new();
    // Lettere/cifre: paginazione completa (fino a pagina vuota).
    for ch in b'a'..=b'z' {
        queries.push(((ch as char).to_string(), None));
    }
    for ch in b'0'..=b'9' {
        queries.push(((ch as char).to_string(), None));
    }
    // Digrammi: stop dopo 2 pagine senza titoli nuovi (molte query).
    for a in b'a'..=b'z' {
        for b in b'a'..=b'z' {
            queries.push((format!("{}{}", a as char, b as char), Some(2)));
        }
    }

    for (query, stop_on_known) in queries {
        let before = index.len();
        let path = format!(
            "/{locale}/search?q={}",
            urlencoding::encode(&query)
        );
        fetch_paginated_titles(
            html_client,
            cdn,
            &path,
            seen,
            index,
            None,
            None,
            None,
            persist_db,
            stop_on_known,
        );
        let added = index.len().saturating_sub(before);
        if added > 0 || query.len() == 1 {
            let _ = std::fs::OpenOptions::new()
                .create(true)
                .append(true)
                .open(".tmp-sc-sync.log")
                .and_then(|mut f| {
                    use std::io::Write;
                    writeln!(
                        f,
                        "[sc-sync] search q={query:?}: +{added} (total {})",
                        index.len()
                    )
                });
        }
    }
}

fn enrich_index_with_genre_archives(
    html_client: &HtmlPageClient,
    cdn: &str,
    locale: &str,
    seen: &mut HashSet<String>,
    index: &mut Vec<StremioMetaPreview>,
    persist_db: Option<&Database>,
) {
    let genres = discover_genres(&html_client.client, &html_client.app_base, locale);
    for (genre_id, name) in genres {
        let source_key = format!("sc-genre-{}", name.to_lowercase().replace(' ', "-"));
        for type_q in ["movie", "tv"] {
            let path = format!("/{locale}/archive?type={type_q}&genres={genre_id}");
            fetch_paginated_titles(
                html_client,
                cdn,
                &path,
                seen,
                index,
                Some(&source_key),
                Some(&name),
                Some(&name),
                persist_db,
                Some(25),
            );
        }
    }
}

/// Arricchisce un batch di titoli SC (generi + provider) dalle pagine dettaglio.
/// Fetch paralleli; salva l'indice a chunk. Ritorna quanti titoli aggiornati.
/// Pausa `base..=1.5*base` ms: evita intervalli perfettamente regolari, che gli
/// anti-bot riconoscono come traffico automatico. Nessuna dipendenza esterna.
fn jittered_ms(base: u64) -> u64 {
    if base == 0 {
        return 0;
    }
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .subsec_nanos() as u64;
    base + (nanos % (base / 2 + 1))
}

pub fn enrich_cached_index_metadata(db: &Database, limit: usize) -> Result<usize, String> {
    let Some((mut index, _)) = load_cached_index(db) else {
        return Ok(0);
    };
    let app = resolve_app_url(db).or_else(|_| discover_app_url(db))?;
    let cdn = cdn_url(db);
    let locale = lang(db);
    let app_base = app.trim_end_matches('/').to_string();
    let client = http_client()?;
    let _ = client
        .get(format!("{app_base}/{locale}"))
        .header("Accept", "text/html,application/xhtml+xml")
        .send();

    let cursor = db
        .get_meta(META_SC_META_ENRICH_CURSOR)
        .ok()
        .flatten()
        .and_then(|raw| raw.parse::<usize>().ok())
        .unwrap_or(0);

    let mut candidates: Vec<(usize, String, String)> = index
        .iter()
        .enumerate()
        .filter(|(_, preview)| {
            preview.catalog_prefix.as_deref().unwrap_or("sc") == "sc"
                && preview
                    .slug
                    .as_ref()
                    .is_some_and(|s| !s.trim().is_empty())
                && (preview.genres.is_empty()
                    || preview.genres.len() > 8
                    || preview.streaming_services.is_none())
        })
        .filter_map(|(idx, preview)| {
            let slug = preview.slug.as_ref()?.clone();
            Some((idx, preview.id.clone(), slug))
        })
        .collect();

    if candidates.is_empty() {
        let _ = db.set_meta(META_SC_META_ENRICH_CURSOR, "0");
        return Ok(0);
    }

    // Riprendi dal cursore (rotazione circolare sull'elenco target).
    let start = cursor % candidates.len();
    candidates.rotate_left(start);
    candidates.truncate(limit.max(1));

    let (tx, rx) = std::sync::mpsc::channel::<(usize, Option<StremioMetaPreview>)>();
    let worker_count = TITLE_META_ENRICH_WORKERS.min(candidates.len()).max(1);
    let chunk_size = (candidates.len() + worker_count - 1) / worker_count;

    for chunk in candidates.chunks(chunk_size) {
        let chunk: Vec<_> = chunk.to_vec();
        let tx = tx.clone();
        let client = client.clone();
        let app_base = app_base.clone();
        let cdn = cdn.clone();
        let locale = locale.clone();
        std::thread::spawn(move || {
            let html_client = HtmlPageClient::new(client, &app_base);
            for (idx, id, slug) in chunk {
                let enriched =
                    fetch_title_preview_from_detail(&html_client, &cdn, &locale, &id, &slug);
                let _ = tx.send((idx, enriched));
                // Ritmo "da persona": ~2-3 richieste/sec per worker.
                std::thread::sleep(Duration::from_millis(jittered_ms(350)));
            }
        });
    }
    drop(tx);

    let mut updated = 0usize;
    let mut processed = 0usize;
    let mut dirty = false;
    for (idx, enriched_opt) in rx {
        processed += 1;
        let Some(enriched) = enriched_opt else {
            continue;
        };
        let Some(existing) = index.get_mut(idx) else {
            continue;
        };
        let before_genres = existing.genres.len();
        let before_type = existing.r#type.clone();
        let before_services = existing.streaming_services.clone();
        apply_preview_metadata(existing, &enriched, None, None);
        // Pagina dettaglio: i generi SC reali sostituiscono il dump degli archivi genere.
        if !enriched.genres.is_empty() {
            existing.genres = enriched.genres.clone();
        }
        // Dettaglio visto → provider noti (anche lista vuota).
        existing.streaming_services = Some(
            enriched
                .streaming_services
                .clone()
                .unwrap_or_default(),
        );
        if !enriched.r#type.is_empty() {
            existing.r#type = enriched.r#type.clone();
        }
        if existing.genres.len() != before_genres
            || existing.r#type != before_type
            || existing.streaming_services != before_services
        {
            updated += 1;
            dirty = true;
        }
        repair_preview(existing);

        if dirty && updated > 0 && updated % TITLE_META_ENRICH_SAVE_EVERY == 0 {
            save_cached_index(db, &index, true)?;
            dirty = false;
        }
    }

    let next_cursor = start.saturating_add(processed);
    let _ = db.set_meta(META_SC_META_ENRICH_CURSOR, &next_cursor.to_string());

    if dirty || updated > 0 {
        save_cached_index(db, &index, true)?;
    }
    Ok(updated)
}

/// Avvia un worker in background che arricchisce finché restano titoli da completare.
/// Un solo job alla volta (desktop + web).
pub fn spawn_continuous_metadata_enrichment(db: std::sync::Arc<Database>) {
    {
        let Ok(mut running) = META_ENRICH_RUNNING.lock() else {
            return;
        };
        if *running {
            return;
        }
        *running = true;
    }

    std::thread::spawn(move || {
        let mut idle_rounds = 0u32;
        let mut backoff_ms = 400u64;
        loop {
            match enrich_cached_index_metadata(db.as_ref(), TITLE_META_ENRICH_BATCH) {
                Ok(0) => {
                    idle_rounds += 1;
                    if idle_rounds >= 2 {
                        break;
                    }
                    std::thread::sleep(Duration::from_secs(2));
                }
                Ok(_) => {
                    idle_rounds = 0;
                    backoff_ms = 400;
                    // Respiro tra un ciclo e l'altro: niente raffiche continue.
                    std::thread::sleep(Duration::from_millis(jittered_ms(1500)));
                }
                Err(_) => {
                    std::thread::sleep(Duration::from_millis(backoff_ms));
                    backoff_ms = (backoff_ms.saturating_mul(2)).min(8_000);
                    idle_rounds += 1;
                    if idle_rounds >= 6 {
                        break;
                    }
                }
            }
        }
        if let Ok(mut running) = META_ENRICH_RUNNING.lock() {
            *running = false;
        }
    });
}

fn fetch_title_preview_from_detail(
    html_client: &HtmlPageClient,
    cdn: &str,
    locale: &str,
    title_id: &str,
    slug: &str,
) -> Option<StremioMetaPreview> {
    let path = format!("/{locale}/titles/{title_id}-{slug}");
    let response = html_client
        .client
        .get(format!("{}{}", html_client.app_base, path))
        .header("Accept", "text/html,application/xhtml+xml")
        .send()
        .ok()?;
    if !response.status().is_success() {
        return None;
    }
    let html = response.text().ok()?;
    let page = parse_inertia_from_html(&html)?;
    let title = page.get("props")?.get("title")?;
    preview_from_value(cdn, title, None)
}

fn merge_row_items(index: &mut Vec<StremioMetaPreview>, rows: &[ScCatalogRow]) {
    let mut seen: HashSet<String> = index.iter().map(preview_dedupe_key).collect();
    for row in rows {
        for item in &row.items {
            insert_preview(
                index,
                &mut seen,
                item.clone(),
                Some(&row.key),
                Some(&row.title),
            );
        }
    }
}

fn decode_bundled_catalog_seed() -> Option<Vec<StremioMetaPreview>> {
    if BUNDLED_SC_CATALOG_SEED_GZ.len() < 32 {
        return None;
    }
    let mut decoder = GzDecoder::new(BUNDLED_SC_CATALOG_SEED_GZ);
    let mut json = String::new();
    decoder.read_to_string(&mut json).ok()?;
    let items: Vec<StremioMetaPreview> = serde_json::from_str(&json).ok()?;
    if items.len() < 800 {
        return None;
    }
    Some(items)
}

/// Se il DB locale è vuoto/parziale, carica lo snapshot incluso nella release.
/// Ritorna `true` se ha scritto l'indice.
pub fn ensure_bundled_catalog_seed(db: &Database) -> bool {
    let Some(mut bundled) = decode_bundled_catalog_seed() else {
        return false;
    };
    let current_len = load_cached_index(db)
        .map(|(items, _)| items.len())
        .unwrap_or(0);
    if current_len >= bundled.len() {
        return false;
    }

    repair_index(&mut bundled);
    let mut seen: HashSet<String> = bundled.iter().map(preview_dedupe_key).collect();
    if let Some((cached, _)) = load_cached_index(db) {
        for preview in cached {
            insert_preview(&mut bundled, &mut seen, preview, None, None);
        }
    }
    repair_index(&mut bundled);
    save_cached_index(db, &bundled, true).is_ok()
}

/// Scrive l'indice SC corrente come seed gzip per la prossima release.
pub fn write_catalog_seed_file(db: &Database, out_path: &Path) -> Result<(usize, usize, usize), String> {
    let (index, _) = load_cached_index(db).ok_or_else(|| "Indice catalogo vuoto".to_string())?;
    let movies = index.iter().filter(|p| p.r#type == "movie").count();
    let series = index
        .iter()
        .filter(|p| p.r#type == "series" || p.r#type == "tv")
        .count();
    let json = serde_json::to_vec(&index).map_err(|e| e.to_string())?;
    let mut encoder = GzEncoder::new(Vec::new(), Compression::best());
    encoder
        .write_all(&json)
        .map_err(|e| format!("gzip write: {e}"))?;
    let gz = encoder
        .finish()
        .map_err(|e| format!("gzip finish: {e}"))?;
    if let Some(parent) = out_path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    std::fs::write(out_path, gz).map_err(|e| e.to_string())?;
    Ok((index.len(), movies, series))
}

/// Crawl completo archivio movie/tv (riprende da cache), poi esporta lo seed gzip.
pub fn build_and_export_catalog_seed(db: &Database, out_path: &Path) -> Result<(usize, usize, usize), String> {
    let app = resolve_app_url(db).or_else(|_| discover_app_url(db))?;
    let cdn = cdn_url(db);
    let locale = lang(db);
    let cached = load_cached_index(db)
        .map(|(items, _)| items)
        .unwrap_or_default();
    let before = cached.len();
    let _ = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(".tmp-sc-sync.log")
        .and_then(|mut f| {
            use std::io::Write;
            writeln!(f, "[sc-sync] seed export start cached={before}")
        });
    let mut index = sync_catalog_index_archives(&app, &cdn, &locale, cached, Some(db))?;
    repair_index(&mut index);
    save_cached_index(db, &index, true)?;
    write_catalog_seed_file(db, out_path)
}

fn load_cached_index(db: &Database) -> Option<(Vec<StremioMetaPreview>, i64)> {
    let ts = db
        .get_meta(META_SC_INDEX_TS)
        .ok()
        .flatten()?
        .parse::<i64>()
        .ok()?;
    let version = db
        .get_meta(META_SC_INDEX_VERSION)
        .ok()
        .flatten()
        .unwrap_or_default();

    if let Ok(guard) = INDEX_MEM_CACHE.lock() {
        if let Some((cached_ts, cached_ver, items)) = guard.as_ref() {
            if *cached_ts == ts && cached_ver == &version && !items.is_empty() {
                return Some((items.clone(), ts));
            }
        }
    }

    let json = db.get_meta(META_SC_INDEX).ok().flatten()?;
    let items: Vec<StremioMetaPreview> = serde_json::from_str(&json).ok()?;
    if items.is_empty() {
        return None;
    }
    if let Ok(mut guard) = INDEX_MEM_CACHE.lock() {
        *guard = Some((ts, version, items.clone()));
    }
    Some((items, ts))
}

fn invalidate_index_mem_cache() {
    if let Ok(mut guard) = INDEX_MEM_CACHE.lock() {
        *guard = None;
    }
}

#[allow(dead_code)]
fn clear_index_mem_cache_for_tests() {
    invalidate_index_mem_cache();
}

fn synthesize_home_rows_from_index(index: &[StremioMetaPreview]) -> Vec<ScCatalogRow> {
    let mut movies: Vec<StremioMetaPreview> = index
        .iter()
        .filter(|p| {
            p.r#type == "movie" && p.catalog_prefix.as_deref().unwrap_or("sc") == "sc"
        })
        .cloned()
        .collect();
    let mut series: Vec<StremioMetaPreview> = index
        .iter()
        .filter(|p| {
            (p.r#type == "series" || p.r#type == "tv")
                && p.catalog_prefix.as_deref().unwrap_or("sc") == "sc"
        })
        .cloned()
        .collect();
    movies.sort_by(|a, b| b.release_info.cmp(&a.release_info));
    series.sort_by(|a, b| b.release_info.cmp(&a.release_info));
    movies.truncate(SLIDER_ROW_LIMIT);
    series.truncate(SLIDER_ROW_LIMIT);

    let mut rows = Vec::new();
    if !movies.is_empty() {
        rows.push(ScCatalogRow {
            key: "sc-recent-movies".into(),
            title: "Film recenti".into(),
            subtitle: "Dal catalogo locale".into(),
            items: movies,
        });
    }
    if !series.is_empty() {
        rows.push(ScCatalogRow {
            key: "sc-recent-series".into(),
            title: "Serie recenti".into(),
            subtitle: "Dal catalogo locale".into(),
            items: series,
        });
    }
    rows
}

/// Slider homepage best-effort: timeout corto, un solo host, senza hub lenti.
fn fetch_sliders_quick(db: &Database, cdn: &str, locale: &str) -> Vec<ScCatalogRow> {
    let Ok(client) = http_client_with_timeout(4) else {
        return Vec::new();
    };
    let Some(base) = app_url_candidates(db).into_iter().next() else {
        return Vec::new();
    };
    let cdn = cdn.trim_end_matches('/');
    let Ok(sliders) = fetch_embedded_home_sliders(&client, &base, locale) else {
        return Vec::new();
    };
    if sliders.iter().all(|s| s.titles.is_empty()) {
        return Vec::new();
    }
    let mut seen = HashSet::new();
    build_rows_from_sliders(cdn, sliders, &mut seen)
}

pub fn catalog_needs_background_sync(db: &Database) -> bool {
    let version = db.get_meta(META_SC_INDEX_VERSION).ok().flatten();
    if version.as_deref() != Some(CURRENT_INDEX_VERSION) {
        return true;
    }
    let Some((items, _)) = load_cached_index(db) else {
        return true;
    };
    if items.is_empty() {
        return true;
    }
    let sc_items: Vec<_> = items
        .iter()
        .filter(|p| p.catalog_prefix.as_deref().unwrap_or("sc") == "sc")
        .collect();
    if sc_items.len() < 800 {
        return true;
    }
    let movies = sc_items.iter().filter(|p| p.r#type == "movie").count();
    // Completo ≈ archivio SC (~13k film): sotto soglia continua il crawl full.
    movies < COMPLETE_MOVIE_MIN
}

fn save_cached_index(db: &Database, index: &[StremioMetaPreview], bump_version: bool) -> Result<(), String> {
    if index.is_empty() {
        return Ok(());
    }
    // Non sovrascrivere mai un indice completo con uno parziale (solo slider).
    if let Some((cached, _)) = load_cached_index(db) {
        if cached.len() > index.len() && index.len() < 800 {
            return Ok(());
        }
    }
    let json = serde_json::to_string(index).map_err(|e| e.to_string())?;
    db.set_meta(META_SC_INDEX, &json)?;
    let ts = now_ts();
    db.set_meta(META_SC_INDEX_TS, &ts.to_string())?;
    let version = if bump_version {
        db.set_meta(META_SC_INDEX_VERSION, CURRENT_INDEX_VERSION)?;
        CURRENT_INDEX_VERSION.to_string()
    } else {
        db.get_meta(META_SC_INDEX_VERSION)
            .ok()
            .flatten()
            .unwrap_or_default()
    };
    if let Ok(mut guard) = INDEX_MEM_CACHE.lock() {
        *guard = Some((ts, version, index.to_vec()));
    }
    Ok(())
}

fn append_genre_rows(rows: &mut Vec<ScCatalogRow>, index: &[StremioMetaPreview]) {
    let existing: HashSet<String> = rows.iter().map(|row| row.key.clone()).collect();
    for row in build_genre_rows_from_index(index) {
        if existing.contains(&row.key) {
            continue;
        }
        rows.push(row);
    }
}

fn build_genre_rows_from_index(index: &[StremioMetaPreview]) -> Vec<ScCatalogRow> {
    const MAX_ITEMS: usize = 64;
    let mut buckets: HashMap<String, (String, Vec<StremioMetaPreview>)> = HashMap::new();

    for preview in index {
        if preview.r#type != "movie" {
            continue;
        }
        let Some(row_key) = preview.source_row_key.as_ref() else {
            continue;
        };
        if !row_key.starts_with("sc-genre-") {
            continue;
        }
        let title = preview
            .source_row_title
            .clone()
            .filter(|t| !t.trim().is_empty())
            .unwrap_or_else(|| {
                row_key
                    .trim_start_matches("sc-genre-")
                    .replace('-', " ")
            });
        let entry = buckets
            .entry(row_key.clone())
            .or_insert_with(|| (title, Vec::new()));
        if entry.1.len() >= MAX_ITEMS {
            continue;
        }
        entry.1.push(preview.clone());
    }

    let mut rows: Vec<ScCatalogRow> = buckets
        .into_iter()
        .filter(|(_, (_, items))| !items.is_empty())
        .map(|(key, (title, items))| ScCatalogRow {
            key,
            title: title.clone(),
            subtitle: title,
            items,
        })
        .collect();
    rows.sort_by(|a, b| a.title.cmp(&b.title));
    rows
}

fn slim_preview_for_transport(mut preview: StremioMetaPreview) -> StremioMetaPreview {
    // Riduce il payload browse senza togliere campi usati da hero/card/filtri.
    preview.description = None;
    preview.cast.clear();
    preview.directors.clear();
    preview
}

fn slim_index_for_transport(index: Vec<StremioMetaPreview>) -> Vec<StremioMetaPreview> {
    index.into_iter().map(slim_preview_for_transport).collect()
}

fn slim_rows_for_transport(rows: Vec<ScCatalogRow>) -> Vec<ScCatalogRow> {
    rows.into_iter()
        .map(|mut row| {
            row.items = row
                .items
                .into_iter()
                .map(slim_preview_for_transport)
                .collect();
            row
        })
        .collect()
}

pub fn fetch_catalog(
    db: &Database,
    _app: &str,
    cdn: &str,
    locale: &str,
) -> Result<ScCatalogResponse, String> {
    let _ = ensure_bundled_catalog_seed(db);
    let needs_background_sync = catalog_needs_background_sync(db);

    let mut index = load_cached_index(db)
        .map(|(cached, _)| cached)
        .unwrap_or_default();
    repair_index(&mut index);

    // Con catalogo locale già completo: zero rete sul path critico del boot.
    let mut rows = if !needs_background_sync && index.len() >= MIN_USABLE_INDEX {
        synthesize_home_rows_from_index(&index)
    } else if index.len() >= MIN_USABLE_INDEX {
        fetch_sliders_quick(db, cdn, locale)
    } else {
        fetch_sliders_for_db(db, cdn, locale).unwrap_or_else(|_| fetch_sliders_quick(db, cdn, locale))
    };
    repair_rows(&mut rows);

    let before_len = index.len();
    if !rows.is_empty()
        && !(rows.len() <= 2
            && rows
                .iter()
                .all(|r| r.key.starts_with("sc-recent-")))
    {
        merge_row_items(&mut index, &rows);
        repair_index(&mut index);
        if index.len() > before_len {
            let _ = save_cached_index(db, &index, false);
        }
    } else if rows.is_empty() && !index.is_empty() {
        rows = synthesize_home_rows_from_index(&index);
    }

    append_genre_rows(&mut rows, &index);

    let synced_at = db
        .get_meta(META_SC_INDEX_TS)
        .ok()
        .flatten()
        .and_then(|v| v.parse().ok())
        .unwrap_or_else(now_ts);

    let total_count = index.len();

    Ok(ScCatalogResponse {
        rows: slim_rows_for_transport(rows),
        index: slim_index_for_transport(index),
        synced_at,
        total_count,
        needs_background_sync,
    })
}

/// Stato leggero per il poll UI (niente indice da 10MB).
pub fn catalog_status(db: &Database) -> (usize, i64, bool) {
    let needs_background_sync = catalog_needs_background_sync(db);
    let (total, synced_at) = match load_cached_index(db) {
        Some((items, ts)) => (items.len(), ts),
        None => (0, 0),
    };
    (total, synced_at, needs_background_sync)
}

static CATALOG_REFRESH_LOCK: Mutex<()> = Mutex::new(());

pub fn refresh_catalog_index(
    db: &Database,
    _app: &str,
    cdn: &str,
    locale: &str,
) -> Result<ScCatalogResponse, String> {
    let _guard = CATALOG_REFRESH_LOCK
        .lock()
        .map_err(|_| "Sync catalogo già in corso".to_string())?;
    let app = resolve_app_url(db).or_else(|_| discover_app_url(db))?;
    let mut rows = fetch_sliders_for_db(db, cdn, locale)?;
    repair_rows(&mut rows);
    let cached = load_cached_index(db)
        .map(|(cached, _)| cached)
        .unwrap_or_default();
    let slider_names = discover_slider_names(&http_client()?, app.trim_end_matches('/'), locale);
    let mut index = sync_catalog_index(
        &app,
        cdn,
        locale,
        &slider_names,
        cached,
        Some(db),
    )?;
    repair_index(&mut index);
    merge_row_items(&mut index, &rows);
    repair_index(&mut index);
    append_genre_rows(&mut rows, &index);
    save_cached_index(db, &index, true)?;
    let synced_at = now_ts();
    Ok(ScCatalogResponse {
        total_count: index.len(),
        rows,
        index,
        synced_at,
        needs_background_sync: catalog_needs_background_sync(db),
    })
}

/// Aggiornamento leggero: solo titoli nuovi dalle prime pagine archivio.
/// Si ferma quando 2 pagine consecutive sono già tutte note.
pub fn incremental_catalog_update(db: &Database) -> Result<usize, String> {
    let Ok(_guard) = CATALOG_REFRESH_LOCK.try_lock() else {
        return Ok(0);
    };
    let app = resolve_app_url(db).or_else(|_| discover_app_url(db))?;
    let cdn = cdn_url(db);
    let locale = lang(db);
    let app_base = app.trim_end_matches('/');
    let client = http_client()?;
    let _ = client
        .get(format!("{app_base}/{locale}"))
        .header("Accept", "text/html,application/xhtml+xml")
        .send();
    let html_client = HtmlPageClient::new(client, app_base);
    let cdn = cdn.trim_end_matches('/');

    let mut index = load_cached_index(db)
        .map(|(cached, _)| cached)
        .unwrap_or_default();
    if index.is_empty() {
        return Ok(0);
    }
    let mut seen: HashSet<String> = index.iter().map(preview_dedupe_key).collect();
    let before = index.len();

    for type_q in ["movie", "tv"] {
        let path = format!("/{locale}/archive?type={type_q}");
        fetch_paginated_titles(
            &html_client,
            cdn,
            &path,
            &mut seen,
            &mut index,
            None,
            None,
            None,
            None,
            Some(2), // stop dopo 2 pagine di soli duplicati
        );
    }

    let added = index.len().saturating_sub(before);
    if added > 0 {
        repair_index(&mut index);
        save_cached_index(db, &index, false)?;
    } else {
        // Aggiorna solo il timestamp “checked”.
        let _ = db.set_meta(META_SC_INDEX_TS, &now_ts().to_string());
    }
    Ok(added)
}

/// All’avvio: full crawl se catalogo incompleto, altrimenti solo delta + enrich.
pub fn spawn_catalog_boot_maintenance(db: std::sync::Arc<Database>) {
    {
        let Ok(mut running) = CATALOG_BOOT_RUNNING.lock() else {
            return;
        };
        if *running {
            return;
        }
        *running = true;
    }

    std::thread::spawn(move || {
        let _ = ensure_bundled_catalog_seed(db.as_ref());
        let needs_full = catalog_needs_background_sync(db.as_ref());
        let cdn = cdn_url(db.as_ref());
        let locale = lang(db.as_ref());
        if needs_full {
            let _ = refresh_catalog_index(db.as_ref(), "", &cdn, &locale);
        } else {
            let _ = incremental_catalog_update(db.as_ref());
        }
        if let Ok(mut running) = CATALOG_BOOT_RUNNING.lock() {
            *running = false;
        }
        spawn_continuous_metadata_enrichment(db);
    });
}

fn decode_text(value: &str) -> String {
    decode_html_entities(value)
}

fn repair_preview(preview: &mut StremioMetaPreview) {
    preview.name = decode_text(&preview.name);
    if let Some(description) = preview.description.as_mut() {
        *description = decode_text(description);
    }
    for genre in preview.genres.iter_mut() {
        *genre = decode_text(genre);
    }
    if let Some(row_title) = preview.source_row_title.as_mut() {
        *row_title = decode_text(row_title);
    }
}

fn repair_index(index: &mut [StremioMetaPreview]) {
    for preview in index.iter_mut() {
        repair_preview(preview);
    }
}

fn repair_rows(rows: &mut [ScCatalogRow]) {
    for row in rows.iter_mut() {
        row.title = decode_text(&row.title);
        row.subtitle = decode_text(&row.subtitle);
        for item in row.items.iter_mut() {
            repair_preview(item);
        }
    }
}

fn parse_inertia_from_html(html: &str) -> Option<serde_json::Value> {
    let marker = "data-page=\"";
    let start = html.find(marker)? + marker.len();
    let rest = &html[start..];
    let end = rest.find('"')?;
    let encoded = &rest[..end];
    let decoded = encoded
        .replace("&quot;", "\"")
        .replace("&amp;", "&")
        .replace("&#39;", "'")
        .replace("&#039;", "'");
    serde_json::from_str(&decoded).ok()
}

pub fn catalog_enabled(db: &crate::db::Database) -> bool {
    db.get_meta("sc_catalog_enabled")
        .ok()
        .flatten()
        .map(|v| v != "false")
        .unwrap_or(true)
}

/// Ricerca su tutto l'indice locale SC (nessun limite artificiale).
pub fn search_index(db: &Database, query: &str) -> Vec<StremioMetaPreview> {
    let q = query.trim();
    if q.len() < 2 {
        return Vec::new();
    }
    load_cached_index(db)
        .map(|(index, _)| crate::smart_search::filter_and_rank_previews(index, q, 200))
        .unwrap_or_default()
}

pub fn app_url(db: &crate::db::Database) -> String {
    db.get_meta("sc_app_url")
        .ok()
        .flatten()
        .filter(|s| !s.trim().is_empty())
        .unwrap_or_else(|| DEFAULT_APP_URL.to_string())
}

pub fn cdn_url(db: &crate::db::Database) -> String {
    db.get_meta("sc_cdn_url")
        .ok()
        .flatten()
        .filter(|s| !s.trim().is_empty())
        .unwrap_or_else(|| DEFAULT_CDN_URL.to_string())
}

pub fn lang(db: &crate::db::Database) -> String {
    let preferred = db
        .get_meta(crate::settings::META_PREFERRED_AUDIO_LANG)
        .ok()
        .flatten()
        .filter(|s| !s.trim().is_empty());
    if let Some(value) = preferred {
        let normalized = value.trim().to_lowercase();
        if normalized == "auto" {
            return DEFAULT_LANG.to_string();
        }
        if normalized == "en" {
            return "en".to_string();
        }
        return DEFAULT_LANG.to_string();
    }
    db.get_meta("sc_lang")
        .ok()
        .flatten()
        .filter(|s| !s.trim().is_empty())
        .unwrap_or_else(|| DEFAULT_LANG.to_string())
}

fn is_low_res_hero_filename(filename: &str) -> bool {
    let lower = filename.to_ascii_lowercase();
    lower.contains("cover_mobile")
        || lower.contains("poster_mobile")
        || lower.contains("background_mobile")
        || lower.contains("_mobile.")
        || lower.contains("-mobile.")
        || lower.contains("_thumb")
        || lower.contains("thumbnail")
        || lower.contains("_small")
        || lower.contains("-small")
        || lower.contains("/small/")
        || lower.contains("/medium/")
}

fn image_filename_quality_score(filename: &str) -> i32 {
    if is_low_res_hero_filename(filename) {
        return -1;
    }
    let lower = filename.to_ascii_lowercase();
    let mut score = 40;
    if lower.ends_with(".png") {
        score += 8;
    } else if lower.ends_with(".webp") {
        score += 4;
    }
    if lower.contains("background") {
        score += 14;
    }
    if lower.contains("logo") {
        score += 10;
    }
    if lower.contains("original") || lower.contains("full") {
        score += 18;
    }
    if lower.contains("large") {
        score += 10;
    }
    score += lower.len() as i32;
    score
}

fn hero_image_url_for_type(cdn: &str, images: &[ScImage], image_type: &str) -> Option<String> {
    images
        .iter()
        .filter(|image| image.image_type == image_type)
        .filter(|image| !is_low_res_hero_filename(&image.filename))
        .max_by_key(|image| image_filename_quality_score(&image.filename))
        .map(|image| format!("{}/images/{}", cdn.trim_end_matches('/'), image.filename))
}

/// Per le card portrait in home: `poster` full-res 2:3, fallback su `cover`.
fn browse_poster_url(cdn: &str, images: &[ScImage]) -> Option<String> {
    for image_type in ["poster", "cover"] {
        if let Some(url) = hero_image_url_for_type(cdn, images, image_type) {
            return Some(url);
        }
    }
    None
}

/// Hero home: `background` full-res landscape, poi `cover`, mai thumb mobile.
fn hero_background_url(cdn: &str, images: &[ScImage]) -> Option<String> {
    for image_type in ["background", "cover", "poster"] {
        if let Some(url) = hero_image_url_for_type(cdn, images, image_type) {
            return Some(url);
        }
    }
    None
}

fn title_logo_url(cdn: &str, images: &[ScImage]) -> Option<String> {
    hero_image_url_for_type(cdn, images, "logo")
}

fn map_title(cdn: &str, title: ScTitle) -> StremioMetaPreview {
    let stremio_type = if title.title_type == "tv" {
        "series"
    } else {
        "movie"
    };
    let is_series = stremio_type == "series";
    let (episode_id, episode_name, episode_images) = if is_series {
        episode_context_from_title(&title)
    } else {
        (None, None, Vec::new())
    };
    let display_name = if is_series {
        episode_name
            .as_deref()
            .filter(|name| !name.trim().is_empty())
            .unwrap_or(title.name.as_str())
    } else {
        title.name.as_str()
    };
    let poster = browse_poster_url(cdn, &title.images)
        .or_else(|| browse_poster_url(cdn, &episode_images));
    let background = hero_background_url(cdn, &title.images);
    let logo = title_logo_url(cdn, &title.images)
        .or_else(|| title_logo_url(cdn, &episode_images));
    let (cast, directors) = credits_from_title_struct(&title);
    StremioMetaPreview {
        id: title.id.to_string(),
        r#type: stremio_type.to_string(),
        name: decode_text(display_name),
        poster,
        background,
        logo,
        poster_shape: None,
        description: None,
        release_info: title.last_air_date,
        catalog_prefix: Some("sc".to_string()),
        slug: Some(title.slug),
        genres: title
            .genres
            .into_iter()
            .map(|g| decode_text(&g.name))
            .collect(),
        cast,
        directors,
        streaming_services: None,
        source_row_key: None,
        source_row_title: None,
        resume_video_id: if is_series {
            episode_id.map(|id| id.to_string())
        } else {
            None
        },
    }
}

pub fn preview_from_value(
    cdn: &str,
    title: &serde_json::Value,
    archive_genre: Option<&str>,
) -> Option<StremioMetaPreview> {
    let id = title.get("id")?.as_i64()?;
    let name = title.get("name")?.as_str()?;
    let slug = title.get("slug")?.as_str()?;
    let title_type = title.get("type")?.as_str()?;
    let stremio_type = if title_type == "tv" {
        "series"
    } else {
        "movie"
    };
    let is_series = stremio_type == "series";
    let images: Vec<ScImage> = title
        .get("images")
        .and_then(|v| serde_json::from_value(v.clone()).ok())
        .unwrap_or_default();
    let (episode_id, episode_name, episode_images) = if is_series {
        episode_context_from_value(title)
    } else {
        (None, None, Vec::new())
    };
    let display_name = if is_series {
        episode_name
            .as_deref()
            .filter(|n| !n.trim().is_empty())
            .unwrap_or(name)
    } else {
        name
    };
    let poster = browse_poster_url(cdn, &images)
        .or_else(|| browse_poster_url(cdn, &episode_images));
    let background = hero_background_url(cdn, &images);
    let logo = title_logo_url(cdn, &images)
        .or_else(|| title_logo_url(cdn, &episode_images));
    let mut genres = genres_from_value(title);
    if let Some(genre) = archive_genre {
        if !genres.iter().any(|g| g.eq_ignore_ascii_case(genre)) {
            genres.push(decode_text(genre));
        }
    }
    let cast = credits_from_value(title, "main_actors");
    let directors = credits_from_value(title, "main_directors");
    // Listing archive non espongono i campi provider → None (sconosciuto).
    // Pagine dettaglio hanno sempre netflix_id/prime_id/… (anche null) → Some([...]).
    let streaming_services = if title_has_provider_fields(title) {
        Some(streaming_services_from_value(title))
    } else {
        None
    };
    Some(StremioMetaPreview {
        id: id.to_string(),
        r#type: stremio_type.to_string(),
        name: decode_text(display_name),
        poster,
        background,
        logo,
        poster_shape: None,
        description: title
            .get("plot")
            .and_then(|v| v.as_str())
            .map(decode_text),
        release_info: title
            .get("last_air_date")
            .or_else(|| title.get("release_date"))
            .and_then(|v| v.as_str())
            .map(str::to_string),
        catalog_prefix: Some("sc".to_string()),
        slug: Some(slug.to_string()),
        genres,
        cast,
        directors,
        streaming_services,
        source_row_key: None,
        source_row_title: None,
        resume_video_id: if is_series {
            episode_id.map(|ep| ep.to_string())
        } else {
            None
        },
    })
}

pub fn fetch_home_catalog(db: &crate::db::Database) -> Result<Vec<ScCatalogRow>, String> {
    if !catalog_enabled(db) {
        return Ok(Vec::new());
    }

    fetch_sliders_for_db(db, &cdn_url(db), &lang(db))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn movie_preview_ignores_episode_context() {
        let preview = map_title(
            "https://cdn.example",
            ScTitle {
                id: 999,
                name: "Reminders of Him".into(),
                slug: "reminders-of-him".into(),
                title_type: "movie".into(),
                last_air_date: Some("2022".into()),
                images: Vec::new(),
                genres: Vec::new(),
                main_actors: Vec::new(),
                main_directors: Vec::new(),
                episode_id: Some(123456),
                episode: Some(ScEpisodeSnippet {
                    id: Some(123456),
                    name: Some("La casa di Topolino".into()),
                    images: Vec::new(),
                }),
            },
        );
        assert_eq!(preview.r#type, "movie");
        assert_eq!(preview.name, "Reminders of Him");
        assert!(preview.resume_video_id.is_none());
    }

    /// Audit live: quanti film SC hanno episode_id spurio (slider + ricerca campione).
    #[test]
    #[ignore]
    fn audit_movies_with_episode_context() {
        let rows = fetch_sliders(DEFAULT_APP_URL, DEFAULT_CDN_URL, DEFAULT_LANG)
            .expect("all sliders");
        let mut mapped_bad = 0usize;
        for row in &rows {
            for item in &row.items {
                if item.r#type == "movie" && item.resume_video_id.is_some() {
                    mapped_bad += 1;
                    eprintln!(
                        "  mapped bad: {} ({}) resume={:?}",
                        item.name,
                        item.slug.as_deref().unwrap_or("?"),
                        item.resume_video_id
                    );
                }
            }
        }
        eprintln!(
            "Film con resume_video_id dopo map (tutti gli slider): {mapped_bad}"
        );

        let results = crate::sc_playback::search_titles(
            DEFAULT_APP_URL,
            DEFAULT_CDN_URL,
            DEFAULT_LANG,
            "reminders",
        )
        .expect("search");
        for preview in results {
            if !preview.name.to_lowercase().contains("reminder") {
                continue;
            }
            eprintln!(
                "Search: {} type={} resume_video_id={:?}",
                preview.name, preview.r#type, preview.resume_video_id
            );
        }
    }

    #[test]
    fn browse_poster_prefers_poster_over_cover() {
        let images = vec![
            ScImage {
                filename: "full-poster.webp".into(),
                image_type: "poster".into(),
            },
            ScImage {
                filename: "landscape-cover.webp".into(),
                image_type: "cover".into(),
            },
            ScImage {
                filename: "hero-bg.webp".into(),
                image_type: "background".into(),
            },
        ];
        assert_eq!(
            browse_poster_url("https://cdn.example", &images).as_deref(),
            Some("https://cdn.example/images/full-poster.webp")
        );
    }

    #[test]
    #[ignore]
    fn dump_embed_urls_per_episode() {
        use crate::sc_playback;
        let embeds = sc_playback::debug_embed_urls(
            DEFAULT_APP_URL,
            DEFAULT_LANG,
            60329,
            "michael-jackson-anatomia-di-una-caduta",
            &[None, Some(347043), Some(347046), Some(347044)],
            &crate::db::Database::open(std::path::Path::new(":memory:")).expect("db"),
        );
        for (ep, result) in embeds {
            match result {
                Ok(url) => eprintln!("ep {ep:?} -> embed {url}"),
                Err(e) => eprintln!("ep {ep:?} -> err {e}"),
            }
        }
    }

    #[test]
    fn fetch_sliders_live() {
        let rows = fetch_sliders(DEFAULT_APP_URL, DEFAULT_CDN_URL, DEFAULT_LANG)
            .expect("SC catalog fetch");
        assert!(!rows.is_empty(), "expected at least one slider row");
        let total_items: usize = rows.iter().map(|r| r.items.len()).sum();
        assert!(
            total_items >= 50,
            "expected slider rows, got {total_items} items in {} rows",
            rows.len()
        );
        let first = &rows[0].items[0];
        assert!(!first.name.is_empty());
        assert_eq!(first.catalog_prefix.as_deref(), Some("sc"));
        assert!(first.slug.as_ref().is_some_and(|s| !s.is_empty()));
    }

    #[test]
    fn sync_catalog_index_includes_genre_metadata() {
        let names: Vec<String> = FALLBACK_SLIDER_NAMES
            .iter()
            .map(|name| (*name).to_string())
            .collect();
        let index = sync_catalog_index(
            DEFAULT_APP_URL,
            DEFAULT_CDN_URL,
            DEFAULT_LANG,
            &names,
            Vec::new(),
            None,
        )
        .expect("SC full index sync");
        let movies: Vec<_> = index.iter().filter(|p| p.r#type == "movie").collect();
        let with_genres = movies.iter().filter(|p| !p.genres.is_empty()).count();
        let with_genre_key = movies
            .iter()
            .filter(|p| {
                p.source_row_key
                    .as_deref()
                    .is_some_and(|k| k.starts_with("sc-genre-"))
            })
            .count();
        assert!(
            with_genres > 50 || with_genre_key > 50,
            "expected genre metadata on movies (genres={with_genres}, genre_keys={with_genre_key})"
        );
    }

    #[test]
    fn sync_catalog_index_live() {
        let names: Vec<String> = FALLBACK_SLIDER_NAMES
            .iter()
            .map(|name| (*name).to_string())
            .collect();
        let index = sync_catalog_index(
            DEFAULT_APP_URL,
            DEFAULT_CDN_URL,
            DEFAULT_LANG,
            &names,
            Vec::new(),
            None,
        )
        .expect("SC full index sync");
        assert!(
            index.len() >= 1900,
            "expected full catalog index, got {} titles",
            index.len()
        );
    }
}
