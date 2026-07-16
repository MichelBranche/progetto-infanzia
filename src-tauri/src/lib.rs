mod addon_proxy;
mod achievements;
mod cast;
mod catalog_search;
mod smart_search;
pub mod db;
mod debrid;
mod dev_admin;
mod html_text;
mod image_palette;
mod friend_presence;
mod import_media;
mod media_ops;
mod models;
mod network;
mod parental;
mod profiles;
mod profile_avatar;
mod loonex_catalog;
mod loonex_playback;
mod mangadex;
mod welib;
mod youtube_catalog;
mod youtube_playback;
mod saturn_catalog;
mod saturn_playback;
pub mod sc_catalog;
mod sc_playback;
pub mod sc_proxy;
mod vix_embed;
mod scanner;
mod settings;
mod stream;
mod stremio;
mod tmdb;
mod torrent;
mod transcode;
mod watch_party;
mod watcher;
mod web_invoke;

use addon_proxy::AddonProxyRegistry;
use db::Database;
use debrid::DebridConfig;
use import_media::{add_media, AddMediaInput};
use media_ops::{delete_media, update_media, UpdateMediaInput};
use models::{
    CastDevice, CastPosition, FriendRecord, Library, MediaCollection, MediaItem, PosterAsset,
    ScanResult, StreamInfo,
};
use parental::{CanPlayResult, ProfileLimits, UpdateProfileLimitsInput, WatchSession};
use profiles::{CreateProfileInput, Profile, UpdateProfileInput};
use scanner::{resolve_media_root, scan_library};
use serde::Deserialize;
use settings::{AppSettings, UpdateSettingsInput};
use std::collections::{HashMap, HashSet};
use std::sync::Arc;
use stremio::{
    fetch_catalog, fetch_manifest, fetch_meta, fetch_streams, has_resource, raw_to_playable,
    InstalledAddon, PlayableStream, StreamingContinueItem, StreamingEpisodeProgress,
    StreamingWatchProgressInput,
    StremioMeta, StremioMetaPreview,
};
use tauri::{AppHandle, Manager, State};
use torrent::TorrentEngine;
use friend_presence::{
    new_presence_registry, set_device_presence, DevicePresence, LanFriendPresence,
    PresenceRegistry,
};
use watch_party::{WatchPartyContent, WatchPartyRegistry, WatchPartyRoomInfo};

pub struct AppState {
    db: Arc<Database>,
    media_root: parking_lot::RwLock<std::path::PathBuf>,
    addon_proxy: Arc<AddonProxyRegistry>,
    torrent: Arc<TorrentEngine>,
    watch_party: Arc<WatchPartyRegistry>,
    presence: PresenceRegistry,
}

fn build_library(
    db: &Database,
    media_root: &std::path::Path,
    profile_id: &str,
) -> Result<Library, String> {
    let items = db.get_all_media(profile_id)?;
    let total_count = items.len();
    let last_scan = db.get_meta("last_scan")?;

    let featured = pick_featured(&items);
    let collections = build_collections(&items);

    Ok(Library {
        items,
        collections,
        featured,
        media_root: media_root.to_string_lossy().to_string(),
        total_count,
        last_scan,
    })
}

fn pick_featured(items: &[MediaItem]) -> Option<MediaItem> {
    items
        .iter()
        .find(|i| {
            i.watch_position.unwrap_or(0.0) > 0.0
                && i.watch_duration.is_some_and(|d| {
                    let pos = i.watch_position.unwrap_or(0.0);
                    pos / d < 0.9
                })
        })
        .or_else(|| {
            let mut films: Vec<_> = items.iter().filter(|i| i.media_type == "film").collect();
            films.sort_by(|a, b| b.created_at.cmp(&a.created_at));
            films.first().copied()
        })
        .or_else(|| items.first())
        .cloned()
}

fn newest_first(mut items: Vec<MediaItem>) -> Vec<MediaItem> {
    items.sort_by(|a, b| b.created_at.cmp(&a.created_at));
    items
}

fn take(items: Vec<MediaItem>, limit: usize) -> Vec<MediaItem> {
    items.into_iter().take(limit).collect()
}

fn never_watched(item: &MediaItem) -> bool {
    item.watch_position.unwrap_or(0.0) < 5.0
}

fn push_collection(
    collections: &mut Vec<MediaCollection>,
    id: &str,
    title: &str,
    subtitle: &str,
    items: Vec<MediaItem>,
) {
    if items.is_empty() {
        return;
    }
    collections.push(MediaCollection {
        id: id.into(),
        title: title.into(),
        subtitle: subtitle.into(),
        items,
    });
}

fn build_collections(items: &[MediaItem]) -> Vec<MediaCollection> {
    let mut collections = Vec::new();
    if items.is_empty() {
        return collections;
    }

    let newest = newest_first(items.to_vec());

    let mut continue_watching: Vec<MediaItem> = items
        .iter()
        .filter(|i| {
            let pos = i.watch_position.unwrap_or(0.0);
            if pos <= 5.0 {
                return false;
            }
            let dur = i.watch_duration.unwrap_or(0.0);
            if dur <= 0.0 {
                return true;
            }
            pos / dur < 0.92
        })
        .cloned()
        .collect();

    continue_watching.sort_by(|a, b| {
        let a_ts = a.watch_updated_at.as_deref().unwrap_or("");
        let b_ts = b.watch_updated_at.as_deref().unwrap_or("");
        b_ts.cmp(a_ts)
    });

    push_collection(
        &mut collections,
        "continue",
        "Continua a guardare",
        "Riprendi da dove eri rimasto",
        continue_watching,
    );

    push_collection(
        &mut collections,
        "new-films",
        "Nuovi film",
        "Appena aggiunti alla libreria",
        take(
            newest
                .iter()
                .filter(|i| i.media_type == "film")
                .cloned()
                .collect(),
            15,
        ),
    );

    push_collection(
        &mut collections,
        "new-episodes",
        "Nuovi episodi",
        "Ultimi cartoni e serie TV",
        take(
            newest
                .iter()
                .filter(|i| {
                    (i.media_type == "cartone" || i.media_type == "serie")
                        && i.series_title
                            .as_ref()
                            .is_some_and(|s| !s.trim().is_empty())
                })
                .cloned()
                .collect(),
            15,
        ),
    );

    let mut films: Vec<MediaItem> = items
        .iter()
        .filter(|i| i.media_type == "film")
        .cloned()
        .collect();
    films.sort_by(|a, b| a.title.to_lowercase().cmp(&b.title.to_lowercase()));
    push_collection(
        &mut collections,
        "film",
        "Film",
        "Storie da crescere",
        take(films, 24),
    );

    let mut cartoni: Vec<MediaItem> = items
        .iter()
        .filter(|i| i.media_type == "cartone")
        .cloned()
        .collect();
    cartoni.sort_by(|a, b| a.title.to_lowercase().cmp(&b.title.to_lowercase()));
    push_collection(
        &mut collections,
        "cartoni",
        "Cartoni",
        "Animazione e avventure",
        take(cartoni, 24),
    );

    let mut serie: Vec<MediaItem> = items
        .iter()
        .filter(|i| i.media_type == "serie")
        .cloned()
        .collect();
    serie.sort_by(|a, b| a.title.to_lowercase().cmp(&b.title.to_lowercase()));
    push_collection(
        &mut collections,
        "serie",
        "Serie TV",
        "Un episodio tira l'altro",
        take(serie, 24),
    );

    push_collection(
        &mut collections,
        "discover",
        "Da scoprire",
        "Ancora non visti",
        take(
            items
                .iter()
                .filter(|i| never_watched(i))
                .cloned()
                .collect::<Vec<_>>(),
            15,
        ),
    );

    let favorites: Vec<MediaItem> = items.iter().filter(|i| i.is_favorite).cloned().collect();
    push_collection(
        &mut collections,
        "favorites",
        "La mia lista",
        "Titoli salvati con + per guardarli dopo",
        favorites,
    );

    let dad_picks: Vec<MediaItem> = items
        .iter()
        .filter(|i| i.tag.as_deref() == Some("Consigliato dal papà"))
        .cloned()
        .collect();
    push_collection(
        &mut collections,
        "dad-picks",
        "Consigliato dal papà",
        "Scelti per te dal papà",
        take(dad_picks, 24),
    );

    let mom_picks: Vec<MediaItem> = items
        .iter()
        .filter(|i| i.tag.as_deref() == Some("Consigliato dalla mamma"))
        .cloned()
        .collect();
    push_collection(
        &mut collections,
        "mom-picks",
        "Consigliato dalla mamma",
        "Scelti per te dalla mamma",
        take(mom_picks, 24),
    );

    let classics: Vec<MediaItem> = items
        .iter()
        .filter(|i| i.year.is_some_and(|y| y < 2000) || i.tag.as_deref() == Some("Classico"))
        .cloned()
        .collect();
    push_collection(
        &mut collections,
        "classics",
        "Classici",
        "Capolavori senza tempo",
        take(classics, 15),
    );

    let capsula: Vec<MediaItem> = items
        .iter()
        .filter(|i| i.year.is_some_and(|y| y < 2005))
        .cloned()
        .collect();
    push_collection(
        &mut collections,
        "capsula",
        "Capsula del tempo",
        "Tesori da non dimenticare",
        take(capsula, 15),
    );

    let mut by_tag: std::collections::HashMap<String, Vec<MediaItem>> =
        std::collections::HashMap::new();
    for item in items {
        if let Some(tag) = item.tag.as_ref().filter(|t| !t.trim().is_empty()) {
            if !matches!(
                tag.as_str(),
                "Classico" | "Consigliato dal papà" | "Consigliato dalla mamma"
            ) {
                by_tag.entry(tag.clone()).or_default().push(item.clone());
            }
        }
    }
    let mut tag_names: Vec<String> = by_tag.keys().cloned().collect();
    tag_names.sort_by(|a, b| a.to_lowercase().cmp(&b.to_lowercase()));
    for tag in tag_names {
        if let Some(tag_items) = by_tag.remove(&tag) {
            let id = format!("tag-{}", tag.to_lowercase().replace(' ', "-"));
            push_collection(
                &mut collections,
                &id,
                &tag,
                "Collezione tematica",
                tag_items,
            );
        }
    }

    collections
}

#[tauri::command]
fn get_profiles(state: State<'_, AppState>) -> Result<Vec<Profile>, String> {
    state.db.get_profiles()
}

#[tauri::command]
fn create_profile_cmd(
    state: State<'_, AppState>,
    input: CreateProfileInput,
) -> Result<Profile, String> {
    state.db.create_profile(&input)
}

#[tauri::command]
fn delete_profile_cmd(
    app: AppHandle,
    state: State<'_, AppState>,
    id: String,
) -> Result<(), String> {
    if let Ok(dir) = app.path().app_data_dir() {
        profile_avatar::remove_legacy_avatar_files(&dir.join("profile-avatars"), &id);
    }
    state.db.delete_profile(&id)
}

#[tauri::command]
fn update_profile_cmd(
    app: AppHandle,
    state: State<'_, AppState>,
    id: String,
    input: UpdateProfileInput,
) -> Result<Profile, String> {
    let before = state.db.get_profile(&id)?;
    let profile = state.db.update_profile(&id, &input)?;
    let was_photo = before
        .as_ref()
        .and_then(|p| p.avatar_style.as_deref())
        == Some("photo");
    let is_photo = profile.avatar_style.as_deref() == Some("photo");
    if was_photo && !is_photo {
        let _ = state.db.clear_profile_avatar(&id);
        if let Ok(dir) = app.path().app_data_dir() {
            profile_avatar::remove_legacy_avatar_files(&dir.join("profile-avatars"), &id);
        }
    }
    Ok(profile)
}

#[tauri::command]
fn set_profile_avatar_bytes_cmd(
    state: State<'_, AppState>,
    profile_id: String,
    bytes: Vec<u8>,
) -> Result<Profile, String> {
    profile_avatar::save_profile_avatar_bytes(&state.db, &profile_id, &bytes)?;
    state
        .db
        .get_profile(&profile_id)?
        .ok_or_else(|| "Profilo non trovato".to_string())
}

#[tauri::command]
fn set_profile_avatar_cmd(
    state: State<'_, AppState>,
    profile_id: String,
    source_path: String,
) -> Result<Profile, String> {
    profile_avatar::save_profile_avatar_from_file(&state.db, &profile_id, &source_path)?;
    state
        .db
        .get_profile(&profile_id)?
        .ok_or_else(|| "Profilo non trovato".to_string())
}

#[tauri::command]
fn get_profile_avatar_data_url_cmd(
    state: State<'_, AppState>,
    profile_id: String,
) -> Result<Option<String>, String> {
    let bytes = state.db.get_profile_avatar_jpeg(&profile_id)?;
    Ok(bytes.as_deref().map(profile_avatar::profile_avatar_data_url))
}

#[tauri::command]
fn verify_profile_pin_cmd(
    state: State<'_, AppState>,
    id: String,
    pin: String,
) -> Result<bool, String> {
    state.db.verify_profile_pin(&id, &pin)
}

#[tauri::command]
fn set_profile_pin_cmd(
    state: State<'_, AppState>,
    profile_id: String,
    pin: String,
    current_pin: Option<String>,
) -> Result<(), String> {
    if !state.db.is_parent_profile(&profile_id)? {
        return Err("Solo il profilo genitore può impostare un PIN".into());
    }
    state
        .db
        .set_profile_pin(&profile_id, &pin, current_pin.as_deref())
}

#[tauri::command]
fn remove_profile_pin_cmd(
    state: State<'_, AppState>,
    profile_id: String,
    current_pin: String,
) -> Result<(), String> {
    state.db.remove_profile_pin(&profile_id, &current_pin)
}

#[tauri::command]
fn get_settings_cmd(state: State<'_, AppState>) -> Result<AppSettings, String> {
    state.db.get_settings(state.media_root.read().as_path())
}

#[tauri::command]
fn update_settings_cmd(
    state: State<'_, AppState>,
    profile_id: String,
    input: UpdateSettingsInput,
) -> Result<AppSettings, String> {
    if !state.db.is_parent_profile(&profile_id)? {
        return Err("Solo il profilo genitore può modificare le impostazioni".into());
    }
    state.db.update_settings(&input)?;
    let settings = state.db.get_settings(state.media_root.read().as_path())?;
    // Applica subito il proxy SC senza riavviare l'app (solo desktop).
    sc_proxy::set_sc_proxy(if settings.sc_proxy_enabled {
        Some(settings.sc_proxy_url.clone())
    } else {
        None
    });
    Ok(settings)
}

#[tauri::command]
fn set_media_root_cmd(state: State<'_, AppState>, path: String) -> Result<ScanResult, String> {
    let path = path.trim();
    if path.is_empty() {
        return Err("Percorso cartella non valido".into());
    }
    let root = std::path::PathBuf::from(path);
    if !root.is_dir() {
        return Err("La cartella selezionata non esiste".into());
    }
    state
        .db
        .set_meta(scanner::META_CUSTOM_MEDIA_ROOT, &root.to_string_lossy())?;
    *state.media_root.write() = root;
    scan_library(&state.db, state.media_root.read().as_path())
}

#[tauri::command]
fn can_play_media_cmd(
    state: State<'_, AppState>,
    profile_id: String,
    media_id: String,
) -> Result<CanPlayResult, String> {
    state.db.can_play_media(&profile_id, &media_id)
}

#[tauri::command]
fn get_profile_limits_cmd(
    state: State<'_, AppState>,
    profile_id: String,
) -> Result<ProfileLimits, String> {
    state.db.get_profile_limits(&profile_id)
}

#[tauri::command]
fn update_profile_limits_cmd(
    state: State<'_, AppState>,
    parent_profile_id: String,
    child_profile_id: String,
    input: UpdateProfileLimitsInput,
) -> Result<ProfileLimits, String> {
    if !state.db.is_parent_profile(&parent_profile_id)? {
        return Err("Solo il profilo genitore può modificare i limiti".into());
    }
    state.db.update_profile_limits(&child_profile_id, &input)
}

#[tauri::command]
fn get_watch_history_cmd(
    state: State<'_, AppState>,
    parent_profile_id: String,
    child_profile_id: String,
    limit: Option<usize>,
) -> Result<Vec<WatchSession>, String> {
    if !state.db.is_parent_profile(&parent_profile_id)? {
        return Err("Solo il profilo genitore può vedere la cronologia".into());
    }
    state
        .db
        .get_watch_history(&child_profile_id, limit.unwrap_or(50))
}

#[tauri::command]
fn dev_local_dashboard_cmd(state: State<'_, AppState>) -> Result<dev_admin::DevLocalDashboard, String> {
    dev_admin::local_dashboard(state.db.as_ref())
}

#[tauri::command]
fn start_watch_session_cmd(
    state: State<'_, AppState>,
    profile_id: String,
    media_id: String,
) -> Result<String, String> {
    state.db.start_watch_session(&profile_id, &media_id)
}

#[tauri::command]
fn update_watch_session_cmd(
    state: State<'_, AppState>,
    session_id: String,
    seconds_watched: i32,
) -> Result<(), String> {
    state.db.update_watch_session(&session_id, seconds_watched)
}

#[tauri::command]
fn end_watch_session_cmd(
    state: State<'_, AppState>,
    session_id: String,
    completed: bool,
) -> Result<Vec<achievements::AchievementUnlock>, String> {
    let session = state.db.get_watch_session_completion(&session_id)?;
    state.db.end_watch_session(&session_id, completed)?;
    if !completed {
        return Ok(Vec::new());
    }
    let Some((profile_id, media_id, title, source_kind)) = session else {
        return Ok(Vec::new());
    };
    achievements::record_completion(
        &state.db,
        &profile_id,
        &format!("{source_kind}:{media_id}"),
        source_kind.as_str(),
        &title,
        0,
    )
}

#[tauri::command]
fn get_achievements_state_cmd(
    state: State<'_, AppState>,
    profile_id: String,
    cloud_friends_count: Option<i32>,
) -> Result<achievements::ProfileAchievementsState, String> {
    achievements::get_state(
        &state.db,
        &profile_id,
        cloud_friends_count.unwrap_or(0),
    )
}

#[tauri::command]
fn sync_achievements_cmd(
    state: State<'_, AppState>,
    profile_id: String,
    cloud_friends_count: Option<i32>,
) -> Result<Vec<achievements::AchievementUnlock>, String> {
    achievements::sync_profile(
        &state.db,
        &profile_id,
        cloud_friends_count.unwrap_or(0),
    )
}

#[tauri::command]
fn record_completion_cmd(
    state: State<'_, AppState>,
    profile_id: String,
    completion_key: String,
    kind: String,
    title: String,
    cloud_friends_count: Option<i32>,
) -> Result<Vec<achievements::AchievementUnlock>, String> {
    achievements::record_completion(
        &state.db,
        &profile_id,
        &completion_key,
        &kind,
        &title,
        cloud_friends_count.unwrap_or(0),
    )
}

#[tauri::command]
fn install_addon_cmd(
    state: State<'_, AppState>,
    parent_profile_id: String,
    manifest_url: String,
) -> Result<InstalledAddon, String> {
    if !state.db.is_parent_profile(&parent_profile_id)? {
        return Err("Solo il profilo genitore può installare addon".into());
    }
    let (transport, manifest) = fetch_manifest(&manifest_url)?;
    state.db.install_addon(&manifest_url, &transport, &manifest)
}

#[tauri::command]
fn remove_addon_cmd(
    state: State<'_, AppState>,
    parent_profile_id: String,
    addon_row_id: String,
) -> Result<(), String> {
    if !state.db.is_parent_profile(&parent_profile_id)? {
        return Err("Solo il profilo genitore può rimuovere addon".into());
    }
    state.db.remove_addon(&addon_row_id)
}

#[tauri::command]
fn list_addons_cmd(
    state: State<'_, AppState>,
    profile_id: String,
) -> Result<Vec<InstalledAddon>, String> {
    state.db.list_addons_for_profile(&profile_id)
}

#[tauri::command]
fn list_all_addons_cmd(
    state: State<'_, AppState>,
    parent_profile_id: String,
) -> Result<Vec<InstalledAddon>, String> {
    if !state.db.is_parent_profile(&parent_profile_id)? {
        return Err("Solo il profilo genitore può gestire tutti gli addon".into());
    }
    state.db.list_installed_addons()
}

#[tauri::command]
fn set_addon_enabled_cmd(
    state: State<'_, AppState>,
    parent_profile_id: String,
    addon_row_id: String,
    enabled: bool,
) -> Result<(), String> {
    if !state.db.is_parent_profile(&parent_profile_id)? {
        return Err("Solo il profilo genitore può modificare gli addon".into());
    }
    state.db.set_addon_enabled(&addon_row_id, enabled)
}

#[tauri::command]
fn fetch_addon_catalog_cmd(
    state: State<'_, AppState>,
    profile_id: String,
    addon_row_id: String,
    content_type: String,
    catalog_id: String,
    extra: Option<HashMap<String, String>>,
) -> Result<Vec<StremioMetaPreview>, String> {
    let check = state.db.can_play_addon(&profile_id, &addon_row_id)?;
    if !check.allowed {
        return Err(check
            .reason
            .unwrap_or_else(|| "Addon non autorizzato".into()));
    }
    let addon = state
        .db
        .get_installed_addon(&addon_row_id)?
        .ok_or_else(|| String::from("Addon non trovato"))?;
    fetch_catalog(
        &addon.transport_url,
        &content_type,
        &catalog_id,
        &extra.unwrap_or_default(),
    )
}

#[tauri::command]
fn fetch_addon_meta_cmd(
    state: State<'_, AppState>,
    profile_id: String,
    content_type: String,
    meta_id: String,
) -> Result<StremioMeta, String> {
    let addons = state.db.list_addons_for_profile(&profile_id)?;
    for addon in addons {
        if has_resource(&addon, "meta") {
            if let Ok(meta) = fetch_meta(&addon.transport_url, &content_type, &meta_id) {
                return Ok(meta);
            }
        }
    }
    Err("Metadati non trovati su nessun addon installato".into())
}

#[tauri::command]
fn resolve_addon_streams_cmd(
    state: State<'_, AppState>,
    profile_id: String,
    content_type: String,
    video_id: String,
) -> Result<Vec<PlayableStream>, String> {
    let addons = state.db.list_addons_for_profile(&profile_id)?;
    let mut all = Vec::new();
    for addon in addons {
        if !has_resource(&addon, "stream") {
            continue;
        }
        let check = state.db.can_play_addon(&profile_id, &addon.id)?;
        if !check.allowed {
            continue;
        }
        if let Ok(raw) = fetch_streams(&addon.transport_url, &content_type, &video_id) {
            let playable =
                raw_to_playable(raw, &addon.addon_id, &addon.name, Some(&state.addon_proxy));
            // Torrent streams are always playable: via debrid if configured,
            // otherwise through the built-in torrent engine.
            all.extend(playable);
        }
    }
    Ok(all)
}

async fn fetch_saturn_catalog_fast(
    db: Arc<crate::db::Database>,
) -> Option<saturn_catalog::SaturnCatalogResponse> {
    let task = tokio::task::spawn_blocking(move || saturn_catalog::fetch_catalog(db.as_ref()));
    match tokio::time::timeout(std::time::Duration::from_secs(12), task).await {
        Ok(Ok(Ok(response))) => Some(response),
        _ => None,
    }
}

async fn fetch_loonex_catalog_fast(
    db: Arc<crate::db::Database>,
) -> Option<loonex_catalog::LoonexCatalogResponse> {
    let task = tokio::task::spawn_blocking(move || loonex_catalog::fetch_catalog(db.as_ref()));
    match tokio::time::timeout(std::time::Duration::from_secs(20), task).await {
        Ok(Ok(Ok(response))) => Some(response),
        _ => None,
    }
}

fn merge_external_catalog(
    response: &mut sc_catalog::ScCatalogResponse,
    rows: Vec<sc_catalog::ScCatalogRow>,
    index: Vec<StremioMetaPreview>,
    synced_at: i64,
) {
    response.rows.extend(rows);
    let mut seen: HashSet<String> = response
        .index
        .iter()
        .map(|p| {
            format!(
                "{}:{}:{}",
                p.catalog_prefix.as_deref().unwrap_or("sc"),
                p.r#type,
                p.id
            )
        })
        .collect();
    for item in index {
        let key = format!(
            "{}:{}:{}",
            item.catalog_prefix.as_deref().unwrap_or("sc"),
            item.r#type,
            item.id
        );
        if seen.insert(key) {
            response.index.push(item);
        }
    }
    response.synced_at = response.synced_at.max(synced_at);
    response.total_count = response.index.len();
}

async fn fetch_youtube_catalog_fast(
    db: Arc<crate::db::Database>,
) -> Option<youtube_catalog::YoutubeCatalogResponse> {
    let task = tokio::task::spawn_blocking(move || youtube_catalog::fetch_catalog(db.as_ref()));
    match tokio::time::timeout(std::time::Duration::from_secs(30), task).await {
        Ok(Ok(Ok(response))) => Some(response),
        _ => None,
    }
}

#[tauri::command]
async fn fetch_sc_catalog_cmd(
    state: State<'_, AppState>,
) -> Result<sc_catalog::ScCatalogResponse, String> {
    let sc_enabled = sc_catalog::catalog_enabled(&state.db);
    let saturn_enabled = saturn_catalog::enabled(&state.db);
    let loonex_enabled = loonex_catalog::enabled(&state.db);
    let youtube_enabled = youtube_catalog::enabled(&state.db);
    if !sc_enabled && !saturn_enabled && !loonex_enabled && !youtube_enabled {
        return Ok(sc_catalog::ScCatalogResponse {
            rows: Vec::new(),
            index: Vec::new(),
            synced_at: 0,
            total_count: 0,
            needs_background_sync: false,
        });
    }
    let cdn = sc_catalog::cdn_url(&state.db);
    let locale = sc_catalog::lang(&state.db);
    let db = Arc::clone(&state.db);

    let sc_future = {
        let db = Arc::clone(&db);
        let cdn = cdn.clone();
        let locale = locale.clone();
        async move {
            if !sc_enabled {
                return Ok(sc_catalog::ScCatalogResponse {
                    rows: Vec::new(),
                    index: Vec::new(),
                    synced_at: 0,
                    total_count: 0,
                    needs_background_sync: false,
                });
            }
            tokio::task::spawn_blocking(move || {
                sc_catalog::fetch_catalog(db.as_ref(), "", &cdn, &locale)
            })
            .await
            .map_err(|e| format!("Errore catalogo: {e}"))?
        }
    };

    let saturn_future = async {
        if !saturn_enabled {
            return None;
        }
        match tokio::time::timeout(
            std::time::Duration::from_secs(4),
            fetch_saturn_catalog_fast(Arc::clone(&db)),
        )
        .await
        {
            Ok(result) => result,
            Err(_) => None,
        }
    };

    let loonex_future = async {
        if !loonex_enabled {
            return None;
        }
        match tokio::time::timeout(
            std::time::Duration::from_secs(12),
            fetch_loonex_catalog_fast(Arc::clone(&db)),
        )
        .await
        {
            Ok(result) => result,
            Err(_) => None,
        }
    };

    let youtube_future = async {
        if !youtube_enabled {
            return None;
        }
        match tokio::time::timeout(
            std::time::Duration::from_secs(30),
            fetch_youtube_catalog_fast(Arc::clone(&db)),
        )
        .await
        {
            Ok(result) => result,
            Err(_) => None,
        }
    };

    let (sc_result, saturn, loonex, youtube) =
        tokio::join!(sc_future, saturn_future, loonex_future, youtube_future);
    let mut response = sc_result?;

    if let Some(saturn) = saturn {
        merge_external_catalog(
            &mut response,
            saturn.rows,
            saturn.index,
            saturn.synced_at,
        );
    }
    if let Some(loonex) = loonex {
        merge_external_catalog(
            &mut response,
            loonex.rows,
            loonex.index,
            loonex.synced_at,
        );
    }
    if let Some(youtube) = youtube {
        merge_external_catalog(
            &mut response,
            youtube.rows,
            youtube.index,
            youtube.synced_at,
        );
    }

    if sc_enabled {
        let db_meta = Arc::clone(&state.db);
        sc_catalog::spawn_catalog_boot_maintenance(db_meta);
    }

    Ok(response)
}

#[tauri::command]
async fn browse_saturn_anime_cmd(
    state: State<'_, AppState>,
    offset: usize,
    limit: Option<usize>,
) -> Result<saturn_catalog::SaturnBrowsePage, String> {
    if !saturn_catalog::enabled(&state.db) {
        return Ok(saturn_catalog::SaturnBrowsePage {
            items: Vec::new(),
            total: 0,
            offset,
            has_more: false,
        });
    }
    let db = Arc::clone(&state.db);
    let page_limit = limit.unwrap_or(48).clamp(1, 96);
    browse_saturn_anime_with_timeout(db, offset, page_limit).await
}

async fn browse_saturn_anime_with_timeout(
    db: Arc<crate::db::Database>,
    offset: usize,
    limit: usize,
) -> Result<saturn_catalog::SaturnBrowsePage, String> {
    let task = tokio::task::spawn_blocking(move || {
        saturn_catalog::browse_anime_page(db.as_ref(), offset, limit)
    });
    match tokio::time::timeout(std::time::Duration::from_secs(20), task).await {
        Ok(Ok(result)) => result,
        Ok(Err(e)) => Err(format!("Errore browse anime: {e}")),
        Err(_) => Err("Timeout caricamento anime".into()),
    }
}

#[tauri::command]
async fn fetch_saturn_home_cmd(
    state: State<'_, AppState>,
) -> Result<saturn_catalog::SaturnHomeResponse, String> {
    if !saturn_catalog::enabled(&state.db) {
        return Ok(saturn_catalog::SaturnHomeResponse {
            rows: Vec::new(),
            genres: Vec::new(),
        });
    }
    let db = Arc::clone(&state.db);
    let task = tokio::task::spawn_blocking(move || saturn_catalog::fetch_home(db.as_ref()));
    match tokio::time::timeout(std::time::Duration::from_secs(30), task).await {
        Ok(Ok(result)) => result,
        Ok(Err(e)) => Err(format!("Errore home anime: {e}")),
        Err(_) => Err("Timeout home anime".into()),
    }
}

#[tauri::command]
async fn fetch_saturn_genres_cmd(
    state: State<'_, AppState>,
) -> Result<Vec<saturn_catalog::SaturnGenre>, String> {
    if !saturn_catalog::enabled(&state.db) {
        return Ok(Vec::new());
    }
    let db = Arc::clone(&state.db);
    let task = tokio::task::spawn_blocking(move || saturn_catalog::fetch_genres(db.as_ref()));
    task.await.map_err(|e| format!("Errore generi anime: {e}"))
}

#[tauri::command]
async fn browse_saturn_genre_cmd(
    state: State<'_, AppState>,
    genre_id: String,
    offset: usize,
    limit: Option<usize>,
) -> Result<saturn_catalog::SaturnBrowsePage, String> {
    if !saturn_catalog::enabled(&state.db) {
        return Ok(saturn_catalog::SaturnBrowsePage {
            items: Vec::new(),
            total: 0,
            offset,
            has_more: false,
        });
    }
    let db = Arc::clone(&state.db);
    let page_limit = limit.unwrap_or(48).clamp(1, 96);
    let task = tokio::task::spawn_blocking(move || {
        saturn_catalog::browse_genre(db.as_ref(), &genre_id, offset, page_limit)
    });
    match tokio::time::timeout(std::time::Duration::from_secs(20), task).await {
        Ok(Ok(result)) => result,
        Ok(Err(e)) => Err(format!("Errore genere anime: {e}")),
        Err(_) => Err("Timeout genere anime".into()),
    }
}

#[tauri::command]
async fn refresh_sc_catalog_cmd(
    state: State<'_, AppState>,
) -> Result<sc_catalog::ScCatalogResponse, String> {
    let sc_enabled = sc_catalog::catalog_enabled(&state.db);
    let saturn_enabled = saturn_catalog::enabled(&state.db);
    let loonex_enabled = loonex_catalog::enabled(&state.db);
    let youtube_enabled = youtube_catalog::enabled(&state.db);
    if !sc_enabled && !saturn_enabled && !loonex_enabled && !youtube_enabled {
        return Ok(sc_catalog::ScCatalogResponse {
            rows: Vec::new(),
            index: Vec::new(),
            synced_at: 0,
            total_count: 0,
            needs_background_sync: false,
        });
    }
    let cdn = sc_catalog::cdn_url(&state.db);
    let locale = sc_catalog::lang(&state.db);
    let db = Arc::clone(&state.db);
    let response = tokio::task::spawn_blocking(move || -> Result<sc_catalog::ScCatalogResponse, String> {
        let mut response = if sc_enabled {
            sc_catalog::refresh_catalog_index(db.as_ref(), "", &cdn, &locale)?
        } else {
            sc_catalog::ScCatalogResponse {
                rows: Vec::new(),
                index: Vec::new(),
                synced_at: 0,
                total_count: 0,
                needs_background_sync: false,
            }
        };

        if saturn_enabled {
            let saturn = saturn_catalog::refresh_catalog_index(db.as_ref())?;
            merge_external_catalog(
                &mut response,
                saturn.rows,
                saturn.index,
                saturn.synced_at,
            );
        }

        if loonex_enabled {
            let loonex = loonex_catalog::refresh_catalog_index(db.as_ref())?;
            merge_external_catalog(
                &mut response,
                loonex.rows,
                loonex.index,
                loonex.synced_at,
            );
        }

        if youtube_enabled {
            let youtube = youtube_catalog::refresh_catalog(db.as_ref())?;
            merge_external_catalog(
                &mut response,
                youtube.rows,
                youtube.index,
                youtube.synced_at,
            );
        }

        Ok(response)
    })
    .await
    .map_err(|e| format!("Errore aggiornamento catalogo: {e}"))??;

    if sc_enabled {
        let db_meta = Arc::clone(&state.db);
        sc_catalog::spawn_continuous_metadata_enrichment(db_meta);
    }

    if saturn_enabled {
        let db_bg = Arc::clone(&state.db);
        std::thread::spawn(move || {
            saturn_catalog::enrich_cached_posters(db_bg.as_ref(), 80);
        });
    }

    Ok(response)
}

#[tauri::command]
async fn fetch_sc_meta_cmd(
    state: State<'_, AppState>,
    title_id: i64,
    slug: String,
) -> Result<StremioMeta, String> {
    if !sc_catalog::catalog_enabled(&state.db) {
        return Err("Catalogo Streaming Community disabilitato".into());
    }
    let db = Arc::clone(&state.db);
    let cdn = sc_catalog::cdn_url(&state.db);
    let locale = sc_catalog::lang(&state.db);
    tokio::task::spawn_blocking(move || {
        let app = sc_catalog::resolve_app_url(db.as_ref())?;
        sc_playback::fetch_title_meta(&app, &cdn, &locale, title_id, &slug)
    })
    .await
    .map_err(|e| format!("Errore metadati: {e}"))?
}

#[tauri::command]
async fn fetch_sc_season_episodes_cmd(
    state: State<'_, AppState>,
    title_id: i64,
    slug: String,
    season: i32,
) -> Result<Vec<crate::stremio::StremioVideo>, String> {
    if !sc_catalog::catalog_enabled(&state.db) {
        return Err("Catalogo Streaming Community disabilitato".into());
    }
    let db = Arc::clone(&state.db);
    let cdn = sc_catalog::cdn_url(&state.db);
    let locale = sc_catalog::lang(&state.db);
    tokio::task::spawn_blocking(move || {
        let app = sc_catalog::resolve_app_url(db.as_ref())?;
        sc_playback::fetch_season_episodes(&app, &cdn, &locale, title_id, &slug, season)
    })
    .await
    .map_err(|e| format!("Errore episodi stagione: {e}"))?
}

#[tauri::command]
async fn resolve_sc_stream_cmd(
    state: State<'_, AppState>,
    title_id: i64,
    slug: String,
    episode_id: Option<i64>,
    audio_lang: Option<String>,
) -> Result<PlayableStream, String> {
    if !sc_catalog::catalog_enabled(&state.db) {
        return Err("Catalogo Streaming Community disabilitato".into());
    }
    let db = Arc::clone(&state.db);
    let locale = audio_lang
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(|s| if s.eq_ignore_ascii_case("en") { "en" } else { "it" })
        .map(str::to_string)
        .unwrap_or_else(|| sc_catalog::lang(&state.db));
    let proxy = state.addon_proxy.clone();
    tokio::task::spawn_blocking(move || {
        let app = sc_catalog::resolve_app_url(db.as_ref())?;
        sc_playback::resolve_playback(
            &app,
            &locale,
            title_id,
            &slug,
            episode_id,
            &proxy,
            db.as_ref(),
        )
    })
    .await
    .map_err(|e| format!("Errore riproduzione: {e}"))?
}

#[tauri::command]
async fn search_sc_catalog_cmd(
    state: State<'_, AppState>,
    query: String,
) -> Result<Vec<StremioMetaPreview>, String> {
    let page = search_sc_catalog_page_inner(&state, query, 0, 500).await?;
    Ok(page.items)
}

async fn search_sc_catalog_page_inner(
    state: &State<'_, AppState>,
    query: String,
    offset: usize,
    limit: usize,
) -> Result<catalog_search::SearchCatalogPage, String> {
    let db = Arc::clone(&state.db);
    let sc_enabled = sc_catalog::catalog_enabled(&state.db);
    let saturn_enabled = saturn_catalog::enabled(&state.db);
    let loonex_enabled = loonex_catalog::enabled(&state.db);
    let youtube_enabled = youtube_catalog::enabled(&state.db);
    if !sc_enabled && !saturn_enabled && !loonex_enabled && !youtube_enabled {
        return Ok(catalog_search::SearchCatalogPage {
            items: Vec::new(),
            total: 0,
            offset,
            has_more: false,
        });
    }

    let cdn = sc_catalog::cdn_url(&state.db);
    let locale = sc_catalog::lang(&state.db);
    let page_limit = limit.clamp(1, 500);

    tokio::task::spawn_blocking(move || {
        catalog_search::search_catalog_page(
            db.as_ref(),
            &query,
            offset,
            page_limit,
            sc_enabled,
            saturn_enabled,
            loonex_enabled,
            youtube_enabled,
            &cdn,
            &locale,
        )
    })
    .await
    .map_err(|e| format!("Errore ricerca: {e}"))
}

#[tauri::command]
async fn search_sc_catalog_page_cmd(
    state: State<'_, AppState>,
    query: String,
    offset: usize,
    limit: Option<usize>,
) -> Result<catalog_search::SearchCatalogPage, String> {
    search_sc_catalog_page_inner(&state, query, offset, limit.unwrap_or(48)).await
}

#[tauri::command]
async fn resolve_saturn_poster_cmd(
    state: State<'_, AppState>,
    slug: String,
) -> Result<Option<String>, String> {
    if !saturn_catalog::enabled(&state.db) {
        return Ok(None);
    }
    let db = Arc::clone(&state.db);
    tokio::task::spawn_blocking(move || Ok(saturn_catalog::resolve_poster_for_slug(db.as_ref(), &slug)))
        .await
        .map_err(|e| format!("Errore poster Saturn: {e}"))?
}

#[tauri::command]
async fn fetch_saturn_meta_cmd(
    state: State<'_, AppState>,
    slug: String,
) -> Result<StremioMeta, String> {
    if !saturn_catalog::enabled(&state.db) {
        return Err("Catalogo AnimeSaturn disabilitato".into());
    }
    let db = Arc::clone(&state.db);
    tokio::task::spawn_blocking(move || saturn_playback::fetch_title_meta(db.as_ref(), &slug))
        .await
        .map_err(|e| format!("Errore meta Saturn: {e}"))?
}

#[tauri::command]
async fn resolve_saturn_stream_cmd(
    state: State<'_, AppState>,
    slug: String,
    episode_id: Option<String>,
) -> Result<PlayableStream, String> {
    if !saturn_catalog::enabled(&state.db) {
        return Err("Catalogo AnimeSaturn disabilitato".into());
    }
    let episode_id = episode_id.filter(|s| !s.trim().is_empty());
    let db = Arc::clone(&state.db);
    let proxy = state.addon_proxy.clone();
    tokio::task::spawn_blocking(move || {
        saturn_playback::resolve_playback(db.as_ref(), &slug, episode_id.as_deref(), &proxy)
    })
    .await
    .map_err(|e| format!("Errore riproduzione Saturn: {e}"))?
}

#[tauri::command]
async fn fetch_loonex_meta_cmd(
    state: State<'_, AppState>,
    slug: String,
) -> Result<StremioMeta, String> {
    if !loonex_catalog::enabled(&state.db) {
        return Err("Catalogo Loonex Cartoni disabilitato".into());
    }
    let db = Arc::clone(&state.db);
    tokio::task::spawn_blocking(move || loonex_playback::fetch_title_meta(db.as_ref(), &slug))
        .await
        .map_err(|e| format!("Errore meta Loonex: {e}"))?
}

#[tauri::command]
async fn resolve_loonex_stream_cmd(
    state: State<'_, AppState>,
    slug: String,
    episode_id: Option<String>,
) -> Result<PlayableStream, String> {
    if !loonex_catalog::enabled(&state.db) {
        return Err("Catalogo Loonex Cartoni disabilitato".into());
    }
    let episode_id = episode_id.filter(|s| !s.trim().is_empty());
    let db = Arc::clone(&state.db);
    let proxy = state.addon_proxy.clone();
    tokio::task::spawn_blocking(move || {
        loonex_playback::resolve_playback(db.as_ref(), &slug, episode_id.as_deref(), &proxy)
    })
    .await
    .map_err(|e| format!("Errore riproduzione Loonex: {e}"))?
}

#[tauri::command]
async fn fetch_youtube_meta_cmd(
    state: State<'_, AppState>,
    playlist_id: String,
) -> Result<StremioMeta, String> {
    if !youtube_catalog::enabled(&state.db) {
        return Err("Catalogo YouTube disabilitato".into());
    }
    let db = Arc::clone(&state.db);
    tokio::task::spawn_blocking(move || {
        youtube_playback::fetch_title_meta(db.as_ref(), &playlist_id)
    })
    .await
    .map_err(|e| format!("Errore meta YouTube: {e}"))?
}

#[tauri::command]
async fn resolve_youtube_stream_cmd(
    state: State<'_, AppState>,
    playlist_id: String,
    video_id: String,
) -> Result<PlayableStream, String> {
    if !youtube_catalog::enabled(&state.db) {
        return Err("Catalogo YouTube disabilitato".into());
    }
    let db = Arc::clone(&state.db);
    tokio::task::spawn_blocking(move || {
        youtube_playback::resolve_playback(db.as_ref(), &playlist_id, &video_id)
    })
    .await
    .map_err(|e| format!("Errore riproduzione YouTube: {e}"))?
}

#[tauri::command]
async fn resolve_sc_preview_cmd(
    state: State<'_, AppState>,
    title_id: i64,
    slug: String,
) -> Result<Option<PlayableStream>, String> {
    if !sc_catalog::catalog_enabled(&state.db) {
        return Ok(None);
    }
    let db = Arc::clone(&state.db);
    let locale = sc_catalog::lang(&state.db);
    let proxy = state.addon_proxy.clone();
    tokio::task::spawn_blocking(move || {
        let app = sc_catalog::resolve_app_url(db.as_ref())?;
        sc_playback::resolve_preview(&app, &locale, title_id, &slug, &proxy, db.as_ref())
    })
    .await
    .map_err(|e| format!("Errore anteprima: {e}"))?
}

#[tauri::command]
fn update_streaming_watch_progress_cmd(
    state: State<'_, AppState>,
    profile_id: String,
    input: StreamingWatchProgressInput,
) -> Result<(), String> {
    state
        .db
        .upsert_streaming_watch_progress(&profile_id, &input)
}

#[tauri::command]
fn get_streaming_watch_progress_cmd(
    state: State<'_, AppState>,
    profile_id: String,
    catalog_prefix: String,
    content_type: String,
    title_id: String,
    slug: String,
    video_id: String,
) -> Result<Option<(f64, Option<f64>)>, String> {
    state.db.get_streaming_watch_progress(
        &profile_id,
        &catalog_prefix,
        &content_type,
        &title_id,
        &slug,
        &video_id,
    )
}

#[tauri::command]
fn list_streaming_title_progress_cmd(
    state: State<'_, AppState>,
    profile_id: String,
    catalog_prefix: String,
    content_type: String,
    title_id: String,
    slug: String,
) -> Result<Vec<StreamingEpisodeProgress>, String> {
    state.db.list_streaming_title_watch_progress(
        &profile_id,
        &catalog_prefix,
        &content_type,
        &title_id,
        &slug,
    )
}

#[tauri::command]
fn get_streaming_continue_cmd(
    state: State<'_, AppState>,
    profile_id: String,
    limit: Option<usize>,
) -> Result<Vec<StreamingContinueItem>, String> {
    state
        .db
        .list_streaming_continue_watching(&profile_id, limit.unwrap_or(20))
}

#[tauri::command]
fn get_streaming_watch_history_cmd(
    state: State<'_, AppState>,
    profile_id: String,
    limit: Option<usize>,
) -> Result<Vec<StreamingContinueItem>, String> {
    state
        .db
        .list_streaming_watch_history(&profile_id, limit.unwrap_or(50))
}

#[tauri::command]
fn get_debrid_config_cmd(state: State<'_, AppState>) -> Result<DebridConfig, String> {
    state.db.get_debrid_config()
}

#[tauri::command]
fn set_debrid_config_cmd(
    state: State<'_, AppState>,
    parent_profile_id: String,
    provider: String,
    api_key: String,
) -> Result<(), String> {
    if !state.db.is_parent_profile(&parent_profile_id)? {
        return Err("Solo il profilo genitore può configurare il debrid".into());
    }
    state.db.set_debrid_config(&provider, &api_key)
}

#[tauri::command]
fn test_debrid_cmd(
    parent_profile_id: String,
    provider: String,
    api_key: String,
    state: State<'_, AppState>,
) -> Result<String, String> {
    if !state.db.is_parent_profile(&parent_profile_id)? {
        return Err("Solo il profilo genitore può configurare il debrid".into());
    }
    let config = DebridConfig { provider, api_key };
    debrid::validate(&config)
}

#[tauri::command]
fn resolve_debrid_stream_cmd(
    state: State<'_, AppState>,
    profile_id: String,
    info_hash: String,
    file_idx: Option<i32>,
    sources: Vec<String>,
) -> Result<PlayableStream, String> {
    let check = state.db.can_play_streaming(&profile_id)?;
    if !check.allowed {
        return Err(check
            .reason
            .unwrap_or_else(|| "Riproduzione non consentita".into()));
    }
    let config = state.db.get_debrid_config()?;
    if !config.is_enabled() {
        return Err("Nessun provider debrid configurato in Impostazioni".into());
    }
    let url = debrid::resolve(&config, &info_hash, file_idx, &sources)?;
    let lower = url.to_lowercase();
    let is_hls = lower.contains(".m3u8") || lower.contains("application/vnd.apple.mpegurl");
    Ok(PlayableStream {
        url,
        name: Some("Debrid".to_string()),
        description: None,
        addon_id: String::new(),
        addon_name: config.provider,
        is_hls,
        proxied: false,
        needs_debrid: false,
        info_hash: None,
        file_idx: None,
        sources: Vec::new(),
    })
}

/// Unified resolver for torrent streams (those returned with an infoHash).
/// Uses a configured debrid provider when available (fast, cached), and
/// otherwise falls back to the built-in torrent engine.
#[tauri::command]
async fn resolve_torrent_source_cmd(
    state: State<'_, AppState>,
    profile_id: String,
    info_hash: String,
    file_idx: Option<i32>,
    sources: Vec<String>,
) -> Result<PlayableStream, String> {
    let check = state.db.can_play_streaming(&profile_id)?;
    if !check.allowed {
        return Err(check
            .reason
            .unwrap_or_else(|| "Riproduzione non consentita".into()));
    }

    let config = state.db.get_debrid_config().unwrap_or_default();

    if config.is_enabled() {
        let cfg = config.clone();
        let ih = info_hash.clone();
        let srcs = sources.clone();
        let debrid_result =
            tokio::task::spawn_blocking(move || debrid::resolve(&cfg, &ih, file_idx, &srcs))
                .await
                .map_err(|e| e.to_string())?;
        if let Ok(url) = debrid_result {
            let lower = url.to_lowercase();
            let is_hls = lower.contains(".m3u8");
            return Ok(PlayableStream {
                url,
                name: Some("Debrid".to_string()),
                description: None,
                addon_id: String::new(),
                addon_name: config.provider.clone(),
                is_hls,
                proxied: false,
                needs_debrid: false,
                info_hash: None,
                file_idx: None,
                sources: Vec::new(),
            });
        }
    }

    let url = state
        .torrent
        .resolve(&info_hash, file_idx, &sources)
        .await?;
    Ok(PlayableStream {
        url,
        name: Some("Torrent".to_string()),
        description: None,
        addon_id: String::new(),
        addon_name: "Motore torrent".to_string(),
        is_hls: false,
        proxied: true,
        needs_debrid: false,
        info_hash: None,
        file_idx: None,
        sources: Vec::new(),
    })
}

#[tauri::command]
fn can_play_addon_cmd(
    state: State<'_, AppState>,
    profile_id: String,
    addon_row_id: String,
) -> Result<CanPlayResult, String> {
    state.db.can_play_addon(&profile_id, &addon_row_id)
}

#[tauri::command]
fn get_addon_allowlist_cmd(
    state: State<'_, AppState>,
    parent_profile_id: String,
    child_profile_id: String,
) -> Result<Vec<String>, String> {
    if !state.db.is_parent_profile(&parent_profile_id)? {
        return Err("Solo il profilo genitore può vedere l'allowlist".into());
    }
    state.db.get_addon_allowlist(&child_profile_id)
}

#[tauri::command]
fn set_addon_allowlist_cmd(
    state: State<'_, AppState>,
    parent_profile_id: String,
    child_profile_id: String,
    addon_row_ids: Vec<String>,
) -> Result<(), String> {
    if !state.db.is_parent_profile(&parent_profile_id)? {
        return Err("Solo il profilo genitore può modificare l'allowlist".into());
    }
    state
        .db
        .set_addon_allowlist(&child_profile_id, &addon_row_ids)
}

#[tauri::command]
fn has_streaming_access_cmd(
    state: State<'_, AppState>,
    profile_id: String,
) -> Result<bool, String> {
    state.db.profile_has_streaming_access(&profile_id)
}

#[tauri::command]
fn start_addon_watch_session_cmd(
    state: State<'_, AppState>,
    profile_id: String,
    content_type: String,
    video_id: String,
    title: String,
) -> Result<String, String> {
    let check = state.db.can_play_streaming(&profile_id)?;
    if !check.allowed {
        return Err(check
            .reason
            .unwrap_or_else(|| "Visione non consentita".into()));
    }
    state
        .db
        .start_addon_watch_session(&profile_id, &content_type, &video_id, &title)
}

#[tauri::command]
fn get_library(_state: State<'_, AppState>, _profile_id: String) -> Result<Library, String> {
    Ok(Library {
        items: vec![],
        collections: vec![],
        featured: None,
        media_root: String::new(),
        total_count: 0,
        last_scan: None,
    })
}

#[tauri::command]
fn scan_library_cmd(_state: State<'_, AppState>) -> Result<ScanResult, String> {
    Ok(ScanResult {
        added: 0,
        updated: 0,
        removed: 0,
        total: 0,
    })
}

#[tauri::command]
fn enrich_metadata_cmd(
    state: State<'_, AppState>,
    profile_id: String,
    media_id: String,
) -> Result<MediaItem, String> {
    if !state.db.is_parent_profile(&profile_id)? {
        return Err("Solo il profilo genitore può arricchire i metadati".into());
    }
    let media = state
        .db
        .get_media_by_id(&profile_id, &media_id)?
        .ok_or_else(|| "Media non trovato".to_string())?;
    let api_key = state
        .db
        .get_meta(tmdb::META_TMDB_API_KEY)?
        .unwrap_or_default();
    if api_key.trim().is_empty() {
        return Err("Configura la chiave API TMDB nelle impostazioni".into());
    }
    let search_title = media.series_title.as_deref().unwrap_or(&media.title);
    tmdb::enrich_media(
        &api_key,
        state.media_root.read().as_path(),
        &media.id,
        search_title,
        &media.media_type,
        media.year,
        media.series_title.as_deref(),
        &state.db,
    )?;
    state
        .db
        .get_media_by_id(&profile_id, &media_id)?
        .ok_or_else(|| "Media non trovato".to_string())
}

#[tauri::command]
fn fetch_cast_photos_cmd(
    state: State<'_, AppState>,
    title: String,
    year: Option<i32>,
    is_series: bool,
    tmdb_id: Option<i64>,
    tmdb_type: Option<String>,
    cast_names: Vec<String>,
) -> Result<Vec<tmdb::CastPhoto>, String> {
    let api_key = state
        .db
        .get_meta(tmdb::META_TMDB_API_KEY)?
        .unwrap_or_default();
    if api_key.trim().is_empty() {
        return Ok(cast_names
            .iter()
            .map(|name| tmdb::CastPhoto {
                name: name.clone(),
                photo_url: None,
            })
            .collect());
    }
    Ok(tmdb::fetch_cast_photos(
        &api_key,
        &title,
        year,
        is_series,
        tmdb_id,
        tmdb_type.as_deref(),
        &cast_names,
    )
    .unwrap_or_else(|_| {
        cast_names
            .iter()
            .map(|name| tmdb::CastPhoto {
                name: name.clone(),
                photo_url: None,
            })
            .collect()
    }))
}

#[tauri::command]
fn get_media(
    state: State<'_, AppState>,
    profile_id: String,
    id: String,
) -> Result<MediaItem, String> {
    state
        .db
        .get_media_by_id(&profile_id, &id)?
        .ok_or_else(|| "Media non trovato".to_string())
}

#[tauri::command]
fn search_media(
    state: State<'_, AppState>,
    profile_id: String,
    query: String,
) -> Result<Vec<MediaItem>, String> {
    state.db.search_media(&profile_id, &query)
}

#[tauri::command]
fn get_stream_info(
    state: State<'_, AppState>,
    profile_id: String,
    id: String,
) -> Result<StreamInfo, String> {
    let media = state
        .db
        .get_media_by_id(&profile_id, &id)?
        .ok_or_else(|| "Media non trovato".to_string())?;

    Ok(StreamInfo {
        url: network::localhost_stream_url(&id),
        lan_url: network::lan_stream_url(&id),
        media,
    })
}

#[tauri::command]
async fn discover_cast_devices_cmd() -> Result<Vec<CastDevice>, String> {
    cast::discover_devices(8500).await
}

#[tauri::command]
async fn probe_cast_device_cmd(host: String) -> Result<CastDevice, String> {
    cast::probe_device_at(&host)
        .await
        .ok_or_else(|| {
            "Nessun lettore DLNA trovato a questo indirizzo. Verifica l'IP della TV nelle impostazioni di rete.".to_string()
        })
}

#[tauri::command]
async fn cast_media_cmd(
    state: State<'_, AppState>,
    profile_id: String,
    media_id: String,
    device: CastDevice,
) -> Result<(), String> {
    let media = state
        .db
        .get_media_by_id(&profile_id, &media_id)?
        .ok_or_else(|| "Media non trovato".to_string())?;

    let transcode_enabled = state
        .db
        .get_meta(crate::settings::META_CAST_TRANSCODE)?
        .map(|v| v != "false")
        .unwrap_or(true);

    let use_transcode = transcode_enabled && transcode::needs_transcode(&media.file_path);

    let lan_url = if use_transcode {
        network::lan_cast_url(&media_id, media.watch_position.unwrap_or(0.0)).ok_or_else(|| {
            "Impossibile trovare l'indirizzo di rete del PC. Verifica Wi-Fi e firewall.".to_string()
        })?
    } else {
        network::lan_stream_url(&media_id).ok_or_else(|| {
            "Impossibile trovare l'indirizzo di rete del PC. Verifica Wi-Fi e firewall.".to_string()
        })?
    };

    let start_secs = if use_transcode {
        0.0
    } else {
        media.watch_position.unwrap_or(0.0)
    };

    let mime = if use_transcode {
        "video/mp4"
    } else {
        cast::video_mime(&media.file_path)
    };

    cast::play_on_device(&device, &media.title, &lan_url, mime, start_secs).await
}

#[tauri::command]
async fn cast_remote_cmd(
    state: State<'_, AppState>,
    proxy_id: String,
    title: String,
    device: CastDevice,
    start_secs: f64,
    is_hls: bool,
) -> Result<(), String> {
    let entry = state.addon_proxy.get(&proxy_id).ok_or_else(|| {
        "Sessione stream scaduta. Riavvia la riproduzione e riprova la trasmissione.".to_string()
    })?;

    let needs_transcode = is_hls || entry.rewrite_manifest;
    let (lan_url, start) = if needs_transcode {
        (
            network::lan_remote_cast_url(&proxy_id, start_secs).ok_or_else(|| {
                "Impossibile trovare l'indirizzo di rete del PC. Verifica Wi-Fi e firewall."
                    .to_string()
            })?,
            0.0,
        )
    } else {
        (
            network::lan_remote_url(&proxy_id).ok_or_else(|| {
                "Impossibile trovare l'indirizzo di rete del PC. Verifica Wi-Fi e firewall."
                    .to_string()
            })?,
            start_secs,
        )
    };

    cast::play_on_device(&device, &title, &lan_url, "video/mp4", start).await
}

#[tauri::command]
async fn cast_transport_cmd(
    device: CastDevice,
    action: String,
    position_secs: Option<f64>,
) -> Result<(), String> {
    match action.as_str() {
        "play" => cast::resume_on_device(&device).await,
        "pause" => cast::pause_on_device(&device).await,
        "stop" => cast::stop_on_device(&device).await,
        "seek" => {
            let pos = position_secs.ok_or_else(|| "Posizione mancante".to_string())?;
            cast::seek_device(&device, pos).await
        }
        _ => Err(format!("Azione cast non supportata: {action}")),
    }
}

#[tauri::command]
async fn cast_position_cmd(device: CastDevice) -> Result<CastPosition, String> {
    cast::get_position(&device).await
}

#[tauri::command]
fn get_lan_host_cmd() -> Option<String> {
    network::lan_host_label()
}

#[tauri::command]
fn update_watch_progress(
    state: State<'_, AppState>,
    profile_id: String,
    media_id: String,
    position: f64,
    duration: Option<f64>,
) -> Result<(), String> {
    state
        .db
        .update_watch_progress(&profile_id, &media_id, position, duration)
}

#[tauri::command]
fn toggle_favorite(
    state: State<'_, AppState>,
    profile_id: String,
    media_id: String,
) -> Result<bool, String> {
    state.db.toggle_favorite(&profile_id, &media_id)
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct StreamingListInput {
    catalog_prefix: String,
    content_type: String,
    title_id: String,
    slug: Option<String>,
    name: String,
    poster: Option<String>,
    media_type: Option<String>,
    release_info: Option<String>,
}

#[tauri::command]
fn list_streaming_list_cmd(
    state: State<'_, AppState>,
    profile_id: String,
) -> Result<Vec<stremio::StremioMetaPreview>, String> {
    state.db.list_streaming_list(&profile_id)
}

#[tauri::command]
fn toggle_streaming_list_cmd(
    state: State<'_, AppState>,
    profile_id: String,
    item: StreamingListInput,
) -> Result<bool, String> {
    state.db.toggle_streaming_list(
        &profile_id,
        &item.catalog_prefix,
        &item.content_type,
        &item.title_id,
        item.slug.as_deref().unwrap_or(""),
        &item.name,
        item.poster.as_deref(),
        item.media_type.as_deref(),
        item.release_info.as_deref(),
    )
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CreateWatchPartyInput {
    profile_name: String,
    media_id: String,
    title: String,
    stream_url: String,
    is_hls: bool,
    poster_url: Option<String>,
    content_kind: String,
}

#[tauri::command]
fn get_friend_code_cmd(state: State<'_, AppState>, profile_id: String) -> Result<String, String> {
    state.db.get_or_create_friend_code(&profile_id)
}

#[tauri::command]
fn list_friends_cmd(
    state: State<'_, AppState>,
    profile_id: String,
) -> Result<Vec<FriendRecord>, String> {
    state.db.list_friends(&profile_id)
}

#[tauri::command]
fn add_friend_cmd(
    state: State<'_, AppState>,
    profile_id: String,
    friend_code: String,
    display_name: Option<String>,
) -> Result<FriendRecord, String> {
    state.db.add_friend(
        &profile_id,
        &friend_code,
        display_name.as_deref().unwrap_or(""),
    )
}

#[tauri::command]
fn remove_friend_cmd(
    state: State<'_, AppState>,
    profile_id: String,
    friend_code: String,
) -> Result<(), String> {
    state.db.remove_friend(&profile_id, &friend_code)
}

#[tauri::command]
async fn sync_lan_friends_presence_cmd(
    state: State<'_, AppState>,
    profile_id: String,
    display_name: String,
    deep_scan: Option<bool>,
    cloud_friend_code: Option<String>,
    avatar_url: Option<String>,
) -> Result<Vec<LanFriendPresence>, String> {
    let friend_code = state.db.get_or_create_friend_code(&profile_id)?;
    set_device_presence(
        &state.presence,
        DevicePresence {
            profile_id: profile_id.clone(),
            friend_code: friend_code.clone(),
            display_name: display_name.clone(),
            cloud_friend_code: cloud_friend_code
                .map(|c| c.trim().to_uppercase())
                .filter(|c| !c.is_empty()),
            avatar_url: avatar_url.filter(|u| !u.trim().is_empty()),
        },
    );

    friend_presence::sync_lan_presence(
        state.db.as_ref(),
        &profile_id,
        &friend_code,
        &display_name,
        deep_scan.unwrap_or(false),
    )
    .await
}

#[tauri::command]
fn create_watch_party_cmd(
    state: State<'_, AppState>,
    profile_id: String,
    input: CreateWatchPartyInput,
) -> Result<WatchPartyRoomInfo, String> {
    let host_ip = network::lan_host_label();
    let stream_url = if input.stream_url.contains("127.0.0.1") {
        if input.content_kind == "local" {
            network::lan_stream_url(&input.media_id).unwrap_or(input.stream_url)
        } else if let Some(proxy_id) = input.stream_url.split("/remote/").nth(1) {
            let proxy_id = proxy_id.split('?').next().unwrap_or(proxy_id);
            network::lan_remote_url(proxy_id).unwrap_or(input.stream_url)
        } else {
            input.stream_url
        }
    } else {
        input.stream_url
    };

    state.watch_party.create_room(
        profile_id,
        input.profile_name,
        WatchPartyContent {
            media_id: input.media_id,
            title: input.title,
            stream_url,
            is_hls: input.is_hls,
            poster_url: input.poster_url,
            content_kind: input.content_kind,
        },
        host_ip.clone(),
    )
}

#[tauri::command]
fn get_watch_party_cmd(
    state: State<'_, AppState>,
    room_code: String,
) -> Result<WatchPartyRoomInfo, String> {
    state
        .watch_party
        .get_room(&room_code)
        .ok_or_else(|| "Stanza non trovata o scaduta".into())
}

#[tauri::command]
fn close_watch_party_cmd(
    state: State<'_, AppState>,
    profile_id: String,
    room_code: String,
) -> Result<(), String> {
    state.watch_party.close_room(&room_code, &profile_id)
}

#[tauri::command]
fn get_media_root(state: State<'_, AppState>) -> Result<String, String> {
    Ok(state
        .media_root
        .read()
        .to_string_lossy()
        .to_string())
}

#[tauri::command]
fn add_media_cmd(
    state: State<'_, AppState>,
    profile_id: String,
    input: AddMediaInput,
) -> Result<MediaItem, String> {
    if !state.db.is_parent_profile(&profile_id)? {
        return Err("Solo il profilo genitore può aggiungere contenuti".into());
    }
    add_media(
        &state.db,
        state.media_root.read().as_path(),
        &profile_id,
        input,
    )
}

#[tauri::command]
fn update_media_cmd(
    state: State<'_, AppState>,
    profile_id: String,
    id: String,
    input: UpdateMediaInput,
) -> Result<MediaItem, String> {
    if !state.db.is_parent_profile(&profile_id)? {
        return Err("Solo il profilo genitore può modificare contenuti".into());
    }
    update_media(&state.db, &profile_id, &id, input)
}

#[tauri::command]
fn delete_media_cmd(
    state: State<'_, AppState>,
    profile_id: String,
    id: String,
) -> Result<(), String> {
    if !state.db.is_parent_profile(&profile_id)? {
        return Err("Solo il profilo genitore può eliminare contenuti".into());
    }
    delete_media(&state.db, state.media_root.read().as_path(), &id)
}

#[tauri::command]
fn list_series_cmd(state: State<'_, AppState>, media_type: String) -> Result<Vec<String>, String> {
    state.db.list_series_titles(&media_type)
}

#[tauri::command]
fn list_posters_cmd(state: State<'_, AppState>) -> Result<Vec<PosterAsset>, String> {
    state
        .db
        .list_poster_assets(state.media_root.read().as_path())
}

fn init_app(handle: &AppHandle) -> Result<AppState, String> {
    let db_path = handle
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("library.db");

    let db = Arc::new(Database::open(&db_path)?);
    // Proxy SC opzionale (solo desktop): off di default → connessione diretta.
    {
        let enabled = db
            .get_meta(crate::settings::META_SC_PROXY_ENABLED)
            .ok()
            .flatten()
            .map(|v| v == "true")
            .unwrap_or(false);
        let url = db.get_meta(crate::settings::META_SC_PROXY_URL).ok().flatten();
        sc_proxy::set_sc_proxy(if enabled { url } else { None });
    }
    let _ = profile_avatar::migrate_filesystem_avatars_to_db(handle, db.as_ref());
    let _ = db.ensure_catalog_addon();
    let _ = saturn_catalog::ensure_defaults(&db);
    let _ = loonex_catalog::ensure_defaults(&db);
    let _ = youtube_catalog::ensure_defaults(&db);
    let _ = db.sync_empty_child_allowlists();
    let db_bootstrap = db.clone();
    tauri::async_runtime::spawn_blocking(move || {
        crate::vix_embed::bootstrap(db_bootstrap.as_ref());
    });
    let media_root = parking_lot::RwLock::new(std::path::PathBuf::new());

    let addon_proxy = Arc::new(AddonProxyRegistry::new());

    let cache_dir = handle
        .path()
        .app_cache_dir()
        .unwrap_or_else(|_| std::env::temp_dir());
    let torrent_engine = Arc::new(TorrentEngine::new(cache_dir.join("branchefy-torrents")));

    let watch_party = Arc::new(WatchPartyRegistry::new());
    let presence = new_presence_registry();

    let db_stream = db.clone();
    let proxy_stream = addon_proxy.clone();
    let torrent_stream = torrent_engine.clone();
    let party_stream = watch_party.clone();
    let presence_stream = presence.clone();
    tauri::async_runtime::spawn(async move {
        stream::start_server(
            db_stream,
            proxy_stream,
            torrent_stream,
            party_stream,
            presence_stream,
        )
        .await;
    });

    Ok(AppState {
        db,
        media_root,
        addon_proxy,
        torrent: torrent_engine,
        watch_party,
        presence,
    })
}

pub use web_invoke::{dispatch_web_command, init_web_state, stream_state_from_app};
pub use stream::{build_stream_router, StreamState};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let mut builder = tauri::Builder::default();
    #[cfg(desktop)]
    {
        builder = builder
            .plugin(tauri_plugin_process::init())
            .plugin(tauri_plugin_updater::Builder::new().build());
    }
    builder
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_notification::init())
        .setup(|app| {
            let state = init_app(app.handle())?;
            app.manage(state);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_profiles,
            create_profile_cmd,
            delete_profile_cmd,
            update_profile_cmd,
            set_profile_avatar_cmd,
            set_profile_avatar_bytes_cmd,
            get_profile_avatar_data_url_cmd,
            verify_profile_pin_cmd,
            set_profile_pin_cmd,
            remove_profile_pin_cmd,
            get_settings_cmd,
            update_settings_cmd,
            get_library,
            scan_library_cmd,
            set_media_root_cmd,
            enrich_metadata_cmd,
            fetch_cast_photos_cmd,
            can_play_media_cmd,
            get_profile_limits_cmd,
            update_profile_limits_cmd,
            get_watch_history_cmd,
            dev_local_dashboard_cmd,
            start_watch_session_cmd,
            update_watch_session_cmd,
            end_watch_session_cmd,
            get_achievements_state_cmd,
            sync_achievements_cmd,
            record_completion_cmd,
            install_addon_cmd,
            remove_addon_cmd,
            list_addons_cmd,
            list_all_addons_cmd,
            set_addon_enabled_cmd,
            fetch_addon_catalog_cmd,
            fetch_addon_meta_cmd,
            resolve_addon_streams_cmd,
            fetch_sc_catalog_cmd,
            refresh_sc_catalog_cmd,
            fetch_sc_meta_cmd,
            fetch_sc_season_episodes_cmd,
            resolve_sc_stream_cmd,
            search_sc_catalog_cmd,
            search_sc_catalog_page_cmd,
            resolve_saturn_poster_cmd,
            browse_saturn_anime_cmd,
            fetch_saturn_home_cmd,
            fetch_saturn_genres_cmd,
            browse_saturn_genre_cmd,
            fetch_saturn_meta_cmd,
            resolve_saturn_stream_cmd,
            fetch_loonex_meta_cmd,
            resolve_loonex_stream_cmd,
            fetch_youtube_meta_cmd,
            resolve_youtube_stream_cmd,
            resolve_sc_preview_cmd,
            update_streaming_watch_progress_cmd,
            get_streaming_watch_progress_cmd,
            list_streaming_title_progress_cmd,
            get_streaming_continue_cmd,
            get_streaming_watch_history_cmd,
            can_play_addon_cmd,
            get_addon_allowlist_cmd,
            set_addon_allowlist_cmd,
            has_streaming_access_cmd,
            start_addon_watch_session_cmd,
            get_debrid_config_cmd,
            set_debrid_config_cmd,
            test_debrid_cmd,
            resolve_debrid_stream_cmd,
            resolve_torrent_source_cmd,
            get_media,
            search_media,
            get_stream_info,
            update_watch_progress,
            toggle_favorite,
            list_streaming_list_cmd,
            toggle_streaming_list_cmd,
            get_friend_code_cmd,
            list_friends_cmd,
            add_friend_cmd,
            remove_friend_cmd,
            sync_lan_friends_presence_cmd,
            create_watch_party_cmd,
            get_watch_party_cmd,
            close_watch_party_cmd,
            get_media_root,
            add_media_cmd,
            update_media_cmd,
            delete_media_cmd,
            list_series_cmd,
            list_posters_cmd,
            discover_cast_devices_cmd,
            probe_cast_device_cmd,
            cast_media_cmd,
            cast_remote_cmd,
            cast_transport_cmd,
            cast_position_cmd,
            get_lan_host_cmd,
            mangadex::mangadex_fetch_cmd,
            welib::welib_popular_cmd,
            welib::welib_search_cmd,
            image_palette::extract_image_palette_cmd,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
