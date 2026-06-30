use crate::db::Database;
use reqwest::blocking::Client;
use serde::Deserialize;
use std::path::{Path, PathBuf};
use std::thread;
use std::time::Duration;

pub const META_TMDB_API_KEY: &str = "tmdb_api_key";
pub const META_ENRICH_ON_SCAN: &str = "tmdb_enrich_on_scan";

#[derive(Debug, Deserialize)]
struct SearchMovieResponse {
    results: Vec<MovieResult>,
}

#[derive(Debug, Deserialize)]
struct SearchTvResponse {
    results: Vec<TvResult>,
}

#[derive(Debug, Deserialize)]
struct MovieResult {
    id: i64,
    title: String,
    release_date: Option<String>,
    overview: Option<String>,
    poster_path: Option<String>,
    runtime: Option<i32>,
    genres: Option<Vec<Genre>>,
}

#[derive(Debug, Deserialize)]
struct TvResult {
    id: i64,
    name: String,
    first_air_date: Option<String>,
    overview: Option<String>,
    poster_path: Option<String>,
    genres: Option<Vec<Genre>>,
    episode_run_time: Option<Vec<i32>>,
}

#[derive(Debug, Deserialize)]
struct Genre {
    name: String,
}

#[derive(Debug, Deserialize)]
struct MovieDetail {
    overview: Option<String>,
    poster_path: Option<String>,
    runtime: Option<i32>,
    genres: Option<Vec<Genre>>,
    release_date: Option<String>,
}

#[derive(Debug, Deserialize)]
struct TvDetail {
    overview: Option<String>,
    poster_path: Option<String>,
    genres: Option<Vec<Genre>>,
    episode_run_time: Option<Vec<i32>>,
}

pub struct EnrichResult {
    pub tmdb_id: i64,
    pub tmdb_type: String,
    pub description: Option<String>,
    pub year: Option<i32>,
    pub genres_json: Option<String>,
    pub runtime_mins: Option<i32>,
    pub poster_path: Option<String>,
}

fn client() -> Result<Client, String> {
    Client::builder()
        .timeout(Duration::from_secs(12))
        .build()
        .map_err(|e| e.to_string())
}

fn normalize_title(title: &str) -> String {
    title
        .to_lowercase()
        .replace(['.', '_', '-'], " ")
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
}

fn titles_match(a: &str, b: &str) -> bool {
    let na = normalize_title(a);
    let nb = normalize_title(b);
    na == nb || na.contains(&nb) || nb.contains(&na)
}

fn year_from_date(date: &Option<String>) -> Option<i32> {
    date.as_ref()
        .and_then(|d| d.get(0..4))
        .and_then(|y| y.parse().ok())
}

fn genres_to_json(genres: &Option<Vec<Genre>>) -> Option<String> {
    let names: Vec<String> = genres
        .as_ref()?
        .iter()
        .map(|g| g.name.clone())
        .collect();
    if names.is_empty() {
        return None;
    }
    serde_json::to_string(&names).ok()
}

fn runtime_from_tv(detail: &TvDetail) -> Option<i32> {
    detail
        .episode_run_time
        .as_ref()
        .and_then(|r| r.first().copied())
}

pub fn enrich_media(
    api_key: &str,
    media_root: &Path,
    media_id: &str,
    title: &str,
    media_type: &str,
    year: Option<i32>,
    series_title: Option<&str>,
    db: &Database,
) -> Result<Option<EnrichResult>, String> {
    let search_title = series_title.unwrap_or(title);
    let is_tv = media_type == "serie" || media_type == "cartone" || series_title.is_some();

    let result = if is_tv {
        search_and_match_tv(api_key, search_title, year)?
    } else {
        search_and_match_movie(api_key, search_title, year)?
    };

    let Some(result) = result else {
        return Ok(None);
    };

    let poster_path = result
        .poster_path
        .as_ref()
        .and_then(|pp| download_poster(api_key, media_root, media_id, pp).ok());

    db.apply_tmdb_enrichment(
        media_id,
        result.tmdb_id,
        &result.tmdb_type,
        result.description.as_deref(),
        result.year,
        result.genres_json.as_deref(),
        result.runtime_mins,
        poster_path.as_deref(),
    )?;

    Ok(Some(result))
}

fn search_and_match_movie(
    api_key: &str,
    title: &str,
    year: Option<i32>,
) -> Result<Option<EnrichResult>, String> {
    let client = client()?;
    let mut url = format!(
        "https://api.themoviedb.org/3/search/movie?api_key={api_key}&query={}&language=it-IT",
        urlencoding::encode(title)
    );
    if let Some(y) = year {
        url.push_str(&format!("&year={y}"));
    }

    let resp: SearchMovieResponse = client.get(&url).send().map_err(|e| e.to_string())?.json().map_err(|e| e.to_string())?;

    let matched = resp.results.into_iter().find(|r| titles_match(title, &r.title));
    let Some(m) = matched else {
        return Ok(None);
    };

    let detail_url = format!(
        "https://api.themoviedb.org/3/movie/{}?api_key={api_key}&language=it-IT",
        m.id
    );
    let detail: MovieDetail = client
        .get(&detail_url)
        .send()
        .map_err(|e| e.to_string())?
        .json()
        .map_err(|e| e.to_string())?;

    Ok(Some(EnrichResult {
        tmdb_id: m.id,
        tmdb_type: "movie".into(),
        description: detail.overview.or(m.overview),
        year: year.or(year_from_date(&detail.release_date)).or(year_from_date(&m.release_date)),
        genres_json: genres_to_json(&detail.genres.or(m.genres)),
        runtime_mins: detail.runtime.or(m.runtime),
        poster_path: detail.poster_path.or(m.poster_path),
    }))
}

fn search_and_match_tv(
    api_key: &str,
    title: &str,
    year: Option<i32>,
) -> Result<Option<EnrichResult>, String> {
    let client = client()?;
    let url = format!(
        "https://api.themoviedb.org/3/search/tv?api_key={api_key}&query={}&language=it-IT",
        urlencoding::encode(title)
    );

    let resp: SearchTvResponse = client.get(&url).send().map_err(|e| e.to_string())?.json().map_err(|e| e.to_string())?;

    let matched = resp
        .results
        .into_iter()
        .find(|r| titles_match(title, &r.name));
    let Some(m) = matched else {
        return Ok(None);
    };

    let detail_url = format!(
        "https://api.themoviedb.org/3/tv/{}?api_key={api_key}&language=it-IT",
        m.id
    );
    let detail: TvDetail = client
        .get(&detail_url)
        .send()
        .map_err(|e| e.to_string())?
        .json()
        .map_err(|e| e.to_string())?;

    Ok(Some(EnrichResult {
        tmdb_id: m.id,
        tmdb_type: "tv".into(),
        description: detail.overview.or(m.overview),
        year: year.or(year_from_date(&m.first_air_date)),
        genres_json: genres_to_json(&detail.genres.or(m.genres)),
        runtime_mins: detail
            .episode_run_time
            .as_ref()
            .and_then(|r| r.first().copied())
            .or(m.episode_run_time.as_ref().and_then(|r| r.first().copied())),
        poster_path: detail.poster_path.or(m.poster_path),
    }))
}

fn download_poster(
    _api_key: &str,
    media_root: &Path,
    media_id: &str,
    poster_path: &str,
) -> Result<String, String> {
    let url = format!("https://image.tmdb.org/t/p/w500{poster_path}");
    let bytes = client()?
        .get(&url)
        .send()
        .map_err(|e| e.to_string())?
        .bytes()
        .map_err(|e| e.to_string())?;

    let posters_dir = media_root.join(".posters");
    std::fs::create_dir_all(&posters_dir).map_err(|e| e.to_string())?;
    let dest = posters_dir.join(format!("{media_id}.jpg"));
    std::fs::write(&dest, &bytes).map_err(|e| e.to_string())?;
    Ok(dest.to_string_lossy().to_string())
}

pub fn enrich_pending_media(db: &Database, media_root: &Path, limit: usize) -> Result<usize, String> {
    let api_key = db.get_meta(META_TMDB_API_KEY)?.unwrap_or_default();
    if api_key.trim().is_empty() {
        return Ok(0);
    }

    let pending = db.list_media_without_tmdb(limit)?;
    let mut enriched = 0;

    for item in pending {
        if enrich_media(
            &api_key,
            media_root,
            &item.id,
            &item.title,
            &item.media_type,
            item.year,
            item.series_title.as_deref(),
            db,
        )?
        .is_some()
        {
            enriched += 1;
        }
        thread::sleep(Duration::from_millis(250));
    }

    Ok(enriched)
}

pub fn try_import_sidecar(video_path: &Path, media_root: &Path, media_id: &str) -> Option<(String, Option<String>)> {
    let dir = video_path.parent()?;
    let stem = video_path.file_stem()?.to_string_lossy();

    let poster_src = ["poster.jpg", "folder.jpg", "cover.jpg"]
        .iter()
        .map(|name| dir.join(name))
        .chain([dir.join(format!("{stem}-poster.jpg"))])
        .find(|p| p.exists())?;

    let posters_dir = media_root.join(".posters");
    std::fs::create_dir_all(&posters_dir).ok()?;
    let ext = poster_src.extension().and_then(|e| e.to_str()).unwrap_or("jpg");
    let dest = posters_dir.join(format!("{media_id}.{ext}"));
    std::fs::copy(&poster_src, &dest).ok()?;
    let poster_path = dest.to_string_lossy().to_string();

    let nfo_path = if dir.join(format!("{stem}.nfo")).exists() {
        Some(dir.join(format!("{stem}.nfo")))
    } else if dir.join("movie.nfo").exists() {
        Some(dir.join("movie.nfo"))
    } else {
        None
    };

    let description = nfo_path.and_then(|p| parse_nfo_plot(&p));

    Some((poster_path, description))
}

fn parse_nfo_plot(path: &Path) -> Option<String> {
    let content = std::fs::read_to_string(path).ok()?;
    let plot_re = regex::Regex::new(r"(?i)<plot[^>]*>([^<]+)</plot>").ok()?;
    plot_re
        .captures(&content)
        .and_then(|c| c.get(1))
        .map(|m| m.as_str().trim().to_string())
        .filter(|s| !s.is_empty())
}
