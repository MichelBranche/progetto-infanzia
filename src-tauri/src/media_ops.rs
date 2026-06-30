use crate::db::Database;
use crate::models::MediaItem;
use serde::Deserialize;
use std::path::Path;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateMediaInput {
    pub title: Option<String>,
    pub description: Option<String>,
    pub series_title: Option<String>,
    pub season: Option<i32>,
    pub episode: Option<i32>,
    pub tag: Option<String>,
    pub kid_friendly: Option<bool>,
    pub streaming_services: Option<Vec<String>>,
}

pub fn update_media(
    db: &Database,
    profile_id: &str,
    id: &str,
    input: UpdateMediaInput,
) -> Result<MediaItem, String> {
    if input.title.as_ref().is_some_and(|t| t.trim().is_empty()) {
        return Err("Il titolo non può essere vuoto".into());
    }

    db.update_media_metadata(
        id,
        input.title.as_deref().map(str::trim),
        input.description.as_deref().map(str::trim),
        input.tag.as_deref().map(str::trim),
        input.series_title.as_deref().map(str::trim),
        input.season,
        input.episode,
        input.kid_friendly,
        input.streaming_services.as_deref(),
    )?;

    db.get_media_by_id(profile_id, id)?
        .ok_or_else(|| "Media non trovato".into())
}

pub fn delete_media(db: &Database, media_root: &Path, id: &str) -> Result<(), String> {
    let (file_path, poster_path) = db.get_media_files(id)?;

    db.delete_media_row(id)?;

    let file = Path::new(&file_path);
    if file.exists() {
        std::fs::remove_file(file).map_err(|e| format!("Eliminazione video fallita: {e}"))?;
    }

    if let Some(poster) = poster_path {
        let poster_path = Path::new(&poster);
        if poster_path.exists() {
            let _ = std::fs::remove_file(poster_path);
        }
    }

    let _ = media_root;
    Ok(())
}
