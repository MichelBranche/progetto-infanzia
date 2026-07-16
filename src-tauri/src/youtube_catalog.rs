use crate::db::Database;
use crate::html_text::decode_html_entities;
use crate::sc_catalog::ScCatalogRow;
use crate::stremio::{StremioMetaPreview, StremioVideo};
use regex::Regex;
use reqwest::blocking::Client;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::thread;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

const META_YOUTUBE_INDEX: &str = "youtube_catalog_index";
const META_YOUTUBE_INDEX_TS: &str = "youtube_catalog_index_ts";
const META_YOUTUBE_INDEX_VERSION: &str = "youtube_catalog_index_version";
const YOUTUBE_INDEX_VERSION: &str = "3";
const META_YOUTUBE_ENABLED: &str = "youtube_catalog_enabled";
const INDEX_TTL_SECS: i64 = 12 * 3600;
const HTTP_TIMEOUT_SECS: u64 = 45;
const OEMBED_DELAY_MS: u64 = 180;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct YoutubeSeriesCache {
    pub playlist_id: String,
    pub name: String,
    pub description: Option<String>,
    pub poster: Option<String>,
    pub channel_name: Option<String>,
    pub videos: Vec<YoutubeVideoCache>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct YoutubeVideoCache {
    pub id: String,
    pub title: String,
    pub description: Option<String>,
    pub thumbnail: Option<String>,
    pub season: Option<i32>,
    pub episode: Option<i32>,
    pub position: usize,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct YoutubeCatalogResponse {
    pub rows: Vec<ScCatalogRow>,
    pub index: Vec<StremioMetaPreview>,
    pub synced_at: i64,
    pub total_count: usize,
}

struct CuratedPlaylist {
    id: &'static str,
    name: Option<&'static str>,
    description: Option<&'static str>,
}

/// Playlist ufficiali / complete messe gratuitamente dai titolari.
const CURATED_PLAYLISTS: &[CuratedPlaylist] = &[
    CuratedPlaylist {
        id: "PL9-DcNziPkgg7l_34cUgHqKh_yMN0HVFZ",
        name: Some("C'era una volta... l'uomo"),
        description: Some(
            "Serie educativa anni '90 · Episodi completi dal canale ufficiale Hello Maestro su YouTube.",
        ),
    },
    CuratedPlaylist {
        id: "PL9-DcNziPkggH4rRwMnvc-WRjF588Nw4L",
        name: Some("C'era una volta... lo spazio"),
        description: Some(
            "Dal Big Bang alle conquiste spaziali · Episodi completi Hello Maestro su YouTube.",
        ),
    },
    CuratedPlaylist {
        id: "PL9-DcNziPkghVPse9vfQWS9wD_2EKqKyV",
        name: Some("Siamo fatti così"),
        description: Some(
            "Esplorando il corpo umano · Serie educativa anni '90 · Episodi su YouTube.",
        ),
    },
    CuratedPlaylist {
        id: "PLsDQtTHFV5VQBc-qcYKzGElZyFKfmt3gK",
        name: Some("C'era una volta... Gli esploratori"),
        description: Some(
            "Grandi viaggi e scoperte geografiche · Episodi completi su YouTube.",
        ),
    },
    CuratedPlaylist {
        id: "PL9-DcNziPkggblxWIYe0MQbEdrb-_md8J",
        name: Some("Riscopriamo le Americhe"),
        description: Some(
            "Storia delle Americhe · Serie educativa · Episodi completi su YouTube.",
        ),
    },
    CuratedPlaylist {
        id: "PL9-DcNziPkgiBM4uW58GufnBWpqdXiHdi",
        name: Some("Grandi uomini per grandi idee"),
        description: Some(
            "Grandi scienziati e inventori della storia · Serie educativa anni '90 · YouTube.",
        ),
    },
];

#[derive(Debug, Deserialize)]
struct OembedResponse {
    title: String,
    #[serde(default)]
    author_name: Option<String>,
    #[serde(default)]
    thumbnail_url: Option<String>,
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

pub fn enabled(db: &Database) -> bool {
    match db.get_meta(META_YOUTUBE_ENABLED) {
        Ok(Some(v)) => v != "0" && v != "false",
        _ => true,
    }
}

pub fn ensure_defaults(db: &Database) -> Result<(), String> {
    if db.get_meta(META_YOUTUBE_ENABLED)?.is_none() {
        db.set_meta(META_YOUTUBE_ENABLED, "true")?;
    }
    Ok(())
}

pub fn youtube_thumbnail(video_id: &str) -> String {
    format!("https://i.ytimg.com/vi/{video_id}/hqdefault.jpg")
}

pub fn youtube_embed_url(video_id: &str) -> String {
    format!(
        "https://www.youtube.com/embed/{video_id}?autoplay=1&rel=0&modestbranding=1&playsinline=1"
    )
}

fn parse_episode_from_title(title: &str, position: usize) -> (Option<i32>, Option<i32>) {
    static EP_RE: std::sync::OnceLock<Regex> = std::sync::OnceLock::new();
    let re = EP_RE.get_or_init(|| {
        Regex::new(r#"(?i)(?:episodio|ep\.?|episode)\s*(\d+)"#).expect("episode regex")
    });
    let episode = re
        .captures(title)
        .and_then(|cap| cap.get(1))
        .and_then(|m| m.as_str().parse::<i32>().ok());
    let season_re = Regex::new(r#"(?i)serie\s*(\d+)"#).ok();
    let season = season_re
        .and_then(|re| re.captures(title))
        .and_then(|cap| cap.get(1))
        .and_then(|m| m.as_str().parse::<i32>().ok());
    (
        season,
        episode.or(Some(position as i32)),
    )
}

fn extract_playlist_video_ids(html: &str) -> Vec<String> {
    static VIDEO_ID_RE: std::sync::OnceLock<Regex> = std::sync::OnceLock::new();
    let re = VIDEO_ID_RE.get_or_init(|| {
        Regex::new(r#""videoId":"([A-Za-z0-9_-]{11})""#).expect("video id regex")
    });
    let mut seen = HashMap::new();
    let mut ordered = Vec::new();
    for cap in re.captures_iter(html) {
        let id = cap.get(1).map(|m| m.as_str().to_string()).unwrap_or_default();
        if id.is_empty() || seen.contains_key(&id) {
            continue;
        }
        seen.insert(id.clone(), true);
        ordered.push(id);
    }
    ordered
}

fn parse_rss_entries(xml: &str) -> HashMap<String, YoutubeVideoCache> {
    static ENTRY_RE: std::sync::OnceLock<Regex> = std::sync::OnceLock::new();
    let entry_re = ENTRY_RE.get_or_init(|| {
        Regex::new(
            r#"(?is)<entry>(.*?)</entry>"#,
        )
        .expect("rss entry")
    });
    static VIDEO_ID_RE: std::sync::OnceLock<Regex> = std::sync::OnceLock::new();
    let video_id_re = VIDEO_ID_RE.get_or_init(|| {
        Regex::new(r#"<yt:videoId>([^<]+)</yt:videoId>"#).expect("rss video id")
    });
    static TITLE_RE: std::sync::OnceLock<Regex> = std::sync::OnceLock::new();
    let title_re = TITLE_RE.get_or_init(|| {
        Regex::new(r#"(?is)<title>([^<]+)</title>"#).expect("rss title")
    });
    static DESC_RE: std::sync::OnceLock<Regex> = std::sync::OnceLock::new();
    let desc_re = DESC_RE.get_or_init(|| {
        Regex::new(r#"(?is)<media:description>([\s\S]*?)</media:description>"#).expect("rss desc")
    });
    static THUMB_RE: std::sync::OnceLock<Regex> = std::sync::OnceLock::new();
    let thumb_re = THUMB_RE.get_or_init(|| {
        Regex::new(r#"(?is)<media:thumbnail[^>]+url="([^"]+)""#).expect("rss thumb")
    });

    let mut out = HashMap::new();
    for cap in entry_re.captures_iter(xml) {
        let block = cap.get(1).map(|m| m.as_str()).unwrap_or_default();
        let Some(video_id) = video_id_re
            .captures(block)
            .and_then(|c| c.get(1))
            .map(|m| m.as_str().trim().to_string())
        else {
            continue;
        };
        let title = title_re
            .captures(block)
            .and_then(|c| c.get(1))
            .map(|m| decode_html_entities(m.as_str().trim()))
            .unwrap_or_else(|| video_id.clone());
        let description = desc_re
            .captures(block)
            .and_then(|c| c.get(1))
            .map(|m| decode_html_entities(m.as_str().trim()))
            .filter(|s| !s.is_empty());
        let thumbnail = thumb_re
            .captures(block)
            .and_then(|c| c.get(1))
            .map(|m| m.as_str().to_string());
        let (season, episode) = parse_episode_from_title(&title, out.len() + 1);
        out.insert(
            video_id.clone(),
            YoutubeVideoCache {
                id: video_id,
                title,
                description,
                thumbnail,
                season,
                episode,
                position: 0,
            },
        );
    }
    out
}

fn parse_rss_playlist_title(xml: &str) -> Option<String> {
    static FEED_TITLE_RE: std::sync::OnceLock<Regex> = std::sync::OnceLock::new();
    let re = FEED_TITLE_RE.get_or_init(|| {
        Regex::new(r#"(?is)<feed[^>]*>[\s\S]*?<title>([^<]+)</title>"#).expect("feed title")
    });
    re.captures(xml)
        .and_then(|cap| cap.get(1))
        .map(|m| decode_html_entities(m.as_str().trim()))
        .filter(|s| !s.is_empty())
}

fn parse_page_playlist_title(html: &str) -> Option<String> {
    static OG_RE: std::sync::OnceLock<Regex> = std::sync::OnceLock::new();
    let re = OG_RE.get_or_init(|| {
        Regex::new(r#"(?is)property="og:title" content="([^"]+)""#).expect("og title")
    });
    re.captures(html)
        .and_then(|cap| cap.get(1))
        .map(|m| decode_html_entities(m.as_str().trim()))
        .filter(|s| !s.is_empty())
}

fn fetch_oembed(client: &Client, video_id: &str) -> Option<OembedResponse> {
    let url = format!(
        "https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v={video_id}&format=json"
    );
    client.get(url).send().ok()?.error_for_status().ok()?.json().ok()
}

fn sync_playlist(client: &Client, curated: &CuratedPlaylist) -> Option<YoutubeSeriesCache> {
    let playlist_id = curated.id;
    let page_url = format!("https://www.youtube.com/playlist?list={playlist_id}");
    let html = client.get(&page_url).send().ok()?.error_for_status().ok()?.text().ok()?;
    let mut video_ids = extract_playlist_video_ids(&html);
    if video_ids.is_empty() {
        return None;
    }

    let rss_url = format!(
        "https://www.youtube.com/feeds/videos.xml?playlist_id={playlist_id}"
    );
    let rss_xml = client.get(&rss_url).send().ok()?.error_for_status().ok()?.text().ok();
    let mut rss_map = rss_xml
        .as_deref()
        .map(parse_rss_entries)
        .unwrap_or_default();

    let page_title = parse_page_playlist_title(&html);
    let rss_title = rss_xml.as_deref().and_then(parse_rss_playlist_title);
    let name = curated
        .name
        .map(str::to_string)
        .or(rss_title)
        .or(page_title)
        .unwrap_or_else(|| playlist_id.to_string());

    let mut videos = Vec::new();
    for (index, video_id) in video_ids.drain(..).enumerate() {
        let position = index + 1;
        if let Some(mut cached) = rss_map.remove(&video_id) {
            cached.position = position;
            let (season, episode) = parse_episode_from_title(&cached.title, position);
            cached.season = season;
            cached.episode = episode;
            videos.push(cached);
            continue;
        }

        thread::sleep(Duration::from_millis(OEMBED_DELAY_MS));
        let oembed = fetch_oembed(client, &video_id);
        let title = oembed
            .as_ref()
            .map(|o| decode_html_entities(o.title.trim()))
            .filter(|s| !s.is_empty())
            .unwrap_or_else(|| format!("Episodio {position}"));
        let thumbnail = oembed
            .as_ref()
            .and_then(|o| o.thumbnail_url.clone())
            .or(Some(youtube_thumbnail(&video_id)));
        let (season, episode) = parse_episode_from_title(&title, position);
        videos.push(YoutubeVideoCache {
            id: video_id,
            title,
            description: None,
            thumbnail,
            season,
            episode,
            position,
        });
    }

    let poster = videos.first().and_then(|v| v.thumbnail.clone());
    let description = curated.description.map(str::to_string).or_else(|| {
        rss_xml.as_deref().and_then(|xml| {
            parse_rss_entries(xml)
                .values()
                .next()
                .and_then(|v| v.description.clone())
        })
    });

    Some(YoutubeSeriesCache {
        playlist_id: playlist_id.to_string(),
        name,
        description,
        poster,
        channel_name: None,
        videos,
    })
}

fn series_to_preview(series: &YoutubeSeriesCache) -> StremioMetaPreview {
    StremioMetaPreview {
        id: series.playlist_id.clone(),
        r#type: "series".to_string(),
        name: series.name.clone(),
        poster: series.poster.clone(),
        background: series.poster.clone(),
        logo: None,
        poster_shape: Some("poster".to_string()),
        description: series.description.clone(),
        release_info: Some("YouTube".to_string()),
        catalog_prefix: Some("youtube".to_string()),
        slug: Some(series.playlist_id.clone()),
        genres: vec!["Animazione".to_string(), "Educational".to_string(), "Cartoni".to_string()],
        cast: Vec::new(),
        directors: Vec::new(),
        streaming_services: None,
        source_row_key: Some("youtube-classics".to_string()),
        source_row_title: Some("Classici su YouTube".to_string()),
        resume_video_id: None,
    }
}

fn load_cached_series(db: &Database) -> Vec<YoutubeSeriesCache> {
    let json = match db.get_meta(META_YOUTUBE_INDEX).ok().flatten() {
        Some(v) => v,
        None => return Vec::new(),
    };
    serde_json::from_str(&json).unwrap_or_default()
}

fn save_cached_series(db: &Database, series: &[YoutubeSeriesCache]) -> Result<(), String> {
    let json = serde_json::to_string(series).map_err(|e| e.to_string())?;
    db.set_meta(META_YOUTUBE_INDEX, &json)?;
    db.set_meta(META_YOUTUBE_INDEX_TS, &now_ts().to_string())?;
    db.set_meta(META_YOUTUBE_INDEX_VERSION, YOUTUBE_INDEX_VERSION)
}

fn index_version_ok(db: &Database) -> bool {
    db.get_meta(META_YOUTUBE_INDEX_VERSION)
        .ok()
        .flatten()
        .as_deref()
        == Some(YOUTUBE_INDEX_VERSION)
}

fn curated_count_matches(cached: &[YoutubeSeriesCache]) -> bool {
    if cached.len() != CURATED_PLAYLISTS.len() {
        return false;
    }
    let expected: HashMap<&str, ()> = CURATED_PLAYLISTS
        .iter()
        .map(|p| (p.id, ()))
        .collect();
    cached.iter().all(|s| expected.contains_key(s.playlist_id.as_str()))
}

fn index_needs_refresh(db: &Database) -> bool {
    let cached = load_cached_series(db);
    if cached.is_empty() || !index_version_ok(db) || !curated_count_matches(&cached) {
        return true;
    }
    let synced_at = db
        .get_meta(META_YOUTUBE_INDEX_TS)
        .ok()
        .flatten()
        .and_then(|v| v.parse::<i64>().ok())
        .unwrap_or(0);
    now_ts().saturating_sub(synced_at) > INDEX_TTL_SECS
}

fn sync_catalog(db: &Database) -> Vec<YoutubeSeriesCache> {
    let client = match http_client() {
        Ok(c) => c,
        Err(_) => return load_cached_series(db),
    };
    let mut out = Vec::new();
    for curated in CURATED_PLAYLISTS {
        if let Some(series) = sync_playlist(&client, curated) {
            if !series.videos.is_empty() {
                out.push(series);
            }
        }
    }
    if !out.is_empty() {
        let _ = save_cached_series(db, &out);
    }
    if out.is_empty() {
        load_cached_series(db)
    } else {
        out
    }
}

pub fn get_series(db: &Database, playlist_id: &str) -> Option<YoutubeSeriesCache> {
    let cached = load_cached_series(db);
    if cached.is_empty() || index_needs_refresh(db) {
        let synced = sync_catalog(db);
        return synced
            .into_iter()
            .find(|s| s.playlist_id == playlist_id);
    }
    cached
        .into_iter()
        .find(|s| s.playlist_id == playlist_id)
}

pub fn videos_for_series(db: &Database, playlist_id: &str) -> Vec<StremioVideo> {
    let Some(series) = get_series(db, playlist_id) else {
        return Vec::new();
    };
    series
        .videos
        .iter()
        .map(|video| StremioVideo {
            id: video.id.clone(),
            title: video.title.clone(),
            season: video.season,
            episode: video.episode,
            thumbnail: video
                .thumbnail
                .clone()
                .or(Some(youtube_thumbnail(&video.id))),
            released: None,
            description: video.description.clone(),
            runtime: None,
        })
        .collect()
}

pub fn fetch_catalog(db: &Database) -> Result<YoutubeCatalogResponse, String> {
    if !enabled(db) {
        return Ok(YoutubeCatalogResponse {
            rows: Vec::new(),
            index: Vec::new(),
            synced_at: 0,
            total_count: 0,
        });
    }

    let series_list = if index_needs_refresh(db) {
        sync_catalog(db)
    } else {
        load_cached_series(db)
    };

    let index: Vec<StremioMetaPreview> = series_list.iter().map(series_to_preview).collect();
    let row_items: Vec<StremioMetaPreview> = index.clone();
    let rows = if row_items.is_empty() {
        Vec::new()
    } else {
        vec![ScCatalogRow {
            key: "youtube-classics".to_string(),
            title: "Classici su YouTube".to_string(),
            subtitle: "Serie complete messe gratuitamente dai titolari".to_string(),
            items: row_items,
        }]
    };

    let synced_at = db
        .get_meta(META_YOUTUBE_INDEX_TS)
        .ok()
        .flatten()
        .and_then(|v| v.parse().ok())
        .unwrap_or_else(now_ts);

    Ok(YoutubeCatalogResponse {
        total_count: index.len(),
        rows,
        index,
        synced_at,
    })
}

pub fn refresh_catalog(db: &Database) -> Result<YoutubeCatalogResponse, String> {
    if !enabled(db) {
        return fetch_catalog(db);
    }
    sync_catalog(db);
    fetch_catalog(db)
}

pub fn search_titles(db: &Database, query: &str) -> Vec<StremioMetaPreview> {
    let q = query.trim();
    if q.len() < 2 {
        return Vec::new();
    }
    let index = fetch_catalog(db).map(|r| r.index).unwrap_or_default();
    crate::smart_search::filter_and_rank_previews(index, q, 40)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn extracts_ordered_unique_video_ids() {
        let html = r#"
            "videoId":"aaaaaaaaaaa"
            "videoId":"bbbbbbbbbbb"
            "videoId":"aaaaaaaaaaa"
            "videoId":"ccccccccccc"
        "#;
        assert_eq!(
            extract_playlist_video_ids(html),
            vec!["aaaaaaaaaaa", "bbbbbbbbbbb", "ccccccccccc"]
        );
    }

    #[test]
    fn parses_episode_number_from_title() {
        let (season, episode) =
            parse_episode_from_title("Serie 1, Episodio 12 | EPISODIO COMPLETO", 3);
        assert_eq!(season, Some(1));
        assert_eq!(episode, Some(12));
    }
}
