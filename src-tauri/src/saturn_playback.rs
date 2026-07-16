use crate::addon_proxy::AddonProxyRegistry;
use crate::saturn_catalog;
use crate::stremio::{PlayableStream, StremioMeta, StremioVideo};
use base64::Engine;
use regex::Regex;
use reqwest::blocking::Client;
use std::collections::{HashMap, HashSet};
use std::time::Duration;

fn http_client() -> Result<Client, String> {
    Client::builder()
        .timeout(Duration::from_secs(40))
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
        .map_err(|e| format!("Rete AnimeSaturn: {e}"))?
        .error_for_status()
        .map_err(|e| format!("Pagina non disponibile: {e}"))?
        .text()
        .map_err(|e| e.to_string())
}

fn page_exists(client: &Client, url: &str, referer: Option<&str>) -> bool {
    let mut req = client
        .get(url)
        .header("Accept", "text/html,application/xhtml+xml");
    if let Some(r) = referer {
        req = req.header("Referer", r);
    }
    req.send()
        .ok()
        .and_then(|r| r.error_for_status().ok())
        .is_some()
}

/// Dettaglio episodio estratto dalla scheda anime.
struct ParsedEpisode {
    ep_slug: String,
    ep_num: i64,
    title: String,
    thumbnail: Option<String>,
    season: i32,
}

fn infer_season_from_slug(slug: &str) -> i32 {
    Regex::new(r"(?i)season-(\d+)")
        .ok()
        .and_then(|re| re.captures(slug))
        .and_then(|cap| cap.get(1))
        .and_then(|m| m.as_str().parse().ok())
        .unwrap_or(1)
}

fn parse_episodes_detailed(
    html: &str,
    anime_slug: &str,
    fallback_poster: &Option<String>,
    db: &crate::db::Database,
) -> Vec<ParsedEpisode> {
    let link_re = Regex::new(
        r#"(?is)<a[^>]*href="/(?:anime|episode)/([^/]+)/ep-(\d+)"(?:[^>]*\btitle="([^"]*)")?[^>]*>([\s\S]*?)</a>"#,
    )
    .expect("saturn detailed episode link");

    let img_re = Regex::new(r#"(?is)<img[^>]*\bsrc="([^"]+)""#).expect("saturn ep img");
    let mut seen = HashSet::new();
    let mut out = Vec::new();

    for cap in link_re.captures_iter(html) {
        let ep_slug = cap
            .get(1)
            .map(|m| m.as_str().to_string())
            .unwrap_or_default();
        let ep_num = cap
            .get(2)
            .and_then(|m| m.as_str().parse::<i64>().ok())
            .unwrap_or(0);
        if ep_slug.is_empty() || ep_num <= 0 {
            continue;
        }
        if !seen.insert((ep_slug.clone(), ep_num)) {
            continue;
        }

        let title_attr = cap
            .get(3)
            .map(|m| saturn_catalog::decode_html_entities(&decode_embed_escapes(m.as_str())))
            .filter(|s| !s.is_empty());
        let block = cap.get(4).map(|m| m.as_str()).unwrap_or_default();
        let title = title_attr.unwrap_or_else(|| format!("Episodio {ep_num}"));
        let thumbnail = img_re
            .captures(block)
            .and_then(|c| c.get(1))
            .and_then(|m| saturn_catalog::resolve_poster_url(db, m.as_str()))
            .or_else(|| fallback_poster.clone());
        let season = if ep_slug == anime_slug {
            infer_season_from_slug(anime_slug)
        } else {
            infer_season_from_slug(&ep_slug)
        };

        out.push(ParsedEpisode {
            ep_slug,
            ep_num,
            title,
            thumbnail,
            season,
        });
    }

    out.sort_by_key(|ep| (ep.season, ep.ep_num));
    out
}

/// (episode_slug, episode_number)
fn parse_episode_links(html: &str) -> Vec<(String, i64)> {
    let patterns = [
        r#"(?is)href="/episode/([^/]+)/ep-(\d+)""#,
        r#"(?is)href="/anime/([^/]+)/ep-(\d+)""#,
    ];
    let mut seen = HashSet::new();
    let mut out = Vec::new();

    for pat in patterns {
        let re = Regex::new(pat).expect("saturn episode href");
        for cap in re.captures_iter(html) {
            let ep_slug = cap
                .get(1)
                .map(|m| m.as_str().trim().to_string())
                .unwrap_or_default();
            let ep_num = cap
                .get(2)
                .and_then(|m| m.as_str().parse::<i64>().ok())
                .unwrap_or(0);
            if ep_slug.is_empty() || ep_num <= 0 {
                continue;
            }
            if seen.insert((ep_slug.clone(), ep_num)) {
                out.push((ep_slug, ep_num));
            }
        }
    }

    out.sort_by_key(|(_, n)| *n);
    out
}

fn episode_video_id(ep_slug: &str, anime_slug: &str, ep_num: i64) -> String {
    if ep_slug == anime_slug {
        ep_num.to_string()
    } else {
        format!("{ep_slug}::{ep_num}")
    }
}

fn resolve_episode_target(
    anime_slug: &str,
    episode_ref: Option<&str>,
) -> Result<(String, i64), String> {
    let reference = episode_ref
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .unwrap_or("1");

    if let Some((ep_slug, ep_raw)) = reference.split_once("::") {
        let ep_num = ep_raw
            .parse::<i64>()
            .map_err(|_| format!("Episodio non valido: {ep_raw}"))?;
        if ep_slug.is_empty() {
            return Err("Riferimento episodio non valido".into());
        }
        return Ok((ep_slug.to_string(), ep_num));
    }

    let ep_num = reference
        .parse::<i64>()
        .map_err(|_| format!("Episodio non valido: {reference}"))?;
    Ok((anime_slug.to_string(), ep_num))
}

fn watch_page_url(base: &str, slug: &str, ep_num: i64) -> String {
    format!("{base}/anime/{slug}/ep-{ep_num}")
}

fn resolve_episode_page_url(
    client: &Client,
    base: &str,
    anime_slug: &str,
    episode_ref: Option<&str>,
) -> Result<String, String> {
    let (ep_slug, ep_num) = resolve_episode_target(anime_slug, episode_ref)?;
    let anime_url = format!("{base}/anime/{anime_slug}");

    let candidates = [
        watch_page_url(base, &ep_slug, ep_num),
        watch_page_url(base, anime_slug, ep_num),
    ];
    for url in candidates {
        if page_exists(client, &url, Some(&anime_url)) {
            return Ok(url);
        }
    }

    let html = fetch_html(client, &anime_url, Some(base))?;
    let patterns = [
        format!(r#"(?is)href="/anime/([^/]+)/ep-{ep_num})""#),
        format!(r#"(?is)href="/episode/([^/]+)/ep-{ep_num})""#),
    ];
    for pat in patterns {
        let re = Regex::new(&pat).map_err(|e| e.to_string())?;
        if let Some(cap) = re.captures(&html) {
            let slug = cap.get(1).map(|m| m.as_str()).unwrap_or(&ep_slug);
            let watch = watch_page_url(base, slug, ep_num);
            if page_exists(client, &watch, Some(&anime_url)) {
                return Ok(watch);
            }
        }
    }

    let available = parse_episode_links(&html);
    if available.is_empty() {
        return Err(
            "Nessun episodio disponibile su AnimeSaturn per questo titolo (prossimamente o non ancora pubblicato)."
                .into(),
        );
    }

    Err(format!(
        "Episodio {ep_num} non disponibile. Episodi pubblicati: da {} a {}.",
        available.first().map(|(_, n)| *n).unwrap_or(0),
        available.last().map(|(_, n)| *n).unwrap_or(0),
    ))
}

fn decode_embed_escapes(raw: &str) -> String {
    let mut url = raw.replace("\\/", "/").replace("&amp;", "&");
    let re = Regex::new(r"\\u([0-9a-fA-F]{4})").expect("unicode escape");
    url = re
        .replace_all(&url, |caps: &regex::Captures| {
            let hex = caps.get(1).map(|m| m.as_str()).unwrap_or("0");
            u32::from_str_radix(hex, 16)
                .ok()
                .and_then(char::from_u32)
                .map(|c| c.to_string())
                .unwrap_or_default()
        })
        .to_string();
    url
}

fn normalize_embed_url(raw: &str, base: &str) -> String {
    let url = decode_embed_escapes(raw);
    if url.starts_with("http") {
        url
    } else if url.starts_with("//") {
        format!("https:{url}")
    } else {
        format!(
            "{base}{}",
            if url.starts_with('/') {
                url
            } else {
                format!("/{url}")
            }
        )
    }
}

fn extract_embed_url(html: &str, base: &str) -> Option<String> {
    let patterns = [
        r#"(?is)initialVideoUrl&quot;:&quot;(.+?)&quot;"#,
        r#"(?is)"initialVideoUrl":"([^"]+)""#,
        r#"(?is)id="watch-iframe"[^>]+src="([^"]+)""#,
        r#"(?is)<iframe[^>]+src="(https?://play\.saturncdn\.net/[^"]+)""#,
    ];
    for pat in patterns {
        let re = Regex::new(pat).ok()?;
        if let Some(cap) = re.captures(html) {
            let url = cap.get(1).map(|m| normalize_embed_url(m.as_str(), base))?;
            if url.contains("play.saturncdn.net") {
                return Some(url);
            }
        }
    }

    let iframe_re = Regex::new(r#"(?is)<iframe[^>]+src="([^"]+)""#).ok()?;
    iframe_re
        .captures(html)
        .and_then(|c| c.get(1))
        .map(|m| normalize_embed_url(m.as_str(), base))
        .filter(|u| u.contains("play.saturncdn.net"))
}

struct SaturnEmbed {
    episode_id: u64,
    token: String,
    expires: u64,
}

fn parse_saturncdn_embed(url: &str) -> Option<SaturnEmbed> {
    let url = decode_embed_escapes(url);
    if !url.contains("play.saturncdn.net/embed/") {
        return None;
    }
    let id_re = Regex::new(r"(?i)play\.saturncdn\.net/embed/(\d+)").ok()?;
    let episode_id = id_re.captures(&url)?.get(1)?.as_str().parse().ok()?;
    let token_re = Regex::new(r"[?&]token=([^&]+)").ok()?;
    let token = token_re.captures(&url)?.get(1)?.as_str().to_string();
    let expires_re = Regex::new(r"[?&]expires=(\d+)").ok()?;
    let expires = expires_re.captures(&url)?.get(1)?.as_str().parse().ok()?;
    Some(SaturnEmbed {
        episode_id,
        token,
        expires,
    })
}

fn xor_decode_b64(encoded: &str, key: &str) -> Option<String> {
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(encoded)
        .ok()?;
    let key_bytes = key.as_bytes();
    if key_bytes.is_empty() {
        return None;
    }
    let decoded: Vec<u8> = bytes
        .iter()
        .enumerate()
        .map(|(i, b)| b ^ key_bytes[i % key_bytes.len()])
        .collect();
    String::from_utf8(decoded).ok()
}

fn resolve_saturncdn_stream(
    client: &Client,
    embed: &SaturnEmbed,
    embed_url: &str,
    watch_page_url: &str,
) -> Result<String, String> {
    let embed_url = decode_embed_escapes(embed_url);
    let _ = client
        .get(&embed_url)
        .header("Referer", watch_page_url)
        .header("Accept", "text/html,application/xhtml+xml")
        .send()
        .ok()
        .and_then(|r| r.error_for_status().ok());

    let playlist_url = format!(
        "https://play.saturncdn.net/embed/{}/playlist?token={}&expires={}",
        embed.episode_id,
        urlencoding::encode(&embed.token),
        embed.expires
    );
    let resp: serde_json::Value = client
        .get(&playlist_url)
        .header("Referer", &embed_url)
        .header("Origin", "https://play.saturncdn.net")
        .header("Accept", "application/json")
        .send()
        .map_err(|e| format!("Rete player Saturn: {e}"))?
        .error_for_status()
        .map_err(|e| format!("Playlist non disponibile: {e}"))?
        .json()
        .map_err(|e| format!("Risposta playlist non valida: {e}"))?;

    let encoded = resp
        .get("d")
        .and_then(|v| v.as_str())
        .filter(|s| !s.is_empty())
        .ok_or_else(|| "Stream non disponibile dal player".to_string())?;

    xor_decode_b64(encoded, &embed.token)
        .filter(|u| u.starts_with("http") || u.starts_with("youtube/"))
        .ok_or_else(|| "Impossibile decodificare lo stream".to_string())
}

pub fn fetch_title_meta(db: &crate::db::Database, slug: &str) -> Result<StremioMeta, String> {
    let client = http_client()?;
    let base = saturn_catalog::app_url(db)
        .trim_end_matches('/')
        .to_string();
    let url = format!("{base}/anime/{slug}");
    let html = fetch_html(&client, &url, Some(&base))?;

    let title_re = Regex::new(r#"(?is)<h1[^>]*class="[^"]*title[^"]*"[^>]*>([^<]+)</h1>"#)
        .or_else(|_| Regex::new(r#"(?is)<h1[^>]*>([^<]+)</h1>"#))
        .map_err(|e| e.to_string())?;
    let name = title_re
        .captures(&html)
        .and_then(|c| c.get(1))
        .map(|m| saturn_catalog::clean_display_name_for_meta(m.as_str().trim()))
        .unwrap_or_else(|| saturn_catalog::decode_html_entities(&slug.replace('-', " ")));

    let poster_re = Regex::new(r#"(?is)<img[^>]+class="[^"]*poster[^"]*"[^>]+src="([^"]+)""#)
        .or_else(|_| Regex::new(r#"(?is)property="og:image" content="([^"]+)""#))
        .map_err(|e| e.to_string())?;
    let poster = poster_re
        .captures(&html)
        .and_then(|c| c.get(1))
        .and_then(|m| saturn_catalog::resolve_poster_url(db, m.as_str()));

    let bg_re = Regex::new(
        r#"(?is)<img[^>]+class="[^"]*(?:background|hero|cover)[^"]*"[^>]+src="([^"]+)""#,
    )
    .or_else(|_| Regex::new(r#"(?is)property="og:image" content="([^"]+)""#))
    .map_err(|e| e.to_string())?;
    let background = bg_re
        .captures(&html)
        .and_then(|c| c.get(1))
        .and_then(|m| saturn_catalog::resolve_poster_url(db, m.as_str()))
        .or_else(|| poster.clone());

    let plot_re = Regex::new(r#"(?is)<div[^>]*class="[^"]*plot[^"]*"[^>]*>([\s\S]*?)</div>"#)
        .map_err(|e| e.to_string())?;
    let description = plot_re
        .captures(&html)
        .and_then(|c| c.get(1))
        .map(|m| strip_tags(m.as_str()));

    let parsed_eps = parse_episodes_detailed(&html, slug, &poster, db);
    let episodes = if parsed_eps.is_empty() {
        parse_episode_links(&html)
    } else {
        Vec::new()
    };
    let mut videos = Vec::new();

    for ep in parsed_eps {
        videos.push(StremioVideo {
            id: episode_video_id(&ep.ep_slug, slug, ep.ep_num),
            title: ep.title,
            season: Some(ep.season),
            episode: Some(ep.ep_num as i32),
            thumbnail: ep.thumbnail,
            released: None,
            description: None,
            runtime: None,
        });
    }

    for (ep_slug, ep_num) in episodes {
        videos.push(StremioVideo {
            id: episode_video_id(&ep_slug, slug, ep_num),
            title: format!("Episodio {ep_num}"),
            season: Some(infer_season_from_slug(&ep_slug)),
            episode: Some(ep_num as i32),
            thumbnail: poster.clone(),
            released: None,
            description: None,
            runtime: None,
        });
    }

    let release_info = if videos.is_empty() {
        None
    } else {
        Some(format!("{} episodi · Sub ITA", videos.len()))
    };

    Ok(StremioMeta {
        id: slug.to_string(),
        r#type: "series".to_string(),
        name,
        poster: poster.clone(),
        background,
        description,
        release_info,
        genres: Vec::new(),
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
    db: &crate::db::Database,
    slug: &str,
    episode_id: Option<&str>,
    proxy: &AddonProxyRegistry,
) -> Result<PlayableStream, String> {
    let client = http_client()?;
    let base = saturn_catalog::app_url(db)
        .trim_end_matches('/')
        .to_string();
    let page_url = resolve_episode_page_url(&client, &base, slug, episode_id)?;
    let html = fetch_html(&client, &page_url, Some(&format!("{base}/anime/{slug}")))?;

    let embed_url = extract_embed_url(&html, &base)
        .ok_or_else(|| "Player non trovato per questo episodio".to_string())?;

    let stream_url = if embed_url.contains("play.saturncdn.net/embed/") {
        let embed = parse_saturncdn_embed(&embed_url)
            .ok_or_else(|| "Parametri player Saturn non validi".to_string())?;
        resolve_saturncdn_stream(&client, &embed, &embed_url, &page_url)?
    } else {
        let embed_html = fetch_html(&client, &embed_url, Some(&page_url))?;
        extract_stream_url(&embed_html)
            .or_else(|| extract_stream_url(&html))
            .ok_or_else(|| "Stream non estratto dal player".to_string())?
    };

    if stream_url.starts_with("youtube/") {
        return Err("Questo episodio usa YouTube e non è riproducibile nell'app.".into());
    }

    let mut headers = HashMap::new();
    headers.insert("Referer".to_string(), embed_url.clone());
    headers.insert(
        "User-Agent".to_string(),
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 \
         (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Branchefy/0.1"
            .to_string(),
    );
    if stream_url.contains("saturncdn.net") {
        headers.insert(
            "Origin".to_string(),
            "https://play.saturncdn.net".to_string(),
        );
    }

    let is_hls = stream_url.contains(".m3u8");
    let proxy_id = proxy.register(stream_url, headers, is_hls, false);

    Ok(PlayableStream {
        url: proxy.playback_url(&proxy_id),
        name: Some("AnimeSaturn".to_string()),
        description: None,
        addon_id: "saturn".to_string(),
        addon_name: "AnimeSaturn".to_string(),
        is_hls,
        proxied: true,
        needs_debrid: false,
        info_hash: None,
        file_idx: None,
        sources: Vec::new(),
    })
}

fn extract_stream_url(html: &str) -> Option<String> {
    let patterns = [
        r#"(?is)https?://[^"'\s]+\.m3u8[^"'\s]*"#,
        r#"(?is)https?://[^"'\s]+\.mp4[^"'\s]*"#,
        r#"(?is)file:\s*['"](https?://[^'"]+)['"]"#,
        r#"(?is)source:\s*['"](https?://[^'"]+)['"]"#,
        r#"(?is)<source[^>]+src="([^"]+)""#,
    ];
    for pat in patterns {
        let re = Regex::new(pat).ok()?;
        if let Some(cap) = re.captures(html) {
            let url = cap
                .get(1)
                .or_else(|| cap.get(0))
                .map(|m| m.as_str().replace("&amp;", "&"))?;
            if url.starts_with("http") {
                return Some(url);
            }
        }
    }
    None
}

fn strip_tags(raw: &str) -> String {
    let re = Regex::new(r"<[^>]+>").unwrap();
    re.replace_all(raw, " ")
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_ep_tile_links() {
        let html = r#"
            <a href="/episode/one-piece-PmTvj/ep-1" class="ep-tile" title="Episodio 1"></a>
            <a href="/episode/one-piece-PmTvj/ep-2" class="ep-tile" title="Episodio 2"></a>
        "#;
        let eps = parse_episode_links(html);
        assert_eq!(eps.len(), 2);
        assert_eq!(eps[0], ("one-piece-PmTvj".to_string(), 1));
        assert_eq!(eps[1], ("one-piece-PmTvj".to_string(), 2));
    }

    #[test]
    fn parses_ep_tile_titles_when_class_before_title() {
        let html = r#"
            <a href="/episode/liar-game-PukAp/ep-1" class="ep-tile" title="Episodio 1">1</a>
            <a href="/episode/liar-game-PukAp/ep-2" class="ep-tile" title="Episodio 2">2</a>
        "#;
        let db_path = std::env::temp_dir().join("saturn_playback_test.db");
        let db = crate::db::Database::open(&db_path).unwrap();
        let eps = parse_episodes_detailed(html, "liar-game-PukAp", &None, &db);
        let _ = std::fs::remove_file(db_path);
        assert_eq!(eps.len(), 2);
        assert_eq!(eps[0].title, "Episodio 1");
        assert_eq!(eps[1].title, "Episodio 2");
    }

    #[test]
    fn parses_watch_page_links() {
        let html = r#"
            <a href="/anime/azur-lane-slow-ahead-93HzF/ep-1" data-watch-link class="ep-tile"></a>
            <a href="/anime/azur-lane-slow-ahead-93HzF/ep-2" data-watch-link class="ep-tile"></a>
        "#;
        let eps = parse_episode_links(html);
        assert_eq!(eps.len(), 2);
        assert_eq!(eps[0].1, 1);
        assert_eq!(eps[1].1, 2);
    }

    #[test]
    fn episode_video_id_compound_when_slug_differs() {
        assert_eq!(
            episode_video_id("liar-game-PukAp", "other", 13),
            "liar-game-PukAp::13"
        );
        assert_eq!(
            episode_video_id("one-piece-PmTvj", "one-piece-PmTvj", 5),
            "5"
        );
    }

    #[test]
    fn extracts_watch_page_embed() {
        let html = r#"
            x-data="watchPage({&quot;initialVideoUrl&quot;:&quot;https:\/\/play.saturncdn.net\/embed\/43239?token=abc&amp;expires=99&quot;})"
            <iframe id="watch-iframe" src="https://play.saturncdn.net/embed/43239?token=abc&amp;expires=99"></iframe>
        "#;
        let url = extract_embed_url(html, "https://www.animesaturn.net").unwrap();
        assert!(url.contains("play.saturncdn.net/embed/43239"));
        assert!(url.contains("token=abc"));
    }

    #[test]
    fn parses_saturncdn_embed_params() {
        let url = "https://play.saturncdn.net/embed/43239?token=650d1f48efa8ad9200f9c166f132850f&expires=1782897654";
        let embed = parse_saturncdn_embed(url).unwrap();
        assert_eq!(embed.episode_id, 43239);
        assert_eq!(embed.token, "650d1f48efa8ad9200f9c166f132850f");
        assert_eq!(embed.expires, 1782897654);
    }

    #[test]
    fn xor_decode_matches_embed_js() {
        let encoded = "XkFEFEJcGxcWFBcKVUpSR0NRSEoXQ1NXC0FWU1NQQkhZR1dLdSJ4FyQoKHUkS3hIRUIqWA1UdF8VXlhHYlBeFV5cXktwHEFKKQcPXSMNSl1bRTxcDUJeXwhudkJnBQE5ZWByO3gydRYIFlUHFQtSV14NAFJOV1tSDABjXX8DeFFaBUcGAzlcT0MDGUgIFlxBDQFRAVEJDwFRAgE=";
        let key = "650d1f48efa8ad9200f9c166f132850f";
        let url = xor_decode_b64(encoded, key).unwrap();
        assert!(url.contains(".m3u8") || url.contains(".mp4"));
    }

    #[test]
    fn parses_embed_url_with_json_unicode_ampersand() {
        let html = r#"
            x-data="watchPage({&quot;initialVideoUrl&quot;:&quot;https:\/\/play.saturncdn.net\/embed\/7727?token=abc\u0026expires=1782898291&quot;})"
        "#;
        let url = extract_embed_url(html, "https://www.animesaturn.net").unwrap();
        assert!(url.contains("token=abc"));
        assert!(url.contains("expires=1782898291"));
        assert!(!url.contains("\\u0026"));
        let embed = parse_saturncdn_embed(&url).unwrap();
        assert_eq!(embed.episode_id, 7727);
        assert_eq!(embed.token, "abc");
        assert_eq!(embed.expires, 1782898291);
    }
}
