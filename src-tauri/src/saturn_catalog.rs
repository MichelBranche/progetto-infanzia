use crate::db::Database;
use crate::sc_catalog::ScCatalogRow;
use crate::stremio::StremioMetaPreview;
use regex::Regex;
use reqwest::blocking::Client;
use std::collections::{HashMap, HashSet};
use std::fs;
use std::path::PathBuf;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

const META_SATURN_INDEX: &str = "saturn_catalog_index";
const META_SATURN_INDEX_TS: &str = "saturn_catalog_index_ts";
const META_SATURN_SITE_ROOT: &str = "saturn_site_root";
const META_SATURN_CDN_ROOT: &str = "saturn_cdn_root";
const META_SATURN_ENABLED: &str = "saturn_catalog_enabled";
const DEFAULT_APP_URL: &str = "https://www.animesaturn.net";
const ROW_LIMIT: usize = 48;
const HTTP_TIMEOUT_SECS: u64 = 60;

#[derive(Debug, Clone)]
struct SaturnCard {
    slug: String,
    name: String,
    poster_src: Option<String>,
    subtitle: Option<String>,
    is_dub: bool,
    episode_count: Option<u32>,
    is_upcoming: bool,
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

pub fn default_paths() -> (PathBuf, PathBuf) {
    let desktop = std::env::var("USERPROFILE")
        .map(|p| PathBuf::from(p).join("Desktop"))
        .unwrap_or_else(|_| PathBuf::from("."));
    (
        desktop.join("www.animesaturn.net"),
        desktop.join("img.saturncdn.net"),
    )
}

pub fn site_root_path(db: &Database) -> PathBuf {
    db.get_meta(META_SATURN_SITE_ROOT)
        .ok()
        .flatten()
        .map(PathBuf::from)
        .filter(|p| p.exists())
        .unwrap_or_else(|| default_paths().0)
}

pub fn cdn_root_path(db: &Database) -> PathBuf {
    db.get_meta(META_SATURN_CDN_ROOT)
        .ok()
        .flatten()
        .map(PathBuf::from)
        .filter(|p| p.exists())
        .unwrap_or_else(|| default_paths().1)
}

pub fn app_url(db: &Database) -> String {
    db.get_meta("saturn_app_url")
        .ok()
        .flatten()
        .filter(|v| !v.trim().is_empty())
        .unwrap_or_else(|| DEFAULT_APP_URL.to_string())
}

pub fn enabled(db: &Database) -> bool {
    match db.get_meta(META_SATURN_ENABLED) {
        Ok(Some(v)) => v != "0" && v != "false",
        _ => true,
    }
}

pub fn ensure_defaults(db: &Database) -> Result<(), String> {
    if db.get_meta(META_SATURN_ENABLED)?.is_none() {
        db.set_meta(META_SATURN_ENABLED, "true")?;
    }
    Ok(())
}

pub fn resolve_poster_url(db: &Database, poster_src: &str) -> Option<String> {
    let rel = normalize_poster_ref(poster_src)?;
    let local = cdn_root_path(db).join(&rel);
    if local.is_file() {
        let normalized = rel.replace('\\', "/");
        let encoded = urlencoding::encode(&normalized);
        return Some(format!(
            "http://127.0.0.1:{}/saturn-poster/{}",
            crate::models::STREAM_PORT,
            encoded
        ));
    }
    Some(format!(
        "https://img.saturncdn.net/{}",
        rel.trim_start_matches('/')
    ))
}

fn normalize_poster_ref(src: &str) -> Option<String> {
    let trimmed = src.trim();
    if trimmed.is_empty() {
        return None;
    }
    let without = trimmed
        .replace("../img.saturncdn.net/", "")
        .replace("https://img.saturncdn.net/", "")
        .replace("http://img.saturncdn.net/", "")
        .trim_start_matches('/')
        .to_string();
    if without.is_empty() {
        None
    } else {
        Some(without)
    }
}

/// Decodifica entità HTML (anche doppie come `&amp;quot;` → `"`).
pub fn decode_html_entities(raw: &str) -> String {
    let mut s = raw.trim().to_string();
    if s.is_empty() {
        return s;
    }

    let dec_re = Regex::new(r"&#(\d+);").expect("html dec entity");
    let hex_re = Regex::new(r"&#x([0-9a-fA-F]+);").expect("html hex entity");
    let named: [(&str, &str); 12] = [
        ("&nbsp;", " "),
        ("&middot;", "·"),
        ("&hellip;", "…"),
        ("&rsquo;", "'"),
        ("&lsquo;", "'"),
        ("&rdquo;", "\""),
        ("&ldquo;", "\""),
        ("&apos;", "'"),
        ("&#039;", "'"),
        ("&quot;", "\""),
        ("&lt;", "<"),
        ("&gt;", ">"),
    ];

    for _ in 0..4 {
        let prev = s.clone();
        s = dec_re
            .replace_all(&s, |caps: &regex::Captures| {
                caps.get(1)
                    .and_then(|m| m.as_str().parse::<u32>().ok())
                    .and_then(char::from_u32)
                    .map(|c| c.to_string())
                    .unwrap_or_else(|| caps[0].to_string())
            })
            .into_owned();
        s = hex_re
            .replace_all(&s, |caps: &regex::Captures| {
                caps.get(1)
                    .and_then(|m| u32::from_str_radix(m.as_str(), 16).ok())
                    .and_then(char::from_u32)
                    .map(|c| c.to_string())
                    .unwrap_or_else(|| caps[0].to_string())
            })
            .into_owned();
        for (entity, ch) in named {
            s = s.replace(entity, ch);
        }
        s = s.replace("&amp;", "&");
        if s == prev {
            break;
        }
    }

    s.replace('\u{2019}', "'")
        .replace('\u{2018}', "'")
        .replace('\u{201C}', "\"")
        .replace('\u{201D}', "\"")
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
}

fn decode_card_text(raw: &str) -> String {
    decode_html_entities(raw)
}

fn slug_to_display_name(slug: &str) -> String {
    let mut base = slug.to_string();
    if let Some(idx) = base.rfind('-') {
        let suffix = &base[idx + 1..];
        if (4..=8).contains(&suffix.len()) && suffix.chars().all(|c| c.is_ascii_alphanumeric()) {
            base.truncate(idx);
        }
    }
    base.replace('-', " ")
}

pub fn clean_display_name_for_meta(name: &str) -> String {
    clean_display_name(name)
}

fn clean_display_name(name: &str) -> String {
    let mut n = decode_html_entities(name);
    for token in [" (ITA)", " (ita)", "(ITA)", " (DUB)", "(DUB)"] {
        n = n.replace(token, "");
    }
    n.trim().to_string()
}

fn clean_series_name(name: &str) -> String {
    let mut n = decode_html_entities(name).to_lowercase();
    for token in ["(ita)", "(dub)", "(sub)", " sub ita"] {
        n = n.replace(token, "");
    }
    n.split(|c: char| !c.is_alphanumeric())
        .filter(|s| !s.is_empty())
        .collect::<Vec<_>>()
        .join(" ")
}

fn infer_season_token(slug: &str, name: &str) -> Option<u32> {
    let slug_re = Regex::new(r"(?i)season-(\d+)").ok()?;
    if let Some(cap) = slug_re.captures(slug) {
        return cap.get(1)?.as_str().parse().ok();
    }
    let name_re = Regex::new(r"(?i)\b(?:season|stagione)\s*(\d+)\b").ok()?;
    if let Some(cap) = name_re.captures(name) {
        return cap.get(1)?.as_str().parse().ok();
    }
    None
}

fn canonical_series_key(name: &str, slug: &str) -> String {
    let season = infer_season_token(slug, name);
    let mut base = clean_series_name(name);
    if base.len() < 2 {
        base = clean_series_name(&slug_to_display_name(slug));
    }
    match season {
        Some(s) => format!("{base}|s{s}"),
        None => base,
    }
}

fn parse_subtitle_meta(sub: &str) -> (Option<u32>, bool) {
    let normalized = sub.trim();
    let upcoming = normalized.contains("??") || normalized.contains("? ep");
    let ep_re = Regex::new(r"(?i)(\d+)\s*ep").expect("ep count");
    let count = ep_re
        .captures(normalized)
        .and_then(|c| c.get(1))
        .and_then(|m| m.as_str().parse().ok());
    (count, upcoming)
}

fn card_rank(card: &SaturnCard) -> i32 {
    let mut score = card.episode_count.unwrap_or(0) as i32 * 100;
    if card.is_dub {
        score -= 120;
    } else if card.name.to_lowercase().contains("(ita)") {
        score += 50;
    } else {
        score += 30;
    }
    if card.is_upcoming && card.episode_count.unwrap_or(0) == 0 {
        score -= 500;
    }
    if card.episode_count.unwrap_or(0) > 0 {
        score += 80;
    }
    score
}

fn is_browseable(card: &SaturnCard) -> bool {
    if card.subtitle.as_deref() == Some("Episodio recente") {
        return true;
    }
    if card.is_upcoming && card.episode_count.unwrap_or(0) == 0 {
        return false;
    }
    card.episode_count.unwrap_or(0) > 0
}

fn dedupe_cards(cards: Vec<SaturnCard>) -> Vec<SaturnCard> {
    let mut best: HashMap<String, SaturnCard> = HashMap::new();
    for card in cards {
        let key = canonical_series_key(&card.name, &card.slug);
        best.entry(key)
            .and_modify(|existing| {
                if card_rank(&card) > card_rank(existing) {
                    *existing = card.clone();
                }
            })
            .or_insert(card);
    }
    let mut out: Vec<_> = best.into_values().collect();
    out.sort_by(|a, b| a.name.cmp(&b.name));
    out
}

fn format_release_info(card: &SaturnCard) -> Option<String> {
    if card.is_upcoming && card.episode_count.unwrap_or(0) == 0 {
        return Some("Prossimamente".to_string());
    }
    let lang = if card.is_dub {
        "Dub"
    } else if card.name.to_lowercase().contains("(ita)") {
        "Sub ITA"
    } else {
        "Sub ITA"
    };
    if let Some(n) = card.episode_count {
        return Some(format!("{n} episodi · {lang}"));
    }
    card.subtitle.clone()
}

fn card_display_name(title: Option<String>, alt: Option<String>, slug: &str) -> String {
    title
        .or(alt)
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| slug_to_display_name(slug))
}

fn finish_card(
    slug: String,
    block: &str,
    title: Option<String>,
    alt: Option<String>,
    sub: Option<String>,
) -> SaturnCard {
    let is_dub = block.contains("ac__dub-badge");
    let (episode_count, is_upcoming) = sub
        .as_deref()
        .map(parse_subtitle_meta)
        .unwrap_or((None, false));
    SaturnCard {
        name: card_display_name(title, alt, &slug),
        slug,
        poster_src: Regex::new(r#"(?is)<img[^>]*\bsrc="([^"]+)""#)
            .ok()
            .and_then(|re| re.captures(block))
            .and_then(|c| c.get(1))
            .map(|m| m.as_str().to_string()),
        subtitle: sub,
        is_dub,
        episode_count,
        is_upcoming,
    }
}

fn parse_anime_cards(html: &str) -> Vec<SaturnCard> {
    let link_re = Regex::new(
        r#"(?is)<a[^>]+href="(/anime/[^"]+)"[^>]*class="[^"]*\bac\b[^"]*"[^>]*>([\s\S]*?)</a>"#,
    )
    .expect("saturn anime link regex");

    let img_alt_re = Regex::new(r#"(?is)<img[^>]*\salt="([^"]*)""#).expect("saturn img alt regex");
    let title_re =
        Regex::new(r#"(?is)<h3 class="ac__title">([^<]*)</h3>"#).expect("saturn title regex");
    let sub_re = Regex::new(r#"(?is)<p class="ac__sub">([^<]*)</p>"#).expect("saturn sub regex");

    let mut out = Vec::new();
    let mut seen = HashSet::new();
    for cap in link_re.captures_iter(html) {
        let href = cap.get(1).map(|m| m.as_str()).unwrap_or_default();
        let block = cap.get(2).map(|m| m.as_str()).unwrap_or_default();
        let slug = href.trim_start_matches("/anime/").to_string();
        if slug.is_empty() || !seen.insert(slug.clone()) {
            continue;
        }

        out.push(finish_card(
            slug,
            block,
            title_re
                .captures(block)
                .and_then(|c| c.get(1))
                .map(|m| decode_card_text(m.as_str()))
                .filter(|s| !s.is_empty()),
            img_alt_re
                .captures(block)
                .and_then(|c| c.get(1))
                .map(|m| decode_card_text(m.as_str()))
                .filter(|s| !s.is_empty()),
            sub_re
                .captures(block)
                .and_then(|c| c.get(1))
                .map(|m| decode_card_text(m.as_str()))
                .filter(|s| !s.is_empty()),
        ));
    }
    out
}

fn parse_episode_cards(html: &str) -> Vec<SaturnCard> {
    let link_re = Regex::new(
        r#"(?is)<a[^>]+href="(/episode/([^/]+)/ep-[^"]+)"[^>]*class="[^"]*\bac\b[^"]*"[^>]*>([\s\S]*?)</a>"#,
    )
    .expect("saturn episode link regex");
    let title_re =
        Regex::new(r#"(?is)<h3 class="ac__title">([^<]*)</h3>"#).expect("saturn title regex");

    let mut out = Vec::new();
    let mut seen = HashSet::new();
    for cap in link_re.captures_iter(html) {
        let slug = cap
            .get(2)
            .map(|m| m.as_str().to_string())
            .unwrap_or_default();
        let block = cap.get(3).map(|m| m.as_str()).unwrap_or_default();
        if slug.is_empty() || !seen.insert(slug.clone()) {
            continue;
        }

        out.push(finish_card(
            slug,
            block,
            title_re
                .captures(block)
                .and_then(|c| c.get(1))
                .map(|m| decode_card_text(m.as_str()))
                .filter(|s| !s.is_empty()),
            Regex::new(r#"(?is)<img[^>]*\salt="([^"]*)""#)
                .ok()
                .and_then(|re| re.captures(block))
                .and_then(|c| c.get(1))
                .map(|m| decode_card_text(m.as_str()))
                .filter(|s| !s.is_empty()),
            Some("Episodio recente".to_string()),
        ));
    }
    out
}

fn cards_from_html(html: &str) -> Vec<SaturnCard> {
    let mut cards = parse_anime_cards(html);
    let seen: HashSet<_> = cards.iter().map(|c| c.slug.clone()).collect();
    for card in parse_episode_cards(html) {
        if !seen.contains(&card.slug) {
            cards.push(card);
        }
    }
    dedupe_cards(cards)
        .into_iter()
        .filter(|card| is_browseable(card))
        .collect()
}

fn collect_cards_from_html(html: &str) -> Vec<SaturnCard> {
    let mut cards = parse_anime_cards(html);
    let seen: HashSet<_> = cards.iter().map(|c| c.slug.clone()).collect();
    for card in parse_episode_cards(html) {
        if !seen.contains(&card.slug) {
            cards.push(card);
        }
    }
    cards
}

fn minimal_card(slug: String, episode_count: Option<u32>) -> SaturnCard {
    let subtitle = episode_count.map(|n| format!("{n} ep"));
    SaturnCard {
        name: slug_to_display_name(&slug),
        slug,
        poster_src: None,
        subtitle,
        is_dub: false,
        episode_count,
        is_upcoming: false,
    }
}

fn ingest_card(cards: &mut HashMap<String, SaturnCard>, card: SaturnCard) {
    cards
        .entry(card.slug.clone())
        .and_modify(|existing| {
            if card_rank(&card) > card_rank(existing) {
                *existing = card.clone();
            } else {
                if existing.poster_src.is_none() {
                    existing.poster_src = card.poster_src.clone();
                }
                let derived = slug_to_display_name(&existing.slug);
                if existing.name == derived && card.name != derived {
                    existing.name = card.name.clone();
                }
                if card.episode_count.unwrap_or(0) > existing.episode_count.unwrap_or(0) {
                    existing.episode_count = card.episode_count;
                    if card.subtitle.is_some() {
                        existing.subtitle = card.subtitle.clone();
                    }
                }
                existing.is_dub |= card.is_dub;
            }
        })
        .or_insert(card);
}

fn ingest_sitemap_anime(cards: &mut HashMap<String, SaturnCard>, xml: &str) {
    let re = Regex::new(r#"(?i)<loc>https?://[^/]+/anime/([^/<]+)</loc>"#).expect("sitemap anime");
    for cap in re.captures_iter(xml) {
        let slug = cap
            .get(1)
            .map(|m| m.as_str().trim().to_string())
            .unwrap_or_default();
        if slug.is_empty() {
            continue;
        }
        cards
            .entry(slug.clone())
            .or_insert_with(|| minimal_card(slug, None));
    }
}

fn ingest_sitemap_episodes(cards: &mut HashMap<String, SaturnCard>, xml: &str) {
    let re = Regex::new(r#"(?i)/anime/([^/]+)/ep-(\d+)</loc>"#).expect("sitemap episode counts");
    for cap in re.captures_iter(xml) {
        let slug = cap
            .get(1)
            .map(|m| m.as_str().trim().to_string())
            .unwrap_or_default();
        let ep = cap
            .get(2)
            .and_then(|m| m.as_str().parse::<u32>().ok())
            .unwrap_or(0);
        if slug.is_empty() || ep == 0 {
            continue;
        }
        cards
            .entry(slug.clone())
            .and_modify(|card| {
                if card.episode_count.unwrap_or(0) < ep {
                    card.episode_count = Some(ep);
                    card.subtitle = Some(format!("{ep} ep"));
                }
            })
            .or_insert_with(|| minimal_card(slug, Some(ep)));
    }
}

fn az_list_paths() -> Vec<String> {
    let mut paths = vec!["/az-list/dot".to_string(), "/az-list/0-9".to_string()];
    for letter in b'A'..=b'Z' {
        paths.push(format!("/az-list/{}", letter as char));
    }
    paths
}

fn listing_paths() -> Vec<&'static str> {
    vec![
        "/",
        "/ongoing",
        "/newest",
        "/upcoming",
        "/filter",
        "/toplist/day",
        "/toplist/week",
        "/toplist/month",
        "/toplist/all",
    ]
}

fn ingest_html_page(cards: &mut HashMap<String, SaturnCard>, html: &str) {
    for card in collect_cards_from_html(html) {
        ingest_card(cards, card);
    }
}

fn ingest_genre_filters(
    cards: &mut HashMap<String, SaturnCard>,
    client: &Client,
    base: &str,
    html: &str,
) {
    let re = Regex::new(r#"(?i)href="(/filter\?categories=\d+)""#).expect("genre filter href");
    let mut seen = HashSet::new();
    for cap in re.captures_iter(html) {
        let path = cap.get(1).map(|m| m.as_str()).unwrap_or_default();
        if path.is_empty() || !seen.insert(path.to_string()) {
            continue;
        }
        if let Some(page) = fetch_online_html(client, base, path) {
            ingest_html_page(cards, &page);
        }
    }
}

fn card_to_preview(db: &Database, card: &SaturnCard) -> StremioMetaPreview {
    StremioMetaPreview {
        id: card.slug.clone(),
        r#type: "series".to_string(),
        name: clean_display_name(&card.name),
        poster: card
            .poster_src
            .as_deref()
            .and_then(|src| resolve_poster_url(db, src)),
        poster_shape: Some("poster".to_string()),
        description: None,
        release_info: format_release_info(card),
        catalog_prefix: Some("saturn".to_string()),
        slug: Some(card.slug.clone()),
    }
}

fn section_rows_from_html(db: &Database, html: &str) -> Vec<ScCatalogRow> {
    let section_re = Regex::new(r#"(?is)<h2 class="section-title">([^<]+)</h2>[\s\S]*?<div class="(?:rail|related-rail|swiper)"#)
        .expect("section regex");
    let mut rows = Vec::new();
    let mut seen_slugs = HashSet::new();

    for cap in section_re.captures_iter(html) {
        let title = cap
            .get(1)
            .map(|m| m.as_str().trim())
            .unwrap_or("AnimeSaturn");
        let start = cap.get(0).map(|m| m.start()).unwrap_or(0);
        let chunk = &html[start..start.saturating_add(120_000).min(html.len())];
        let cards: Vec<_> = cards_from_html(chunk)
            .into_iter()
            .filter(|c| seen_slugs.insert(c.slug.clone()))
            .take(ROW_LIMIT)
            .collect();
        if cards.is_empty() {
            continue;
        }
        let key = format!(
            "saturn-{}",
            title
                .to_lowercase()
                .replace(' ', "-")
                .chars()
                .filter(|c| c.is_ascii_alphanumeric() || *c == '-')
                .collect::<String>()
        );
        rows.push(ScCatalogRow {
            key,
            title: title.to_string(),
            subtitle: "AnimeSaturn · Locale e streaming".to_string(),
            items: cards.iter().map(|c| card_to_preview(db, c)).collect(),
        });
    }

    if rows.is_empty() {
        let cards: Vec<_> = cards_from_html(html)
            .into_iter()
            .filter(|c| seen_slugs.insert(c.slug.clone()))
            .take(ROW_LIMIT)
            .collect();
        if !cards.is_empty() {
            rows.push(ScCatalogRow {
                key: "saturn-home".to_string(),
                title: "Anime in evidenza".to_string(),
                subtitle: "AnimeSaturn".to_string(),
                items: cards.iter().map(|c| card_to_preview(db, c)).collect(),
            });
        }
    }

    rows
}

fn load_local_home(db: &Database) -> Vec<ScCatalogRow> {
    let index_path = site_root_path(db).join("index.html");
    let html = fs::read_to_string(index_path).unwrap_or_default();
    if html.is_empty() {
        return Vec::new();
    }
    section_rows_from_html(db, &html)
}

fn load_home_rows(db: &Database) -> Vec<ScCatalogRow> {
    let mut rows = load_local_home(db);
    let Ok(client) = http_client() else {
        return filter_rows(rows);
    };
    let base = app_url(db);
    if let Some(html) = fetch_online_html(&client, &base, "/") {
        let online = section_rows_from_html(db, &html);
        let mut keys: HashSet<String> = rows.iter().map(|r| r.key.clone()).collect();
        for row in online {
            if keys.insert(row.key.clone()) {
                rows.push(row);
            }
        }
    }
    filter_rows(rows)
}

fn fetch_online_html(client: &Client, base: &str, path: &str) -> Option<String> {
    let url = format!("{}{}", base.trim_end_matches('/'), path);
    client
        .get(url)
        .header("Accept", "text/html,application/xhtml+xml")
        .send()
        .ok()?
        .error_for_status()
        .ok()?
        .text()
        .ok()
}

fn sync_online_index(db: &Database) -> Vec<StremioMetaPreview> {
    let client = match http_client() {
        Ok(c) => c,
        Err(_) => return Vec::new(),
    };
    let base = app_url(db);
    let mut cards: HashMap<String, SaturnCard> = HashMap::new();

    if let Some(xml) = fetch_online_html(&client, &base, "/sitemap-anime-1.xml") {
        ingest_sitemap_anime(&mut cards, &xml);
    }
    for i in 1..=4 {
        let path = format!("/sitemap-episodes-{i}.xml");
        let Some(xml) = fetch_online_html(&client, &base, &path) else {
            break;
        };
        if !xml.contains("<url>") {
            break;
        }
        ingest_sitemap_episodes(&mut cards, &xml);
    }

    for path in listing_paths() {
        if let Some(html) = fetch_online_html(&client, &base, path) {
            ingest_html_page(&mut cards, &html);
        }
    }

    for path in az_list_paths() {
        if let Some(html) = fetch_online_html(&client, &base, &path) {
            ingest_html_page(&mut cards, &html);
        }
    }

    if let Some(html) = fetch_online_html(&client, &base, "/genres") {
        ingest_genre_filters(&mut cards, &client, &base, &html);
    }

    cards
        .into_values()
        .filter(|card| is_browseable(card))
        .map(|card| card_to_preview(db, &card))
        .collect()
}

fn load_cached_index(db: &Database) -> Option<Vec<StremioMetaPreview>> {
    let json = db.get_meta(META_SATURN_INDEX).ok().flatten()?;
    serde_json::from_str(&json).ok()
}

fn save_cached_index(db: &Database, index: &[StremioMetaPreview]) -> Result<(), String> {
    let json = serde_json::to_string(index).map_err(|e| e.to_string())?;
    db.set_meta(META_SATURN_INDEX, &json)?;
    db.set_meta(META_SATURN_INDEX_TS, &now_ts().to_string())?;
    Ok(())
}

fn ensure_preview_name(preview: &mut StremioMetaPreview) {
    if !preview.name.trim().is_empty() {
        return;
    }
    preview.name = preview
        .slug
        .as_deref()
        .map(slug_to_display_name)
        .unwrap_or_else(|| slug_to_display_name(&preview.id));
}

fn repair_index_names(index: &mut [StremioMetaPreview]) {
    for item in index.iter_mut() {
        ensure_preview_name(item);
        item.name = clean_display_name(&item.name);
    }
}

fn preview_rank(preview: &StremioMetaPreview) -> i32 {
    let release = preview.release_info.as_deref().unwrap_or("");
    let mut score = 0;
    if release.contains("Prossimamente") {
        score -= 500;
    }
    if let Ok(re) = Regex::new(r"(?i)(\d+)\s*episod") {
        if let Some(cap) = re.captures(release) {
            score += cap
                .get(1)
                .and_then(|m| m.as_str().parse::<i32>().ok())
                .unwrap_or(0)
                * 100;
        }
    }
    if release.contains("Dub") {
        score -= 120;
    }
    if preview.name.to_lowercase().contains("ita") {
        score += 40;
    }
    score
}

fn preview_canonical_key(preview: &StremioMetaPreview) -> String {
    let slug = preview.slug.as_deref().unwrap_or(&preview.id);
    canonical_series_key(&preview.name, slug)
}

fn is_browseable_preview(preview: &StremioMetaPreview) -> bool {
    let release = preview.release_info.as_deref().unwrap_or("");
    if release.contains("Prossimamente") {
        return false;
    }
    release.contains("episodi") || release == "Episodio recente"
}

fn finalize_index(index: Vec<StremioMetaPreview>) -> Vec<StremioMetaPreview> {
    let mut best: HashMap<String, StremioMetaPreview> = HashMap::new();
    for preview in index {
        let key = preview_canonical_key(&preview);
        best.entry(key)
            .and_modify(|existing| {
                if preview_rank(&preview) > preview_rank(existing) {
                    *existing = preview.clone();
                }
            })
            .or_insert(preview);
    }
    best.into_values()
        .filter(|preview| is_browseable_preview(preview))
        .collect()
}

fn dedupe_previews(items: Vec<StremioMetaPreview>) -> Vec<StremioMetaPreview> {
    let mut best: HashMap<String, StremioMetaPreview> = HashMap::new();
    for preview in items {
        let key = preview_canonical_key(&preview);
        best.entry(key)
            .and_modify(|existing| {
                if preview_rank(&preview) > preview_rank(existing) {
                    *existing = preview.clone();
                }
            })
            .or_insert(preview);
    }
    best.into_values()
        .filter(|preview| is_browseable_preview(preview))
        .collect()
}

fn filter_rows(mut rows: Vec<ScCatalogRow>) -> Vec<ScCatalogRow> {
    for row in &mut rows {
        row.items = dedupe_previews(std::mem::take(&mut row.items));
    }
    rows.retain(|row| !row.items.is_empty());
    rows
}

fn enrich_index_from_local_site(db: &Database, index: &mut [StremioMetaPreview]) {
    let site = site_root_path(db);
    let paths = [
        site.join("index.html"),
        site.join("az-list/index.html"),
        site.join("ongoing/index.html"),
        site.join("newest/index.html"),
        site.join("toplist/week/index.html"),
    ];

    let mut by_slug: HashMap<String, SaturnCard> = HashMap::new();
    for path in paths {
        if !path.is_file() {
            continue;
        }
        let Ok(html) = fs::read_to_string(&path) else {
            continue;
        };
        for card in cards_from_html(&html) {
            by_slug
                .entry(card.slug.clone())
                .and_modify(|existing| {
                    if existing.name.trim().is_empty() && !card.name.trim().is_empty() {
                        existing.name = card.name.clone();
                    }
                    if existing.poster_src.is_none() {
                        existing.poster_src = card.poster_src.clone();
                    }
                    if existing.subtitle.is_none() {
                        existing.subtitle = card.subtitle.clone();
                    }
                })
                .or_insert(card);
        }
    }

    for item in index.iter_mut() {
        if let Some(card) = by_slug.get(&item.id) {
            if item.name.trim().is_empty() && !card.name.trim().is_empty() {
                item.name = card.name.clone();
            }
            if item.poster.is_none() {
                item.poster = card
                    .poster_src
                    .as_deref()
                    .and_then(|src| resolve_poster_url(db, src));
            }
            if item.slug.is_none() {
                item.slug = Some(card.slug.clone());
            }
        }
        ensure_preview_name(item);
    }
}

fn merge_index(index: &mut Vec<StremioMetaPreview>, rows: &[ScCatalogRow]) {
    let mut seen: HashSet<String> = index
        .iter()
        .map(|p| format!("{}:{}", p.r#type, p.id))
        .collect();
    for row in rows {
        for item in &row.items {
            let key = format!("{}:{}", item.r#type, item.id);
            if seen.insert(key.clone()) {
                index.push(item.clone());
                continue;
            }
            if item.name.trim().is_empty() {
                continue;
            }
            if let Some(existing) = index
                .iter_mut()
                .find(|p| format!("{}:{}", p.r#type, p.id) == key)
            {
                if existing.name.trim().is_empty() {
                    existing.name = item.name.clone();
                    if existing.poster.is_none() {
                        existing.poster = item.poster.clone();
                    }
                    if existing.slug.is_none() {
                        existing.slug = item.slug.clone();
                    }
                }
            }
        }
    }
}

pub struct SaturnCatalogResponse {
    pub rows: Vec<ScCatalogRow>,
    pub index: Vec<StremioMetaPreview>,
    pub synced_at: i64,
    pub total_count: usize,
}

pub fn fetch_catalog(db: &Database) -> Result<SaturnCatalogResponse, String> {
    if !enabled(db) {
        return Ok(SaturnCatalogResponse {
            rows: Vec::new(),
            index: Vec::new(),
            synced_at: 0,
            total_count: 0,
        });
    }

    let rows = load_home_rows(db);
    let mut index = load_cached_index(db).unwrap_or_default();
    enrich_index_from_local_site(db, &mut index);
    repair_index_names(&mut index);
    merge_index(&mut index, &rows);
    index = finalize_index(index);

    if !index.is_empty() {
        let _ = save_cached_index(db, &index);
    }

    let synced_at = db
        .get_meta(META_SATURN_INDEX_TS)
        .ok()
        .flatten()
        .and_then(|v| v.parse().ok())
        .unwrap_or_else(now_ts);

    Ok(SaturnCatalogResponse {
        total_count: index.len(),
        rows,
        index,
        synced_at,
    })
}

pub fn refresh_catalog_index(db: &Database) -> Result<SaturnCatalogResponse, String> {
    if !enabled(db) {
        return fetch_catalog(db);
    }

    let rows = load_home_rows(db);
    let mut index = sync_online_index(db);
    enrich_index_from_local_site(db, &mut index);
    repair_index_names(&mut index);
    merge_index(&mut index, &rows);
    index = finalize_index(index);
    save_cached_index(db, &index)?;

    Ok(SaturnCatalogResponse {
        total_count: index.len(),
        rows,
        index,
        synced_at: now_ts(),
    })
}

pub fn poster_file_path(db: &Database, rel_path: &str) -> Option<PathBuf> {
    let root = cdn_root_path(db);
    let joined = root.join(rel_path.trim_start_matches('/'));
    let canonical = joined.canonicalize().ok()?;
    let root_canon = root.canonicalize().ok()?;
    if canonical.starts_with(&root_canon) && canonical.is_file() {
        Some(canonical)
    } else {
        None
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
        .filter(|p| {
            let name = if p.name.trim().is_empty() {
                p.slug
                    .as_deref()
                    .map(slug_to_display_name)
                    .unwrap_or_else(|| p.id.clone())
            } else {
                p.name.clone()
            };
            let slug = p
                .slug
                .as_deref()
                .map(slug_to_display_name)
                .unwrap_or_default();
            name.to_lowercase().contains(&q) || slug.to_lowercase().contains(&q)
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_multiline_img_tags() {
        let html = r#"<a href="/anime/hack-sign-ita-ng6gH" class="ac group">
    <div class="ac__poster">
        <img src="https://img.saturncdn.net/static/images/locandine/94665l.jpg"
             alt=".hack//Sign (ITA)"
             width="240" height="360"
             loading="lazy" decoding="async">
    </div>
    <div class="ac__caption">
        <h3 class="ac__title">.hack//Sign (ITA)</h3>
        <p class="ac__sub">04 Aprile 2002 &middot; 26 ep</p>
    </div>
</a>"#;
        let cards = parse_anime_cards(html);
        assert_eq!(cards.len(), 1);
        assert_eq!(cards[0].name, ".hack//Sign (ITA)");
        assert_eq!(cards[0].slug, "hack-sign-ita-ng6gH");
    }

    #[test]
    fn slug_display_name_strips_hash_suffix() {
        assert_eq!(slug_to_display_name("one-piece-PmTvj"), "one piece");
    }

    #[test]
    fn parses_sitemap_anime_slugs() {
        let xml = r#"<url><loc>https://www.animesaturn.net/anime/one-piece-PmTvj</loc></url>"#;
        let mut cards = HashMap::new();
        ingest_sitemap_anime(&mut cards, xml);
        assert_eq!(cards.len(), 1);
        assert!(cards.contains_key("one-piece-PmTvj"));
    }

    #[test]
    fn parses_sitemap_episode_counts() {
        let xml = r#"
            <loc>https://www.animesaturn.net/anime/one-piece-PmTvj/ep-12</loc>
            <loc>https://www.animesaturn.net/anime/one-piece-PmTvj/ep-3</loc>
        "#;
        let mut cards = HashMap::new();
        ingest_sitemap_episodes(&mut cards, xml);
        assert_eq!(
            cards.get("one-piece-PmTvj").and_then(|c| c.episode_count),
            Some(12)
        );
    }

    #[test]
    fn decodes_html_entities_in_titles() {
        assert_eq!(decode_html_entities("Tom &amp; Jerry"), "Tom & Jerry");
        assert_eq!(
            decode_html_entities("&amp;quot;Hello&amp;quot;"),
            "\"Hello\""
        );
        assert_eq!(decode_html_entities("Demon&#39;s Slayer"), "Demon's Slayer");
        assert_eq!(
            decode_html_entities("A&amp;B &quot;Test&quot;"),
            "A&B \"Test\""
        );
        assert_eq!(decode_html_entities("&#8217;"), "'");
    }
}
