use crate::addon_proxy::AddonProxyRegistry;
use crate::html_text::decode_html_entities;
use crate::sc_catalog;
use crate::stremio::{PlayableStream, StremioMeta, StremioMetaPreview, StremioVideo};
use reqwest::blocking::Client;
use serde_json::Value;
use std::collections::HashMap;
use std::time::Duration;

pub fn fetch_title_meta(
    app: &str,
    cdn: &str,
    locale: &str,
    title_id: i64,
    slug: &str,
) -> Result<StremioMeta, String> {
    let mut session = ScSession::open(app, locale)?;
    let path = title_path(locale, title_id, slug, None);
    let page = session.inertia_page(&path, None)?;
    let props = page_props(&page)?;
    let title = props
        .get("title")
        .ok_or_else(|| "Metadati titolo non disponibili".to_string())?;

    let stremio_type = title_type(title);
    let cdn = cdn.trim_end_matches('/');
    let poster = poster_from_images(cdn, title.get("images"));
    let background = cover_from_images(cdn, title.get("images"));
    let description = plot_from_title(title);
    let release_info = title
        .get("last_air_date")
        .or_else(|| title.get("release_date"))
        .and_then(|v| v.as_str())
        .map(str::to_string);

    let videos = if stremio_type == "movie" {
        vec![StremioVideo {
            id: title_id.to_string(),
            title: title_name(title),
            season: None,
            episode: None,
            thumbnail: poster.clone(),
            released: release_info.clone(),
            description: plot_from_title(title),
            runtime: title
                .get("runtime")
                .and_then(|v| v.as_i64())
                .map(|m| format!("{m} min")),
        }]
    } else {
        collect_series_videos(&mut session, cdn, locale, title_id, slug, title, props)?
    };

    Ok(StremioMeta {
        id: title_id.to_string(),
        r#type: stremio_type,
        name: title_name(title),
        poster,
        background,
        description,
        release_info,
        genres: genres_from_title(title),
        videos,
        runtime: title
            .get("runtime")
            .and_then(|v| v.as_i64())
            .map(|m| format!("{m} min")),
        logo: logo_from_images(cdn, title.get("images")),
        rating: title.get("score").and_then(|v| {
            v.as_str()
                .map(str::to_string)
                .or_else(|| v.as_f64().map(|n| format!("{n:.1}")))
        }),
        cast: credits_from_title(title, "main_actors"),
        directors: credits_from_title(title, "main_directors"),
        view_count: title.get("views").and_then(|v| v.as_i64()),
        quality: title
            .get("quality")
            .and_then(|v| v.as_str())
            .map(str::to_string),
        has_preview: title.get("preview").map(|p| !p.is_null()).unwrap_or(false),
        season_numbers: if title_type(title) == "movie" {
            Vec::new()
        } else {
            season_numbers_from_title(title)
        },
    })
}

pub fn resolve_playback(
    app: &str,
    locale: &str,
    title_id: i64,
    slug: &str,
    episode_id: Option<i64>,
    proxy: &AddonProxyRegistry,
) -> Result<PlayableStream, String> {
    let mut session = ScSession::open(app, locale)?;
    let watch_path = watch_path(locale, title_id, slug, episode_id);
    let referer = title_path(locale, title_id, slug, None);
    let page = session.inertia_page(&watch_path, Some(&referer))?;
    let props = page_props(&page)?;
    let embed_url = props
        .get("embedUrl")
        .and_then(|v| v.as_str())
        .ok_or_else(|| "Player non disponibile per questo titolo".to_string())?;
    let embed_url = embed_url_with_episode(embed_url, episode_id);

    let iframe_html = session.get_html(&embed_url, Some(&referer))?;
    let vix_embed =
        extract_iframe_src(&iframe_html).ok_or_else(|| "Embed vixcloud non trovato".to_string())?;
    let vix_html = session.get_html(&vix_embed, Some(app))?;
    Ok(stream_from_playlist(
        build_playlist_url(&vix_embed, &vix_html, locale)?,
        proxy,
    ))
}

/// Solo per test/debug: restituisce l'embedUrl grezzo per ciascun episodio richiesto.
pub fn debug_embed_urls(
    app: &str,
    locale: &str,
    title_id: i64,
    slug: &str,
    episode_ids: &[Option<i64>],
) -> Vec<(Option<i64>, Result<String, String>)> {
    episode_ids
        .iter()
        .map(|ep| {
            let result = (|| {
                let mut session = ScSession::open(app, locale)?;
                let watch_path = watch_path(locale, title_id, slug, *ep);
                let referer = title_path(locale, title_id, slug, None);
                let page = session.inertia_page(&watch_path, Some(&referer))?;
                let props = page_props(&page)?;
                let embed = props
                    .get("embedUrl")
                    .and_then(|v| v.as_str())
                    .map(|raw| embed_url_with_episode(raw, *ep))
                    .ok_or_else(|| "embedUrl mancante".to_string())?;
                let iframe_html = session.get_html(&embed, Some(&referer))?;
                extract_iframe_src(&iframe_html)
                    .ok_or_else(|| "vix embed mancante".to_string())
            })();
            (*ep, result)
        })
        .collect()
}

pub fn resolve_preview(
    app: &str,
    locale: &str,
    title_id: i64,
    slug: &str,
    proxy: &AddonProxyRegistry,
) -> Result<Option<PlayableStream>, String> {
    let mut session = ScSession::open(app, locale)?;
    let path = title_path(locale, title_id, slug, None);
    let page = session.inertia_page(&path, None)?;
    let props = page_props(&page)?;
    let embed_url = props
        .get("title")
        .and_then(|t| t.get("preview"))
        .and_then(|p| p.get("embed_url"))
        .and_then(|v| v.as_str())
        .map(|s| s.replace("&amp;", "&"));
    let Some(embed_url) = embed_url else {
        return Ok(None);
    };

    let vix_html = session.get_html(&embed_url, Some(app))?;
    let playlist_url = build_playlist_url(&embed_url, &vix_html, locale)?;
    Ok(Some(stream_from_playlist(playlist_url, proxy)))
}

pub fn search_titles(
    app: &str,
    cdn: &str,
    locale: &str,
    query: &str,
) -> Result<Vec<StremioMetaPreview>, String> {
    let trimmed = query.trim();
    if trimmed.is_empty() {
        return Ok(Vec::new());
    }
    let session = ScSession::open(app, locale)?;
    let path = format!("/{locale}/search?q={}", urlencoding::encode(trimmed));
    let html = session.get_html(&path, None)?;
    let page =
        parse_inertia_from_html(&html).ok_or_else(|| "Ricerca non disponibile".to_string())?;
    let props = page_props(&page)?;
    let cdn = cdn.trim_end_matches('/');
    Ok(props
        .get("titles")
        .and_then(|v| v.as_array())
        .map(|titles| {
            titles
                .iter()
                .filter_map(|t| sc_catalog::preview_from_value(cdn, t, None))
                .collect()
        })
        .unwrap_or_default())
}

fn stream_from_playlist(playlist_url: String, proxy: &AddonProxyRegistry) -> PlayableStream {
    let headers = vixcloud_headers();
    let proxy_id = proxy.register(playlist_url, headers, true);
    PlayableStream {
        url: proxy.playback_url(&proxy_id),
        name: Some("Streaming Community".to_string()),
        description: None,
        addon_id: "sc".to_string(),
        addon_name: "Streaming Community".to_string(),
        is_hls: true,
        proxied: true,
        needs_debrid: false,
        info_hash: None,
        file_idx: None,
        sources: Vec::new(),
    }
}

fn vixcloud_headers() -> HashMap<String, String> {
    let mut headers = HashMap::new();
    headers.insert("Referer".to_string(), "https://vixcloud.co/".to_string());
    headers.insert("Origin".to_string(), "https://vixcloud.co".to_string());
    headers.insert(
        "User-Agent".to_string(),
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 \
         (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Branchefy/0.1"
            .to_string(),
    );
    headers
}

fn cover_from_images(cdn: &str, images: Option<&Value>) -> Option<String> {
    image_url_by_type(cdn, images, &["cover", "background"])
}

fn logo_from_images(cdn: &str, images: Option<&Value>) -> Option<String> {
    image_url_by_type(cdn, images, &["logo"])
}

fn image_url_by_type(cdn: &str, images: Option<&Value>, types: &[&str]) -> Option<String> {
    let images = images?.as_array()?;
    for image in images {
        let image_type = image.get("type").and_then(|v| v.as_str());
        if types.iter().any(|t| image_type == Some(*t)) {
            if let Some(filename) = image.get("filename").and_then(|v| v.as_str()) {
                return Some(format!("{}/images/{}", cdn.trim_end_matches('/'), filename));
            }
        }
    }
    None
}

fn genres_from_title(title: &Value) -> Vec<String> {
    title
        .get("genres")
        .and_then(|v| v.as_array())
        .map(|genres| {
            genres
                .iter()
                .filter_map(|genre| {
                    genre
                        .get("name")
                        .and_then(|v| v.as_str())
                        .map(str::to_string)
                })
                .collect()
        })
        .unwrap_or_default()
}

fn credits_from_title(title: &Value, key: &str) -> Vec<String> {
    title
        .get(key)
        .and_then(|v| v.as_array())
        .map(|people| {
            people
                .iter()
                .filter_map(|person| {
                    person
                        .get("name")
                        .and_then(|v| v.as_str())
                        .map(str::to_string)
                })
                .collect()
        })
        .unwrap_or_default()
}

fn season_numbers_from_title(title: &Value) -> Vec<i32> {
    let mut nums: Vec<i32> = title
        .get("seasons")
        .and_then(|v| v.as_array())
        .map(|seasons| {
            seasons
                .iter()
                .filter_map(|s| s.get("number").and_then(|v| v.as_i64()).map(|n| n as i32))
                .collect()
        })
        .unwrap_or_default();
    nums.sort_unstable();
    nums.dedup();
    nums
}

fn loaded_season_number(loaded: &Value) -> Option<i32> {
    loaded
        .get("number")
        .and_then(|v| v.as_i64())
        .map(|n| n as i32)
}

fn season_fetch_paths(
    locale: &str,
    title_id: i64,
    slug: &str,
    season_number: i32,
    season_id: Option<i64>,
) -> Vec<String> {
    let mut paths = vec![title_season_path(locale, title_id, slug, season_number)];
    if let Some(sid) = season_id {
        paths.push(format!(
            "/{locale}/titles/{title_id}-{slug}?season_id={sid}"
        ));
    }
    paths.push(title_path(locale, title_id, slug, Some(season_number)));
    paths
}

fn episodes_embedded_in_season(
    cdn: &str,
    season_entry: &Value,
    season_number: i32,
    seen_ids: &mut HashMap<String, i32>,
) -> Option<Vec<StremioVideo>> {
    let episodes = season_entry.get("episodes")?.as_array()?;
    if episodes.is_empty() {
        return None;
    }
    let loaded = serde_json::json!({
        "number": season_entry
            .get("number")
            .and_then(|v| v.as_i64())
            .unwrap_or(season_number as i64),
        "episodes": episodes,
    });
    let batch = episodes_from_season_deduped(cdn, &loaded, season_number, seen_ids);
    if batch.is_empty() {
        None
    } else {
        Some(batch)
    }
}

fn loaded_season_from_props(props: &Value) -> Option<&Value> {
    props
        .get("loadedSeason")
        .filter(|loaded| !loaded.is_null())
}

fn episodes_from_season_deduped(
    cdn: &str,
    loaded: &Value,
    season_number: i32,
    seen_ids: &mut HashMap<String, i32>,
) -> Vec<StremioVideo> {
    if let Some(loaded_num) = loaded_season_number(loaded) {
        if loaded_num != season_number {
            return Vec::new();
        }
    }
    let batch = episodes_from_season(cdn, loaded, Some(season_number));
    let mut result = Vec::new();
    for ep in batch {
        if let Some(prev_season) = seen_ids.get(&ep.id) {
            if *prev_season != season_number {
                continue;
            }
            continue;
        }
        seen_ids.insert(ep.id.clone(), season_number);
        result.push(ep);
    }
    result
}

fn load_season_episodes(
    session: &mut ScSession,
    cdn: &str,
    locale: &str,
    title_id: i64,
    slug: &str,
    season_number: i32,
    season_entry: Option<&Value>,
    seen_ids: &mut HashMap<String, i32>,
) -> Result<Vec<StremioVideo>, String> {
    if let Some(entry) = season_entry {
        if let Some(batch) = episodes_embedded_in_season(cdn, entry, season_number, seen_ids) {
            return Ok(batch);
        }
    }

    let season_id = season_entry
        .and_then(|s| s.get("id"))
        .and_then(|v| v.as_i64());
    let paths = season_fetch_paths(locale, title_id, slug, season_number, season_id);

    for path in paths {
        let season_props = match session.props_for_season_path(&path) {
            Ok(props) => props,
            Err(_) => continue,
        };
        if let Some(loaded) = loaded_season_from_props(&season_props) {
            let batch = episodes_from_season_deduped(cdn, loaded, season_number, seen_ids);
            if !batch.is_empty() {
                return Ok(batch);
            }
        }
    }
    Ok(Vec::new())
}

fn collect_series_videos(
    session: &mut ScSession,
    cdn: &str,
    locale: &str,
    title_id: i64,
    slug: &str,
    title: &Value,
    props: &Value,
) -> Result<Vec<StremioVideo>, String> {
    let seasons = title
        .get("seasons")
        .and_then(|v| v.as_array())
        .cloned()
        .unwrap_or_default();

    let mut videos = Vec::new();
    let mut seen_ids = HashMap::new();

    if seasons.is_empty() {
        if let Some(loaded) = props.get("loadedSeason") {
            let season_number = loaded_season_number(loaded).unwrap_or(1);
            videos.extend(episodes_from_season_deduped(
                cdn,
                loaded,
                season_number,
                &mut seen_ids,
            ));
        }
        return Ok(videos);
    }

    let first = seasons.first().expect("seasons non vuoto");
    let season_number = first
        .get("number")
        .and_then(|v| v.as_i64())
        .unwrap_or(1) as i32;
    videos.extend(load_season_episodes(
        session,
        cdn,
        locale,
        title_id,
        slug,
        season_number,
        Some(first),
        &mut seen_ids,
    )?);

    if videos.is_empty() {
        if let Some(loaded) = props.get("loadedSeason") {
            let fallback_season = loaded_season_number(loaded).unwrap_or(season_number);
            videos.extend(episodes_from_season_deduped(
                cdn,
                loaded,
                fallback_season,
                &mut seen_ids,
            ));
        }
    }

    Ok(videos)
}

pub fn fetch_season_episodes(
    app: &str,
    cdn: &str,
    locale: &str,
    title_id: i64,
    slug: &str,
    season_number: i32,
) -> Result<Vec<StremioVideo>, String> {
    let mut session = ScSession::open(app, locale)?;
    let path = title_path(locale, title_id, slug, None);
    let page = session.inertia_page(&path, None)?;
    let props = page_props(&page)?;
    let title = props
        .get("title")
        .ok_or_else(|| "Metadati titolo non disponibili".to_string())?;

    let seasons = title
        .get("seasons")
        .and_then(|v| v.as_array())
        .cloned()
        .unwrap_or_default();
    let season_entry = seasons.iter().find(|s| {
        s.get("number")
            .and_then(|v| v.as_i64())
            .map(|n| n as i32)
            == Some(season_number)
    });

    let mut seen_ids = HashMap::new();
    if season_number > 1 {
        let first_season = seasons
            .first()
            .and_then(|s| s.get("number").and_then(|v| v.as_i64()).map(|n| n as i32))
            .unwrap_or(1);
        if first_season != season_number {
            if let Ok(first_eps) = load_season_episodes(
                &mut session,
                cdn,
                locale,
                title_id,
                slug,
                first_season,
                seasons.first(),
                &mut seen_ids,
            ) {
                for ep in first_eps {
                    seen_ids.insert(ep.id, first_season);
                }
            }
        }
    }

    load_season_episodes(
        &mut session,
        cdn,
        locale,
        title_id,
        slug,
        season_number,
        season_entry,
        &mut seen_ids,
    )
}

struct ScSession {
    client: Client,
    app_base: String,
    locale: String,
    inertia_version: Option<String>,
}

impl ScSession {
    fn open(app: &str, locale: &str) -> Result<Self, String> {
        let client = Client::builder()
            .timeout(Duration::from_secs(30))
            .cookie_store(true)
            .user_agent(
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 \
                 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Branchefy/0.1",
            )
            .build()
            .map_err(|e| e.to_string())?;

        let app_base = app.trim_end_matches('/').to_string();
        client
            .get(format!("{app_base}/"))
            .header("Accept", "text/html,application/xhtml+xml")
            .send()
            .map_err(|e| format!("Sessione streaming: {e}"))?;

        Ok(Self {
            client,
            app_base,
            locale: locale.to_string(),
            inertia_version: None,
        })
    }

    fn get_html(&self, path_or_url: &str, referer: Option<&str>) -> Result<String, String> {
        let url = if path_or_url.starts_with("http") {
            path_or_url.to_string()
        } else {
            format!("{}{}", self.app_base, path_or_url)
        };
        let mut req = self
            .client
            .get(&url)
            .header("Accept", "text/html,application/xhtml+xml");
        if let Some(r) = referer {
            let referer_url = if r.starts_with("http") {
                r.to_string()
            } else {
                format!("{}{}", self.app_base, r)
            };
            req = req.header("Referer", referer_url);
        }
        req.send()
            .map_err(|e| format!("Richiesta non riuscita: {e}"))?
            .error_for_status()
            .map_err(|e| format!("HTTP: {e}"))?
            .text()
            .map_err(|e| e.to_string())
    }

    fn inertia_page(&mut self, path: &str, referer: Option<&str>) -> Result<Value, String> {
        if self.inertia_version.is_none() {
            let html = self.get_html(path, referer)?;
            if let Some(page) = parse_inertia_from_html(&html) {
                self.inertia_version = page
                    .get("version")
                    .and_then(|v| v.as_str())
                    .map(str::to_string);
                return Ok(page);
            }
        }

        let url = format!("{}{}", self.app_base, path);
        let referer_url = referer.map(|r| {
            if r.starts_with("http") {
                r.to_string()
            } else {
                format!("{}{}", self.app_base, r)
            }
        });

        let mut req = self
            .client
            .get(&url)
            .header("Accept", "application/json")
            .header("X-Inertia", "true")
            .header("X-Requested-With", "XMLHttpRequest");
        if let Some(version) = &self.inertia_version {
            req = req.header("X-Inertia-Version", version);
        }
        if let Some(r) = referer_url {
            req = req.header("Referer", r);
        }

        let resp = req
            .send()
            .map_err(|e| format!("Inertia: {e}"))?
            .error_for_status()
            .map_err(|e| format!("Inertia HTTP: {e}"))?;
        resp.json().map_err(|e| format!("Inertia JSON: {e}"))
    }

    /// Carica props per una pagina stagione: HTML + Inertia XHR con versione aggiornata.
    fn props_for_season_path(&mut self, path: &str) -> Result<Value, String> {
        let referer = Some(path);
        if let Ok(html) = self.get_html(path, referer) {
            if let Some(page) = parse_inertia_from_html(&html) {
                if let Some(version) = page.get("version").and_then(|v| v.as_str()) {
                    self.inertia_version = Some(version.to_string());
                }
                if let Some(props) = page.get("props").filter(|p| !p.is_null()) {
                    if loaded_season_from_props(props).is_some() {
                        return Ok(props.clone());
                    }
                }
            }
        }

        let html = self.get_html(path, referer)?;
        if let Some(page) = parse_inertia_from_html(&html) {
            if let Some(version) = page.get("version").and_then(|v| v.as_str()) {
                self.inertia_version = Some(version.to_string());
            }
        }

        let page = self.inertia_page(path, referer)?;
        page.get("props")
            .cloned()
            .ok_or_else(|| format!("Props non disponibili per {path}"))
    }

    /// Carica props Inertia da HTML completo (necessario per ?season=N: le richieste X-Inertia
    /// possono restituire sempre la stagione predefinita).
    fn props_from_html_page(&self, path: &str, referer: Option<&str>) -> Result<Value, String> {
        let html = self.get_html(path, referer)?;
        let page = parse_inertia_from_html(&html)
            .ok_or_else(|| format!("Metadati non disponibili per {path}"))?;
        page.get("props")
            .cloned()
            .ok_or_else(|| "Props pagina non disponibili".to_string())
    }
}

fn title_path(locale: &str, title_id: i64, slug: &str, season: Option<i32>) -> String {
    let mut path = format!("/{locale}/titles/{title_id}-{slug}");
    if let Some(n) = season {
        path.push_str(&format!("?season={n}"));
    }
    path
}

fn title_season_path(locale: &str, title_id: i64, slug: &str, season_number: i32) -> String {
    format!("/{locale}/titles/{title_id}-{slug}/season-{season_number}")
}

fn watch_path(locale: &str, title_id: i64, slug: &str, episode_id: Option<i64>) -> String {
    let mut path = format!("/{locale}/watch/{title_id}-{slug}");
    if let Some(episode_id) = episode_id {
        path.push_str(&format!("?e={episode_id}"));
    }
    path
}

/// Il server SC ignora il parametro episodio nel watch path (via Inertia) e
/// restituisce sempre l'embedUrl del primo episodio. L'iframe però accetta
/// `episode_id`: forzandolo qui si ottiene il vix embed dell'episodio giusto.
fn embed_url_with_episode(embed_url: &str, episode_id: Option<i64>) -> String {
    let Some(episode_id) = episode_id else {
        return embed_url.to_string();
    };
    let Ok(mut url) = reqwest::Url::parse(embed_url) else {
        return embed_url.to_string();
    };
    let others: Vec<(String, String)> = url
        .query_pairs()
        .filter(|(k, _)| k != "episode_id")
        .map(|(k, v)| (k.into_owned(), v.into_owned()))
        .collect();
    {
        let mut pairs = url.query_pairs_mut();
        pairs.clear();
        for (k, v) in &others {
            pairs.append_pair(k, v);
        }
        pairs.append_pair("episode_id", &episode_id.to_string());
    }
    url.to_string()
}

fn page_props(page: &Value) -> Result<&Value, String> {
    page.get("props")
        .ok_or_else(|| "Risposta pagina non valida".to_string())
}

fn parse_inertia_from_html(html: &str) -> Option<Value> {
    let marker = "data-page=\"";
    let start = html.find(marker)? + marker.len();
    let rest = &html[start..];
    let end = rest.find('"')?;
    let encoded = &rest[..end];
    let decoded = encoded
        .replace("&quot;", "\"")
        .replace("&amp;", "&")
        .replace("&#39;", "'");
    serde_json::from_str(&decoded).ok()
}

fn extract_iframe_src(html: &str) -> Option<String> {
    let marker = "src=\"";
    let iframe_pos = html.find("<iframe")?;
    let start = html[iframe_pos..].find(marker)? + iframe_pos + marker.len();
    let rest = &html[start..];
    let end = rest.find('"')?;
    Some(rest[..end].replace("&amp;", "&").replace("&#39;", "'"))
}

fn extract_js_string(html: &str, key: &str) -> Option<String> {
    let patterns = [
        format!("{key}: '"),
        format!("'{key}': '"),
        format!("\"{key}\": \""),
    ];
    for pat in patterns {
        if let Some(pos) = html.find(&pat) {
            let start = pos + pat.len();
            let rest = &html[start..];
            let quote = pat.chars().last()?;
            let end = rest.find(quote)?;
            return Some(rest[..end].to_string());
        }
    }
    None
}

fn build_playlist_url(vix_embed: &str, vix_html: &str, locale: &str) -> Result<String, String> {
    let block_start = vix_html
        .find("window.masterPlaylist")
        .ok_or_else(|| "Playlist HLS non trovata".to_string())?;
    let block = &vix_html[block_start..block_start.saturating_add(2500)];
    let master_url =
        extract_js_string(block, "url").ok_or_else(|| "URL playlist non trovata".to_string())?;
    let token = extract_js_string(block, "token").unwrap_or_default();
    let expires = extract_js_string(block, "expires").unwrap_or_default();
    let can_fhd = vix_html.contains("canPlayFHD = true") || vix_embed.contains("canPlayFHD=1");
    let scz = vix_embed.contains("scz=1") || vix_html.contains("scz");

    let mut url = reqwest::Url::parse(&master_url).map_err(|e| e.to_string())?;
    {
        let mut pairs = url.query_pairs_mut();
        if !token.is_empty() {
            pairs.append_pair("token", &token);
        }
        if !expires.is_empty() {
            pairs.append_pair("expires", &expires);
        }
        pairs.append_pair("lang", locale);
        if can_fhd {
            pairs.append_pair("h", "1");
        }
        if scz {
            pairs.append_pair("scz", "1");
        }
    }
    Ok(url.to_string())
}

fn title_type(title: &Value) -> String {
    match title.get("type").and_then(|v| v.as_str()) {
        Some("tv") => "series".to_string(),
        _ => "movie".to_string(),
    }
}

fn title_name(title: &Value) -> String {
    title
        .get("name")
        .and_then(|v| v.as_str())
        .map(decode_html_entities)
        .unwrap_or_else(|| "Titolo".to_string())
}

fn plot_from_title(title: &Value) -> Option<String> {
    title
        .get("plot")
        .and_then(|v| v.as_str())
        .map(decode_html_entities)
}

fn decode_html(input: &str) -> String {
    decode_html_entities(input)
}

fn poster_from_images(cdn: &str, images: Option<&Value>) -> Option<String> {
    let images = images?.as_array()?;
    for image in images {
        if image.get("type").and_then(|v| v.as_str()) == Some("poster") {
            if let Some(filename) = image.get("filename").and_then(|v| v.as_str()) {
                return Some(format!("{cdn}/images/{filename}"));
            }
        }
    }
    None
}

fn episodes_from_season(
    cdn: &str,
    season: &Value,
    season_override: Option<i32>,
) -> Vec<StremioVideo> {
    let season_number = season_override.or_else(|| {
        season
            .get("number")
            .and_then(|v| v.as_i64())
            .map(|n| n as i32)
    });
    let episodes = season
        .get("episodes")
        .and_then(|v| v.as_array())
        .cloned()
        .unwrap_or_default();

    episodes
        .into_iter()
        .filter_map(|episode| {
            let id = episode.get("id")?.as_i64()?;
            let number = episode
                .get("number")
                .and_then(|v| v.as_i64())
                .map(|n| n as i32);
            let name = episode
                .get("name")
                .and_then(|v| v.as_str())
                .map(decode_html_entities)
                .unwrap_or_else(|| "Episodio".to_string());
            let duration = episode.get("duration").and_then(|v| v.as_i64());
            Some(StremioVideo {
                id: id.to_string(),
                title: name,
                season: season_number,
                episode: number,
                thumbnail: episode_image(cdn, &episode),
                released: None,
                description: episode
                    .get("plot")
                    .and_then(|v| v.as_str())
                    .map(decode_html),
                runtime: duration.map(|d| format!("{d} min")),
            })
        })
        .collect()
}

fn episode_image(cdn: &str, episode: &Value) -> Option<String> {
    let images = episode.get("images")?.as_array()?;
    for image in images {
        let image_type = image.get("type").and_then(|v| v.as_str());
        if image_type == Some("cover") || image_type == Some("poster") {
            if let Some(filename) = image.get("filename").and_then(|v| v.as_str()) {
                return Some(format!("{}/images/{}", cdn.trim_end_matches('/'), filename));
            }
        }
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::addon_proxy::AddonProxyRegistry;

    #[test]
    fn title_season_path_uses_sc_route_format() {
        assert_eq!(
            title_season_path("it", 3589, "breaking-bad", 2),
            "/it/titles/3589-breaking-bad/season-2"
        );
    }

    #[test]
    fn rejects_loaded_season_with_wrong_number() {
        let loaded = serde_json::json!({
            "number": 2,
            "episodes": [{"id": 100, "name": "Ep 1", "number": 1}]
        });
        let mut seen = HashMap::new();
        let eps = episodes_from_season_deduped("https://cdn.test", &loaded, 1, &mut seen);
        assert!(eps.is_empty());
    }

    #[test]
    fn accepts_matching_season_and_dedupes_duplicate_ids() {
        let loaded = serde_json::json!({
            "number": 1,
            "episodes": [
                {"id": 1, "name": "A", "number": 1},
                {"id": 1, "name": "A dup", "number": 1}
            ]
        });
        let mut seen = HashMap::new();
        let eps = episodes_from_season_deduped("https://cdn.test", &loaded, 1, &mut seen);
        assert_eq!(eps.len(), 1);
        assert_eq!(eps[0].id, "1");
    }

    #[test]
    fn dedup_skips_episode_id_already_in_other_season() {
        let mut seen = HashMap::new();
        seen.insert("42".to_string(), 1);
        let loaded = serde_json::json!({
            "number": 2,
            "episodes": [{"id": 42, "name": "Dup", "number": 1}]
        });
        let eps = episodes_from_season_deduped("https://cdn.test", &loaded, 2, &mut seen);
        assert!(eps.is_empty());
    }

    #[test]
    fn season_numbers_from_title_sorted_unique() {
        let title = serde_json::json!({
            "seasons": [
                {"number": 3},
                {"number": 1},
                {"number": 2},
                {"number": 2}
            ]
        });
        assert_eq!(season_numbers_from_title(&title), vec![1, 2, 3]);
    }

    #[test]
    fn resolve_movie_playback_live() {
        let proxy = AddonProxyRegistry::new();
        let stream = resolve_playback(
            "https://streamingcommunityz.tech",
            "it",
            63783,
            "messaggi-per-isabelle",
            None,
            &proxy,
        )
        .expect("SC playback resolve");
        assert!(stream.is_hls);
        assert!(stream.url.starts_with("http://127.0.0.1:"));
        assert!(stream.url.contains("/remote/"));
    }
}
