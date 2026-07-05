use crate::addon_proxy::AddonProxyRegistry;
use crate::html_text::decode_html_entities;
use crate::loonex_catalog;
use crate::stremio::{PlayableStream, StremioMeta, StremioVideo};
use regex::Regex;
use reqwest::blocking::Client;
use std::collections::HashMap;
use std::collections::HashSet;
use std::time::Duration;

const GUARDA_BASE: &str = "https://loonex.eu/guarda/";

fn http_client() -> Result<Client, String> {
    Client::builder()
        .timeout(Duration::from_secs(45))
        .cookie_store(true)
        .user_agent(
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 \
             (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Branchefy/0.1",
        )
        .build()
        .map_err(|e| e.to_string())
}

fn fetch_html(client: &Client, url: &str, referer: Option<&str>) -> Result<String, String> {
    let mut req = client
        .get(url)
        .header("Accept", "text/html,application/xhtml+xml");
    if let Some(r) = referer {
        req = req.header("Referer", r);
    }
    req.send()
        .map_err(|e| format!("Rete Loonex: {e}"))?
        .error_for_status()
        .map_err(|e| format!("Pagina non disponibile: {e}"))?
        .text()
        .map_err(|e| e.to_string())
}

pub fn decrypt_guarda_url(hex_str: &str, key: &str) -> Option<String> {
    let trimmed = hex_str.trim();
    if trimmed.is_empty() || key.is_empty() {
        return None;
    }
    let bytes: Vec<u8> = (0..trimmed.len())
        .step_by(2)
        .filter_map(|i| u8::from_str_radix(&trimmed[i..i + 2], 16).ok())
        .collect();
    let decoded: String = bytes
        .iter()
        .enumerate()
        .map(|(i, byte)| {
            let key_byte = key.as_bytes()[i % key.len()];
            (*byte ^ key_byte) as char
        })
        .collect();
    let url = urlencoding::decode(&decoded)
        .map(|s| s.into_owned())
        .unwrap_or(decoded);
    if url.starts_with("http") {
        Some(url.replace("&amp;", "&"))
    } else {
        None
    }
}

struct ParsedEpisode {
    guarda_id: String,
    title: String,
    season: i32,
    episode: i32,
    thumbnail: Option<String>,
}

fn season_before_position(html: &str, pos: usize) -> i32 {
    let head = &html[..pos.min(html.len())];
    let tab_re = Regex::new(r#"season-tab-(\d+)"#).ok();
    if let Some(re) = tab_re {
        if let Some(cap) = re.captures_iter(head).last() {
            if let Some(n) = cap.get(1).and_then(|m| m.as_str().parse::<i32>().ok()) {
                return n.max(1);
            }
        }
    }
    let stagione_re = Regex::new(r#"(?i)stagione\s*0*(\d{1,3})"#).ok();
    if let Some(re) = stagione_re {
        if let Some(cap) = re.captures_iter(head).last() {
            if let Some(n) = cap.get(1).and_then(|m| m.as_str().parse::<i32>().ok()) {
                return n.max(1);
            }
        }
    }
    1
}

fn parse_guarda_id_season_episode(guarda_id: &str) -> (Option<i32>, Option<i32>) {
    if let Ok(re) = Regex::new(r#"(?i)_(\d{1,3})x(\d{1,3})$"#) {
        if let Some(cap) = re.captures(guarda_id) {
            let season = cap.get(1).and_then(|m| m.as_str().parse().ok());
            let episode = cap.get(2).and_then(|m| m.as_str().parse().ok());
            return (season, episode);
        }
    }
    if let Ok(re) = Regex::new(r#"(?i)_s(\d{1,3})e(\d{1,3})"#) {
        if let Some(cap) = re.captures(guarda_id) {
            let season = cap.get(1).and_then(|m| m.as_str().parse().ok());
            let episode = cap.get(2).and_then(|m| m.as_str().parse().ok());
            return (season, episode);
        }
    }
    if let Ok(re) = Regex::new(r#"(?i)_ep(\d{1,3})$"#) {
        if let Some(cap) = re.captures(guarda_id) {
            let episode = cap.get(1).and_then(|m| m.as_str().parse().ok());
            return (None, episode);
        }
    }
    (None, None)
}

fn episode_thumbnail_from_block(
    db: &crate::db::Database,
    block: &str,
    series_poster: &Option<String>,
) -> Option<String> {
    let img_re = Regex::new(r#"(?is)<img[^>]+src="([^"]+)""#).ok()?;
    for cap in img_re.captures_iter(block) {
        let src = cap.get(1)?.as_str().trim();
        if src.is_empty() || src.contains("data:image") {
            continue;
        }
        let resolved = loonex_catalog::resolve_poster_url(db, src)
            .or_else(|| Some(loonex_catalog::absolute_asset_url(
                &loonex_catalog::app_url(db),
                src,
            )));
        if let Some(url) = resolved {
            if series_poster.as_ref().is_some_and(|p| p == &url) {
                continue;
            }
            return Some(url);
        }
    }
    None
}

fn parse_episodes(html: &str, db: &crate::db::Database, series_poster: &Option<String>) -> Vec<ParsedEpisode> {
    let link_re = Regex::new(
        r#"(?is)href="(?:https://loonex\.eu)?/guarda/\?id=([^"]+)""#,
    )
    .expect("loonex guarda link");
    let title_re =
        Regex::new(r#"(?is)<span[^>]+class="episode-title"[^>]*>([\s\S]*?)</span>"#)
            .expect("loonex episode title");

    let mut seen = HashSet::new();
    let mut out = Vec::new();
    let mut episode_by_season: HashMap<i32, i32> = HashMap::new();

    for cap in link_re.captures_iter(html) {
        let guarda_id = cap
            .get(1)
            .map(|m| m.as_str().trim().to_string())
            .unwrap_or_default();
        if guarda_id.is_empty() || !seen.insert(guarda_id.clone()) {
            continue;
        }
        let start = cap.get(0).map(|m| m.start()).unwrap_or(0);
        let window_start = start.saturating_sub(1600);
        let window_end = (start + 500).min(html.len());
        let block = &html[window_start..window_end];
        let link_offset = start - window_start;
        let before_link = &block[..link_offset.min(block.len())];
        let title = title_re
            .captures_iter(before_link)
            .last()
            .and_then(|c| c.get(1))
            .map(|m| {
                decode_html_entities(
                    m.as_str().split_whitespace().collect::<Vec<_>>().join(" ").trim(),
                )
            })
            .filter(|s| !s.is_empty())
            .unwrap_or_else(|| guarda_id.replace('_', " "));

        let (id_season, id_episode) = parse_guarda_id_season_episode(&guarda_id);
        let season = id_season.unwrap_or_else(|| season_before_position(html, start));
        let episode = id_episode.unwrap_or_else(|| {
            let counter = episode_by_season.entry(season).or_insert(0);
            *counter += 1;
            *counter
        });
        let thumbnail = episode_thumbnail_from_block(db, block, series_poster);

        out.push(ParsedEpisode {
            guarda_id,
            title,
            season,
            episode,
            thumbnail,
        });
    }

    out.sort_by(|a, b| {
        a.season
            .cmp(&b.season)
            .then(a.episode.cmp(&b.episode))
            .then(a.title.cmp(&b.title))
    });

    out
}


fn extract_detail_name(html: &str, slug: &str) -> String {
    let og_re = Regex::new(r#"(?is)property="og:title" content="([^"]+)""#).ok();
    if let Some(re) = og_re {
        if let Some(cap) = re.captures(html) {
            if let Some(title) = cap.get(1) {
                let name = decode_html_entities(title.as_str().trim());
                if !name.is_empty() {
                    return name;
                }
            }
        }
    }
    let h1_re = Regex::new(r#"(?is)<h1[^>]*>([^<]+)</h1>"#).ok();
    if let Some(re) = h1_re {
        if let Some(cap) = re.captures(html) {
            if let Some(title) = cap.get(1) {
                let name = decode_html_entities(title.as_str().trim());
                if !name.is_empty() {
                    return name;
                }
            }
        }
    }
    slug.replace('-', " ")
}

fn extract_poster(db: &crate::db::Database, html: &str) -> Option<String> {
    let base = loonex_catalog::app_url(db);
    if let Some(src) = loonex_catalog::extract_img_src(html, "detail-poster") {
        return loonex_catalog::resolve_poster_url(db, &src);
    }
    if let Some(src) = loonex_catalog::extract_img_src(html, "card-img-bg") {
        return loonex_catalog::resolve_poster_url(db, &src);
    }
    let patterns = [
        r#"(?is)property="og:image" content="([^"]+)""#,
        r#"(?is)<img[^>]+src="([^"]+cover[^"]+)""#,
    ];
    for pat in patterns {
        if let Ok(re) = Regex::new(pat) {
            if let Some(cap) = re.captures(html) {
                if let Some(src) = cap.get(1) {
                    let resolved = loonex_catalog::resolve_poster_url(db, src.as_str())
                        .unwrap_or_else(|| loonex_catalog::absolute_asset_url(&base, src.as_str()));
                    if !resolved.is_empty() {
                        return Some(resolved);
                    }
                }
            }
        }
    }
    None
}

fn clean_loonex_description(raw: &str, title: &str) -> String {
    let mut s = decode_html_entities(raw.trim());
    let patterns = [
        r"(?is)^\s*📂\s*Categoria:\s*[^👁\n]+",
        r"(?is)👁️?\s*[\d.,]+\s*Visualizzazioni\s*•\s*🌟?\s*\d+\s*Vibes\s*",
        r"(?is)Streaming gratis senza pubblicità in italiano,\s*tutti gli episodi[^.]*\.\s*",
        r"(?is)tutti gli episodi\s*/\s*puntate[^.]*\.\s*",
        r"(?is)Streaming gratis[^.]*su loonex\.eu\.\s*",
        r"(?is)guarda[^.]*su loonex\.eu\.\s*",
    ];
    for pat in patterns {
        if let Ok(re) = Regex::new(pat) {
            s = re.replace(&s, "").into_owned();
        }
    }
    if !title.is_empty() {
        let escaped = regex::escape(title);
        if let Ok(re) = Regex::new(&format!(r"(?is)^\s*{escaped}\s*[-–:.]*\s*")) {
            s = re.replace(&s, "").into_owned();
        }
    }
    s.split_whitespace().collect::<Vec<_>>().join(" ").trim().to_string()
}

fn extract_description(html: &str, title: &str) -> Option<String> {
    let synopsis_re =
        Regex::new(r#"(?is)<div[^>]+class="[^"]*detail-synopsis[^"]*"[^>]*>([\s\S]*?)</div>"#).ok();
    if let Some(re) = synopsis_re {
        if let Some(cap) = re.captures(html) {
            if let Some(body) = cap.get(1) {
                let text = decode_html_entities(
                    body.as_str()
                        .replace("<br>", "\n")
                        .replace("<br/>", "\n")
                        .replace("<br />", "\n")
                        .split_whitespace()
                        .collect::<Vec<_>>()
                        .join(" ")
                        .trim(),
                );
                let cleaned = clean_loonex_description(&text, title);
                if cleaned.len() >= 24 {
                    return Some(cleaned.chars().take(600).collect());
                }
            }
        }
    }

    let re = Regex::new(r#"(?is)property="og:description" content="([^"]+)""#).ok()?;
    re.captures(html).and_then(|cap| {
        cap.get(1).map(|m| {
            let cleaned = clean_loonex_description(m.as_str().trim(), title);
            cleaned.chars().take(600).collect::<String>()
        })
    })
    .filter(|s| !s.is_empty())
}

fn is_movie_detail(html: &str, episodes: &[ParsedEpisode]) -> bool {
    if html.contains("class=\"movie-badge\"") || html.contains("class='movie-badge'") {
        return true;
    }
    if html.contains("FILM COMPLETO") && episodes.len() <= 1 {
        return true;
    }
    false
}

fn season_numbers_from_episodes(episodes: &[ParsedEpisode]) -> Vec<i32> {
    let mut seasons: Vec<i32> = episodes.iter().map(|e| e.season).collect();
    seasons.sort_unstable();
    seasons.dedup();
    seasons
}

pub fn fetch_title_meta(db: &crate::db::Database, slug: &str) -> Result<StremioMeta, String> {
    let client = http_client()?;
    let html = loonex_catalog::fetch_cartoon_detail_html(db, &client, slug)?;

    let name = extract_detail_name(&html, slug);
    let poster = extract_poster(db, &html);
    let description = extract_description(&html, &name);
    let episodes = parse_episodes(&html, db, &poster);
    let movie = is_movie_detail(&html, &episodes);

    let mut videos = Vec::new();
    for ep in episodes.iter() {
        let thumb = ep
            .thumbnail
            .clone()
            .or_else(|| poster.clone());
        videos.push(StremioVideo {
            id: ep.guarda_id.clone(),
            title: ep.title.clone(),
            season: Some(ep.season),
            episode: Some(ep.episode),
            thumbnail: thumb,
            released: None,
            description: None,
            runtime: None,
        });
    }

    let stremio_type = if movie {
        "movie"
    } else if videos.is_empty() {
        "movie"
    } else {
        "series"
    };

    if stremio_type == "movie" && videos.is_empty() {
        if let Some(cap) =
            Regex::new(r#"(?is)href="(?:https://loonex\.eu)?/guarda/\?id=([^"]+)""#)
                .ok()
                .and_then(|re| re.captures(&html))
        {
            if let Some(id) = cap.get(1) {
                videos.push(StremioVideo {
                    id: id.as_str().to_string(),
                    title: name.clone(),
                    season: None,
                    episode: None,
                    thumbnail: poster.clone(),
                    released: None,
                    description: None,
                    runtime: None,
                });
            }
        }
    }

    let release_info = if videos.is_empty() {
        None
    } else if stremio_type == "movie" {
        Some("Film completo · ITA".to_string())
    } else {
        let seasons = season_numbers_from_episodes(&episodes);
        if seasons.len() > 1 {
            Some(format!(
                "{} episodi · {} stagioni · ITA",
                videos.len(),
                seasons.len()
            ))
        } else {
            Some(format!("{} episodi · ITA", videos.len()))
        }
    };

    let season_numbers = if stremio_type == "series" {
        season_numbers_from_episodes(&episodes)
    } else {
        Vec::new()
    };

    Ok(StremioMeta {
        id: slug.to_string(),
        r#type: stremio_type.to_string(),
        name,
        poster: poster.clone(),
        background: poster,
        description,
        release_info,
        genres: vec!["Animazione".to_string(), "Cartoni".to_string()],
        videos,
        runtime: None,
        logo: None,
        rating: None,
        cast: Vec::new(),
        directors: Vec::new(),
        view_count: None,
        quality: None,
        has_preview: false,
        season_numbers,
    })
}

fn extract_guarda_stream(html: &str) -> Option<String> {
    let hex_re = Regex::new(r#"(?is)var\s+encodedStr\s*=\s*"([0-9a-fA-F]+)""#).ok()?;
    let key_re = Regex::new(r#"(?is)var\s+decryptionKey\s*=\s*"([^"]+)""#).ok()?;
    let hex = hex_re.captures(html)?.get(1)?.as_str();
    let key = key_re.captures(html)?.get(1)?.as_str();
    decrypt_guarda_url(hex, key)
}

pub fn resolve_playback(
    _db: &crate::db::Database,
    _slug: &str,
    episode_id: Option<&str>,
    proxy: &AddonProxyRegistry,
) -> Result<PlayableStream, String> {
    let guarda_id = episode_id
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .ok_or_else(|| "Seleziona un episodio da riprodurre".to_string())?;

    let client = http_client()?;
    let guarda_url = format!("{GUARDA_BASE}?id={}", urlencoding::encode(guarda_id));
    let html = fetch_html(&client, &guarda_url, Some("https://loonex.eu/cartoni/"))?;

    let stream_url = extract_guarda_stream(&html)
        .ok_or_else(|| "Stream non disponibile per questo episodio".to_string())?;

    if stream_url.contains("nontrovato") {
        return Err("Video non trovato su Loonex".into());
    }

    let mut headers = HashMap::new();
    headers.insert("Referer".to_string(), guarda_url.clone());
    headers.insert(
        "User-Agent".to_string(),
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 \
         (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Branchefy/0.1"
            .to_string(),
    );
    if stream_url.contains("loonex.eu") || stream_url.contains("videoserver") {
        headers.insert("Origin".to_string(), "https://loonex.eu".to_string());
    }

    let is_hls = stream_url.contains(".m3u8");
    let proxy_id = proxy.register(stream_url, headers, is_hls);

    Ok(PlayableStream {
        url: proxy.playback_url(&proxy_id),
        name: Some("Loonex Cartoni".to_string()),
        description: None,
        addon_id: "loonex".to_string(),
        addon_name: "Loonex Cartoni".to_string(),
        is_hls,
        proxied: true,
        needs_debrid: false,
        info_hash: None,
        file_idx: None,
        sources: Vec::new(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn decrypts_guarda_sample() {
        let hex = "3b115a061c425f284a1c2a441c251704060c005d0a15180c5c5d090c0000011700261c445d68241b0c01060a060461234c1301495d594a1c2a034b0d4f5c52475d1e5f524b5b683655523c1b140a5c665b512d4b2f3457425b58421161481f4e42565f445c1c4953680c1419121c1b0002541b51";
        let key = "Se.voglio.la.cambio.ogni.secondo.Ciao.Akerino!";
        let url = decrypt_guarda_url(hex, key).expect("decrypted url");
        assert!(url.starts_with("http"));
    }

    #[test]
    fn cleans_loonex_description_boilerplate() {
        let raw = "📂 Categoria: Animali 👁️ 30.845 Visualizzazioni • 🌟 15 Vibes Streaming gratis senza pubblicità in italiano, tutti gli episodi / puntate / speciali / completi e integrali di 101 Dalmatian Street su loonex.eu. Le avventure di Delilah e Doug.";
        let cleaned = clean_loonex_description(raw, "101 Dalmatian Street");
        assert!(!cleaned.contains("Categoria"));
        assert!(!cleaned.contains("Visualizzazioni"));
        assert!(!cleaned.contains("loonex.eu"));
        assert!(cleaned.contains("Delilah"));
    }

    #[test]
    fn parses_episode_links_without_lookahead() {
        let db = crate::db::Database::open(std::path::Path::new(":memory:")).expect("db");
        let html = r#"
            <div class="episode-row px-0">
                <span class="episode-title">Episodio 1</span>
                <a href="https://loonex.eu/guarda/?id=ben10_2005_ep1" class="btn-play-sm">Guarda</a>
            </div>
            <div class="episode-row px-0">
                <span class="episode-title">Episodio 2</span>
                <a href="/guarda/?id=ben10_2005_ep2" class="btn-play-sm">Guarda</a>
            </div>
        "#;
        let eps = parse_episodes(html, &db, &None);
        assert_eq!(eps.len(), 2);
        assert_eq!(eps[0].guarda_id, "ben10_2005_ep1");
        assert_eq!(eps[0].title, "Episodio 1");
        assert_eq!(eps[1].guarda_id, "ben10_2005_ep2");
        assert_eq!(eps[0].season, 1);
        assert_eq!(eps[0].episode, 1);
    }

    #[test]
    fn parses_season_episode_from_guarda_id() {
        let (s, e) = parse_guarda_id_season_episode("101dalmatianstreet_1x01");
        assert_eq!(s, Some(1));
        assert_eq!(e, Some(1));
        let (s2, e2) = parse_guarda_id_season_episode("ben10_2005_ep12");
        assert_eq!(s2, None);
        assert_eq!(e2, Some(12));
    }

    #[test]
    fn series_with_one_episode_is_not_movie() {
        let db = crate::db::Database::open(std::path::Path::new(":memory:")).expect("db");
        let html = r#"<div class="episode-row"><span class="episode-title">Unico</span><a href="/guarda/?id=foo_1x01">x</a></div>"#;
        let eps = parse_episodes(html, &db, &None);
        assert!(!is_movie_detail(html, &eps));
    }

    #[test]
    fn css_movie_badge_class_does_not_mark_as_movie() {
        let db = crate::db::Database::open(std::path::Path::new(":memory:")).expect("db");
        let html = r#"
            <style>.movie-badge { background: blue; }</style>
            <div class="episode-row"><span class="episode-title">E1</span><a href="/guarda/?id=foo_1x01">x</a></div>
            <div class="episode-row"><span class="episode-title">E2</span><a href="/guarda/?id=foo_1x02">x</a></div>
        "#;
        let eps = parse_episodes(html, &db, &None);
        assert_eq!(eps.len(), 2);
        assert!(!is_movie_detail(html, &eps));
    }

    #[test]
    fn episode_numbers_restart_per_season_without_id() {
        let db = crate::db::Database::open(std::path::Path::new(":memory:")).expect("db");
        let html = r#"
            <div class="episode-row"><span class="episode-title">S1E1</span><a href="/guarda/?id=show_a">x</a></div>
            <div class="episode-row"><span class="episode-title">S1E2</span><a href="/guarda/?id=show_b">x</a></div>
            <div id="season-tab-2"></div>
            <div class="episode-row"><span class="episode-title">S2E1</span><a href="/guarda/?id=show_c">x</a></div>
            <div class="episode-row"><span class="episode-title">S2E2</span><a href="/guarda/?id=show_d">x</a></div>
        "#;
        let eps = parse_episodes(html, &db, &None);
        assert_eq!(eps.len(), 4);
        assert_eq!(eps[2].season, 2);
        assert_eq!(eps[2].episode, 1);
        assert_eq!(eps[3].season, 2);
        assert_eq!(eps[3].episode, 2);
    }
}
