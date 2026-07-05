use crate::db::Database;
use crate::stremio::{PlayableStream, StremioMeta};
use crate::youtube_catalog;

pub fn fetch_title_meta(db: &Database, playlist_id: &str) -> Result<StremioMeta, String> {
    let series = youtube_catalog::get_series(db, playlist_id)
        .ok_or_else(|| "Serie YouTube non trovata".to_string())?;
    let videos = youtube_catalog::videos_for_series(db, playlist_id);
    Ok(StremioMeta {
        id: series.playlist_id.clone(),
        r#type: "series".to_string(),
        name: series.name.clone(),
        poster: series.poster.clone(),
        background: series.poster.clone(),
        description: series.description.clone(),
        release_info: Some("YouTube".to_string()),
        genres: vec![
            "Animazione".to_string(),
            "Educational".to_string(),
            "Cartoni".to_string(),
        ],
        videos,
        runtime: None,
        logo: None,
        rating: None,
        cast: Vec::new(),
        directors: Vec::new(),
        view_count: None,
        quality: None,
        has_preview: false,
        season_numbers: Vec::new(),
    })
}

pub fn resolve_playback(
    _db: &Database,
    _playlist_id: &str,
    video_id: &str,
) -> Result<PlayableStream, String> {
    let trimmed = video_id.trim();
    if trimmed.is_empty() {
        return Err("Video YouTube non specificato".into());
    }
    Ok(PlayableStream {
        url: youtube_catalog::youtube_embed_url(trimmed),
        name: Some("YouTube".to_string()),
        description: None,
        addon_id: "youtube".to_string(),
        addon_name: "YouTube".to_string(),
        is_hls: false,
        proxied: false,
        needs_debrid: false,
        info_hash: None,
        file_idx: None,
        sources: Vec::new(),
    })
}
