use crate::db::Database;
use crate::html_text::decode_html_entities;
use crate::sc_catalog::ScCatalogRow;
use crate::stremio::StremioMetaPreview;
use regex::Regex;
use reqwest::blocking::Client;
use std::collections::{HashMap, HashSet};
use std::fs;
use std::path::{Path, PathBuf};
use std::thread;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

const META_LOONEX_INDEX: &str = "loonex_catalog_index";
const META_LOONEX_INDEX_TS: &str = "loonex_catalog_index_ts";
const META_LOONEX_INDEX_VERSION: &str = "loonex_catalog_index_version";
const LOONEX_INDEX_VERSION: &str = "7";
const META_LOONEX_SITE_ROOT: &str = "loonex_site_root";
const META_LOONEX_ENABLED: &str = "loonex_catalog_enabled";
const META_LOONEX_APP_URL: &str = "loonex_app_url";
const DEFAULT_APP_URL: &str = "https://loonex.eu/cartoni";
const ROW_LIMIT: usize = 48;
const MIN_CACHED_INDEX: usize = 120;
const INDEX_TTL_SECS: i64 = 6 * 3600;
const MAX_ARCHIVE_PAGES: usize = 240;
const HTTP_TIMEOUT_SECS: u64 = 60;
const ONLINE_PAGE_DELAY_MS: u64 = 900;

#[derive(Debug, Clone)]
struct LoonexCard {
    slug: String,
    name: String,
    poster_src: Option<String>,
    is_movie: bool,
}

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LoonexCatalogResponse {
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
        .user_agent(
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 \
             (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Branchefy/0.1",
        )
        .build()
        .map_err(|e| e.to_string())
}

fn desktop_path() -> PathBuf {
    std::env::var("USERPROFILE")
        .map(|p| PathBuf::from(p).join("Desktop"))
        .unwrap_or_else(|_| PathBuf::from("."))
}

/// Layout HTTrack comuni: `Desktop/loonex.eu/cartoni` oppure `Desktop/cartoni/loonex.eu/cartoni`.
pub fn site_root_candidates() -> Vec<PathBuf> {
    let desktop = desktop_path();
    [
        desktop.join("loonex.eu").join("cartoni"),
        desktop.join("cartoni").join("loonex.eu").join("cartoni"),
    ]
    .into_iter()
    .filter(|p| p.is_dir())
    .collect()
}

fn detail_page_count(root: &Path) -> usize {
    fs::read_dir(root)
        .ok()
        .map(|entries| {
            entries
                .filter_map(|e| e.ok())
                .filter(|e| {
                    e.file_name()
                        .to_string_lossy()
                        .starts_with("index_cartone=")
                })
                .count()
        })
        .unwrap_or(0)
}

fn count_files_in_dir(path: &Path) -> usize {
    if !path.is_dir() {
        return 0;
    }
    fs::read_dir(path)
        .ok()
        .map(|entries| {
            entries
                .filter_map(|e| e.ok())
                .filter(|e| e.path().is_file())
                .count()
        })
        .unwrap_or(0)
}

/// Preferisce il mirror con `index.html` e cartella `uploads/covers` (non solo pagine dettaglio).
fn mirror_asset_score(root: &Path) -> usize {
    if !root.is_dir() {
        return 0;
    }
    let mut score = 0;
    if root.join("index.html").is_file() || root.join("index.php").is_file() {
        score += 1000;
    }
    score += detail_page_count(root) * 5;
    score += count_files_in_dir(&root.join("uploads/covers"));
    score += count_files_in_dir(&root.join("covers"));
    score
}

fn best_site_root() -> PathBuf {
    site_root_candidates()
        .into_iter()
        .max_by_key(|p| mirror_asset_score(p))
        .unwrap_or_else(|| desktop_path().join("loonex.eu").join("cartoni"))
}

pub fn site_root_candidates_ordered(db: &Database) -> Vec<PathBuf> {
    let primary = site_root_path(db);
    let mut roots = vec![primary.clone()];
    for candidate in site_root_candidates() {
        if candidate != primary {
            roots.push(candidate);
        }
    }
    roots
}

pub fn default_site_root() -> PathBuf {
    best_site_root()
}

pub fn site_root_path(db: &Database) -> PathBuf {
    let best = best_site_root();
    if let Ok(Some(stored)) = db.get_meta(META_LOONEX_SITE_ROOT) {
        let stored_path = PathBuf::from(stored);
        if stored_path.is_dir() {
            let stored_score = mirror_asset_score(&stored_path);
            let best_score = mirror_asset_score(&best);
            if stored_score >= best_score || best_score == 0 {
                return stored_path;
            }
        }
    }
    best
}

pub fn app_url(db: &Database) -> String {
    db.get_meta(META_LOONEX_APP_URL)
        .ok()
        .flatten()
        .filter(|v| !v.trim().is_empty())
        .unwrap_or_else(|| DEFAULT_APP_URL.to_string())
}

pub fn enabled(db: &Database) -> bool {
    match db.get_meta(META_LOONEX_ENABLED) {
        Ok(Some(v)) => v != "0" && v != "false",
        _ => true,
    }
}

pub fn ensure_defaults(db: &Database) -> Result<(), String> {
    if db.get_meta(META_LOONEX_ENABLED)?.is_none() {
        db.set_meta(META_LOONEX_ENABLED, "true")?;
    }
    if db.get_meta(META_LOONEX_SITE_ROOT)?.is_none() {
        let root = best_site_root();
        if root.exists() {
            db.set_meta(META_LOONEX_SITE_ROOT, &root.to_string_lossy())?;
        }
    } else if let Ok(Some(stored)) = db.get_meta(META_LOONEX_SITE_ROOT) {
        let stored_path = PathBuf::from(&stored);
        let best = best_site_root();
        if stored_path.is_dir()
            && mirror_asset_score(&stored_path) < mirror_asset_score(&best)
            && best.exists()
        {
            db.set_meta(META_LOONEX_SITE_ROOT, &best.to_string_lossy())?;
        }
    }
    Ok(())
}

fn normalize_poster_ref(src: &str) -> Option<String> {
    let trimmed = src.trim();
    if trimmed.is_empty() {
        return None;
    }
    if trimmed.starts_with("http://") || trimmed.starts_with("https://") {
        return Some(trimmed.to_string());
    }
    let without = trimmed
        .replace("../", "")
        .trim_start_matches('/')
        .to_string();
    if without.is_empty() {
        None
    } else {
        Some(without)
    }
}

/// URL upstream per una copertina (file locale assente → remoto su loonex.eu).
pub fn poster_upstream_url(db: &Database, poster_ref: &str) -> String {
    let trimmed = poster_ref.trim().replace("&amp;", "&");
    if trimmed.starts_with("http://") || trimmed.starts_with("https://") {
        return trimmed;
    }
    if trimmed.starts_with("//") {
        return format!("https:{trimmed}");
    }
    absolute_asset_url(
        &app_url(db),
        &normalize_loonex_relative_ref(&trimmed),
    )
}

pub fn resolve_poster_url(_db: &Database, poster_src: &str) -> Option<String> {
    let trimmed = poster_src.trim().replace("&amp;", "&");
    if trimmed.is_empty() {
        return None;
    }
    let storage_ref = poster_storage_ref(&trimmed);
    let encoded = urlencoding::encode(&storage_ref);
    Some(format!(
        "http://127.0.0.1:{}/loonex-poster/{}",
        crate::models::STREAM_PORT,
        encoded
    ))
}

fn poster_storage_ref(src: &str) -> String {
    let trimmed = src.trim().replace("&amp;", "&");
    if trimmed.starts_with("http://") || trimmed.starts_with("https://") {
        if trimmed.contains("loonex.eu/cartoni/") {
            return normalize_loonex_relative_ref(&trimmed);
        }
        return trimmed;
    }
    normalize_loonex_relative_ref(&trimmed)
}

fn repair_preview_poster(db: &Database, preview: &mut StremioMetaPreview) {
    preview.name = decode_html_entities(&preview.name);
    if preview.catalog_prefix.as_deref() == Some("loonex") && preview.r#type == "movie" {
        preview.r#type = "series".to_string();
    }
    if let Some(poster) = preview.poster.as_ref() {
        let ref_str = if poster.contains("/loonex-poster/") {
            poster
                .split("/loonex-poster/")
                .nth(1)
                .map(|s| urlencoding::decode(s).map(|d| d.into_owned()).unwrap_or_else(|_| s.to_string()))
                .unwrap_or_else(|| poster_storage_ref(poster))
        } else {
            poster_storage_ref(poster)
        };
        preview.poster = resolve_poster_url(db, &ref_str);
    }
}

fn repair_posters_from_rows(index: &mut [StremioMetaPreview], rows: &[ScCatalogRow]) {
    let mut by_slug: HashMap<String, String> = HashMap::new();
    for row in rows {
        for item in &row.items {
            if let (Some(slug), Some(poster)) = (&item.slug, &item.poster) {
                if !poster.trim().is_empty() {
                    by_slug.insert(slug.clone(), poster.clone());
                }
            }
        }
    }
    for preview in index.iter_mut() {
        if preview.catalog_prefix.as_deref() != Some("loonex") {
            continue;
        }
        let needs = preview
            .poster
            .as_ref()
            .map(|s| s.trim().is_empty())
            .unwrap_or(true);
        if !needs {
            continue;
        }
        if let Some(slug) = &preview.slug {
            if let Some(poster) = by_slug.get(slug) {
                preview.poster = Some(poster.clone());
            }
        }
    }
}

fn repair_index(db: &Database, index: &mut [StremioMetaPreview]) {
    for preview in index.iter_mut() {
        repair_preview_poster(db, preview);
    }
}

fn index_version_ok(db: &Database) -> bool {
    db.get_meta(META_LOONEX_INDEX_VERSION)
        .ok()
        .flatten()
        .as_deref()
        == Some(LOONEX_INDEX_VERSION)
}

fn touch_index_version(db: &Database) -> Result<(), String> {
    db.set_meta(META_LOONEX_INDEX_VERSION, LOONEX_INDEX_VERSION)
}

/// Risolve path relativi (`covers/x.jpg`, `../gumball/x.jpg`, `/cartoni/covers/x.jpg`).
pub fn absolute_asset_url(app_base: &str, src: &str) -> String {
    let trimmed = src.trim().replace("&amp;", "&");
    if trimmed.starts_with("http://") || trimmed.starts_with("https://") {
        return trimmed;
    }
    if trimmed.starts_with("//") {
        return format!("https:{trimmed}");
    }
    if trimmed.starts_with('/') {
        return format!("https://loonex.eu{trimmed}");
    }
    let site = app_base.trim_end_matches('/');
    format!("{site}/{}", trimmed.trim_start_matches('/'))
}

fn resolve_path_relative(base: &Path, src: &str) -> PathBuf {
    let mut out = base.to_path_buf();
    for part in src.split('/') {
        match part {
            "" | "." => {}
            ".." => {
                out.pop();
            }
            segment => out.push(segment),
        }
    }
    out
}

/// Normalizza path relativi da HTML loonex (`/cartoni/covers/x.jpg`, `covers/x.jpg`).
pub fn normalize_loonex_relative_ref(src: &str) -> String {
    let mut s = src.trim().replace("&amp;", "&");
    if s.starts_with("http://") || s.starts_with("https://") {
        if let Some(rest) = s.strip_prefix("https://loonex.eu/cartoni/") {
            s = rest.to_string();
        } else if let Some(rest) = s.strip_prefix("http://loonex.eu/cartoni/") {
            s = rest.to_string();
        } else {
            return s;
        }
    }
    let s = s.trim_start_matches('/');
    if let Some(rest) = s.strip_prefix("cartoni/") {
        return rest.to_string();
    }
    s.to_string()
}

pub fn poster_file_path(db: &Database, rel: &str) -> Option<PathBuf> {
    let trimmed = rel.trim().replace("&amp;", "&");
    if trimmed.starts_with("http://") || trimmed.starts_with("https://") {
        return None;
    }
    let normalized = normalize_loonex_relative_ref(&trimmed);
    if normalized.is_empty() {
        return None;
    }
    for root in site_root_candidates_ordered(db) {
        if let Some(path) = poster_file_path_in_root(&root, &normalized) {
            return Some(path);
        }
    }
    None
}

fn poster_file_path_in_root(root: &Path, rel: &str) -> Option<PathBuf> {
    let candidates = [
        root.join(rel),
        resolve_path_relative(root, rel),
    ];
    for path in candidates {
        if path.is_file() {
            return Some(path);
        }
    }
    None
}

/// Estrae `src` da un tag `<img>` che contiene la classe indicata (ordine attributi flessibile).
pub fn extract_img_src(html: &str, class_hint: &str) -> Option<String> {
    let patterns = [
        format!(
            r#"(?is)<img[^>]*class="[^"]*{class_hint}[^"]*"[^>]*(?:src|data-src)="([^"]+)""#
        ),
        format!(
            r#"(?is)<img[^>]*(?:src|data-src)="([^"]+)"[^>]*class="[^"]*{class_hint}[^"]*""#
        ),
        format!(r#"(?is)<img[^>]*src="([^"]+)"[^>]*class="[^"]*{class_hint}[^"]*""#),
    ];
    for pat in patterns {
        if let Ok(re) = Regex::new(&pat) {
            if let Some(cap) = re.captures(html) {
                if let Some(src) = cap.get(1) {
                    return Some(src.as_str().to_string());
                }
            }
        }
    }
    None
}

fn extract_first_img_src(html: &str) -> Option<String> {
    static IMG_SRC: std::sync::OnceLock<Regex> = std::sync::OnceLock::new();
    let re = IMG_SRC.get_or_init(|| {
        Regex::new(r#"(?is)<img[^>]+(?:src|data-src)="([^"]+)""#).expect("img src")
    });
    re.captures(html)
        .and_then(|cap| cap.get(1))
        .map(|m| m.as_str().to_string())
        .filter(|src| !src.starts_with("data:"))
}

fn parse_cartoon_cards(html: &str) -> Vec<LoonexCard> {
    let link_re = Regex::new(
        r##"(?is)<a[^>]+href="(?:https://loonex\.eu/cartoni/)?\?cartone=([^"#&]+)"[^>]*>([\s\S]*?)</a>"##,
    )
    .expect("loonex card link");
    let title_re =
        Regex::new(r#"(?is)<div[^>]+class="card-title-cine[^"]*"[^>]*title="([^"]*)""#)
            .expect("loonex title attr");
    let title_inner_re =
        Regex::new(r#"(?is)<div[^>]+class="card-title-cine[^"]*"[^>]*>([\s\S]*?)</div>"#)
            .expect("loonex title inner");
    let alt_re = Regex::new(r#"(?is)alt="([^"]+)""#).ok();

    let mut best: HashMap<String, LoonexCard> = HashMap::new();

    for cap in link_re.captures_iter(html) {
        let slug = cap
            .get(1)
            .map(|m| m.as_str().trim().to_string())
            .unwrap_or_default();
        if slug.is_empty() {
            continue;
        }
        let block = cap.get(2).map(|m| m.as_str()).unwrap_or_default();
        let poster_src = extract_img_src(block, "card-img-bg")
            .or_else(|| extract_first_img_src(block));
        let name = title_re
            .captures(block)
            .and_then(|c| c.get(1))
            .map(|m| decode_html_entities(m.as_str().trim()))
            .filter(|s| !s.is_empty())
            .or_else(|| {
                title_inner_re.captures(block).and_then(|c| c.get(1)).map(|m| {
                    decode_html_entities(
                        m.as_str().split_whitespace().collect::<Vec<_>>().join(" ").trim(),
                    )
                })
            })
            .or_else(|| {
                alt_re
                    .as_ref()
                    .and_then(|re| re.captures(block))
                    .and_then(|c| c.get(1))
                    .map(|m| decode_html_entities(m.as_str().trim()))
                    .filter(|s| !s.is_empty())
            })
            .unwrap_or_else(|| slug.replace('-', " "));
        let is_movie = block.contains("class=\"movie-badge\"")
            || block.contains("class='movie-badge'")
            || block.contains("movie-badge\">");
        let card = LoonexCard {
            slug: slug.clone(),
            name,
            poster_src,
            is_movie,
        };
        best.entry(slug).or_insert(card);
    }

    let mut cards: Vec<LoonexCard> = best.into_values().collect();
    cards.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    cards
}

fn card_to_preview(db: &Database, card: &LoonexCard) -> StremioMetaPreview {
    let stremio_type = if card.is_movie { "movie" } else { "series" };
    StremioMetaPreview {
        id: card.slug.clone(),
        r#type: stremio_type.to_string(),
        name: card.name.clone(),
        poster: card
            .poster_src
            .as_deref()
            .and_then(|src| resolve_poster_url(db, src)),
        background: None,
        poster_shape: Some("poster".to_string()),
        description: None,
        release_info: None,
        catalog_prefix: Some("loonex".to_string()),
        slug: Some(card.slug.clone()),
        genres: vec!["Animazione".to_string(), "Cartoni".to_string()],
        source_row_key: Some("loonex-cartoni".to_string()),
        source_row_title: Some("Loonex Archivio Cartoni".to_string()),
        resume_video_id: None,
    }
}

fn fetch_online_html(client: &Client, base: &str, path: &str) -> Option<String> {
    let url = if path.starts_with("http") {
        path.to_string()
    } else {
        format!("{base}{path}")
    };
    client
        .get(&url)
        .header("Accept", "text/html,application/xhtml+xml")
        .send()
        .ok()
        .and_then(|r| r.error_for_status().ok())
        .and_then(|r| r.text().ok())
}

fn archive_page_from_path(path: &str) -> Option<usize> {
    static PAGE_RE: std::sync::OnceLock<Regex> = std::sync::OnceLock::new();
    let re = PAGE_RE.get_or_init(|| {
        Regex::new(r#"(?i)[?&]page=(\d+)"#).expect("archive page param")
    });
    if !path.contains("cat=all") {
        return None;
    }
    re.captures(path)
        .and_then(|cap| cap.get(1))
        .and_then(|m| m.as_str().parse::<usize>().ok())
}

fn local_archive_html(root: &Path, page: usize) -> Option<String> {
    let candidates: Vec<PathBuf> = if page <= 1 {
        vec![
            root.join("index.html"),
            root.join("index.php.html"),
            root.join("index.php"),
        ]
    } else {
        vec![
            root.join(format!(
                "index.php?cat=all&search=&collezione=&page={page}.html"
            )),
            root.join(format!("index.php_cat=all&search=&collezione=&page={page}.html")),
            root.join(format!("index.php?cat=all&page={page}.html")),
            root.join(format!("index_cat=all&page={page}.html")),
            root.join(format!("index.php?cat=all&search=&collezione=&page={page}")),
        ]
    };
    for file in candidates {
        if file.is_file() {
            return fs::read_to_string(file).ok();
        }
    }
    None
}

fn read_local_html(root: &Path, path: &str) -> Option<String> {
    if let Some(page) = archive_page_from_path(path) {
        return local_archive_html(root, page);
    }
    let file = if path.is_empty() || path == "/" || path == "/index.php" {
        root.join("index.html")
    } else if path.starts_with('/') {
        root.join(path.trim_start_matches('/'))
    } else {
        root.join(path)
    };
    if file.is_file() {
        fs::read_to_string(file).ok()
    } else {
        None
    }
}

fn slug_from_detail_filename(name: &str) -> Option<String> {
    static DETAIL_RE: std::sync::OnceLock<Regex> = std::sync::OnceLock::new();
    let re = DETAIL_RE.get_or_init(|| {
        Regex::new(r#"(?i)^index_cartone=(.+)\.php\.html$"#).expect("detail filename")
    });
    re.captures(name)
        .and_then(|cap| cap.get(1))
        .map(|m| m.as_str().trim().to_string())
        .filter(|slug| !slug.is_empty())
}

fn extract_detail_name(html: &str, slug: &str) -> String {
    static OG_TITLE: std::sync::OnceLock<Regex> = std::sync::OnceLock::new();
    static H1_TITLE: std::sync::OnceLock<Regex> = std::sync::OnceLock::new();
    let og = OG_TITLE.get_or_init(|| {
        Regex::new(r#"(?is)property="og:title" content="([^"]+)""#).expect("og:title")
    });
    if let Some(cap) = og.captures(html) {
        if let Some(title) = cap.get(1) {
            let name = decode_html_entities(title.as_str().trim());
            if !name.is_empty() {
                return name;
            }
        }
    }
    let h1 = H1_TITLE.get_or_init(|| {
        Regex::new(r#"(?is)<h1[^>]*>([^<]+)</h1>"#).expect("h1 title")
    });
    if let Some(cap) = h1.captures(html) {
        if let Some(title) = cap.get(1) {
            let name = decode_html_entities(title.as_str().trim());
            if !name.is_empty() {
                return name;
            }
        }
    }
    slug.replace('-', " ")
}

fn card_from_detail_html(html: &str, slug: &str) -> LoonexCard {
    let poster_src = extract_img_src(html, "detail-poster")
        .or_else(|| extract_img_src(html, "card-img-bg"))
        .and_then(|src| normalize_poster_ref(&src));
    let is_movie = html.contains("class=\"movie-badge\"")
        || html.contains("class='movie-badge'")
        || html.contains("movie-badge\">");
    LoonexCard {
        slug: slug.to_string(),
        name: extract_detail_name(html, slug),
        poster_src,
        is_movie,
    }
}

fn ingest_mirror_detail_pages(root: &Path, cards: &mut HashMap<String, LoonexCard>) -> usize {
    let entries = match fs::read_dir(root) {
        Ok(entries) => entries,
        Err(_) => return 0,
    };
    let before = cards.len();
    for entry in entries.filter_map(|e| e.ok()) {
        let name = entry.file_name().to_string_lossy().to_string();
        let Some(slug) = slug_from_detail_filename(&name) else {
            continue;
        };
        let path = entry.path();
        let Ok(html) = fs::read_to_string(&path) else {
            continue;
        };
        let card = card_from_detail_html(&html, &slug);
        cards.entry(slug).or_insert(card);
    }
    cards.len().saturating_sub(before)
}

fn ingest_mirror_archive_pages(root: &Path, cards: &mut HashMap<String, LoonexCard>) -> usize {
    let before = cards.len();
    let mut empty_streak = 0usize;
    for page in 1..=MAX_ARCHIVE_PAGES {
        let Some(html) = local_archive_html(root, page) else {
            empty_streak += 1;
            if empty_streak >= 2 {
                break;
            }
            continue;
        };
        let added = ingest_cards(cards, parse_cartoon_cards(&html));
        if added == 0 {
            empty_streak += 1;
            if empty_streak >= 2 {
                break;
            }
        } else {
            empty_streak = 0;
        }
    }
    cards.len().saturating_sub(before)
}

fn sync_mirror_index(db: &Database) -> HashMap<String, LoonexCard> {
    let mut cards: HashMap<String, LoonexCard> = HashMap::new();
    for root in site_root_candidates_ordered(db) {
        ingest_mirror_archive_pages(&root, &mut cards);
        ingest_mirror_detail_pages(&root, &mut cards);
    }
    cards
}

/// Mirror locale salvato come `index_cartone={slug}.php.html` (HTTrack/wget).
pub fn read_local_detail_html(root: &Path, slug: &str) -> Option<String> {
    let trimmed = slug.trim();
    if trimmed.is_empty() {
        return None;
    }
    let candidates = [
        root.join(format!("index_cartone={trimmed}.php.html")),
        root.join(format!("index_cartone={trimmed}.html")),
        root.join(format!("index.php?cartone={trimmed}.html")),
        root
            .parent()
            .map(|p| p.join(format!("index_cartone={trimmed}.php.html")))
            .unwrap_or_else(|| root.join(format!("index_cartone={trimmed}.php.html"))),
    ];
    for path in candidates {
        if path.is_file() {
            return fs::read_to_string(path).ok();
        }
    }
    None
}

pub fn fetch_cartoon_detail_html(
    db: &Database,
    client: &Client,
    slug: &str,
) -> Result<String, String> {
    for root in site_root_candidates_ordered(db) {
        if let Some(html) = read_local_detail_html(&root, slug) {
            return Ok(html);
        }
    }

    let base = app_url(db).trim_end_matches('/').to_string();
    let paths = [
        format!("/index.php?cartone={slug}"),
        format!("/?cartone={slug}"),
    ];
    for path in paths {
        if let Some(html) = fetch_online_html(client, &base, &path) {
            if html.contains("guarda/?id=") || html.contains("episode-row") {
                return Ok(html);
            }
        }
    }
    Err(format!("Pagina cartone non trovata: {slug}"))
}

fn fetch_page_html_local(db: &Database, path: &str) -> Option<String> {
    for root in site_root_candidates_ordered(db) {
        if let Some(html) = read_local_html(&root, path) {
            return Some(html);
        }
    }
    None
}

fn fetch_page_html(db: &Database, client: &Client, path: &str) -> Option<String> {
    if let Some(html) = fetch_page_html_local(db, path) {
        return Some(html);
    }
    let base = app_url(db).trim_end_matches('/').to_string();
    fetch_online_html(client, &base, path)
}

fn online_gap_fill_needed(cards: &HashMap<String, LoonexCard>) -> bool {
    cards.len() < MIN_CACHED_INDEX
}

fn pause_between_online_pages() {
    thread::sleep(Duration::from_millis(ONLINE_PAGE_DELAY_MS));
}

/// Costruisce l'indice: prima mirror locale (archivio + pagine dettaglio), poi online solo se serve.
fn sync_catalog_index(db: &Database, allow_online: bool) -> Vec<StremioMetaPreview> {
    let mut cards = sync_mirror_index(db);
    if !allow_online || !online_gap_fill_needed(&cards) {
        let mut index: Vec<StremioMetaPreview> = cards
            .values()
            .map(|card| card_to_preview(db, card))
            .collect();
        index.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
        return index;
    }

    let client = match http_client() {
        Ok(c) => c,
        Err(_) => {
            let mut index: Vec<StremioMetaPreview> = cards
                .values()
                .map(|card| card_to_preview(db, card))
                .collect();
            index.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
            return index;
        }
    };
    let base = app_url(db).trim_end_matches('/').to_string();
    let first_path = "/index.php?cat=all&search=&collezione=&page=1";
    let first_html = fetch_page_html_local(db, first_path)
        .or_else(|| fetch_page_html_local(db, "/index.php"))
        .or_else(|| fetch_page_html_local(db, "/index.html"));
    let first_html = if first_html.is_some() {
        first_html
    } else {
        pause_between_online_pages();
        fetch_online_html(&client, &base, first_path)
            .or_else(|| {
                pause_between_online_pages();
                fetch_online_html(&client, &base, "/index.php")
            })
            .or_else(|| fetch_online_html(&client, &base, "/index.html"))
    };
    let Some(first_html) = first_html else {
        let mut index: Vec<StremioMetaPreview> = cards
            .values()
            .map(|card| card_to_preview(db, card))
            .collect();
        index.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
        return index;
    };

    ingest_cards(&mut cards, parse_cartoon_cards(&first_html));
    let hinted_max = max_archive_page(&first_html).max(1);
    let scan_until = hinted_max.max(32).min(MAX_ARCHIVE_PAGES);
    let mut empty_streak = 0usize;

    for page in 2..=scan_until {
        let path = format!("/index.php?cat=all&search=&collezione=&page={page}");
        let html = fetch_page_html_local(db, &path).unwrap_or_else(|| {
            pause_between_online_pages();
            fetch_online_html(&client, &base, &path).unwrap_or_default()
        });
        if html.is_empty() {
            empty_streak += 1;
            if empty_streak >= 2 {
                break;
            }
            continue;
        }
        let added = ingest_cards(&mut cards, parse_cartoon_cards(&html));
        if added == 0 {
            empty_streak += 1;
            if empty_streak >= 2 {
                break;
            }
        } else {
            empty_streak = 0;
        }
        if page >= hinted_max && added == 0 {
            break;
        }
        if cards.len() >= MIN_CACHED_INDEX && added == 0 {
            break;
        }
    }

    let mut index: Vec<StremioMetaPreview> = cards
        .values()
        .map(|card| card_to_preview(db, card))
        .collect();
    index.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    index
}

fn max_archive_page(html: &str) -> usize {
    let patterns = [
        r#"(?is)href="[^"]*\?cat=all[^"]*page=(\d+)""#,
        r#"(?is)href='[^']*\?cat=all[^']*page=(\d+)'"#,
        r#"(?is)data-page="(\d+)""#,
    ];
    let mut max_page = 1usize;
    for pat in patterns {
        if let Ok(re) = Regex::new(pat) {
            for cap in re.captures_iter(html) {
                if let Some(page) = cap.get(1).and_then(|m| m.as_str().parse::<usize>().ok()) {
                    max_page = max_page.max(page);
                }
            }
        }
    }
    max_page
}

fn ingest_cards(cards: &mut HashMap<String, LoonexCard>, parsed: Vec<LoonexCard>) -> usize {
    let before = cards.len();
    for card in parsed {
        cards.entry(card.slug.clone()).or_insert(card);
    }
    cards.len().saturating_sub(before)
}

/// Scarica tutte le pagine dell'archivio finché non arrivano pagine vuote o senza novità.
fn sync_online_index(db: &Database) -> Vec<StremioMetaPreview> {
    sync_catalog_index(db, true)
}

pub fn index_needs_refresh(db: &Database) -> bool {
    if !enabled(db) {
        return false;
    }
    let count = load_cached_index(db).map(|index| index.len()).unwrap_or(0);
    if count < MIN_CACHED_INDEX {
        return true;
    }
    let synced_at = db
        .get_meta(META_LOONEX_INDEX_TS)
        .ok()
        .flatten()
        .and_then(|v| v.parse::<i64>().ok())
        .unwrap_or(0);
    now_ts().saturating_sub(synced_at) > INDEX_TTL_SECS
}

fn load_home_rows(db: &Database) -> Vec<ScCatalogRow> {
    let client = http_client().ok();
    let html = client
        .as_ref()
        .and_then(|c| fetch_page_html(db, c, "/index.php"))
        .or_else(|| read_local_html(&site_root_path(db), "/index.html"));
    let Some(html) = html else {
        return Vec::new();
    };

    let trending_re = Regex::new(
        r#"(?is)id="trendingBand"[\s\S]*?<div class="horizontal-scroller">([\s\S]*?)</div>\s*<button class="scroll-btn scroll-right""#,
    )
    .ok();
    let cards = if let Some(re) = trending_re {
        re.captures(&html)
            .and_then(|cap| cap.get(1))
            .map(|m| parse_cartoon_cards(m.as_str()))
            .filter(|c| !c.is_empty())
            .unwrap_or_else(|| parse_cartoon_cards(&html))
    } else {
        parse_cartoon_cards(&html)
    };

    if cards.is_empty() {
        return Vec::new();
    }

    vec![ScCatalogRow {
        key: "loonex-trending".to_string(),
        title: "Archivio Cartoni".to_string(),
        subtitle: "Archivio cartoni animati · ITA gratis".to_string(),
        items: cards
            .into_iter()
            .take(ROW_LIMIT)
            .map(|card| card_to_preview(db, &card))
            .collect(),
    }]
}

fn load_cached_index(db: &Database) -> Option<Vec<StremioMetaPreview>> {
    let json = db.get_meta(META_LOONEX_INDEX).ok().flatten()?;
    let mut index: Vec<StremioMetaPreview> = serde_json::from_str(&json).ok()?;
    if !index_version_ok(db) {
        repair_index(db, &mut index);
        if !index.is_empty() {
            let _ = save_cached_index(db, &index);
        }
    } else {
        repair_index(db, &mut index);
    }
    Some(index)
}

fn save_cached_index(db: &Database, index: &[StremioMetaPreview]) -> Result<(), String> {
    if index.is_empty() {
        return Ok(());
    }
    let json = serde_json::to_string(index).map_err(|e| e.to_string())?;
    db.set_meta(META_LOONEX_INDEX, &json)?;
    db.set_meta(META_LOONEX_INDEX_TS, &now_ts().to_string())?;
    touch_index_version(db)
}

fn merge_index(index: &mut Vec<StremioMetaPreview>, rows: &[ScCatalogRow]) {
    let mut seen: HashSet<String> = index
        .iter()
        .filter_map(|p| p.slug.clone())
        .collect();
    for row in rows {
        for item in &row.items {
            if let Some(slug) = &item.slug {
                if seen.insert(slug.clone()) {
                    index.push(item.clone());
                }
            }
        }
    }
}

pub fn search_titles(db: &Database, query: &str) -> Vec<StremioMetaPreview> {
    let q = query.trim().to_lowercase();
    if q.len() < 2 {
        return Vec::new();
    }
    let index = load_cached_index(db).unwrap_or_default();
    index
        .into_iter()
        .filter(|item| {
            item.name.to_lowercase().contains(&q)
                || item
                    .slug
                    .as_deref()
                    .unwrap_or("")
                    .to_lowercase()
                    .contains(&q)
        })
        .take(80)
        .collect()
}

pub fn fetch_catalog(db: &Database) -> Result<LoonexCatalogResponse, String> {
    if !enabled(db) {
        return Ok(LoonexCatalogResponse {
            rows: Vec::new(),
            index: Vec::new(),
            synced_at: 0,
            total_count: 0,
        });
    }

    let rows = load_home_rows(db);
    let mut index = load_cached_index(db).unwrap_or_default();
    merge_index(&mut index, &rows);
    repair_posters_from_rows(&mut index, &rows);
    repair_index(db, &mut index);

    let synced_at = db
        .get_meta(META_LOONEX_INDEX_TS)
        .ok()
        .flatten()
        .and_then(|v| v.parse().ok())
        .unwrap_or_else(now_ts);

    Ok(LoonexCatalogResponse {
        total_count: index.len(),
        rows,
        index,
        synced_at,
    })
}

pub fn refresh_catalog_index(db: &Database) -> Result<LoonexCatalogResponse, String> {
    if !enabled(db) {
        return fetch_catalog(db);
    }

    let rows = load_home_rows(db);
    let cached = load_cached_index(db).unwrap_or_default();
    let mut index = sync_online_index(db);
    if index.is_empty() && !cached.is_empty() {
        index = cached;
    }
    merge_index(&mut index, &rows);
    repair_posters_from_rows(&mut index, &rows);
    repair_index(db, &mut index);
    if !index.is_empty() {
        save_cached_index(db, &index)?;
    }

    Ok(LoonexCatalogResponse {
        total_count: index.len(),
        rows,
        index,
        synced_at: now_ts(),
    })
}

pub fn resolve_poster_for_slug(db: &Database, slug: &str) -> Option<String> {
    let index = load_cached_index(db)?;
    index
        .iter()
        .find(|p| p.slug.as_deref() == Some(slug))
        .and_then(|p| p.poster.clone())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    #[ignore]
    fn count_loonex_posters_live() {
        let client = http_client().expect("client");
        let html = fetch_online_html(
            &client,
            "https://loonex.eu/cartoni",
            "/index.php?cat=all&page=1",
        )
        .expect("html");
        let cards = parse_cartoon_cards(&html);
        let with = cards.iter().filter(|c| c.poster_src.is_some()).count();
        eprintln!(
            "loonex page1: {} cards, {} with poster, {} without",
            cards.len(),
            with,
            cards.len() - with
        );
    }

    #[test]
    fn ingest_cards_tracks_new_entries() {
        let mut cards = HashMap::new();
        let page1 = parse_cartoon_cards(
            r#"<a href="?cartone=foo-1"><div class="card-title-cine" title="Foo">Foo</div></a>"#,
        );
        assert_eq!(ingest_cards(&mut cards, page1), 1);
        let page2 = parse_cartoon_cards(
            r#"<a href="?cartone=bar-2"><div class="card-title-cine" title="Bar">Bar</div></a>"#,
        );
        assert_eq!(ingest_cards(&mut cards, page2.clone()), 1);
        assert_eq!(cards.len(), 2);
        assert_eq!(ingest_cards(&mut cards, page2), 0);
    }

    #[test]
    fn slug_from_detail_filename_reads_httrack_name() {
        assert_eq!(
            slug_from_detail_filename("index_cartone=ben-10-1771414168.php.html").as_deref(),
            Some("ben-10-1771414168")
        );
    }

    #[test]
    fn archive_page_from_path_reads_query() {
        assert_eq!(
            archive_page_from_path("/index.php?cat=all&search=&collezione=&page=9"),
            Some(9)
        );
    }

    #[test]
    fn card_from_detail_html_reads_poster_and_title() {
        let html = r#"
            <meta property="og:title" content="Ben 10">
            <img src="covers/143-ben-10-cover.jpg" class="detail-poster" alt="Ben 10">
        "#;
        let card = card_from_detail_html(html, "ben-10-1771414168");
        assert_eq!(card.slug, "ben-10-1771414168");
        assert_eq!(card.name, "Ben 10");
        assert_eq!(
            card.poster_src.as_deref(),
            Some("covers/143-ben-10-cover.jpg")
        );
    }

    #[test]
    fn max_archive_page_reads_index_php_links() {
        let html = r#"<a href="/cartoni/index.php?cat=all&search=&collezione=&page=14">14</a>"#;
        assert_eq!(max_archive_page(html), 14);
    }

    #[test]
    fn parses_cartoon_cards_from_snippet() {
        let html = r#"
            <a href="?cartone=ben-10-1771414168">
                <div class="cartoon-card-cinematic">
                    <img src="covers/143-ben-10-cover.jpg" class="card-img-bg" alt="Ben 10">
                    <div class="card-title-cine" title="Ben 10">Ben 10</div>
                </div>
            </a>
        "#;
        let cards = parse_cartoon_cards(html);
        assert_eq!(cards.len(), 1);
        assert_eq!(cards[0].slug, "ben-10-1771414168");
        assert_eq!(cards[0].name, "Ben 10");
        assert_eq!(cards[0].poster_src.as_deref(), Some("covers/143-ben-10-cover.jpg"));
    }

    #[test]
    fn parses_uploads_cover_paths() {
        let html = r#"
            <a href="?cartone=6teen-1782667057">
                <div class="cartoon-card-cinematic">
                    <img src="uploads/covers/cover_6teen_1782667057.jpg" class="card-img-bg" alt="6Teen">
                </div>
            </a>
        "#;
        let cards = parse_cartoon_cards(html);
        assert_eq!(cards.len(), 1);
        assert_eq!(
            cards[0].poster_src.as_deref(),
            Some("uploads/covers/cover_6teen_1782667057.jpg")
        );
    }

    #[test]
    fn normalizes_cartoni_prefixed_cover_paths() {
        assert_eq!(
            normalize_loonex_relative_ref("/cartoni/covers/10-baby-looney-tunes-cover.jpg"),
            "covers/10-baby-looney-tunes-cover.jpg"
        );
        assert_eq!(
            normalize_loonex_relative_ref("cartoni/covers/x.jpg"),
            "covers/x.jpg"
        );
        assert_eq!(
            absolute_asset_url(
                "https://loonex.eu/cartoni",
                &normalize_loonex_relative_ref("/cartoni/covers/x.jpg"),
            ),
            "https://loonex.eu/cartoni/covers/x.jpg"
        );
    }

    #[test]
    fn resolves_absolute_poster_paths() {
        assert_eq!(
            absolute_asset_url("https://loonex.eu/cartoni", "/cartoni/covers/x.jpg"),
            "https://loonex.eu/cartoni/covers/x.jpg"
        );
        assert_eq!(
            absolute_asset_url("https://loonex.eu/cartoni", "covers/x.jpg"),
            "https://loonex.eu/cartoni/covers/x.jpg"
        );
    }

    #[test]
    fn poster_proxy_path_encoding() {
        let encoded = urlencoding::encode("uploads/covers/cover_x.jpg");
        assert!(encoded.contains("uploads%2Fcovers"));
        let url = format!(
            "http://127.0.0.1:{}/loonex-poster/{}",
            crate::models::STREAM_PORT,
            encoded
        );
        assert!(url.contains("/loonex-poster/"));
    }
}
