use crate::db::{series_poster_id, Database};
use crate::models::MediaItem;
use crate::scanner::path_to_id;
use serde::Deserialize;
use std::path::{Path, PathBuf};

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AddMediaInput {
    pub media_type: String,
    pub title: String,
    pub description: Option<String>,
    pub series_title: Option<String>,
    pub season: Option<i32>,
    pub episode: Option<i32>,
    pub video_source_path: String,
    pub poster_source_path: Option<String>,
    pub series_poster_source_path: Option<String>,
    pub tag: Option<String>,
    pub kid_friendly: Option<bool>,
    pub streaming_services: Option<Vec<String>>,
}

const VIDEO_EXTENSIONS: &[&str] = &["mp4", "mkv", "avi", "mov", "webm", "m4v", "wmv"];
const IMAGE_EXTENSIONS: &[&str] = &["png", "jpg", "jpeg", "webp", "gif"];

pub fn add_media(
    db: &Database,
    media_root: &Path,
    profile_id: &str,
    input: AddMediaInput,
) -> Result<MediaItem, String> {
    validate_input(&input)?;

    let video_src = PathBuf::from(&input.video_source_path);
    if !video_src.exists() {
        return Err("File video non trovato".into());
    }

    let video_ext = extension_lower(&video_src).ok_or("Formato video non supportato")?;
    if !VIDEO_EXTENSIONS.contains(&video_ext.as_str()) {
        return Err("Formato video non supportato".into());
    }

    let dest_video = build_video_destination(media_root, &input, &video_ext)?;

    if let Some(parent) = dest_video.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }

    std::fs::copy(&video_src, &dest_video).map_err(|e| format!("Copia video fallita: {e}"))?;

    let file_path = dest_video.to_string_lossy().to_string();
    let file_name = dest_video
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_default();
    let id = path_to_id(&file_path);
    let display_title = input.title.trim().to_string();
    let poster_dest = copy_poster(media_root, &id, &input)?;
    copy_series_poster(db, media_root, &input)?;

    let kid_friendly = input.kid_friendly.unwrap_or(input.media_type == "cartone");
    let streaming_json = input
        .streaming_services
        .as_ref()
        .and_then(|services| serde_json::to_string(services).ok());

    db.insert_manual_media(
        &id,
        &display_title,
        &input.media_type,
        &file_path,
        &file_name,
        input.description.as_deref(),
        input.tag.as_deref().map(str::trim).filter(|t| !t.is_empty()),
        input.series_title.as_deref(),
        input.season,
        input.episode,
        poster_dest.as_deref(),
        kid_friendly,
        streaming_json.as_deref(),
    )?;

    db.get_media_by_id(profile_id, &id)?
        .ok_or_else(|| "Errore dopo l'inserimento".to_string())
}

fn validate_input(input: &AddMediaInput) -> Result<(), String> {
    if input.title.trim().is_empty() {
        return Err("Il titolo è obbligatorio".into());
    }

    match input.media_type.as_str() {
        "film" | "cartone" | "serie" => {}
        _ => return Err("Tipologia non valida".into()),
    }

    if input.media_type == "serie" {
        let has_series = input
            .series_title
            .as_ref()
            .is_some_and(|s| !s.trim().is_empty());
        if !has_series {
            return Err("Per le serie TV indica il nome della serie".into());
        }
    }

    if input.media_type == "cartone" && episodic_content(input) {
        let has_series = input
            .series_title
            .as_ref()
            .is_some_and(|s| !s.trim().is_empty());
        if !has_series {
            return Err("Per gli episodi di cartoni indica il nome della serie".into());
        }
    }

    Ok(())
}

fn episodic_content(input: &AddMediaInput) -> bool {
    input.season.is_some() || input.episode.is_some()
}

fn build_video_destination(
    media_root: &Path,
    input: &AddMediaInput,
    ext: &str,
) -> Result<PathBuf, String> {
    let safe_title = sanitize_filename(&input.title);

    let dest = match input.media_type.as_str() {
        "film" => media_root.join("film").join(format!("{safe_title}.{ext}")),
        "cartone" if episodic_content(input) => build_episodic_path(
            media_root.join("cartoni"),
            input,
            &safe_title,
            ext,
        )?,
        "cartone" => media_root.join("cartoni").join(format!("{safe_title}.{ext}")),
        "serie" => build_episodic_path(
            media_root.join("serie"),
            input,
            &safe_title,
            ext,
        )?,
        _ => unreachable!(),
    };

    if dest.exists() {
        return Err("Esiste già un file con questo nome nella libreria".into());
    }

    Ok(dest)
}

fn build_episodic_path(
    type_root: PathBuf,
    input: &AddMediaInput,
    safe_title: &str,
    ext: &str,
) -> Result<PathBuf, String> {
    let series_name = input
        .series_title
        .as_ref()
        .map(|s| sanitize_filename(s))
        .filter(|s| !s.is_empty())
        .ok_or("Nome serie obbligatorio per contenuti episodici")?;

    let mut base = type_root.join(&series_name);

    if let Some(season) = input.season {
        base = base.join(format!("Stagione {season:02}"));
    }

    let filename = match (input.season, input.episode) {
        (Some(s), Some(e)) => format!("S{s:02}E{e:02} - {safe_title}.{ext}"),
        (None, Some(e)) => format!("Ep{e:02} - {safe_title}.{ext}"),
        _ => format!("{safe_title}.{ext}"),
    };

    Ok(base.join(filename))
}

fn is_library_poster(media_root: &Path, path: &Path) -> bool {
    let Ok(posters_root) = std::fs::canonicalize(media_root.join(".posters")) else {
        return false;
    };
    let Ok(canonical) = std::fs::canonicalize(path) else {
        return false;
    };
    canonical.starts_with(&posters_root)
}

fn copy_poster(
    media_root: &Path,
    media_id: &str,
    input: &AddMediaInput,
) -> Result<Option<String>, String> {
    let Some(poster_src_path) = &input.poster_source_path else {
        return Ok(None);
    };

    let poster_src = PathBuf::from(poster_src_path);
    if !poster_src.exists() {
        return Err("File copertina non trovato".into());
    }

    let ext = extension_lower(&poster_src).ok_or("Formato immagine non supportato")?;
    if !IMAGE_EXTENSIONS.contains(&ext.as_str()) {
        return Err("Formato immagine non supportato".into());
    }

    let posters_dir = media_root.join(".posters");
    std::fs::create_dir_all(&posters_dir).map_err(|e| e.to_string())?;

    if is_library_poster(media_root, &poster_src) {
        return Ok(Some(poster_src.to_string_lossy().to_string()));
    }

    let dest = posters_dir.join(format!("{media_id}.{ext}"));
    std::fs::copy(&poster_src, &dest).map_err(|e| format!("Copia copertina fallita: {e}"))?;

    Ok(Some(dest.to_string_lossy().to_string()))
}

fn copy_series_poster(
    db: &Database,
    media_root: &Path,
    input: &AddMediaInput,
) -> Result<(), String> {
    let Some(series_title) = input
        .series_title
        .as_ref()
        .map(|s| s.trim())
        .filter(|s| !s.is_empty())
    else {
        return Ok(());
    };

    if input.media_type != "serie" && input.media_type != "cartone" {
        return Ok(());
    }

    let Some(poster_src_path) = &input.series_poster_source_path else {
        return Ok(());
    };

    let poster_src = PathBuf::from(poster_src_path);
    if !poster_src.exists() {
        return Err("File copertina serie non trovato".into());
    }

    let ext = extension_lower(&poster_src).ok_or("Formato immagine non supportato")?;
    if !IMAGE_EXTENSIONS.contains(&ext.as_str()) {
        return Err("Formato immagine non supportato".into());
    }

    let posters_dir = media_root.join(".posters").join("series");
    std::fs::create_dir_all(&posters_dir).map_err(|e| e.to_string())?;

    let sp_id = series_poster_id(&input.media_type, series_title);

    if is_library_poster(media_root, &poster_src) {
        let reused = poster_src.to_string_lossy().to_string();
        db.upsert_series_poster(&input.media_type, series_title, &reused)?;
        return Ok(());
    }

    let dest = posters_dir.join(format!("{sp_id}.{ext}"));
    std::fs::copy(&poster_src, &dest).map_err(|e| format!("Copia copertina serie fallita: {e}"))?;

    db.upsert_series_poster(
        &input.media_type,
        series_title,
        &dest.to_string_lossy(),
    )?;

    Ok(())
}

fn sanitize_filename(name: &str) -> String {
    let invalid = ['<', '>', ':', '"', '/', '\\', '|', '?', '*'];
    let mut result: String = name
        .chars()
        .map(|c| if invalid.contains(&c) { '_' } else { c })
        .collect();
    result = result.split_whitespace().collect::<Vec<_>>().join(" ");
    if result.len() > 120 {
        result.truncate(120);
    }
    result.trim().to_string()
}

fn extension_lower(path: &Path) -> Option<String> {
    path.extension()?.to_str().map(|e| e.to_lowercase())
}
