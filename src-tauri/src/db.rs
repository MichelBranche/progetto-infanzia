use crate::models::{gradient_for_type, MediaItem, PosterAsset, STREAM_PORT};
use crate::profiles::{CreateProfileInput, Profile, UpdateProfileInput};
use chrono::{Local, Utc};
use rusqlite::{params, Connection};
use std::collections::hash_map::DefaultHasher;
use std::collections::HashMap;
use std::hash::{Hash, Hasher};
use std::path::Path;
use std::sync::Mutex;

pub fn series_poster_id(media_type: &str, series_title: &str) -> String {
    let mut hasher = DefaultHasher::new();
    media_type.to_lowercase().hash(&mut hasher);
    series_title.trim().to_lowercase().hash(&mut hasher);
    format!("sp{:014x}", hasher.finish())
}

pub struct Database {
    conn: Mutex<Connection>,
}

impl Database {
    pub fn open(path: &Path) -> Result<Self, String> {
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }

        let conn = Connection::open(path).map_err(|e| e.to_string())?;
        conn.execute_batch(
            "
            PRAGMA foreign_keys = ON;

            CREATE TABLE IF NOT EXISTS media (
                id TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                media_type TEXT NOT NULL,
                year INTEGER,
                file_path TEXT NOT NULL UNIQUE,
                file_name TEXT NOT NULL,
                description TEXT,
                tag TEXT,
                series_title TEXT,
                season INTEGER,
                episode INTEGER,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS watch_progress (
                media_id TEXT PRIMARY KEY REFERENCES media(id) ON DELETE CASCADE,
                position_secs REAL NOT NULL DEFAULT 0,
                duration_secs REAL,
                updated_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS favorites (
                media_id TEXT PRIMARY KEY REFERENCES media(id) ON DELETE CASCADE,
                added_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS meta (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            );
            ",
        )
        .map_err(|e| e.to_string())?;

        migrate_schema(&conn)?;

        Ok(Self {
            conn: Mutex::new(conn),
        })
    }

    pub fn set_meta(&self, key: &str, value: &str) -> Result<(), String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        conn.execute(
            "INSERT INTO meta (key, value) VALUES (?1, ?2)
             ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            params![key, value],
        )
        .map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn get_meta(&self, key: &str) -> Result<Option<String>, String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        let mut stmt = conn
            .prepare("SELECT value FROM meta WHERE key = ?1")
            .map_err(|e| e.to_string())?;
        let mut rows = stmt.query(params![key]).map_err(|e| e.to_string())?;
        if let Some(row) = rows.next().map_err(|e| e.to_string())? {
            Ok(Some(row.get(0).map_err(|e| e.to_string())?))
        } else {
            Ok(None)
        }
    }

    pub fn upsert_media(&self, item: &ScannedMedia) -> Result<bool, String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        let now = Utc::now().to_rfc3339();

        let existing: Option<String> = conn
            .query_row(
                "SELECT id FROM media WHERE file_path = ?1",
                params![item.file_path],
                |row| row.get(0),
            )
            .ok();

        if let Some(id) = existing {
            conn.execute(
                "UPDATE media SET title = ?2, media_type = ?3, year = ?4, file_name = ?5,
                 description = COALESCE(?6, description), tag = ?7, series_title = ?8,
                 season = ?9, episode = ?10, updated_at = ?11 WHERE id = ?1",
                params![
                    id,
                    item.title,
                    item.media_type,
                    item.year,
                    item.file_name,
                    item.description,
                    item.tag,
                    item.series_title,
                    item.season,
                    item.episode,
                    now,
                ],
            )
            .map_err(|e| e.to_string())?;
            Ok(false)
        } else {
            conn.execute(
                "INSERT INTO media (id, title, media_type, year, file_path, file_name, description,
                 tag, series_title, season, episode, kid_friendly, created_at, updated_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14)",
                params![
                    item.id,
                    item.title,
                    item.media_type,
                    item.year,
                    item.file_path,
                    item.file_name,
                    item.description,
                    item.tag,
                    item.series_title,
                    item.season,
                    item.episode,
                    i32::from(item.kid_friendly),
                    now,
                    now,
                ],
            )
            .map_err(|e| e.to_string())?;
            Ok(true)
        }
    }

    pub fn remove_missing(&self, valid_paths: &[String]) -> Result<usize, String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        let mut stmt = conn
            .prepare("SELECT id, file_path FROM media")
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map([], |row| {
                Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
            })
            .map_err(|e| e.to_string())?;

        let mut removed = 0;
        for row in rows {
            let (id, path) = row.map_err(|e| e.to_string())?;
            if !valid_paths.contains(&path) {
                conn.execute("DELETE FROM media WHERE id = ?1", params![id])
                    .map_err(|e| e.to_string())?;
                removed += 1;
            }
        }
        Ok(removed)
    }

    pub fn get_file_path(&self, id: &str) -> Result<String, String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        conn.query_row(
            "SELECT file_path FROM media WHERE id = ?1",
            params![id],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())
    }

    pub fn get_poster_path(&self, id: &str) -> Result<String, String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        conn.query_row(
            "SELECT poster_path FROM media WHERE id = ?1 AND poster_path IS NOT NULL",
            params![id],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())
    }

    pub fn get_series_poster_path(&self, id: &str) -> Result<String, String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        conn.query_row(
            "SELECT poster_path FROM series_posters WHERE id = ?1",
            params![id],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())
    }

    pub fn upsert_series_poster(
        &self,
        media_type: &str,
        series_title: &str,
        poster_path: &str,
    ) -> Result<(), String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        let now = Utc::now().to_rfc3339();
        let id = series_poster_id(media_type, series_title);

        conn.execute(
            "INSERT INTO series_posters (id, media_type, series_title, poster_path, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5)
             ON CONFLICT(media_type, series_title) DO UPDATE SET
               poster_path = excluded.poster_path,
               updated_at = excluded.updated_at",
            params![id, media_type, series_title.trim(), poster_path, now],
        )
        .map_err(|e| e.to_string())?;

        Ok(())
    }

    pub fn insert_manual_media(
        &self,
        id: &str,
        title: &str,
        media_type: &str,
        file_path: &str,
        file_name: &str,
        description: Option<&str>,
        tag: Option<&str>,
        series_title: Option<&str>,
        season: Option<i32>,
        episode: Option<i32>,
        poster_path: Option<&str>,
        kid_friendly: bool,
        streaming_services: Option<&str>,
    ) -> Result<(), String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        let now = Utc::now().to_rfc3339();

        conn.execute(
            "INSERT INTO media (id, title, media_type, year, file_path, file_name, description,
             tag, series_title, season, episode, poster_path, kid_friendly, streaming_services,
             created_at, updated_at)
             VALUES (?1, ?2, ?3, NULL, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15)",
            params![
                id,
                title,
                media_type,
                file_path,
                file_name,
                description,
                tag,
                series_title,
                season,
                episode,
                poster_path,
                i32::from(kid_friendly),
                streaming_services,
                now,
                now,
            ],
        )
        .map_err(|e| e.to_string())?;

        Ok(())
    }

    pub fn get_media_files(&self, id: &str) -> Result<(String, Option<String>), String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        conn.query_row(
            "SELECT file_path, poster_path FROM media WHERE id = ?1",
            params![id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .map_err(|e| e.to_string())
    }

    pub fn update_media_metadata(
        &self,
        id: &str,
        title: Option<&str>,
        description: Option<&str>,
        tag: Option<&str>,
        series_title: Option<&str>,
        season: Option<i32>,
        episode: Option<i32>,
        kid_friendly: Option<bool>,
        streaming_services: Option<&[String]>,
    ) -> Result<(), String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        let now = Utc::now().to_rfc3339();

        let existing: (
            String,
            Option<String>,
            Option<String>,
            Option<String>,
            Option<i32>,
            Option<i32>,
            i32,
            Option<String>,
        ) = conn
            .query_row(
                "SELECT title, description, tag, series_title, season, episode, kid_friendly, streaming_services
                 FROM media WHERE id = ?1",
                params![id],
                |row| {
                    Ok((
                        row.get(0)?,
                        row.get(1)?,
                        row.get(2)?,
                        row.get(3)?,
                        row.get(4)?,
                        row.get(5)?,
                        row.get(6)?,
                        row.get(7)?,
                    ))
                },
            )
            .map_err(|_| "Media non trovato".to_string())?;

        let new_title = title.unwrap_or(&existing.0);
        let new_description = description.or(existing.1.as_deref());
        let new_tag = tag.or(existing.2.as_deref());
        let new_series = series_title.or(existing.3.as_deref());
        let new_season = season.or(existing.4);
        let new_episode = episode.or(existing.5);
        let new_kid_friendly = kid_friendly.unwrap_or(existing.6 == 1);
        let new_streaming = if let Some(services) = streaming_services {
            serialize_streaming_services(services)
        } else {
            existing.7
        };

        conn.execute(
            "UPDATE media SET title = ?2, description = ?3, tag = ?4, series_title = ?5,
             season = ?6, episode = ?7, kid_friendly = ?8, streaming_services = ?9,
             updated_at = ?10 WHERE id = ?1",
            params![
                id,
                new_title,
                new_description,
                new_tag,
                new_series,
                new_season,
                new_episode,
                i32::from(new_kid_friendly),
                new_streaming,
                now,
            ],
        )
        .map_err(|e| e.to_string())?;

        Ok(())
    }

    pub fn delete_media_row(&self, id: &str) -> Result<(), String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        let changed = conn
            .execute("DELETE FROM media WHERE id = ?1", params![id])
            .map_err(|e| e.to_string())?;
        if changed == 0 {
            return Err("Media non trovato".into());
        }
        Ok(())
    }

    pub fn list_series_titles(&self, media_type: &str) -> Result<Vec<String>, String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        let mut stmt = conn
            .prepare(
                "SELECT DISTINCT series_title FROM media
                 WHERE media_type = ?1 AND series_title IS NOT NULL AND TRIM(series_title) != ''
                 ORDER BY series_title COLLATE NOCASE",
            )
            .map_err(|e| e.to_string())?;

        let rows = stmt
            .query_map(params![media_type], |row| row.get::<_, String>(0))
            .map_err(|e| e.to_string())?;

        rows.collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())
    }

    pub fn list_poster_assets(&self, media_root: &Path) -> Result<Vec<PosterAsset>, String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        let mut by_path: HashMap<String, PosterAsset> = HashMap::new();

        let mut media_stmt = conn
            .prepare(
                "SELECT DISTINCT poster_path, title, media_type
                 FROM media
                 WHERE poster_path IS NOT NULL AND TRIM(poster_path) != ''",
            )
            .map_err(|e| e.to_string())?;

        let media_rows = media_stmt
            .query_map([], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                ))
            })
            .map_err(|e| e.to_string())?;

        for row in media_rows {
            let (path, title, media_type) = row.map_err(|e| e.to_string())?;
            insert_poster_asset(
                &mut by_path,
                &path,
                title,
                poster_kind_for_media_type(&media_type),
            );
        }

        let mut series_stmt = conn
            .prepare(
                "SELECT DISTINCT poster_path, series_title, media_type
                 FROM series_posters
                 WHERE poster_path IS NOT NULL AND TRIM(poster_path) != ''",
            )
            .map_err(|e| e.to_string())?;

        let series_rows = series_stmt
            .query_map([], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                ))
            })
            .map_err(|e| e.to_string())?;

        for row in series_rows {
            let (path, series_title, media_type) = row.map_err(|e| e.to_string())?;
            let label = format!("{series_title} ({})", kind_label("series", &media_type));
            insert_poster_asset(&mut by_path, &path, label, "series".to_string());
        }

        collect_posters_from_dir(&mut by_path, &media_root.join(".posters"), "episode");
        collect_posters_from_dir(
            &mut by_path,
            &media_root.join(".posters").join("series"),
            "series",
        );

        let mut assets: Vec<PosterAsset> = by_path.into_values().collect();
        assets.sort_by(|a, b| a.label.to_lowercase().cmp(&b.label.to_lowercase()));
        Ok(assets)
    }

    pub fn get_all_media(&self, profile_id: &str) -> Result<Vec<MediaItem>, String> {
        let kid_only = self
            .get_profile(profile_id)?
            .is_some_and(|p| p.role == "child");

        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        let mut stmt = conn
            .prepare(
                "SELECT m.id, m.title, m.media_type, m.year, m.file_path, m.file_name,
                        m.description, m.tag, m.series_title, m.season, m.episode,
                        m.poster_path,
                        sp.poster_path as series_poster_path,
                        wp.position_secs, wp.duration_secs, wp.updated_at as watch_updated_at,
                        CASE WHEN f.media_id IS NOT NULL THEN 1 ELSE 0 END as is_favorite,
                        m.created_at, m.kid_friendly, m.streaming_services,
                        m.tmdb_id, m.tmdb_type, m.genres, m.runtime_mins
                 FROM media m
                 LEFT JOIN series_posters sp
                   ON sp.media_type = m.media_type AND sp.series_title = m.series_title
                 LEFT JOIN watch_progress wp ON wp.media_id = m.id AND wp.profile_id = ?1
                 LEFT JOIN favorites f ON f.media_id = m.id AND f.profile_id = ?1
                 WHERE (?2 = 0 OR m.kid_friendly = 1)
                 ORDER BY m.title COLLATE NOCASE",
            )
            .map_err(|e| e.to_string())?;

        let kid_filter: i32 = if kid_only { 1 } else { 0 };

        let rows = stmt
            .query_map(params![profile_id, kid_filter], |row| {
                let media_type: String = row.get(2)?;
                let id: String = row.get(0)?;
                let idx = id.len() + media_type.len();
                let poster_path: Option<String> = row.get(11)?;
                let series_poster_path: Option<String> = row.get(12)?;
                let poster_url = poster_path
                    .as_ref()
                    .map(|_| format!("http://127.0.0.1:{STREAM_PORT}/poster/{id}"));
                let series_title: Option<String> = row.get(8)?;
                let series_poster_url = series_poster_path.as_ref().and_then(|_| {
                    series_title.as_ref().map(|title| {
                        let sp_id = series_poster_id(&media_type, title);
                        format!("http://127.0.0.1:{STREAM_PORT}/series-poster/{sp_id}")
                    })
                });
                let streaming_raw: Option<String> = row.get(19)?;
                let genres_raw: Option<String> = row.get(22)?;
                Ok(MediaItem {
                    id,
                    title: row.get(1)?,
                    media_type: media_type.clone(),
                    year: row.get(3)?,
                    file_path: row.get(4)?,
                    file_name: row.get(5)?,
                    description: row.get(6)?,
                    tag: row.get(7)?,
                    series_title,
                    season: row.get(9)?,
                    episode: row.get(10)?,
                    poster_path,
                    poster_url,
                    series_poster_path,
                    series_poster_url,
                    watch_position: row.get(13)?,
                    watch_duration: row.get(14)?,
                    watch_updated_at: row.get(15)?,
                    is_favorite: row.get::<_, i32>(16)? == 1,
                    kid_friendly: row.get::<_, i32>(18)? == 1,
                    tmdb_id: row.get(20)?,
                    tmdb_type: row.get(21)?,
                    genres: parse_genres(genres_raw),
                    runtime_mins: row.get(23)?,
                    streaming_services: parse_streaming_services(streaming_raw),
                    gradient: gradient_for_type(&media_type, idx as usize),
                    created_at: row.get(17)?,
                })
            })
            .map_err(|e| e.to_string())?;

        rows.collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())
    }

    pub fn get_media_by_id(&self, profile_id: &str, id: &str) -> Result<Option<MediaItem>, String> {
        Ok(self
            .get_all_media(profile_id)?
            .into_iter()
            .find(|item| item.id == id))
    }

    pub fn search_media(&self, profile_id: &str, query: &str) -> Result<Vec<MediaItem>, String> {
        let q = query.trim().to_lowercase();
        if q.is_empty() {
            return self.get_all_media(profile_id);
        }
        Ok(self
            .get_all_media(profile_id)?
            .into_iter()
            .filter(|item| {
                item.title.to_lowercase().contains(&q)
                    || item
                        .series_title
                        .as_ref()
                        .is_some_and(|s| s.to_lowercase().contains(&q))
                    || item.file_name.to_lowercase().contains(&q)
            })
            .collect())
    }

    pub fn update_watch_progress(
        &self,
        profile_id: &str,
        media_id: &str,
        position: f64,
        duration: Option<f64>,
    ) -> Result<(), String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        let now = Utc::now().to_rfc3339();
        conn.execute(
            "INSERT INTO watch_progress (profile_id, media_id, position_secs, duration_secs, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5)
             ON CONFLICT(profile_id, media_id) DO UPDATE SET
               position_secs = excluded.position_secs,
               duration_secs = COALESCE(excluded.duration_secs, watch_progress.duration_secs),
               updated_at = excluded.updated_at",
            params![profile_id, media_id, position, duration, now],
        )
        .map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn upsert_streaming_watch_progress(
        &self,
        profile_id: &str,
        input: &crate::stremio::StreamingWatchProgressInput,
    ) -> Result<(), String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        let progress_key = format!(
            "{}:{}:{}:{}:{}",
            input.catalog_prefix.trim(),
            input.content_type.trim(),
            input.title_id.trim(),
            input.slug.trim(),
            input.video_id.trim()
        );
        let now = Utc::now().to_rfc3339();
        conn.execute(
            "INSERT INTO streaming_watch_progress (
                profile_id, progress_key, catalog_prefix, content_type, title_id, slug,
                video_id, title_name, episode_label, poster_url,
                position_secs, duration_secs, updated_at
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)
             ON CONFLICT(profile_id, progress_key) DO UPDATE SET
               title_name = excluded.title_name,
               episode_label = excluded.episode_label,
               poster_url = COALESCE(excluded.poster_url, streaming_watch_progress.poster_url),
               position_secs = excluded.position_secs,
               duration_secs = COALESCE(excluded.duration_secs, streaming_watch_progress.duration_secs),
               updated_at = excluded.updated_at",
            params![
                profile_id,
                progress_key,
                input.catalog_prefix,
                input.content_type,
                input.title_id,
                input.slug,
                input.video_id,
                input.title_name,
                input.episode_label,
                input.poster,
                input.position_secs,
                input.duration_secs,
                now,
            ],
        )
        .map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn list_streaming_title_watch_progress(
        &self,
        profile_id: &str,
        catalog_prefix: &str,
        content_type: &str,
        title_id: &str,
        slug: &str,
    ) -> Result<Vec<crate::stremio::StreamingEpisodeProgress>, String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        let mut stmt = conn
            .prepare(
                "SELECT video_id, position_secs, duration_secs
                 FROM streaming_watch_progress
                 WHERE profile_id = ?1
                   AND catalog_prefix = ?2
                   AND content_type = ?3
                   AND title_id = ?4
                   AND slug = ?5
                   AND position_secs > 0",
            )
            .map_err(|e| e.to_string())?;

        let rows = stmt
            .query_map(
                params![
                    profile_id,
                    catalog_prefix,
                    content_type,
                    title_id,
                    slug,
                ],
                |row| {
                    Ok(crate::stremio::StreamingEpisodeProgress {
                        video_id: row.get(0)?,
                        position_secs: row.get(1)?,
                        duration_secs: row.get(2)?,
                    })
                },
            )
            .map_err(|e| e.to_string())?;

        rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
    }

    pub fn get_streaming_watch_progress(
        &self,
        profile_id: &str,
        catalog_prefix: &str,
        content_type: &str,
        title_id: &str,
        slug: &str,
        video_id: &str,
    ) -> Result<Option<(f64, Option<f64>)>, String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        let progress_key = format!(
            "{}:{}:{}:{}:{}",
            catalog_prefix.trim(),
            content_type.trim(),
            title_id.trim(),
            slug.trim(),
            video_id.trim()
        );
        let row = conn.query_row(
            "SELECT position_secs, duration_secs FROM streaming_watch_progress
             WHERE profile_id = ?1 AND progress_key = ?2",
            params![profile_id, progress_key],
            |row| Ok((row.get::<_, f64>(0)?, row.get::<_, Option<f64>>(1)?)),
        );
        match row {
            Ok(value) => Ok(Some(value)),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
            Err(e) => Err(e.to_string()),
        }
    }

    pub fn list_streaming_continue_watching(
        &self,
        profile_id: &str,
        limit: usize,
    ) -> Result<Vec<crate::stremio::StreamingContinueItem>, String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        let mut stmt = conn
            .prepare(
                "SELECT catalog_prefix, content_type, title_id, slug, video_id,
                        title_name, episode_label, poster_url,
                        position_secs, duration_secs, updated_at
                 FROM streaming_watch_progress
                 WHERE profile_id = ?1
                   AND position_secs > 5
                   AND (duration_secs IS NULL OR duration_secs <= 0 OR position_secs / duration_secs < 0.92)
                 ORDER BY updated_at DESC
                 LIMIT ?2",
            )
            .map_err(|e| e.to_string())?;

        let fetch_limit = (limit.saturating_mul(4)).max(limit) as i64;
        let rows = stmt
            .query_map(params![profile_id, fetch_limit], |row| {
                Ok(crate::stremio::StreamingContinueItem {
                    catalog_prefix: row.get(0)?,
                    content_type: row.get(1)?,
                    title_id: row.get(2)?,
                    slug: row.get(3)?,
                    video_id: row.get(4)?,
                    title_name: row.get(5)?,
                    episode_label: row.get(6)?,
                    poster: row.get(7)?,
                    position_secs: row.get(8)?,
                    duration_secs: row.get(9)?,
                    updated_at: row.get(10)?,
                })
            })
            .map_err(|e| e.to_string())?;

        let mut items = rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())?;
        let mut seen_series = std::collections::HashSet::new();
        items.retain(|item| {
            let key = format!(
                "{}:{}:{}:{}",
                item.catalog_prefix, item.content_type, item.title_id, item.slug
            );
            seen_series.insert(key)
        });
        items.truncate(limit);
        Ok(items)
    }

    pub fn list_streaming_watch_history(
        &self,
        profile_id: &str,
        limit: usize,
    ) -> Result<Vec<crate::stremio::StreamingContinueItem>, String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        let mut stmt = conn
            .prepare(
                "SELECT catalog_prefix, content_type, title_id, slug, video_id,
                        title_name, episode_label, poster_url,
                        position_secs, duration_secs, updated_at
                 FROM streaming_watch_progress
                 WHERE profile_id = ?1 AND position_secs > 5
                 ORDER BY updated_at DESC
                 LIMIT ?2",
            )
            .map_err(|e| e.to_string())?;

        let rows = stmt
            .query_map(params![profile_id, limit as i64], |row| {
                Ok(crate::stremio::StreamingContinueItem {
                    catalog_prefix: row.get(0)?,
                    content_type: row.get(1)?,
                    title_id: row.get(2)?,
                    slug: row.get(3)?,
                    video_id: row.get(4)?,
                    title_name: row.get(5)?,
                    episode_label: row.get(6)?,
                    poster: row.get(7)?,
                    position_secs: row.get(8)?,
                    duration_secs: row.get(9)?,
                    updated_at: row.get(10)?,
                })
            })
            .map_err(|e| e.to_string())?;

        rows.collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())
    }

    pub fn toggle_favorite(&self, profile_id: &str, media_id: &str) -> Result<bool, String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        let exists: i32 = conn
            .query_row(
                "SELECT COUNT(*) FROM favorites WHERE profile_id = ?1 AND media_id = ?2",
                params![profile_id, media_id],
                |row| row.get(0),
            )
            .map_err(|e| e.to_string())?;

        if exists > 0 {
            conn.execute(
                "DELETE FROM favorites WHERE profile_id = ?1 AND media_id = ?2",
                params![profile_id, media_id],
            )
            .map_err(|e| e.to_string())?;
            Ok(false)
        } else {
            let now = Utc::now().to_rfc3339();
            conn.execute(
                "INSERT INTO favorites (profile_id, media_id, added_at) VALUES (?1, ?2, ?3)",
                params![profile_id, media_id, now],
            )
            .map_err(|e| e.to_string())?;
            Ok(true)
        }
    }

    pub fn list_streaming_list(
        &self,
        profile_id: &str,
    ) -> Result<Vec<crate::stremio::StremioMetaPreview>, String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        let mut stmt = conn
            .prepare(
                "SELECT catalog_prefix, content_type, title_id, slug, name, poster_url, media_type, release_info
                 FROM streaming_list
                 WHERE profile_id = ?1
                 ORDER BY added_at DESC",
            )
            .map_err(|e| e.to_string())?;

        let rows = stmt
            .query_map(params![profile_id], |row| {
                Ok(crate::stremio::StremioMetaPreview {
                    id: row.get::<_, String>(2)?,
                    r#type: row.get::<_, String>(1)?,
                    name: row.get::<_, String>(4)?,
                    poster: row.get::<_, Option<String>>(5)?,
                    poster_shape: None,
                    description: None,
                    release_info: row.get::<_, Option<String>>(7)?,
                    catalog_prefix: Some(row.get::<_, String>(0)?),
                    slug: {
                        let slug: String = row.get(3)?;
                        if slug.is_empty() {
                            None
                        } else {
                            Some(slug)
                        }
                    },
                    genres: Vec::new(),
                    source_row_key: None,
                    source_row_title: None,
                    resume_video_id: None,
                })
            })
            .map_err(|e| e.to_string())?;

        rows.collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())
    }

    pub fn toggle_streaming_list(
        &self,
        profile_id: &str,
        catalog_prefix: &str,
        content_type: &str,
        title_id: &str,
        slug: &str,
        name: &str,
        poster: Option<&str>,
        media_type: Option<&str>,
        release_info: Option<&str>,
    ) -> Result<bool, String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        let exists: i32 = conn
            .query_row(
                "SELECT COUNT(*) FROM streaming_list
                 WHERE profile_id = ?1 AND catalog_prefix = ?2 AND content_type = ?3 AND title_id = ?4",
                params![profile_id, catalog_prefix, content_type, title_id],
                |row| row.get(0),
            )
            .map_err(|e| e.to_string())?;

        if exists > 0 {
            conn.execute(
                "DELETE FROM streaming_list
                 WHERE profile_id = ?1 AND catalog_prefix = ?2 AND content_type = ?3 AND title_id = ?4",
                params![profile_id, catalog_prefix, content_type, title_id],
            )
            .map_err(|e| e.to_string())?;
            Ok(false)
        } else {
            let now = Utc::now().to_rfc3339();
            conn.execute(
                "INSERT INTO streaming_list (
                    profile_id, catalog_prefix, content_type, title_id, slug, name,
                    poster_url, media_type, release_info, added_at
                ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
                params![
                    profile_id,
                    catalog_prefix,
                    content_type,
                    title_id,
                    slug,
                    name,
                    poster,
                    media_type,
                    release_info,
                    now,
                ],
            )
            .map_err(|e| e.to_string())?;
            Ok(true)
        }
    }

    fn random_friend_code(&self, conn: &rusqlite::Connection) -> Result<String, String> {
        const CHARS: &[u8] = b"ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
        for _ in 0..32 {
            let code: String = (0..8)
                .map(|i| {
                    let n = (chrono::Utc::now().timestamp_nanos_opt().unwrap_or(0) as usize)
                        .wrapping_add(i * 17)
                        % CHARS.len();
                    CHARS[n] as char
                })
                .collect();
            let exists: i32 = conn
                .query_row(
                    "SELECT COUNT(*) FROM profile_friend_codes WHERE friend_code = ?1",
                    rusqlite::params![code],
                    |row| row.get(0),
                )
                .map_err(|e| e.to_string())?;
            if exists == 0 {
                return Ok(code);
            }
        }
        Err("Impossibile generare un codice amico".into())
    }

    pub fn get_or_create_friend_code(&self, profile_id: &str) -> Result<String, String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        if let Ok(code) = conn.query_row(
            "SELECT friend_code FROM profile_friend_codes WHERE profile_id = ?1",
            rusqlite::params![profile_id],
            |row| row.get::<_, String>(0),
        ) {
            return Ok(code);
        }
        let code = self.random_friend_code(&conn)?;
        let now = chrono::Utc::now().to_rfc3339();
        conn.execute(
            "INSERT INTO profile_friend_codes (profile_id, friend_code, created_at) VALUES (?1, ?2, ?3)",
            rusqlite::params![profile_id, code, now],
        )
        .map_err(|e| e.to_string())?;
        Ok(code)
    }

    pub fn list_friends(
        &self,
        owner_profile_id: &str,
    ) -> Result<Vec<crate::models::FriendRecord>, String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        let mut stmt = conn
            .prepare(
                "SELECT friend_code, display_name, last_host, added_at
                 FROM friends WHERE owner_profile_id = ?1 ORDER BY added_at DESC",
            )
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map(rusqlite::params![owner_profile_id], |row| {
                Ok(crate::models::FriendRecord {
                    friend_code: row.get(0)?,
                    display_name: row.get(1)?,
                    last_host: row.get(2)?,
                    added_at: row.get(3)?,
                })
            })
            .map_err(|e| e.to_string())?;
        rows.collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())
    }

    pub fn add_friend(
        &self,
        owner_profile_id: &str,
        friend_code: &str,
        display_name: &str,
    ) -> Result<crate::models::FriendRecord, String> {
        let code = friend_code.trim().to_uppercase();
        if code.len() < 6 {
            return Err("Codice amico non valido".into());
        }
        let own = self.get_or_create_friend_code(owner_profile_id)?;
        if own == code {
            return Err("Non puoi aggiungere te stesso".into());
        }
        let now = chrono::Utc::now().to_rfc3339();
        let name = if display_name.trim().is_empty() {
            format!("Amico {code}")
        } else {
            display_name.trim().to_string()
        };
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        conn.execute(
            "INSERT INTO friends (owner_profile_id, friend_code, display_name, last_host, added_at)
             VALUES (?1, ?2, ?3, NULL, ?4)
             ON CONFLICT(owner_profile_id, friend_code) DO UPDATE SET display_name = excluded.display_name",
            rusqlite::params![owner_profile_id, code, name, now],
        )
        .map_err(|e| e.to_string())?;
        Ok(crate::models::FriendRecord {
            friend_code: code,
            display_name: name,
            last_host: None,
            added_at: now,
        })
    }

    pub fn remove_friend(&self, owner_profile_id: &str, friend_code: &str) -> Result<(), String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        conn.execute(
            "DELETE FROM friends WHERE owner_profile_id = ?1 AND friend_code = ?2",
            rusqlite::params![owner_profile_id, friend_code.to_uppercase()],
        )
        .map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn update_friend_host(
        &self,
        owner_profile_id: &str,
        friend_code: &str,
        host: &str,
    ) -> Result<(), String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        conn.execute(
            "UPDATE friends SET last_host = ?3
             WHERE owner_profile_id = ?1 AND friend_code = ?2",
            rusqlite::params![owner_profile_id, friend_code.to_uppercase(), host],
        )
        .map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn update_friend_hosts_for_code(
        &self,
        friend_code: &str,
        host: &str,
    ) -> Result<(), String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        conn.execute(
            "UPDATE friends SET last_host = ?2 WHERE friend_code = ?1",
            rusqlite::params![friend_code.to_uppercase(), host],
        )
        .map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn list_friend_hosts(
        &self,
        owner_profile_id: &str,
    ) -> Result<Vec<(String, String, Option<String>)>, String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        let mut stmt = conn
            .prepare(
                "SELECT friend_code, display_name, last_host FROM friends WHERE owner_profile_id = ?1",
            )
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map(rusqlite::params![owner_profile_id], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, Option<String>>(2)?,
                ))
            })
            .map_err(|e| e.to_string())?;
        rows.collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())
    }

    pub fn count_media(&self) -> Result<usize, String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        let count: i32 = conn
            .query_row("SELECT COUNT(*) FROM media", [], |row| row.get(0))
            .map_err(|e| e.to_string())?;
        Ok(count as usize)
    }

    pub fn get_profiles(&self) -> Result<Vec<Profile>, String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        let mut stmt = conn
            .prepare(
                "SELECT id, name, role, avatar_color, accent_color, avatar_style, avatar_emoji, created_at,
                        CASE WHEN pin_hash IS NOT NULL AND pin_hash != '' THEN 1 ELSE 0 END
                 FROM profiles ORDER BY
                   CASE role WHEN 'parent' THEN 0 WHEN 'child' THEN 1 ELSE 2 END,
                   created_at ASC",
            )
            .map_err(|e| e.to_string())?;

        let rows = stmt
            .query_map([], |row| {
                Ok(Profile {
                    id: row.get(0)?,
                    name: row.get(1)?,
                    role: row.get(2)?,
                    avatar_color: row.get(3)?,
                    accent_color: row.get(4)?,
                    avatar_style: row.get(5)?,
                    avatar_emoji: row.get(6)?,
                    created_at: row.get(7)?,
                    has_pin: row.get::<_, i32>(8)? == 1,
                })
            })
            .map_err(|e| e.to_string())?;

        rows.collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())
    }

    pub fn get_profile(&self, id: &str) -> Result<Option<Profile>, String> {
        Ok(self.get_profiles()?.into_iter().find(|p| p.id == id))
    }

    pub fn is_parent_profile(&self, id: &str) -> Result<bool, String> {
        Ok(self.get_profile(id)?.is_some_and(|p| p.role == "parent"))
    }

    pub fn create_profile(&self, input: &CreateProfileInput) -> Result<Profile, String> {
        if input.name.trim().is_empty() {
            return Err("Il nome del profilo è obbligatorio".into());
        }

        match input.role.as_str() {
            "parent" | "child" | "other" => {}
            _ => return Err("Ruolo profilo non valido".into()),
        }

        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        let now = Utc::now().to_rfc3339();
        let id = format!("profile-{}", Utc::now().timestamp_millis());

        let avatar_style = input
            .avatar_style
            .as_deref()
            .filter(|s| !s.is_empty())
            .unwrap_or("emoji");
        match avatar_style {
            "emoji" | "initial" | "gradient" => {}
            _ => return Err("Stile avatar non valido".into()),
        }

        let avatar_emoji = if avatar_style == "emoji" {
            input.avatar_emoji.clone()
        } else {
            None
        };
        let accent_color = if avatar_style == "gradient" {
            input.accent_color.clone()
        } else {
            None
        };

        conn.execute(
            "INSERT INTO profiles (id, name, role, avatar_color, accent_color, avatar_style, avatar_emoji, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            params![
                id,
                input.name.trim(),
                input.role,
                input.avatar_color,
                accent_color,
                avatar_style,
                avatar_emoji,
                now,
            ],
        )
        .map_err(|e| e.to_string())?;

        Ok(Profile {
            id,
            name: input.name.trim().to_string(),
            role: input.role.clone(),
            avatar_color: input.avatar_color.clone(),
            accent_color,
            avatar_style: Some(avatar_style.to_string()),
            avatar_emoji,
            created_at: now,
            has_pin: false,
        })
    }

    pub fn delete_profile(&self, id: &str) -> Result<(), String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        let count: i32 = conn
            .query_row("SELECT COUNT(*) FROM profiles", [], |row| row.get(0))
            .map_err(|e| e.to_string())?;

        if count <= 1 {
            return Err("Devi avere almeno un profilo".into());
        }

        conn.execute("DELETE FROM profiles WHERE id = ?1", params![id])
            .map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn update_profile(&self, id: &str, input: &UpdateProfileInput) -> Result<Profile, String> {
        let existing = self
            .get_profile(id)?
            .ok_or_else(|| "Profilo non trovato".to_string())?;

        let name = input
            .name
            .as_deref()
            .map(str::trim)
            .filter(|n| !n.is_empty())
            .unwrap_or(&existing.name);

        let role = input.role.as_deref().unwrap_or(&existing.role);
        match role {
            "parent" | "child" | "other" => {}
            _ => return Err("Ruolo profilo non valido".into()),
        }

        let avatar_color = input
            .avatar_color
            .as_deref()
            .unwrap_or(&existing.avatar_color);
        let avatar_style = input
            .avatar_style
            .as_deref()
            .or(existing.avatar_style.as_deref())
            .unwrap_or("emoji");
        match avatar_style {
            "emoji" | "initial" | "gradient" => {}
            _ => return Err("Stile avatar non valido".into()),
        }

        let avatar_emoji = if avatar_style == "emoji" {
            input
                .avatar_emoji
                .clone()
                .or(existing.avatar_emoji.clone())
        } else {
            None
        };
        let accent_color = if avatar_style == "gradient" {
            input
                .accent_color
                .clone()
                .or(existing.accent_color.clone())
        } else {
            None
        };

        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        conn.execute(
            "UPDATE profiles SET name = ?2, role = ?3, avatar_color = ?4, accent_color = ?5, avatar_style = ?6, avatar_emoji = ?7 WHERE id = ?1",
            params![
                id,
                name,
                role,
                avatar_color,
                accent_color,
                avatar_style,
                avatar_emoji,
            ],
        )
        .map_err(|e| e.to_string())?;

        drop(conn);
        self.get_profile(id)?
            .ok_or_else(|| "Profilo non trovato".to_string())
    }

    pub fn set_profile_pin(
        &self,
        id: &str,
        pin: &str,
        current_pin: Option<&str>,
    ) -> Result<(), String> {
        if !crate::profiles::is_valid_pin(pin) {
            return Err("Il PIN deve avere 4-8 cifre".into());
        }

        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        let (role, existing_hash): (String, Option<String>) = conn
            .query_row(
                "SELECT role, pin_hash FROM profiles WHERE id = ?1",
                params![id],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .map_err(|_| "Profilo non trovato".to_string())?;

        if role != "parent" {
            return Err("Solo il profilo genitore può avere un PIN".into());
        }

        if let Some(hash) = existing_hash.as_deref().filter(|h| !h.is_empty()) {
            let current = current_pin.ok_or_else(|| "Inserisci il PIN attuale".to_string())?;
            if !crate::profiles::verify_pin(current, hash) {
                return Err("PIN attuale non corretto".into());
            }
        }

        let new_hash = crate::profiles::hash_pin(pin);
        conn.execute(
            "UPDATE profiles SET pin_hash = ?2 WHERE id = ?1",
            params![id, new_hash],
        )
        .map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn remove_profile_pin(&self, id: &str, current_pin: &str) -> Result<(), String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        let existing_hash: Option<String> = conn
            .query_row(
                "SELECT pin_hash FROM profiles WHERE id = ?1",
                params![id],
                |row| row.get(0),
            )
            .map_err(|_| "Profilo non trovato".to_string())?;

        let hash = existing_hash
            .as_deref()
            .filter(|h| !h.is_empty())
            .ok_or_else(|| "Questo profilo non ha un PIN".to_string())?;

        if !crate::profiles::verify_pin(current_pin, hash) {
            return Err("PIN non corretto".into());
        }

        conn.execute(
            "UPDATE profiles SET pin_hash = NULL WHERE id = ?1",
            params![id],
        )
        .map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn verify_profile_pin(&self, id: &str, pin: &str) -> Result<bool, String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        let existing_hash: Option<String> = conn
            .query_row(
                "SELECT pin_hash FROM profiles WHERE id = ?1",
                params![id],
                |row| row.get(0),
            )
            .map_err(|_| "Profilo non trovato".to_string())?;

        Ok(existing_hash
            .as_deref()
            .filter(|h| !h.is_empty())
            .is_some_and(|hash| crate::profiles::verify_pin(pin, hash)))
    }

    pub fn get_settings(&self, media_root: &Path) -> Result<crate::settings::AppSettings, String> {
        let intro_sound_enabled = self
            .get_meta(crate::settings::META_INTRO_SOUND)?
            .map(|v| v != "false")
            .unwrap_or(true);
        let subscribed_services = self
            .get_meta(crate::settings::META_SUBSCRIBED_SERVICES)?
            .map(|raw| parse_streaming_services(Some(raw)))
            .unwrap_or_default();
        let last_scan = self.get_meta("last_scan")?;
        let tmdb_api_key = self
            .get_meta(crate::tmdb::META_TMDB_API_KEY)?
            .filter(|k| !k.is_empty());
        let tmdb_enrich_on_scan = self
            .get_meta(crate::tmdb::META_ENRICH_ON_SCAN)?
            .map(|v| v != "false")
            .unwrap_or(false);
        let cast_transcode_enabled = self
            .get_meta(crate::settings::META_CAST_TRANSCODE)?
            .map(|v| v != "false")
            .unwrap_or(true);

        Ok(crate::settings::AppSettings {
            intro_sound_enabled,
            subscribed_services,
            media_root: media_root.to_string_lossy().to_string(),
            last_scan,
            stream_port: STREAM_PORT,
            tmdb_api_key,
            tmdb_enrich_on_scan,
            cast_transcode_enabled,
        })
    }

    pub fn update_settings(
        &self,
        input: &crate::settings::UpdateSettingsInput,
    ) -> Result<(), String> {
        if let Some(enabled) = input.intro_sound_enabled {
            self.set_meta(
                crate::settings::META_INTRO_SOUND,
                if enabled { "true" } else { "false" },
            )?;
        }
        if let Some(services) = &input.subscribed_services {
            self.set_meta(
                crate::settings::META_SUBSCRIBED_SERVICES,
                &serialize_streaming_services(services).unwrap_or_else(|| "[]".to_string()),
            )?;
        }
        if let Some(key) = &input.tmdb_api_key {
            self.set_meta(crate::tmdb::META_TMDB_API_KEY, key)?;
        }
        if let Some(enrich) = input.tmdb_enrich_on_scan {
            self.set_meta(
                crate::tmdb::META_ENRICH_ON_SCAN,
                if enrich { "true" } else { "false" },
            )?;
        }
        if let Some(transcode) = input.cast_transcode_enabled {
            self.set_meta(
                crate::settings::META_CAST_TRANSCODE,
                if transcode { "true" } else { "false" },
            )?;
        }
        Ok(())
    }

    pub fn get_debrid_config(&self) -> Result<crate::debrid::DebridConfig, String> {
        let provider = self
            .get_meta("debrid_provider")?
            .filter(|p| !p.is_empty())
            .unwrap_or_else(|| "none".to_string());
        let api_key = self.get_meta("debrid_api_key")?.unwrap_or_default();
        Ok(crate::debrid::DebridConfig { provider, api_key })
    }

    pub fn set_debrid_config(&self, provider: &str, api_key: &str) -> Result<(), String> {
        self.set_meta("debrid_provider", provider)?;
        self.set_meta("debrid_api_key", api_key)?;
        Ok(())
    }

    pub fn list_media_without_tmdb(&self, limit: usize) -> Result<Vec<PendingEnrichMedia>, String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        let mut stmt = conn
            .prepare(
                "SELECT id, title, media_type, year, series_title FROM media
                 WHERE tmdb_id IS NULL
                 ORDER BY created_at DESC
                 LIMIT ?1",
            )
            .map_err(|e| e.to_string())?;

        let rows = stmt
            .query_map(params![limit as i64], |row| {
                Ok(PendingEnrichMedia {
                    id: row.get(0)?,
                    title: row.get(1)?,
                    media_type: row.get(2)?,
                    year: row.get(3)?,
                    series_title: row.get(4)?,
                })
            })
            .map_err(|e| e.to_string())?;

        rows.collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())
    }

    pub fn apply_tmdb_enrichment(
        &self,
        media_id: &str,
        tmdb_id: i64,
        tmdb_type: &str,
        description: Option<&str>,
        year: Option<i32>,
        genres_json: Option<&str>,
        runtime_mins: Option<i32>,
        poster_path: Option<&str>,
    ) -> Result<(), String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        let now = Utc::now().to_rfc3339();
        conn.execute(
            "UPDATE media SET
                tmdb_id = ?2, tmdb_type = ?3,
                description = COALESCE(?4, description),
                year = COALESCE(?5, year),
                genres = COALESCE(?6, genres),
                runtime_mins = COALESCE(?7, runtime_mins),
                poster_path = COALESCE(?8, poster_path),
                updated_at = ?9
             WHERE id = ?1",
            params![
                media_id,
                tmdb_id,
                tmdb_type,
                description,
                year,
                genres_json,
                runtime_mins,
                poster_path,
                now,
            ],
        )
        .map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn apply_sidecar_metadata(
        &self,
        media_id: &str,
        poster_path: &str,
        description: Option<&str>,
    ) -> Result<(), String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        let now = Utc::now().to_rfc3339();
        conn.execute(
            "UPDATE media SET
                poster_path = COALESCE(poster_path, ?2),
                description = COALESCE(?3, description),
                updated_at = ?4
             WHERE id = ?1",
            params![media_id, poster_path, description, now],
        )
        .map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn get_profile_limits(
        &self,
        profile_id: &str,
    ) -> Result<crate::parental::ProfileLimits, String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        let result = conn.query_row(
            "SELECT profile_id, daily_limit_mins, bedtime_start, bedtime_end
             FROM profile_limits WHERE profile_id = ?1",
            params![profile_id],
            |row| {
                Ok(crate::parental::ProfileLimits {
                    profile_id: row.get(0)?,
                    daily_limit_mins: row.get(1)?,
                    bedtime_start: row.get(2)?,
                    bedtime_end: row.get(3)?,
                })
            },
        );

        match result {
            Ok(limits) => Ok(limits),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(crate::parental::ProfileLimits {
                profile_id: profile_id.to_string(),
                daily_limit_mins: 0,
                bedtime_start: None,
                bedtime_end: None,
            }),
            Err(e) => Err(e.to_string()),
        }
    }

    pub fn update_profile_limits(
        &self,
        profile_id: &str,
        input: &crate::parental::UpdateProfileLimitsInput,
    ) -> Result<crate::parental::ProfileLimits, String> {
        let current = self.get_profile_limits(profile_id)?;
        let daily = input.daily_limit_mins.unwrap_or(current.daily_limit_mins);
        let bedtime_start = input.bedtime_start.clone().or(current.bedtime_start);
        let bedtime_end = input.bedtime_end.clone().or(current.bedtime_end);

        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        conn.execute(
            "INSERT INTO profile_limits (profile_id, daily_limit_mins, bedtime_start, bedtime_end)
             VALUES (?1, ?2, ?3, ?4)
             ON CONFLICT(profile_id) DO UPDATE SET
               daily_limit_mins = excluded.daily_limit_mins,
               bedtime_start = excluded.bedtime_start,
               bedtime_end = excluded.bedtime_end",
            params![profile_id, daily, bedtime_start, bedtime_end],
        )
        .map_err(|e| e.to_string())?;

        self.get_profile_limits(profile_id)
    }

    pub fn start_watch_session(&self, profile_id: &str, media_id: &str) -> Result<String, String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        let title: String = conn
            .query_row(
                "SELECT title FROM media WHERE id = ?1",
                params![media_id],
                |row| row.get(0),
            )
            .unwrap_or_default();
        let id = format!("{:016x}", {
            use std::collections::hash_map::DefaultHasher;
            use std::hash::{Hash, Hasher};
            let mut h = DefaultHasher::new();
            profile_id.hash(&mut h);
            media_id.hash(&mut h);
            Utc::now().to_rfc3339().hash(&mut h);
            h.finish()
        });
        let now = Utc::now().to_rfc3339();
        conn.execute(
            "INSERT INTO watch_sessions (
                id, profile_id, media_id, session_title, source_kind,
                started_at, seconds_watched, completed
             ) VALUES (?1, ?2, ?3, ?4, 'local', ?5, 0, 0)",
            params![id, profile_id, media_id, title, now],
        )
        .map_err(|e| e.to_string())?;
        Ok(id)
    }

    pub fn start_addon_watch_session(
        &self,
        profile_id: &str,
        content_type: &str,
        video_id: &str,
        title: &str,
    ) -> Result<String, String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        let synthetic_id = format!("{content_type}:{video_id}");
        let id = format!("{:016x}", {
            use std::collections::hash_map::DefaultHasher;
            use std::hash::{Hash, Hasher};
            let mut h = DefaultHasher::new();
            profile_id.hash(&mut h);
            synthetic_id.hash(&mut h);
            Utc::now().to_rfc3339().hash(&mut h);
            h.finish()
        });
        let now = Utc::now().to_rfc3339();
        conn.execute(
            "INSERT INTO watch_sessions (
                id, profile_id, media_id, session_title, source_kind,
                started_at, seconds_watched, completed
             ) VALUES (?1, ?2, ?3, ?4, 'addon', ?5, 0, 0)",
            params![id, profile_id, synthetic_id, title, now],
        )
        .map_err(|e| e.to_string())?;
        Ok(id)
    }

    pub fn update_watch_session(
        &self,
        session_id: &str,
        seconds_watched: i32,
    ) -> Result<(), String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        conn.execute(
            "UPDATE watch_sessions SET seconds_watched = ?2 WHERE id = ?1",
            params![session_id, seconds_watched],
        )
        .map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn end_watch_session(&self, session_id: &str, completed: bool) -> Result<(), String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        let now = Utc::now().to_rfc3339();
        conn.execute(
            "UPDATE watch_sessions SET ended_at = ?2, completed = ?3 WHERE id = ?1",
            params![session_id, now, i32::from(completed)],
        )
        .map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn daily_watch_seconds(&self, profile_id: &str) -> Result<i32, String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        let today = Local::now().format("%Y-%m-%d").to_string();
        let total: i32 = conn
            .query_row(
                "SELECT COALESCE(SUM(seconds_watched), 0) FROM watch_sessions
                 WHERE profile_id = ?1 AND started_at LIKE ?2 || '%'",
                params![profile_id, today],
                |row| row.get(0),
            )
            .map_err(|e| e.to_string())?;
        Ok(total)
    }

    pub fn dev_top_watched_titles(
        &self,
        profile_id: &str,
        limit: usize,
    ) -> Result<Vec<crate::dev_admin::DevTopTitle>, String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        let mut stmt = conn
            .prepare(
                "SELECT COALESCE(NULLIF(ws.session_title, ''), m.title, ws.media_id) AS title,
                        COALESCE(SUM(ws.seconds_watched), 0) AS total_seconds,
                        COUNT(*) AS play_count
                 FROM watch_sessions ws
                 LEFT JOIN media m ON m.id = ws.media_id
                 WHERE ws.profile_id = ?1
                 GROUP BY title
                 HAVING total_seconds > 0
                 ORDER BY total_seconds DESC
                 LIMIT ?2",
            )
            .map_err(|e| e.to_string())?;

        let rows = stmt
            .query_map(params![profile_id, limit as i64], |row| {
                Ok(crate::dev_admin::DevTopTitle {
                    title: row.get(0)?,
                    total_seconds: row.get(1)?,
                    play_count: row.get(2)?,
                })
            })
            .map_err(|e| e.to_string())?;

        rows.collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())
    }

    pub fn get_watch_history(
        &self,
        profile_id: &str,
        limit: usize,
    ) -> Result<Vec<crate::parental::WatchSession>, String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        let mut stmt = conn
            .prepare(
                "SELECT ws.id, ws.profile_id, ws.media_id,
                        COALESCE(NULLIF(ws.session_title, ''), m.title, 'Senza titolo'),
                        ws.started_at, ws.ended_at, ws.seconds_watched, ws.completed,
                        ws.source_kind
                 FROM watch_sessions ws
                 LEFT JOIN media m ON m.id = ws.media_id
                 WHERE ws.profile_id = ?1
                 ORDER BY ws.started_at DESC
                 LIMIT ?2",
            )
            .map_err(|e| e.to_string())?;

        let rows = stmt
            .query_map(params![profile_id, limit as i64], |row| {
                Ok(crate::parental::WatchSession {
                    id: row.get(0)?,
                    profile_id: row.get(1)?,
                    media_id: row.get(2)?,
                    media_title: row.get(3)?,
                    started_at: row.get(4)?,
                    ended_at: row.get(5)?,
                    seconds_watched: row.get(6)?,
                    completed: row.get::<_, i32>(7)? == 1,
                    source_kind: row.get(8)?,
                })
            })
            .map_err(|e| e.to_string())?;

        rows.collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())
    }

    pub fn can_play_media(
        &self,
        profile_id: &str,
        media_id: &str,
    ) -> Result<crate::parental::CanPlayResult, String> {
        let profile = self
            .get_profile(profile_id)?
            .ok_or_else(|| "Profilo non trovato".to_string())?;

        if profile.role == "parent" {
            return Ok(crate::parental::CanPlayResult {
                allowed: true,
                reason: None,
            });
        }

        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        let kid_friendly: i32 = conn
            .query_row(
                "SELECT kid_friendly FROM media WHERE id = ?1",
                params![media_id],
                |row| row.get(0),
            )
            .map_err(|_| "Contenuto non trovato".to_string())?;

        if kid_friendly == 0 {
            return Ok(crate::parental::CanPlayResult {
                allowed: false,
                reason: Some("Questo contenuto non è adatto al tuo profilo".into()),
            });
        }

        let limits = self.get_profile_limits(profile_id)?;

        if let (Some(start), Some(end)) = (&limits.bedtime_start, &limits.bedtime_end) {
            if crate::parental::in_bedtime_window(start, end) {
                return Ok(crate::parental::CanPlayResult {
                    allowed: false,
                    reason: Some(
                        "È ora di dormire. Chiedi a un genitore se vuoi guardare ancora.".into(),
                    ),
                });
            }
        }

        if limits.daily_limit_mins > 0 {
            let watched = self.daily_watch_seconds(profile_id)?;
            let limit_secs = limits.daily_limit_mins * 60;
            if watched >= limit_secs {
                return Ok(crate::parental::CanPlayResult {
                    allowed: false,
                    reason: Some(
                        "Hai raggiunto il limite di tempo per oggi. Riprova domani.".into(),
                    ),
                });
            }
        }

        Ok(crate::parental::CanPlayResult {
            allowed: true,
            reason: None,
        })
    }

    fn streaming_time_limits(
        &self,
        profile_id: &str,
    ) -> Result<crate::parental::CanPlayResult, String> {
        let limits = self.get_profile_limits(profile_id)?;

        if let (Some(start), Some(end)) = (&limits.bedtime_start, &limits.bedtime_end) {
            if crate::parental::in_bedtime_window(start, end) {
                return Ok(crate::parental::CanPlayResult {
                    allowed: false,
                    reason: Some(
                        "È ora di dormire. Chiedi a un genitore se vuoi guardare ancora.".into(),
                    ),
                });
            }
        }

        if limits.daily_limit_mins > 0 {
            let watched = self.daily_watch_seconds(profile_id)?;
            let limit_secs = limits.daily_limit_mins * 60;
            if watched >= limit_secs {
                return Ok(crate::parental::CanPlayResult {
                    allowed: false,
                    reason: Some(
                        "Hai raggiunto il limite di tempo per oggi. Riprova domani.".into(),
                    ),
                });
            }
        }

        Ok(crate::parental::CanPlayResult {
            allowed: true,
            reason: None,
        })
    }

    pub fn can_play_addon(
        &self,
        profile_id: &str,
        addon_row_id: &str,
    ) -> Result<crate::parental::CanPlayResult, String> {
        let profile = self
            .get_profile(profile_id)?
            .ok_or_else(|| "Profilo non trovato".to_string())?;

        if profile.role == "parent" {
            return Ok(crate::parental::CanPlayResult {
                allowed: true,
                reason: None,
            });
        }

        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        let allowed: i32 = conn
            .query_row(
                "SELECT 1 FROM profile_addon_allowlist
                 WHERE profile_id = ?1 AND addon_row_id = ?2",
                params![profile_id, addon_row_id],
                |_| Ok(1),
            )
            .unwrap_or(0);

        if allowed == 0 {
            return Ok(crate::parental::CanPlayResult {
                allowed: false,
                reason: Some(
                    "Questo addon non è autorizzato per il tuo profilo. Chiedi a un genitore."
                        .into(),
                ),
            });
        }

        drop(conn);
        self.streaming_time_limits(profile_id)
    }

    pub fn can_play_streaming(
        &self,
        profile_id: &str,
    ) -> Result<crate::parental::CanPlayResult, String> {
        let profile = self
            .get_profile(profile_id)?
            .ok_or_else(|| "Profilo non trovato".to_string())?;

        if profile.role == "parent" {
            return Ok(crate::parental::CanPlayResult {
                allowed: true,
                reason: None,
            });
        }

        self.streaming_time_limits(profile_id)
    }

    fn row_to_installed_addon(
        row: &rusqlite::Row<'_>,
    ) -> rusqlite::Result<crate::stremio::InstalledAddon> {
        let resources_json: String = row.get(6)?;
        let types_json: String = row.get(7)?;
        let catalogs_json: String = row.get(8)?;
        let enabled: i32 = row.get(9)?;
        Ok(crate::stremio::InstalledAddon {
            id: row.get(0)?,
            manifest_url: row.get(1)?,
            transport_url: row.get(2)?,
            addon_id: row.get(3)?,
            name: row.get(4)?,
            description: row.get(5)?,
            version: row.get::<_, String>(10).unwrap_or_else(|_| "0.0.0".into()),
            resources: serde_json::from_str(&resources_json).unwrap_or_default(),
            types: serde_json::from_str(&types_json).unwrap_or_default(),
            catalogs: serde_json::from_str(&catalogs_json).unwrap_or_default(),
            enabled: enabled != 0,
            installed_at: row.get(11)?,
        })
    }

    pub fn list_installed_addons(&self) -> Result<Vec<crate::stremio::InstalledAddon>, String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        let mut stmt = conn
            .prepare(
                "SELECT id, manifest_url, transport_url, addon_id, name, description,
                        resources_json, types_json, catalogs_json, enabled, version, installed_at
                 FROM installed_addons ORDER BY name COLLATE NOCASE",
            )
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map([], Self::row_to_installed_addon)
            .map_err(|e| e.to_string())?;
        rows.collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())
    }

    pub fn list_addons_for_profile(
        &self,
        profile_id: &str,
    ) -> Result<Vec<crate::stremio::InstalledAddon>, String> {
        let profile = self
            .get_profile(profile_id)?
            .ok_or_else(|| "Profilo non trovato".to_string())?;

        if profile.role == "parent" {
            return Ok(self
                .list_installed_addons()?
                .into_iter()
                .filter(|a| a.enabled)
                .collect());
        }

        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        let mut stmt = conn
            .prepare(
                "SELECT a.id, a.manifest_url, a.transport_url, a.addon_id, a.name, a.description,
                        a.resources_json, a.types_json, a.catalogs_json, a.enabled, a.version, a.installed_at
                 FROM installed_addons a
                 INNER JOIN profile_addon_allowlist p ON p.addon_row_id = a.id
                 WHERE p.profile_id = ?1 AND a.enabled = 1
                 ORDER BY a.name COLLATE NOCASE",
            )
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map(params![profile_id], Self::row_to_installed_addon)
            .map_err(|e| e.to_string())?;
        rows.collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())
    }

    pub fn get_installed_addon(
        &self,
        row_id: &str,
    ) -> Result<Option<crate::stremio::InstalledAddon>, String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        let result = conn.query_row(
            "SELECT id, manifest_url, transport_url, addon_id, name, description,
                    resources_json, types_json, catalogs_json, enabled, version, installed_at
             FROM installed_addons WHERE id = ?1",
            params![row_id],
            Self::row_to_installed_addon,
        );
        match result {
            Ok(addon) => Ok(Some(addon)),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
            Err(e) => Err(e.to_string()),
        }
    }

    pub fn install_addon(
        &self,
        manifest_url: &str,
        transport_url: &str,
        manifest: &crate::stremio::ManifestResponse,
    ) -> Result<crate::stremio::InstalledAddon, String> {
        let resources = crate::stremio::parse_resources(&manifest.resources);
        let now = Utc::now().to_rfc3339();
        let mut hasher = DefaultHasher::new();
        manifest_url.hash(&mut hasher);
        manifest.id.hash(&mut hasher);
        let row_id = format!("addon{:012x}", hasher.finish());

        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        conn.execute(
            "INSERT INTO installed_addons (
                id, manifest_url, transport_url, addon_id, name, description, version,
                resources_json, types_json, catalogs_json, enabled, installed_at
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, 1, ?11)
             ON CONFLICT(manifest_url) DO UPDATE SET
                transport_url = excluded.transport_url,
                addon_id = excluded.addon_id,
                name = excluded.name,
                description = excluded.description,
                version = excluded.version,
                resources_json = excluded.resources_json,
                types_json = excluded.types_json,
                catalogs_json = excluded.catalogs_json,
                enabled = 1",
            params![
                row_id,
                manifest_url,
                transport_url,
                manifest.id,
                manifest.name,
                manifest.description,
                manifest.version,
                serde_json::to_string(&resources).unwrap_or_else(|_| "[]".into()),
                serde_json::to_string(&manifest.types).unwrap_or_else(|_| "[]".into()),
                serde_json::to_string(&manifest.catalogs).unwrap_or_else(|_| "[]".into()),
                now,
            ],
        )
        .map_err(|e| e.to_string())?;

        let id: String = conn
            .query_row(
                "SELECT id FROM installed_addons WHERE manifest_url = ?1",
                params![manifest_url],
                |row| row.get(0),
            )
            .map_err(|e| e.to_string())?;

        drop(conn);
        let addon = self
            .get_installed_addon(&id)?
            .ok_or_else(|| "Addon non salvato".to_string())?;
        self.allowlist_addon_for_all_children(&addon.id)?;
        Ok(addon)
    }

    /// Grant a newly installed addon to every child profile automatically.
    pub fn allowlist_addon_for_all_children(&self, addon_row_id: &str) -> Result<(), String> {
        let child_ids: Vec<String> = self
            .get_profiles()?
            .into_iter()
            .filter(|p| p.role != "parent")
            .map(|p| p.id)
            .collect();
        if child_ids.is_empty() {
            return Ok(());
        }
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        for child_id in child_ids {
            conn.execute(
                "INSERT OR IGNORE INTO profile_addon_allowlist (profile_id, addon_row_id) VALUES (?1, ?2)",
                params![child_id, addon_row_id],
            )
            .map_err(|e| e.to_string())?;
        }
        Ok(())
    }

    /// For children with an empty allowlist, enable all currently installed addons.
    pub fn sync_empty_child_allowlists(&self) -> Result<(), String> {
        let enabled: Vec<String> = self
            .list_installed_addons()?
            .into_iter()
            .filter(|a| a.enabled)
            .map(|a| a.id)
            .collect();
        if enabled.is_empty() {
            return Ok(());
        }
        for profile in self.get_profiles()? {
            if profile.role == "parent" {
                continue;
            }
            if self.get_addon_allowlist(&profile.id)?.is_empty() {
                self.set_addon_allowlist(&profile.id, &enabled)?;
            }
        }
        Ok(())
    }

    /// Install Cinemeta when no catalog addon is present (metadata for home/hero rows).
    pub fn ensure_catalog_addon(&self) -> Result<(), String> {
        const CINEMETA: &str = "https://v3-cinemeta.strem.io/manifest.json";
        let has_catalog = self.list_installed_addons()?.iter().any(|a| {
            a.enabled && a.resources.iter().any(|r| r == "catalog") && !a.catalogs.is_empty()
        });
        if has_catalog {
            return Ok(());
        }
        let (transport, manifest) = crate::stremio::fetch_manifest(CINEMETA)?;
        self.install_addon(CINEMETA, &transport, &manifest)?;
        Ok(())
    }

    pub fn remove_addon(&self, row_id: &str) -> Result<(), String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        conn.execute(
            "DELETE FROM installed_addons WHERE id = ?1",
            params![row_id],
        )
        .map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn set_addon_enabled(&self, row_id: &str, enabled: bool) -> Result<(), String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        conn.execute(
            "UPDATE installed_addons SET enabled = ?2 WHERE id = ?1",
            params![row_id, if enabled { 1 } else { 0 }],
        )
        .map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn get_addon_allowlist(&self, child_profile_id: &str) -> Result<Vec<String>, String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        let mut stmt = conn
            .prepare("SELECT addon_row_id FROM profile_addon_allowlist WHERE profile_id = ?1")
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map(params![child_profile_id], |row| row.get(0))
            .map_err(|e| e.to_string())?;
        rows.collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())
    }

    pub fn set_addon_allowlist(
        &self,
        child_profile_id: &str,
        addon_row_ids: &[String],
    ) -> Result<(), String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        conn.execute(
            "DELETE FROM profile_addon_allowlist WHERE profile_id = ?1",
            params![child_profile_id],
        )
        .map_err(|e| e.to_string())?;
        for addon_id in addon_row_ids {
            conn.execute(
                "INSERT INTO profile_addon_allowlist (profile_id, addon_row_id) VALUES (?1, ?2)",
                params![child_profile_id, addon_id],
            )
            .map_err(|e| e.to_string())?;
        }
        Ok(())
    }

    pub fn profile_has_streaming_access(&self, profile_id: &str) -> Result<bool, String> {
        if crate::sc_catalog::catalog_enabled(self) {
            return Ok(true);
        }
        Ok(self
            .list_addons_for_profile(profile_id)?
            .iter()
            .any(|a| a.resources.iter().any(|r| r == "catalog") && !a.catalogs.is_empty()))
    }
}

#[derive(Debug, Clone)]
pub struct ScannedMedia {
    pub id: String,
    pub title: String,
    pub media_type: String,
    pub year: Option<i32>,
    pub file_path: String,
    pub file_name: String,
    pub description: Option<String>,
    pub tag: Option<String>,
    pub series_title: Option<String>,
    pub season: Option<i32>,
    pub episode: Option<i32>,
    pub kid_friendly: bool,
}

fn migrate_schema(conn: &Connection) -> Result<(), String> {
    let has_poster: bool = table_has_column(conn, "media", "poster_path")?;

    if !has_poster {
        conn.execute("ALTER TABLE media ADD COLUMN poster_path TEXT", [])
            .map_err(|e| e.to_string())?;
    }

    conn.execute_batch(
        "
        CREATE TABLE IF NOT EXISTS series_posters (
            id TEXT PRIMARY KEY,
            media_type TEXT NOT NULL,
            series_title TEXT NOT NULL,
            poster_path TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            UNIQUE(media_type, series_title)
        );
        ",
    )
    .map_err(|e| e.to_string())?;

    conn.execute_batch(
        "
        CREATE TABLE IF NOT EXISTS profiles (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            role TEXT NOT NULL,
            avatar_color TEXT NOT NULL,
            avatar_emoji TEXT,
            created_at TEXT NOT NULL
        );
        ",
    )
    .map_err(|e| e.to_string())?;

    let wp_has_profile = table_has_column(conn, "watch_progress", "profile_id").unwrap_or(false);

    if !wp_has_profile {
        let _ = conn.execute(
            "ALTER TABLE watch_progress RENAME TO watch_progress_legacy",
            [],
        );
        let _ = conn.execute("ALTER TABLE favorites RENAME TO favorites_legacy", []);

        conn.execute_batch(
            "
            CREATE TABLE IF NOT EXISTS watch_progress (
                profile_id TEXT NOT NULL,
                media_id TEXT NOT NULL REFERENCES media(id) ON DELETE CASCADE,
                position_secs REAL NOT NULL DEFAULT 0,
                duration_secs REAL,
                updated_at TEXT NOT NULL,
                PRIMARY KEY (profile_id, media_id)
            );

            CREATE TABLE IF NOT EXISTS favorites (
                profile_id TEXT NOT NULL,
                media_id TEXT NOT NULL REFERENCES media(id) ON DELETE CASCADE,
                added_at TEXT NOT NULL,
                PRIMARY KEY (profile_id, media_id)
            );
            ",
        )
        .map_err(|e| e.to_string())?;

        let _ = conn.execute("DROP TABLE IF EXISTS watch_progress_legacy", []);
        let _ = conn.execute("DROP TABLE IF EXISTS favorites_legacy", []);
    }

    if !table_has_column(conn, "media", "kid_friendly")? {
        conn.execute(
            "ALTER TABLE media ADD COLUMN kid_friendly INTEGER NOT NULL DEFAULT 0",
            [],
        )
        .map_err(|e| e.to_string())?;
        let _ = conn.execute(
            "UPDATE media SET kid_friendly = 1 WHERE media_type = 'cartone'",
            [],
        );
    }

    if !table_has_column(conn, "media", "streaming_services")? {
        conn.execute("ALTER TABLE media ADD COLUMN streaming_services TEXT", [])
            .map_err(|e| e.to_string())?;
    }

    if !table_has_column(conn, "profiles", "pin_hash")? {
        conn.execute("ALTER TABLE profiles ADD COLUMN pin_hash TEXT", [])
            .map_err(|e| e.to_string())?;
    }

    if !table_has_column(conn, "profiles", "avatar_style")? {
        conn.execute(
            "ALTER TABLE profiles ADD COLUMN avatar_style TEXT NOT NULL DEFAULT 'emoji'",
            [],
        )
        .map_err(|e| e.to_string())?;
    }

    if !table_has_column(conn, "profiles", "accent_color")? {
        conn.execute("ALTER TABLE profiles ADD COLUMN accent_color TEXT", [])
            .map_err(|e| e.to_string())?;
    }

    if !table_has_column(conn, "media", "tmdb_id")? {
        conn.execute("ALTER TABLE media ADD COLUMN tmdb_id INTEGER", [])
            .map_err(|e| e.to_string())?;
    }
    if !table_has_column(conn, "media", "tmdb_type")? {
        conn.execute("ALTER TABLE media ADD COLUMN tmdb_type TEXT", [])
            .map_err(|e| e.to_string())?;
    }
    if !table_has_column(conn, "media", "genres")? {
        conn.execute("ALTER TABLE media ADD COLUMN genres TEXT", [])
            .map_err(|e| e.to_string())?;
    }
    if !table_has_column(conn, "media", "runtime_mins")? {
        conn.execute("ALTER TABLE media ADD COLUMN runtime_mins INTEGER", [])
            .map_err(|e| e.to_string())?;
    }

    conn.execute_batch(
        "
        CREATE TABLE IF NOT EXISTS profile_limits (
            profile_id TEXT PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
            daily_limit_mins INTEGER NOT NULL DEFAULT 0,
            bedtime_start TEXT,
            bedtime_end TEXT
        );

        CREATE TABLE IF NOT EXISTS watch_sessions (
            id TEXT PRIMARY KEY,
            profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
            media_id TEXT NOT NULL REFERENCES media(id) ON DELETE CASCADE,
            started_at TEXT NOT NULL,
            ended_at TEXT,
            seconds_watched INTEGER NOT NULL DEFAULT 0,
            completed INTEGER NOT NULL DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS installed_addons (
            id TEXT PRIMARY KEY,
            manifest_url TEXT NOT NULL UNIQUE,
            transport_url TEXT NOT NULL,
            addon_id TEXT NOT NULL,
            name TEXT NOT NULL,
            description TEXT NOT NULL DEFAULT '',
            version TEXT NOT NULL DEFAULT '0.0.0',
            resources_json TEXT NOT NULL,
            types_json TEXT NOT NULL,
            catalogs_json TEXT NOT NULL,
            enabled INTEGER NOT NULL DEFAULT 1,
            installed_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS profile_addon_allowlist (
            profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
            addon_row_id TEXT NOT NULL REFERENCES installed_addons(id) ON DELETE CASCADE,
            PRIMARY KEY (profile_id, addon_row_id)
        );
        ",
    )
    .map_err(|e| e.to_string())?;

    if !table_has_column(conn, "watch_sessions", "source_kind")? {
        conn.execute_batch(
            "
            CREATE TABLE watch_sessions_v2 (
                id TEXT PRIMARY KEY,
                profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
                media_id TEXT,
                session_title TEXT NOT NULL DEFAULT '',
                source_kind TEXT NOT NULL DEFAULT 'local',
                started_at TEXT NOT NULL,
                ended_at TEXT,
                seconds_watched INTEGER NOT NULL DEFAULT 0,
                completed INTEGER NOT NULL DEFAULT 0
            );

            INSERT INTO watch_sessions_v2 (
                id, profile_id, media_id, session_title, source_kind,
                started_at, ended_at, seconds_watched, completed
            )
            SELECT ws.id, ws.profile_id, ws.media_id,
                   COALESCE(m.title, ''),
                   'local',
                   ws.started_at, ws.ended_at, ws.seconds_watched, ws.completed
            FROM watch_sessions ws
            LEFT JOIN media m ON m.id = ws.media_id;

            DROP TABLE watch_sessions;
            ALTER TABLE watch_sessions_v2 RENAME TO watch_sessions;
            ",
        )
        .map_err(|e| e.to_string())?;
    }

    conn.execute_batch(
        "
        CREATE TABLE IF NOT EXISTS streaming_watch_progress (
            profile_id TEXT NOT NULL,
            progress_key TEXT NOT NULL,
            catalog_prefix TEXT NOT NULL DEFAULT 'sc',
            content_type TEXT NOT NULL,
            title_id TEXT NOT NULL,
            slug TEXT NOT NULL,
            video_id TEXT NOT NULL,
            title_name TEXT NOT NULL,
            episode_label TEXT,
            poster_url TEXT,
            position_secs REAL NOT NULL DEFAULT 0,
            duration_secs REAL,
            updated_at TEXT NOT NULL,
            PRIMARY KEY (profile_id, progress_key)
        );

        CREATE TABLE IF NOT EXISTS streaming_list (
            profile_id TEXT NOT NULL,
            catalog_prefix TEXT NOT NULL DEFAULT 'sc',
            content_type TEXT NOT NULL,
            title_id TEXT NOT NULL,
            slug TEXT NOT NULL DEFAULT '',
            name TEXT NOT NULL,
            poster_url TEXT,
            media_type TEXT,
            release_info TEXT,
            added_at TEXT NOT NULL,
            PRIMARY KEY (profile_id, catalog_prefix, content_type, title_id)
        );

        CREATE TABLE IF NOT EXISTS profile_friend_codes (
            profile_id TEXT PRIMARY KEY,
            friend_code TEXT NOT NULL UNIQUE,
            created_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS friends (
            owner_profile_id TEXT NOT NULL,
            friend_code TEXT NOT NULL,
            display_name TEXT NOT NULL,
            last_host TEXT,
            added_at TEXT NOT NULL,
            PRIMARY KEY (owner_profile_id, friend_code)
        );
        ",
    )
    .map_err(|e| e.to_string())?;

    Ok(())
}

#[derive(Debug, Clone)]
pub struct PendingEnrichMedia {
    pub id: String,
    pub title: String,
    pub media_type: String,
    pub year: Option<i32>,
    pub series_title: Option<String>,
}

fn parse_genres(raw: Option<String>) -> Vec<String> {
    let Some(raw) = raw else {
        return Vec::new();
    };
    serde_json::from_str(&raw).unwrap_or_default()
}

fn parse_streaming_services(raw: Option<String>) -> Vec<String> {
    let Some(raw) = raw else {
        return Vec::new();
    };
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return Vec::new();
    }
    serde_json::from_str(trimmed).unwrap_or_default()
}

fn serialize_streaming_services(services: &[String]) -> Option<String> {
    if services.is_empty() {
        None
    } else {
        serde_json::to_string(services).ok()
    }
}

fn table_has_column(conn: &Connection, table: &str, column: &str) -> Result<bool, String> {
    let sql = format!("PRAGMA table_info({table})");
    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |row| row.get::<_, String>(1))
        .map_err(|e| e.to_string())?;

    for name in rows {
        if name.map_err(|e| e.to_string())? == column {
            return Ok(true);
        }
    }
    Ok(false)
}

fn insert_poster_asset(
    map: &mut HashMap<String, PosterAsset>,
    path: &str,
    label: String,
    kind: String,
) {
    if !Path::new(path).exists() {
        return;
    }
    let key = normalize_path_key(path);
    map.entry(key).or_insert(PosterAsset {
        path: path.to_string(),
        label,
        kind,
    });
}

fn normalize_path_key(path: &str) -> String {
    std::fs::canonicalize(path)
        .map(|p| p.to_string_lossy().to_lowercase())
        .unwrap_or_else(|_| path.to_lowercase())
}

fn poster_kind_for_media_type(media_type: &str) -> String {
    match media_type {
        "serie" | "cartone" => "episode".to_string(),
        _ => "film".to_string(),
    }
}

fn kind_label(kind: &str, media_type: &str) -> &'static str {
    match (kind, media_type) {
        ("series", "cartone") => "cartone",
        ("series", _) => "serie",
        (_, "cartone") => "episodio cartone",
        (_, "serie") => "episodio",
        _ => "film",
    }
}

const POSTER_EXTENSIONS: &[&str] = &["png", "jpg", "jpeg", "webp", "gif"];

fn collect_posters_from_dir(
    map: &mut HashMap<String, PosterAsset>,
    dir: &Path,
    default_kind: &str,
) {
    if !dir.exists() {
        return;
    }

    let Ok(entries) = std::fs::read_dir(dir) else {
        return;
    };

    for entry in entries.flatten() {
        let path = entry.path();
        if !path.is_file() {
            continue;
        }
        let Some(ext) = path.extension().and_then(|e| e.to_str()) else {
            continue;
        };
        if !POSTER_EXTENSIONS.contains(&ext.to_lowercase().as_str()) {
            continue;
        }
        let file_name = path
            .file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_else(|| "Copertina".to_string());
        let label = if default_kind == "series" {
            format!("{file_name} (serie)")
        } else {
            file_name
        };
        insert_poster_asset(
            map,
            &path.to_string_lossy(),
            label,
            default_kind.to_string(),
        );
    }
}

#[cfg(test)]
mod continue_watching_tests {
    use super::*;
    use crate::stremio::StreamingWatchProgressInput;

    fn test_db() -> Database {
        Database::open(std::path::Path::new(":memory:")).expect("in-memory db")
    }

    fn sample_progress(
        video_id: &str,
        episode_label: &str,
        position: f64,
    ) -> StreamingWatchProgressInput {
        StreamingWatchProgressInput {
            catalog_prefix: "sc".to_string(),
            content_type: "series".to_string(),
            title_id: "show-1".to_string(),
            slug: "my-show".to_string(),
            video_id: video_id.to_string(),
            title_name: "My Show".to_string(),
            episode_label: Some(episode_label.to_string()),
            poster: None,
            position_secs: position,
            duration_secs: Some(3600.0),
        }
    }

    #[test]
    fn continue_watching_dedupes_to_latest_episode_per_series() {
        let db = test_db();
        let profile = "kid-1";

        db.upsert_streaming_watch_progress(
            profile,
            &sample_progress("ep1", "S01E01", 120.0),
        )
        .unwrap();
        std::thread::sleep(std::time::Duration::from_millis(5));
        db.upsert_streaming_watch_progress(
            profile,
            &sample_progress("ep2", "S01E02", 240.0),
        )
        .unwrap();

        let items = db
            .list_streaming_continue_watching(profile, 10)
            .expect("list continue");

        assert_eq!(items.len(), 1);
        assert_eq!(items[0].video_id, "ep2");
        assert_eq!(items[0].episode_label.as_deref(), Some("S01E02"));
    }

    #[test]
    fn get_streaming_progress_trims_key_fields() {
        let db = test_db();
        let profile = "kid-1";

        db.upsert_streaming_watch_progress(
            profile,
            &sample_progress("ep1", "S01E01", 90.0),
        )
        .unwrap();

        let progress = db
            .get_streaming_watch_progress(
                profile,
                " sc ",
                "series",
                "show-1",
                " my-show ",
                " ep1 ",
            )
            .expect("get progress");

        assert_eq!(progress.map(|p| p.0), Some(90.0));
    }
}
