use crate::db::Database;
use crate::stremio::StremioMetaPreview;
use reqwest::blocking::Client;
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

const DEFAULT_APP_URL: &str = "https://streamingcommunityz.tech";
const DEFAULT_CDN_URL: &str = "https://cdn.streamingcommunityz.tech";
const DEFAULT_LANG: &str = "it";
const META_SC_RESOLVED_APP: &str = "sc_resolved_app_url";
const FALLBACK_APP_URLS: &[&str] = &["https://streamingunity.dog"];

#[derive(Debug, Clone, Serialize)]
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
}

const META_SC_INDEX: &str = "sc_catalog_index";
const META_SC_INDEX_TS: &str = "sc_catalog_index_ts";
const INDEX_TTL_SECS: i64 = 2 * 3600;
const SLIDER_ROW_LIMIT: usize = 60;

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
}

#[derive(Deserialize)]
struct ScImage {
    filename: String,
    #[serde(rename = "type")]
    image_type: String,
}

fn http_client() -> Result<Client, String> {
    Client::builder()
        .timeout(Duration::from_secs(30))
        .cookie_store(true)
        .user_agent(
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 \
             (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Branchefy/0.1",
        )
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
        let html = self
            .client
            .get(format!("{}{}", self.app_base, path))
            .header("Accept", "text/html,application/xhtml+xml")
            .send()
            .ok()?
            .error_for_status()
            .ok()?
            .text()
            .ok()?;
        let page = parse_inertia_from_html(&html)?;
        let props = page.get("props")?;
        let titles = extract_titles(props.get("titles")?)?;
        let label = props
            .get("label")
            .and_then(|v| v.as_str())
            .map(str::to_string)
            .unwrap_or_else(|| "Catalogo".to_string());
        Some((label, titles))
    }
}

fn extract_titles(value: &serde_json::Value) -> Option<Vec<serde_json::Value>> {
    if let Some(arr) = value.as_array() {
        return Some(arr.clone());
    }
    value
        .get("data")
        .and_then(|v| v.as_array())
        .cloned()
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
                let dedupe_key = format!("{}:{}", preview.r#type, preview.id);
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

pub fn fetch_sliders(
    app: &str,
    cdn: &str,
    locale: &str,
) -> Result<Vec<ScCatalogRow>, String> {
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
            .map(|name| SliderFetchItem {
                name: name.clone(),
            })
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
                    let dedupe_key = format!("{}:{}", preview.r#type, preview.id);
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

fn insert_preview(
    index: &mut Vec<StremioMetaPreview>,
    seen: &mut HashSet<String>,
    preview: StremioMetaPreview,
) {
    let key = format!("{}:{}", preview.r#type, preview.id);
    if seen.insert(key) {
        index.push(preview);
    }
}

fn map_title_values_unlimited(
    cdn: &str,
    titles: &[serde_json::Value],
    seen: &mut HashSet<String>,
    index: &mut Vec<StremioMetaPreview>,
) {
    for title in titles {
        if let Some(preview) = preview_from_value(cdn, title) {
            insert_preview(index, seen, preview);
        }
    }
}

fn fetch_paginated_titles(
    html_client: &HtmlPageClient,
    cdn: &str,
    base_path: &str,
    seen: &mut HashSet<String>,
    index: &mut Vec<StremioMetaPreview>,
) {
    for page in 1..=500 {
        let path = if base_path.contains('?') {
            format!("{base_path}&page={page}")
        } else {
            format!("{base_path}?page={page}")
        };
        let Some((_, titles)) = html_client.fetch_page(&path) else {
            break;
        };
        if titles.is_empty() {
            break;
        }
        let before = index.len();
        map_title_values_unlimited(cdn, &titles, seen, index);
        if index.len() == before {
            break;
        }
    }
}

pub fn sync_catalog_index(
    app: &str,
    cdn: &str,
    locale: &str,
    slider_names: &[String],
) -> Result<Vec<StremioMetaPreview>, String> {
    let app_base = app.trim_end_matches('/');
    let client = http_client()?;
    let xsrf = bootstrap_csrf(&client, app_base).ok();
    let html_client = HtmlPageClient::new(client, app_base);
    let cdn = cdn.trim_end_matches('/');
    let mut seen = HashSet::new();
    let mut index = Vec::new();

    if let Some(token) = xsrf.as_ref() {
        if let Ok(sliders) = fetch_slider_batch(&html_client.client, app_base, token, locale, slider_names) {
            for slider in sliders {
                for title in slider.titles {
                    insert_preview(&mut index, &mut seen, map_title(cdn, title));
                }
            }
        }
    }

    let archive_paths = [
        format!("/{locale}/archive"),
        format!("/{locale}/archive?type=movie"),
        format!("/{locale}/archive?type=tv"),
    ];
    for path in archive_paths {
        fetch_paginated_titles(&html_client, cdn, &path, &mut seen, &mut index);
    }

    for (genre_id, _name) in discover_genres(&html_client.client, app_base, locale) {
        let path = format!("/{locale}/archive?genre={genre_id}");
        fetch_paginated_titles(&html_client, cdn, &path, &mut seen, &mut index);
    }

    for slider_name in slider_names {
        let path = format!("/{locale}/browse/{slider_name}");
        fetch_paginated_titles(&html_client, cdn, &path, &mut seen, &mut index);
    }

    for hub in [format!("/{locale}/movies"), format!("/{locale}/tv-shows")] {
        if let Ok(html) = html_client
            .client
            .get(format!("{app_base}{hub}"))
            .header("Accept", "text/html,application/xhtml+xml")
            .send()
            .and_then(|r| r.error_for_status())
            .and_then(|r| r.text())
        {
            if let Some(page) = parse_inertia_from_html(&html) {
                if let Some(sliders_val) = page.get("props").and_then(|props| props.get("sliders")) {
                    if let Ok(sliders) =
                        serde_json::from_value::<Vec<ScSlider>>(sliders_val.clone())
                    {
                        for slider in sliders {
                            for title in slider.titles {
                                insert_preview(&mut index, &mut seen, map_title(cdn, title));
                            }
                        }
                    }
                }
            }
        }
    }

    Ok(index)
}

fn merge_row_items(index: &mut Vec<StremioMetaPreview>, rows: &[ScCatalogRow]) {
    let mut seen: HashSet<String> = index
        .iter()
        .map(|item| format!("{}:{}", item.r#type, item.id))
        .collect();
    for row in rows {
        for item in &row.items {
            insert_preview(index, &mut seen, item.clone());
        }
    }
}

fn load_cached_index(db: &Database) -> Option<(Vec<StremioMetaPreview>, i64)> {
    let ts = db
        .get_meta(META_SC_INDEX_TS)
        .ok()
        .flatten()?
        .parse::<i64>()
        .ok()?;
    let json = db.get_meta(META_SC_INDEX).ok().flatten()?;
    let items: Vec<StremioMetaPreview> = serde_json::from_str(&json).ok()?;
    if items.is_empty() {
        return None;
    }
    Some((items, ts))
}

fn save_cached_index(db: &Database, index: &[StremioMetaPreview]) -> Result<(), String> {
    let json = serde_json::to_string(index).map_err(|e| e.to_string())?;
    db.set_meta(META_SC_INDEX, &json)?;
    db.set_meta(META_SC_INDEX_TS, &now_ts().to_string())?;
    Ok(())
}

pub fn fetch_catalog(db: &Database, _app: &str, cdn: &str, locale: &str) -> Result<ScCatalogResponse, String> {
    let rows = fetch_sliders_for_db(db, cdn, locale)?;

    let mut index = load_cached_index(db)
        .map(|(cached, _)| cached)
        .unwrap_or_default();

    merge_row_items(&mut index, &rows);

    if !index.is_empty() {
        save_cached_index(db, &index)?;
    }

    let synced_at = db
        .get_meta(META_SC_INDEX_TS)
        .ok()
        .flatten()
        .and_then(|v| v.parse().ok())
        .unwrap_or_else(now_ts);

    let total_count = index.len();

    Ok(ScCatalogResponse {
        rows,
        index,
        synced_at,
        total_count,
    })
}

pub fn refresh_catalog_index(
    db: &Database,
    _app: &str,
    cdn: &str,
    locale: &str,
) -> Result<ScCatalogResponse, String> {
    let app = resolve_app_url(db).or_else(|_| discover_app_url(db))?;
    let rows = fetch_sliders_for_db(db, cdn, locale)?;
    let slider_names = discover_slider_names(
        &http_client()?,
        app.trim_end_matches('/'),
        locale,
    );
    let mut index = sync_catalog_index(&app, cdn, locale, &slider_names)?;
    merge_row_items(&mut index, &rows);
    save_cached_index(db, &index)?;
    let synced_at = now_ts();
    Ok(ScCatalogResponse {
        total_count: index.len(),
        rows,
        index,
        synced_at,
    })
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
        .replace("&#39;", "'");
    serde_json::from_str(&decoded).ok()
}

pub fn catalog_enabled(db: &crate::db::Database) -> bool {
    db.get_meta("sc_catalog_enabled")
        .ok()
        .flatten()
        .map(|v| v != "false")
        .unwrap_or(true)
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
    db.get_meta("sc_lang")
        .ok()
        .flatten()
        .filter(|s| !s.trim().is_empty())
        .unwrap_or_else(|| DEFAULT_LANG.to_string())
}

fn poster_url(cdn: &str, images: &[ScImage]) -> Option<String> {
    images
        .iter()
        .find(|i| i.image_type == "poster")
        .map(|i| format!("{}/images/{}", cdn.trim_end_matches('/'), i.filename))
}

fn map_title(cdn: &str, title: ScTitle) -> StremioMetaPreview {
    let stremio_type = if title.title_type == "tv" {
        "series"
    } else {
        "movie"
    };
    StremioMetaPreview {
        id: title.id.to_string(),
        r#type: stremio_type.to_string(),
        name: title.name,
        poster: poster_url(cdn, &title.images),
        poster_shape: None,
        description: None,
        release_info: title.last_air_date,
        catalog_prefix: Some("sc".to_string()),
        slug: Some(title.slug),
    }
}

pub fn preview_from_value(cdn: &str, title: &serde_json::Value) -> Option<StremioMetaPreview> {
    let id = title.get("id")?.as_i64()?;
    let name = title.get("name")?.as_str()?;
    let slug = title.get("slug")?.as_str()?;
    let title_type = title.get("type")?.as_str()?;
    let stremio_type = if title_type == "tv" { "series" } else { "movie" };
    let images: Vec<ScImage> = title
        .get("images")
        .and_then(|v| serde_json::from_value(v.clone()).ok())
        .unwrap_or_default();
    Some(StremioMetaPreview {
        id: id.to_string(),
        r#type: stremio_type.to_string(),
        name: name.to_string(),
        poster: poster_url(cdn, &images),
        poster_shape: None,
        description: title
            .get("plot")
            .and_then(|v| v.as_str())
            .map(|s| s.replace("&#39;", "'").replace("&amp;", "&")),
        release_info: title
            .get("last_air_date")
            .or_else(|| title.get("release_date"))
            .and_then(|v| v.as_str())
            .map(str::to_string),
        catalog_prefix: Some("sc".to_string()),
        slug: Some(slug.to_string()),
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
    fn sync_catalog_index_live() {
        let names: Vec<String> = FALLBACK_SLIDER_NAMES
            .iter()
            .map(|name| (*name).to_string())
            .collect();
        let index = sync_catalog_index(DEFAULT_APP_URL, DEFAULT_CDN_URL, DEFAULT_LANG, &names)
            .expect("SC full index sync");
        assert!(
            index.len() >= 1900,
            "expected full catalog index, got {} titles",
            index.len()
        );
    }
}
