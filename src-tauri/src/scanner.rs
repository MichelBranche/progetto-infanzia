use crate::db::{Database, ScannedMedia};
use crate::models::ScanResult;
use regex::Regex;
use std::collections::hash_map::DefaultHasher;
use std::hash::{Hash, Hasher};
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager};
use walkdir::WalkDir;

pub const META_CUSTOM_MEDIA_ROOT: &str = "custom_media_root";
pub const META_LAST_MEDIA_ROOT: &str = "media_root";

const VIDEO_EXTENSIONS: &[&str] = &["mp4", "mkv", "avi", "mov", "webm", "m4v", "wmv"];

/// Normalizes paths for stable comparisons (slashes, Windows case).
pub fn normalize_path_key(path: &str) -> String {
    let mut normalized = path.trim().replace('/', std::path::MAIN_SEPARATOR_STR);
    #[cfg(windows)]
    {
        normalized = normalized.to_lowercase();
    }
    normalized
}

pub fn path_under_root(file_path: &str, media_root: &Path) -> bool {
    let file_key = normalize_path_key(file_path);
    let root_key = normalize_path_key(&media_root.to_string_lossy());
    if file_key == root_key {
        return true;
    }
    let prefix = format!("{}{}", root_key, std::path::MAIN_SEPARATOR);
    file_key.starts_with(&prefix)
}

fn is_dev_project_root(cwd: &Path) -> bool {
    cwd.join("src-tauri").join("tauri.conf.json").exists()
        || cwd
            .parent()
            .is_some_and(|p| p.join("src-tauri").join("tauri.conf.json").exists())
}

pub fn resolve_media_root(handle: &AppHandle, db: &Database) -> PathBuf {
    if let Ok(Some(custom)) = db.get_meta(META_CUSTOM_MEDIA_ROOT) {
        let trimmed = custom.trim();
        if !trimmed.is_empty() {
            let path = PathBuf::from(trimmed);
            if path.is_dir() {
                return path;
            }
        }
    }

    // Keep using the last library folder that was scanned successfully.
    if let Ok(Some(last)) = db.get_meta(META_LAST_MEDIA_ROOT) {
        let trimmed = last.trim();
        if !trimmed.is_empty() {
            let path = PathBuf::from(trimmed);
            if path.is_dir() {
                return path;
            }
        }
    }

    if let Ok(cwd) = std::env::current_dir() {
        if is_dev_project_root(&cwd) {
            if cwd.join("src-tauri").exists() {
                return cwd.join("media");
            }
            if let Some(parent) = cwd.parent() {
                return parent.join("media");
            }
        }
    }

    handle
        .path()
        .app_data_dir()
        .map(|dir| dir.join("media"))
        .unwrap_or_else(|_| PathBuf::from("media"))
}

pub fn scan_library(db: &Database, media_root: &Path) -> Result<ScanResult, String> {
    std::fs::create_dir_all(media_root.join("film")).ok();
    std::fs::create_dir_all(media_root.join("cartoni")).ok();
    std::fs::create_dir_all(media_root.join("serie")).ok();

    let mut found_paths = Vec::new();
    let mut added = 0;
    let mut updated = 0;

    scan_folder(
        db,
        media_root,
        &media_root.join("film"),
        "film",
        None,
        &mut found_paths,
        &mut added,
        &mut updated,
    )?;
    scan_episodic(
        db,
        media_root,
        &media_root.join("cartoni"),
        "cartone",
        &mut found_paths,
        &mut added,
        &mut updated,
    )?;
    scan_episodic(
        db,
        media_root,
        &media_root.join("serie"),
        "serie",
        &mut found_paths,
        &mut added,
        &mut updated,
    )?;

    let removed = db.remove_missing(&found_paths, media_root)?;
    let total = db.count_media()?;

    db.set_meta("last_scan", &chrono::Utc::now().to_rfc3339())?;
    db.set_meta(META_LAST_MEDIA_ROOT, &media_root.to_string_lossy())?;

    Ok(ScanResult {
        added,
        updated,
        removed,
        total,
    })
}

fn scan_folder(
    db: &Database,
    media_root: &Path,
    folder: &Path,
    media_type: &str,
    series_title: Option<&str>,
    found_paths: &mut Vec<String>,
    added: &mut usize,
    updated: &mut usize,
) -> Result<(), String> {
    if !folder.exists() {
        return Ok(());
    }

    for entry in WalkDir::new(folder)
        .min_depth(1)
        .max_depth(if series_title.is_some() { 3 } else { 1 })
        .into_iter()
        .filter_entry(|e| {
            !e.path()
                .components()
                .any(|c| c.as_os_str().to_string_lossy().starts_with('.'))
        })
        .filter_map(|e| e.ok())
    {
        if !entry.file_type().is_file() {
            continue;
        }

        let path = entry.path();
        if !is_video_file(path) {
            continue;
        }

        if media_type == "serie" {
            continue;
        }

        let item = build_media_item(path, media_type, series_title, None, None)?;
        found_paths.push(normalize_path_key(&item.file_path));
        let is_new = db.upsert_media(&item)?;
        apply_sidecar_if_present(db, media_root, path, &item.id);
        if is_new {
            *added += 1;
        } else {
            *updated += 1;
        }
    }

    Ok(())
}

fn scan_episodic(
    db: &Database,
    media_root: &Path,
    root: &Path,
    media_type: &str,
    found_paths: &mut Vec<String>,
    added: &mut usize,
    updated: &mut usize,
) -> Result<(), String> {
    if !root.exists() {
        return Ok(());
    }

    for series_entry in std::fs::read_dir(root).map_err(|e| e.to_string())? {
        let series_entry = series_entry.map_err(|e| e.to_string())?;
        if !series_entry
            .file_type()
            .map_err(|e| e.to_string())?
            .is_dir()
        {
            if is_video_file(&series_entry.path()) {
                let item = build_media_item(&series_entry.path(), media_type, None, None, None)?;
                found_paths.push(normalize_path_key(&item.file_path));
                let is_new = db.upsert_media(&item)?;
                apply_sidecar_if_present(db, media_root, &series_entry.path(), &item.id);
                if is_new {
                    *added += 1;
                } else {
                    *updated += 1;
                }
            }
            continue;
        }

        let series_name = series_entry.file_name().to_string_lossy().to_string();
        let series_path = series_entry.path();

        for entry in WalkDir::new(&series_path)
            .min_depth(1)
            .into_iter()
            .filter_map(|e| e.ok())
        {
            if !entry.file_type().is_file() || !is_video_file(entry.path()) {
                continue;
            }

            let (season, episode) = parse_season_episode(entry.path(), &series_path);
            let item = build_media_item(
                entry.path(),
                media_type,
                Some(&series_name),
                season,
                episode,
            )?;
            found_paths.push(normalize_path_key(&item.file_path));
            let is_new = db.upsert_media(&item)?;
            apply_sidecar_if_present(db, media_root, entry.path(), &item.id);
            if is_new {
                *added += 1;
            } else {
                *updated += 1;
            }
        }
    }

    Ok(())
}

fn build_media_item(
    path: &Path,
    media_type: &str,
    series_title: Option<&str>,
    season: Option<i32>,
    episode: Option<i32>,
) -> Result<ScannedMedia, String> {
    let file_name = path
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_default();
    let file_path = path.to_string_lossy().to_string();
    let id = path_to_id(&file_path);

    let title = clean_title(&file_name);

    let year = extract_year(&file_name).or_else(|| extract_year(&title));
    let tag = if year.is_some_and(|y| y < 2000) {
        Some("Classico".to_string())
    } else {
        None
    };

    Ok(ScannedMedia {
        id,
        title,
        media_type: media_type.to_string(),
        year,
        file_path,
        file_name,
        description: None,
        tag,
        series_title: series_title.map(str::to_string),
        season,
        episode,
        kid_friendly: media_type == "cartone",
    })
}

fn apply_sidecar_if_present(db: &Database, media_root: &Path, video_path: &Path, media_id: &str) {
    if let Some((poster, description)) =
        crate::tmdb::try_import_sidecar(video_path, media_root, media_id)
    {
        let _ = db.apply_sidecar_metadata(media_id, &poster, description.as_deref());
    }
}

fn is_video_file(path: &Path) -> bool {
    path.extension()
        .and_then(|e| e.to_str())
        .map(|e| VIDEO_EXTENSIONS.contains(&e.to_lowercase().as_str()))
        .unwrap_or(false)
}

pub fn path_to_id(path: &str) -> String {
    let mut hasher = DefaultHasher::new();
    path.hash(&mut hasher);
    format!("{:016x}", hasher.finish())
}

fn clean_title(file_name: &str) -> String {
    let stem = file_name
        .rsplit_once('.')
        .map(|(s, _)| s)
        .unwrap_or(file_name);

    let re =
        Regex::new(r"(?i)\b(720p|1080p|2160p|4k|bluray|webrip|x264|x265|h264|h265)\b").unwrap();
    let cleaned = re.replace_all(stem, "");

    let re2 = Regex::new(r"(?i)[._-]+").unwrap();
    let cleaned = re2.replace_all(&cleaned, " ");

    let re3 = Regex::new(r"(?i)^\s*s\d{1,2}e\d{1,2}\s*[-._\s]*").unwrap();
    let cleaned = re3.replace(&cleaned, "");

    let re4 = Regex::new(r"(?i)^\s*e(?:p(?:isode)?)?\s*\d{1,3}\s*[-._\s]*").unwrap();
    let cleaned = re4.replace(&cleaned, "");

    cleaned
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
        .trim()
        .to_string()
}

fn extract_year(text: &str) -> Option<i32> {
    let re = Regex::new(r"(19|20)\d{2}").ok()?;
    re.find(text).and_then(|m| m.as_str().parse().ok())
}

fn parse_season_episode(path: &Path, series_root: &Path) -> (Option<i32>, Option<i32>) {
    let combined = format!(
        "{} {}",
        path.parent()
            .and_then(|p| p.strip_prefix(series_root).ok())
            .and_then(|p| p.to_str())
            .unwrap_or(""),
        path.file_name().and_then(|n| n.to_str()).unwrap_or("")
    );

    let sxe = Regex::new(r"(?i)s(\d{1,2})e(\d{1,2})").unwrap();
    if let Some(caps) = sxe.captures(&combined) {
        return (
            caps.get(1).and_then(|m| m.as_str().parse().ok()),
            caps.get(2).and_then(|m| m.as_str().parse().ok()),
        );
    }

    let season_re = Regex::new(r"(?i)(?:season|stagione)\s*(\d{1,2})").unwrap();
    let season = season_re
        .captures(&combined)
        .and_then(|c| c.get(1))
        .and_then(|m| m.as_str().parse().ok());

    let ep_re = Regex::new(r"(?i)(?:^|[\s._-])(\d{1,3})(?:[\s._-]|$)").unwrap();
    let episode = ep_re
        .captures(path.file_stem().and_then(|s| s.to_str()).unwrap_or(""))
        .and_then(|c| c.get(1))
        .and_then(|m| m.as_str().parse().ok());

    (season, episode)
}
