use crate::addon_proxy::AddonProxyRegistry;
use crate::db::Database;
use crate::friend_presence::new_presence_registry;
use crate::profiles::{CreateProfileInput, Profile, UpdateProfileInput};
use crate::settings::{AppSettings, UpdateSettingsInput};
use crate::stremio::{
    PlayableStream, StreamingContinueItem, StreamingEpisodeProgress, StreamingWatchProgressInput,
    StremioMeta, StremioMetaPreview,
};
use crate::torrent::TorrentEngine;
use crate::watch_party::{WatchPartyRegistry, WatchPartyRoomInfo};
use crate::AppState;
use serde::Deserialize;
use serde_json::Value;
use std::sync::Arc;

pub async fn init_web_state() -> Result<Arc<AppState>, String> {
    let data_dir = std::env::var("BRANCHEFY_DATA_DIR")
        .unwrap_or_else(|_| "./.branchefy-data".to_string());
    std::fs::create_dir_all(&data_dir).map_err(|e| e.to_string())?;

    let db_path = std::path::Path::new(&data_dir).join("library.db");
    let cache_dir = std::path::Path::new(&data_dir).join("cache");
    let torrent_cache_dir = cache_dir.join("torrents");

    let db = tokio::task::spawn_blocking(move || -> Result<Arc<Database>, String> {
        std::fs::create_dir_all(&cache_dir).map_err(|e| e.to_string())?;
        let db = Arc::new(Database::open(&db_path)?);
        let _ = db.ensure_catalog_addon();
        let _ = crate::saturn_catalog::ensure_defaults(&db);
        let _ = crate::loonex_catalog::ensure_defaults(&db);
        let _ = crate::youtube_catalog::ensure_defaults(&db);
        let _ = db.sync_empty_child_allowlists();
        let db_bootstrap = db.clone();
        crate::vix_embed::bootstrap(db_bootstrap.as_ref());
        Ok(db)
    })
    .await
    .map_err(|e| format!("Init database: {e}"))??;

    let addon_proxy = Arc::new(AddonProxyRegistry::new());
    let torrent_engine = Arc::new(TorrentEngine::new(torrent_cache_dir));
    let watch_party = Arc::new(WatchPartyRegistry::new());
    let presence = new_presence_registry();

    Ok(Arc::new(AppState {
        db,
        media_root: parking_lot::RwLock::new(std::path::PathBuf::new()),
        addon_proxy,
        torrent: torrent_engine,
        watch_party,
        presence,
    }))
}

pub async fn dispatch_web_command(
    state: &AppState,
    command: &str,
    args: Value,
) -> Result<Value, String> {
    match command {
        "get_profiles" => ok(state.db.get_profiles()?),
        "create_profile_cmd" => {
            #[derive(Deserialize)]
            struct Args {
                input: CreateProfileInput,
            }
            let parsed: Args = parse_args(args)?;
            ok(state.db.create_profile(&parsed.input)?)
        }
        "delete_profile_cmd" => {
            #[derive(Deserialize)]
            struct Args {
                id: String,
            }
            let parsed: Args = parse_args(args)?;
            state.db.delete_profile(&parsed.id)?;
            ok(())
        }
        "update_profile_cmd" => {
            #[derive(Deserialize)]
            struct Args {
                id: String,
                input: UpdateProfileInput,
            }
            let parsed: Args = parse_args(args)?;
            ok(state.db.update_profile(&parsed.id, &parsed.input)?)
        }
        "verify_profile_pin_cmd" => {
            #[derive(Deserialize)]
            struct Args {
                id: String,
                pin: String,
            }
            let parsed: Args = parse_args(args)?;
            ok(state.db.verify_profile_pin(&parsed.id, &parsed.pin)?)
        }
        "set_profile_pin_cmd" => {
            #[derive(Deserialize)]
            #[serde(rename_all = "camelCase")]
            struct Args {
                profile_id: String,
                pin: String,
                #[serde(default)]
                current_pin: Option<String>,
            }
            let parsed: Args = parse_args(args)?;
            state
                .db
                .set_profile_pin(&parsed.profile_id, &parsed.pin, parsed.current_pin.as_deref())?;
            ok(())
        }
        "remove_profile_pin_cmd" => {
            #[derive(Deserialize)]
            #[serde(rename_all = "camelCase")]
            struct Args {
                profile_id: String,
                current_pin: String,
            }
            let parsed: Args = parse_args(args)?;
            state
                .db
                .remove_profile_pin(&parsed.profile_id, &parsed.current_pin)?;
            ok(())
        }
        "set_profile_avatar_bytes_cmd" => {
            #[derive(Deserialize)]
            #[serde(rename_all = "camelCase")]
            struct Args {
                profile_id: String,
                bytes: Vec<u8>,
            }
            let parsed: Args = parse_args(args)?;
            crate::profile_avatar::save_profile_avatar_bytes(
                &state.db,
                &parsed.profile_id,
                &parsed.bytes,
            )?;
            ok(state
                .db
                .get_profile(&parsed.profile_id)?
                .ok_or_else(|| "Profilo non trovato".to_string())?)
        }
        "get_profile_avatar_data_url_cmd" => {
            #[derive(Deserialize)]
            #[serde(rename_all = "camelCase")]
            struct Args {
                profile_id: String,
            }
            let parsed: Args = parse_args(args)?;
            let bytes = state.db.get_profile_avatar_jpeg(&parsed.profile_id)?;
            ok(bytes
                .as_deref()
                .map(crate::profile_avatar::profile_avatar_data_url))
        }
        "get_settings_cmd" => ok(state.db.get_settings(state.media_root.read().as_path())?),
        "update_settings_cmd" => {
            #[derive(Deserialize)]
            #[serde(rename_all = "camelCase")]
            struct Args {
                profile_id: String,
                input: UpdateSettingsInput,
            }
            let parsed: Args = parse_args(args)?;
            if !state.db.is_parent_profile(&parsed.profile_id)? {
                return Err("Solo il profilo genitore può modificare le impostazioni".into());
            }
            state.db.update_settings(&parsed.input)?;
            ok(state.db.get_settings(state.media_root.read().as_path())?)
        }
        "fetch_sc_catalog_cmd" => ok(fetch_sc_catalog_web(state).await?),
        "refresh_sc_catalog_cmd" => ok(refresh_sc_catalog_web(state).await?),
        "fetch_sc_meta_cmd" => {
            #[derive(Deserialize)]
            #[serde(rename_all = "camelCase")]
            struct Args {
                title_id: i64,
                slug: String,
            }
            let parsed: Args = parse_args(args)?;
            let app = crate::sc_catalog::app_url(state.db.as_ref());
            let cdn = crate::sc_catalog::cdn_url(state.db.as_ref());
            let locale = crate::sc_catalog::lang(state.db.as_ref());
            let task = tokio::task::spawn_blocking(move || {
                crate::sc_playback::fetch_title_meta(&app, &cdn, &locale, parsed.title_id, &parsed.slug)
            });
            ok(task.await.map_err(|e| format!("Errore metadati: {e}"))??)
        }
        "fetch_sc_season_episodes_cmd" => {
            #[derive(Deserialize)]
            #[serde(rename_all = "camelCase")]
            struct Args {
                title_id: i64,
                slug: String,
                #[serde(rename = "season")]
                season_number: i32,
            }
            let parsed: Args = parse_args(args)?;
            let app = crate::sc_catalog::app_url(state.db.as_ref());
            let cdn = crate::sc_catalog::cdn_url(state.db.as_ref());
            let locale = crate::sc_catalog::lang(state.db.as_ref());
            let task = tokio::task::spawn_blocking(move || {
                crate::sc_playback::fetch_season_episodes(
                    &app,
                    &cdn,
                    &locale,
                    parsed.title_id,
                    &parsed.slug,
                    parsed.season_number,
                )
            });
            ok(task.await.map_err(|e| format!("Errore episodi: {e}"))??)
        }
        "resolve_sc_stream_cmd" => {
            #[derive(Deserialize)]
            #[serde(rename_all = "camelCase")]
            struct Args {
                title_id: i64,
                slug: String,
                #[serde(default)]
                episode_id: Option<i64>,
                #[serde(default)]
                audio_lang: Option<String>,
            }
            let parsed: Args = parse_args(args)?;
            let app = crate::sc_catalog::app_url(state.db.as_ref());
            let locale = parsed
                .audio_lang
                .as_deref()
                .map(str::trim)
                .filter(|s| !s.is_empty())
                .map(|s| if s.eq_ignore_ascii_case("en") { "en" } else { "it" })
                .map(str::to_string)
                .unwrap_or_else(|| crate::sc_catalog::lang(state.db.as_ref()));
            let proxy = state.addon_proxy.clone();
            let db = Arc::clone(&state.db);
            let task = tokio::task::spawn_blocking(move || {
                crate::sc_playback::resolve_playback(
                    &app,
                    &locale,
                    parsed.title_id,
                    &parsed.slug,
                    parsed.episode_id,
                    proxy.as_ref(),
                    db.as_ref(),
                )
            });
            ok(task.await.map_err(|e| format!("Errore stream: {e}"))??)
        }
        "resolve_sc_preview_cmd" => {
            #[derive(Deserialize)]
            #[serde(rename_all = "camelCase")]
            struct Args {
                title_id: i64,
                slug: String,
            }
            let parsed: Args = parse_args(args)?;
            let app = crate::sc_catalog::app_url(state.db.as_ref());
            let locale = crate::sc_catalog::lang(state.db.as_ref());
            let proxy = state.addon_proxy.clone();
            let db = Arc::clone(&state.db);
            let task = tokio::task::spawn_blocking(move || {
                crate::sc_playback::resolve_preview(
                    &app,
                    &locale,
                    parsed.title_id,
                    &parsed.slug,
                    proxy.as_ref(),
                    db.as_ref(),
                )
            });
            ok(task.await.map_err(|e| format!("Errore preview: {e}"))??)
        }
        "search_sc_catalog_cmd" => {
            #[derive(Deserialize)]
            struct Args {
                query: String,
            }
            let parsed: Args = parse_args(args)?;
            let page = search_catalog_page_web(state, parsed.query, 0, 500).await?;
            ok(page.items)
        }
        "search_sc_catalog_page_cmd" => {
            #[derive(Deserialize)]
            struct Args {
                query: String,
                offset: usize,
                limit: Option<usize>,
            }
            let parsed: Args = parse_args(args)?;
            ok(search_catalog_page_web(state, parsed.query, parsed.offset, parsed.limit.unwrap_or(48)).await?)
        }
        "browse_saturn_anime_cmd" => {
            #[derive(Deserialize)]
            struct Args {
                offset: usize,
                limit: Option<usize>,
            }
            let parsed: Args = parse_args(args)?;
            let db = state.db.clone();
            let limit = parsed.limit.unwrap_or(48).clamp(1, 96);
            let task = tokio::task::spawn_blocking(move || {
                crate::saturn_catalog::browse_anime_page(db.as_ref(), parsed.offset, limit)
            });
            ok(task.await.map_err(|e| format!("Errore anime: {e}"))??)
        }
        "fetch_saturn_home_cmd" => {
            if !crate::saturn_catalog::enabled(&state.db) {
                return ok(crate::saturn_catalog::SaturnHomeResponse {
                    rows: Vec::new(),
                    genres: Vec::new(),
                });
            }
            let db = state.db.clone();
            let task =
                tokio::task::spawn_blocking(move || crate::saturn_catalog::fetch_home(db.as_ref()));
            ok(task.await.map_err(|e| format!("Errore home anime: {e}"))??)
        }
        "fetch_saturn_genres_cmd" => {
            if !crate::saturn_catalog::enabled(&state.db) {
                return ok(Vec::<crate::saturn_catalog::SaturnGenre>::new());
            }
            let db = state.db.clone();
            let task = tokio::task::spawn_blocking(move || {
                crate::saturn_catalog::fetch_genres(db.as_ref())
            });
            ok(task.await.map_err(|e| format!("Errore generi anime: {e}"))?)
        }
        "browse_saturn_genre_cmd" => {
            #[derive(Deserialize)]
            #[serde(rename_all = "camelCase")]
            struct Args {
                genre_id: String,
                offset: usize,
                limit: Option<usize>,
            }
            let parsed: Args = parse_args(args)?;
            if !crate::saturn_catalog::enabled(&state.db) {
                return ok(crate::saturn_catalog::SaturnBrowsePage {
                    items: Vec::new(),
                    total: 0,
                    offset: parsed.offset,
                    has_more: false,
                });
            }
            let db = state.db.clone();
            let limit = parsed.limit.unwrap_or(48).clamp(1, 96);
            let genre_id = parsed.genre_id;
            let offset = parsed.offset;
            let task = tokio::task::spawn_blocking(move || {
                crate::saturn_catalog::browse_genre(db.as_ref(), &genre_id, offset, limit)
            });
            ok(task.await.map_err(|e| format!("Errore genere anime: {e}"))??)
        }
        "fetch_saturn_meta_cmd" => {
            #[derive(Deserialize)]
            struct Args {
                slug: String,
            }
            let parsed: Args = parse_args(args)?;
            if !crate::saturn_catalog::enabled(&state.db) {
                return Err("Catalogo AnimeSaturn disabilitato".into());
            }
            let db = state.db.clone();
            let slug = parsed.slug;
            let task = tokio::task::spawn_blocking(move || {
                crate::saturn_playback::fetch_title_meta(db.as_ref(), &slug)
            });
            ok(task.await.map_err(|e| format!("Errore saturn meta: {e}"))??)
        }
        "resolve_saturn_stream_cmd" => {
            #[derive(Deserialize)]
            #[serde(rename_all = "camelCase")]
            struct Args {
                slug: String,
                #[serde(default)]
                episode_id: Option<String>,
            }
            let parsed: Args = parse_args(args)?;
            if !crate::saturn_catalog::enabled(&state.db) {
                return Err("Catalogo AnimeSaturn disabilitato".into());
            }
            let episode_id = parsed.episode_id.filter(|s| !s.trim().is_empty());
            let db = state.db.clone();
            let proxy = state.addon_proxy.clone();
            let slug = parsed.slug;
            let task = tokio::task::spawn_blocking(move || {
                crate::saturn_playback::resolve_playback(
                    db.as_ref(),
                    &slug,
                    episode_id.as_deref(),
                    proxy.as_ref(),
                )
            });
            ok(task.await.map_err(|e| format!("Errore saturn stream: {e}"))??)
        }
        "resolve_saturn_poster_cmd" => {
            #[derive(Deserialize)]
            struct Args {
                slug: String,
            }
            let parsed: Args = parse_args(args)?;
            if !crate::saturn_catalog::enabled(&state.db) {
                return ok(Option::<String>::None);
            }
            let db = state.db.clone();
            let slug = parsed.slug;
            let task = tokio::task::spawn_blocking(move || {
                crate::saturn_catalog::resolve_poster_for_slug(db.as_ref(), &slug)
            });
            ok(task.await.map_err(|e| format!("Errore poster: {e}"))?)
        }
        "fetch_loonex_meta_cmd" => {
            #[derive(Deserialize)]
            struct Args {
                slug: String,
            }
            let parsed: Args = parse_args(args)?;
            if !crate::loonex_catalog::enabled(&state.db) {
                return Err("Catalogo Loonex Cartoni disabilitato".into());
            }
            let db = state.db.clone();
            let slug = parsed.slug;
            let task = tokio::task::spawn_blocking(move || {
                crate::loonex_playback::fetch_title_meta(db.as_ref(), &slug)
            });
            ok(task.await.map_err(|e| format!("Errore loonex meta: {e}"))??)
        }
        "resolve_loonex_stream_cmd" => {
            #[derive(Deserialize)]
            #[serde(rename_all = "camelCase")]
            struct Args {
                slug: String,
                #[serde(default)]
                episode_id: Option<String>,
            }
            let parsed: Args = parse_args(args)?;
            if !crate::loonex_catalog::enabled(&state.db) {
                return Err("Catalogo Loonex Cartoni disabilitato".into());
            }
            let episode_id = parsed.episode_id.filter(|s| !s.trim().is_empty());
            let db = state.db.clone();
            let proxy = state.addon_proxy.clone();
            let slug = parsed.slug;
            let task = tokio::task::spawn_blocking(move || {
                crate::loonex_playback::resolve_playback(
                    db.as_ref(),
                    &slug,
                    episode_id.as_deref(),
                    proxy.as_ref(),
                )
            });
            ok(task.await.map_err(|e| format!("Errore loonex stream: {e}"))??)
        }
        "fetch_youtube_meta_cmd" => {
            #[derive(Deserialize)]
            #[serde(rename_all = "camelCase")]
            struct Args {
                playlist_id: String,
            }
            let parsed: Args = parse_args(args)?;
            let db = state.db.clone();
            let playlist_id = parsed.playlist_id;
            let task = tokio::task::spawn_blocking(move || {
                crate::youtube_playback::fetch_title_meta(db.as_ref(), &playlist_id)
            });
            ok(task.await.map_err(|e| format!("Errore youtube meta: {e}"))??)
        }
        "resolve_youtube_stream_cmd" => {
            #[derive(Deserialize)]
            #[serde(rename_all = "camelCase")]
            struct Args {
                playlist_id: String,
                video_id: String,
            }
            let parsed: Args = parse_args(args)?;
            let db = state.db.clone();
            let task = tokio::task::spawn_blocking(move || {
                crate::youtube_playback::resolve_playback(
                    db.as_ref(),
                    &parsed.playlist_id,
                    &parsed.video_id,
                )
            });
            ok(task.await.map_err(|e| format!("Errore youtube stream: {e}"))??)
        }
        "update_streaming_watch_progress_cmd" => {
            #[derive(Deserialize)]
            #[serde(rename_all = "camelCase")]
            struct Args {
                profile_id: String,
                input: StreamingWatchProgressInput,
            }
            let parsed: Args = parse_args(args)?;
            state.db.upsert_streaming_watch_progress(&parsed.profile_id, &parsed.input)?;
            ok(())
        }
        "get_streaming_watch_progress_cmd" => {
            #[derive(Deserialize)]
            #[serde(rename_all = "camelCase")]
            struct Args {
                profile_id: String,
                catalog_prefix: String,
                content_type: String,
                title_id: String,
                slug: String,
                video_id: String,
            }
            let parsed: Args = parse_args(args)?;
            ok(state.db.get_streaming_watch_progress(
                &parsed.profile_id,
                &parsed.catalog_prefix,
                &parsed.content_type,
                &parsed.title_id,
                &parsed.slug,
                &parsed.video_id,
            )?)
        }
        "list_streaming_title_progress_cmd" => {
            #[derive(Deserialize)]
            #[serde(rename_all = "camelCase")]
            struct Args {
                profile_id: String,
                catalog_prefix: String,
                content_type: String,
                title_id: String,
                slug: String,
            }
            let parsed: Args = parse_args(args)?;
            ok(state.db.list_streaming_title_watch_progress(
                &parsed.profile_id,
                &parsed.catalog_prefix,
                &parsed.content_type,
                &parsed.title_id,
                &parsed.slug,
            )?)
        }
        "get_streaming_continue_cmd" => {
            #[derive(Deserialize)]
            #[serde(rename_all = "camelCase")]
            struct Args {
                profile_id: String,
                #[serde(default)]
                limit: Option<usize>,
            }
            let parsed: Args = parse_args(args)?;
            ok(state.db.list_streaming_continue_watching(&parsed.profile_id, parsed.limit.unwrap_or(20))?)
        }
        "get_streaming_watch_history_cmd" => {
            #[derive(Deserialize)]
            #[serde(rename_all = "camelCase")]
            struct Args {
                profile_id: String,
                #[serde(default)]
                limit: Option<usize>,
            }
            let parsed: Args = parse_args(args)?;
            ok(state.db.list_streaming_watch_history(&parsed.profile_id, parsed.limit.unwrap_or(50))?)
        }
        "list_streaming_list_cmd" => {
            #[derive(Deserialize)]
            #[serde(rename_all = "camelCase")]
            struct Args {
                profile_id: String,
            }
            let parsed: Args = parse_args(args)?;
            ok(state.db.list_streaming_list(&parsed.profile_id)?)
        }
        "toggle_streaming_list_cmd" => {
            #[derive(Deserialize)]
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
            #[derive(Deserialize)]
            #[serde(rename_all = "camelCase")]
            struct Args {
                profile_id: String,
                item: StreamingListInput,
            }
            let parsed: Args = parse_args(args)?;
            ok(state.db.toggle_streaming_list(
                &parsed.profile_id,
                &parsed.item.catalog_prefix,
                &parsed.item.content_type,
                &parsed.item.title_id,
                parsed.item.slug.as_deref().unwrap_or(""),
                &parsed.item.name,
                parsed.item.poster.as_deref(),
                parsed.item.media_type.as_deref(),
                parsed.item.release_info.as_deref(),
            )?)
        }
        "has_streaming_access_cmd" => {
            #[derive(Deserialize)]
            #[serde(rename_all = "camelCase")]
            struct Args {
                profile_id: String,
            }
            let parsed: Args = parse_args(args)?;
            ok(state.db.profile_has_streaming_access(&parsed.profile_id)?)
        }
        "mangadex_fetch_cmd" => {
            #[derive(Deserialize)]
            struct Args {
                path: String,
                #[serde(default)]
                query: Option<String>,
            }
            let parsed: Args = parse_args(args)?;
            ok(crate::mangadex::mangadex_fetch_cmd(parsed.path, parsed.query).await?)
        }
        "welib_popular_cmd" => {
            #[derive(Deserialize)]
            #[serde(rename_all = "camelCase")]
            struct Args {
                interval: Option<String>,
                offset: Option<u32>,
                limit: Option<u32>,
            }
            let parsed: Args = parse_args(args)?;
            ok(crate::welib::welib_popular_cmd(parsed.interval, parsed.offset, parsed.limit).await?)
        }
        "welib_search_cmd" => {
            #[derive(Deserialize)]
            #[serde(rename_all = "camelCase")]
            struct Args {
                query: String,
                page: Option<u32>,
            }
            let parsed: Args = parse_args(args)?;
            ok(crate::welib::welib_search_cmd(parsed.query, parsed.page).await?)
        }
        "extract_image_palette_cmd" => {
            #[derive(Deserialize)]
            struct Args {
                url: String,
            }
            let parsed: Args = parse_args(args)?;
            ok(crate::image_palette::extract_image_palette_cmd(parsed.url).await?)
        }
        "fetch_cast_photos_cmd" => {
            #[derive(Deserialize)]
            #[serde(rename_all = "camelCase")]
            struct Args {
                title: String,
                year: Option<i32>,
                is_series: bool,
                tmdb_id: Option<i64>,
                tmdb_type: Option<String>,
                cast_names: Vec<String>,
            }
            let parsed: Args = parse_args(args)?;
            let api_key = state
                .db
                .get_meta(crate::tmdb::META_TMDB_API_KEY)?
                .unwrap_or_default();
            if api_key.trim().is_empty() {
                return ok(
                    parsed
                        .cast_names
                        .iter()
                        .map(|name| crate::tmdb::CastPhoto {
                            name: name.clone(),
                            photo_url: None,
                        })
                        .collect::<Vec<_>>(),
                );
            }
            let title = parsed.title.clone();
            let year = parsed.year;
            let is_series = parsed.is_series;
            let tmdb_id = parsed.tmdb_id;
            let tmdb_type = parsed.tmdb_type.clone();
            let cast_names = parsed.cast_names.clone();
            let task = tokio::task::spawn_blocking(move || {
                crate::tmdb::fetch_cast_photos(
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
                        .map(|name| crate::tmdb::CastPhoto {
                            name: name.clone(),
                            photo_url: None,
                        })
                        .collect()
                })
            });
            ok(task.await.map_err(|e| format!("Errore cast: {e}"))?)
        }
        "get_friend_code_cmd" => {
            #[derive(Deserialize)]
            #[serde(rename_all = "camelCase")]
            struct Args {
                profile_id: String,
            }
            let parsed: Args = parse_args(args)?;
            ok(state.db.get_or_create_friend_code(&parsed.profile_id)?)
        }
        "list_friends_cmd" => {
            #[derive(Deserialize)]
            #[serde(rename_all = "camelCase")]
            struct Args {
                profile_id: String,
            }
            let parsed: Args = parse_args(args)?;
            ok(state.db.list_friends(&parsed.profile_id)?)
        }
        "add_friend_cmd" => {
            #[derive(Deserialize)]
            #[serde(rename_all = "camelCase")]
            struct Args {
                profile_id: String,
                friend_code: String,
                display_name: Option<String>,
            }
            let parsed: Args = parse_args(args)?;
            ok(state.db.add_friend(
                &parsed.profile_id,
                &parsed.friend_code,
                parsed.display_name.as_deref().unwrap_or(""),
            )?)
        }
        "remove_friend_cmd" => {
            #[derive(Deserialize)]
            #[serde(rename_all = "camelCase")]
            struct Args {
                profile_id: String,
                friend_code: String,
            }
            let parsed: Args = parse_args(args)?;
            state
                .db
                .remove_friend(&parsed.profile_id, &parsed.friend_code)?;
            ok(())
        }
        "get_library" => ok(crate::models::Library {
            items: vec![],
            collections: vec![],
            featured: None,
            media_root: String::new(),
            total_count: 0,
            last_scan: None,
        }),
        "scan_library_cmd" => ok(crate::models::ScanResult {
            added: 0,
            updated: 0,
            removed: 0,
            total: 0,
        }),
        "dev_local_dashboard_cmd" => {
            ok(crate::dev_admin::local_dashboard(state.db.as_ref())?)
        }
        other => Err(format!(
            "Comando non disponibile sulla web API: {other}. Usa l app desktop per questa funzione."
        )),
    }
}

async fn search_catalog_page_web(
    state: &AppState,
    query: String,
    offset: usize,
    limit: usize,
) -> Result<crate::catalog_search::SearchCatalogPage, String> {
    let db = state.db.clone();
    let sc_enabled = crate::sc_catalog::catalog_enabled(&state.db);
    let saturn_enabled = crate::saturn_catalog::enabled(&state.db);
    let loonex_enabled = crate::loonex_catalog::enabled(&state.db);
    let youtube_enabled = crate::youtube_catalog::enabled(&state.db);
    if !sc_enabled && !saturn_enabled && !loonex_enabled && !youtube_enabled {
        return Ok(crate::catalog_search::SearchCatalogPage {
            items: Vec::new(),
            total: 0,
            offset,
            has_more: false,
        });
    }
    let cdn = crate::sc_catalog::cdn_url(&state.db);
    let locale = crate::sc_catalog::lang(&state.db);
    let page_limit = limit.clamp(1, 500);
    tokio::task::spawn_blocking(move || {
        crate::catalog_search::search_catalog_page(
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

async fn fetch_sc_catalog_web(
    state: &AppState,
) -> Result<crate::sc_catalog::ScCatalogResponse, String> {
    let sc_enabled = crate::sc_catalog::catalog_enabled(&state.db);
    let saturn_enabled = crate::saturn_catalog::enabled(&state.db);
    let loonex_enabled = crate::loonex_catalog::enabled(&state.db);
    let youtube_enabled = crate::youtube_catalog::enabled(&state.db);
    if !sc_enabled && !saturn_enabled && !loonex_enabled && !youtube_enabled {
        return Ok(crate::sc_catalog::ScCatalogResponse {
            rows: Vec::new(),
            index: Vec::new(),
            synced_at: 0,
            total_count: 0,
            needs_background_sync: false,
        });
    }
    let cdn = crate::sc_catalog::cdn_url(&state.db);
    let locale = crate::sc_catalog::lang(&state.db);
    let db = state.db.clone();

    let sc_future = {
        let db = db.clone();
        let cdn = cdn.clone();
        let locale = locale.clone();
        async move {
            if !sc_enabled {
                return Ok(crate::sc_catalog::ScCatalogResponse {
                    rows: Vec::new(),
                    index: Vec::new(),
                    synced_at: 0,
                    total_count: 0,
                    needs_background_sync: false,
                });
            }
            tokio::task::spawn_blocking(move || {
                crate::sc_catalog::fetch_catalog(db.as_ref(), "", &cdn, &locale)
            })
            .await
            .map_err(|e| format!("Errore catalogo: {e}"))?
        }
    };

    let saturn_future = async {
        if !saturn_enabled {
            return None;
        }
        let db = db.clone();
        let task = tokio::task::spawn_blocking(move || crate::saturn_catalog::fetch_catalog(db.as_ref()));
        match tokio::time::timeout(std::time::Duration::from_secs(4), task).await {
            Ok(Ok(Ok(response))) => Some(response),
            _ => None,
        }
    };

    let loonex_future = async {
        if !loonex_enabled {
            return None;
        }
        let db = db.clone();
        let task = tokio::task::spawn_blocking(move || crate::loonex_catalog::fetch_catalog(db.as_ref()));
        match tokio::time::timeout(std::time::Duration::from_secs(5), task).await {
            Ok(Ok(Ok(response))) => Some(response),
            _ => None,
        }
    };

    let youtube_future = async {
        if !youtube_enabled {
            return None;
        }
        let db = db.clone();
        let task = tokio::task::spawn_blocking(move || crate::youtube_catalog::fetch_catalog(db.as_ref()));
        match tokio::time::timeout(std::time::Duration::from_secs(5), task).await {
            Ok(Ok(Ok(response))) => Some(response),
            _ => None,
        }
    };

    let (sc_result, saturn, loonex, youtube) =
        tokio::join!(sc_future, saturn_future, loonex_future, youtube_future);
    let mut response = sc_result?;

    if let Some(saturn) = saturn {
        merge_catalog(&mut response, saturn.rows, saturn.index, saturn.synced_at);
    }
    if let Some(loonex) = loonex {
        merge_catalog(&mut response, loonex.rows, loonex.index, loonex.synced_at);
        // Loonex incompleto non deve forzare sync/poll SC (blocca il boot).
    }
    if let Some(youtube) = youtube {
        merge_catalog(&mut response, youtube.rows, youtube.index, youtube.synced_at);
    }

    if sc_enabled {
        let db_meta = state.db.clone();
        crate::sc_catalog::spawn_catalog_boot_maintenance(db_meta);
    }

    Ok(response)
}

async fn refresh_sc_catalog_web(
    state: &AppState,
) -> Result<crate::sc_catalog::ScCatalogResponse, String> {
    let sc_enabled = crate::sc_catalog::catalog_enabled(&state.db);
    let saturn_enabled = crate::saturn_catalog::enabled(&state.db);
    let loonex_enabled = crate::loonex_catalog::enabled(&state.db);
    let youtube_enabled = crate::youtube_catalog::enabled(&state.db);
    if !sc_enabled && !saturn_enabled && !loonex_enabled && !youtube_enabled {
        return Ok(crate::sc_catalog::ScCatalogResponse {
            rows: Vec::new(),
            index: Vec::new(),
            synced_at: 0,
            total_count: 0,
            needs_background_sync: false,
        });
    }

    let cdn = crate::sc_catalog::cdn_url(&state.db);
    let locale = crate::sc_catalog::lang(&state.db);
    let db = state.db.clone();

    // Sync SC completa (archivio). I cataloghi esterni usano fetch rapido per non
    // bloccare la risposta per diversi minuti.
    let mut response = if sc_enabled {
        let db_sc = db.clone();
        let cdn_sc = cdn.clone();
        let locale_sc = locale.clone();
        tokio::task::spawn_blocking(move || {
            crate::sc_catalog::refresh_catalog_index(db_sc.as_ref(), "", &cdn_sc, &locale_sc)
        })
        .await
        .map_err(|e| format!("Errore aggiornamento catalogo: {e}"))??
    } else {
        crate::sc_catalog::ScCatalogResponse {
            rows: Vec::new(),
            index: Vec::new(),
            synced_at: 0,
            total_count: 0,
            needs_background_sync: false,
        }
    };

    if saturn_enabled {
        let db_s = db.clone();
        if let Ok(Ok(Ok(saturn))) = tokio::time::timeout(
            std::time::Duration::from_secs(20),
            tokio::task::spawn_blocking(move || crate::saturn_catalog::fetch_catalog(db_s.as_ref())),
        )
        .await
        {
            merge_catalog(
                &mut response,
                saturn.rows,
                saturn.index,
                saturn.synced_at,
            );
        }
    }

    if loonex_enabled {
        let db_l = db.clone();
        match tokio::time::timeout(
            std::time::Duration::from_secs(25),
            tokio::task::spawn_blocking(move || crate::loonex_catalog::fetch_catalog(db_l.as_ref())),
        )
        .await
        {
            Ok(Ok(Ok(loonex))) => {
                merge_catalog(
                    &mut response,
                    loonex.rows,
                    loonex.index,
                    loonex.synced_at,
                );
                if loonex.total_count < 120 {
                    response.needs_background_sync = true;
                }
            }
            _ => {
                response.needs_background_sync = true;
            }
        }
    }

    if youtube_enabled {
        let db_y = db.clone();
        if let Ok(Ok(Ok(youtube))) = tokio::time::timeout(
            std::time::Duration::from_secs(20),
            tokio::task::spawn_blocking(move || crate::youtube_catalog::fetch_catalog(db_y.as_ref())),
        )
        .await
        {
            merge_catalog(
                &mut response,
                youtube.rows,
                youtube.index,
                youtube.synced_at,
            );
        }
    }

    if sc_enabled {
        let db_meta = state.db.clone();
        crate::sc_catalog::spawn_continuous_metadata_enrichment(db_meta);
    }

    Ok(response)
}

fn merge_catalog(
    response: &mut crate::sc_catalog::ScCatalogResponse,
    rows: Vec<crate::sc_catalog::ScCatalogRow>,
    index: Vec<StremioMetaPreview>,
    synced_at: i64,
) {
    response.rows.extend(rows);
    let mut seen: std::collections::HashSet<String> = response
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

fn parse_args<T: for<'de> Deserialize<'de>>(args: Value) -> Result<T, String> {
    serde_json::from_value(args).map_err(|e| format!("Argomenti non validi: {e}"))
}

fn ok<T: serde::Serialize>(value: T) -> Result<Value, String> {
    let mut json = serde_json::to_value(value).map_err(|e| e.to_string())?;
    rewrite_public_urls(&mut json);
    Ok(json)
}

pub fn stream_state_from_app(state: &AppState) -> Arc<crate::stream::StreamState> {
    Arc::new(crate::stream::StreamState {
        db: state.db.clone(),
        addon_proxy: state.addon_proxy.clone(),
        torrent: state.torrent.clone(),
        watch_party: state.watch_party.clone(),
        presence: state.presence.clone(),
    })
}

fn rewrite_public_urls(value: &mut Value) {
    let public = crate::network::stream_http_base();
    if public.contains("127.0.0.1") {
        return;
    }
    let local_http = format!("http://127.0.0.1:{}", crate::models::STREAM_PORT);
    let local_ws = format!("ws://127.0.0.1:{}", crate::models::STREAM_PORT);
    let public_ws = public
        .replace("https://", "wss://")
        .replace("http://", "ws://");
    rewrite_urls_recursive(value, &local_http, &public);
    rewrite_urls_recursive(value, &local_ws, &public_ws);
    // Repair URLs already rewritten with a host but no scheme.
    rewrite_bare_public_hosts(value, &public);
}

fn rewrite_bare_public_hosts(value: &mut Value, public: &str) {
    let host = public
        .trim_start_matches("https://")
        .trim_start_matches("http://");
    if host.is_empty() {
        return;
    }
    let prefix = format!("{host}/");
    match value {
        Value::String(text) => {
            if text.starts_with(&prefix) && !text.starts_with("http") {
                *text = format!("https://{text}");
            }
        }
        Value::Array(items) => {
            for item in items {
                rewrite_bare_public_hosts(item, public);
            }
        }
        Value::Object(map) => {
            for item in map.values_mut() {
                rewrite_bare_public_hosts(item, public);
            }
        }
        _ => {}
    }
}

fn rewrite_urls_recursive(value: &mut Value, from: &str, to: &str) {
    match value {
        Value::String(text) => {
            if text.contains(from) {
                *text = text.replace(from, to);
            }
        }
        Value::Array(items) => {
            for item in items {
                rewrite_urls_recursive(item, from, to);
            }
        }
        Value::Object(map) => {
            for item in map.values_mut() {
                rewrite_urls_recursive(item, from, to);
            }
        }
        _ => {}
    }
}

// Silence unused import warnings for types referenced only in signatures.
#[allow(dead_code)]
type _WebTypes = (
    AppSettings,
    Profile,
    PlayableStream,
    StremioMeta,
    StreamingContinueItem,
    StreamingEpisodeProgress,
    WatchPartyRoomInfo,
);
