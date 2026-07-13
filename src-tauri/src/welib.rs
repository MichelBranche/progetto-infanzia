use crate::html_text::decode_html_entities;
use regex::Regex;
use serde::Serialize;
use std::path::PathBuf;
use std::time::Duration;

const WELIB_BASE: &str = "https://welib.org";

fn user_agent() -> &'static str {
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
}

fn curl_binary() -> &'static str {
    if cfg!(windows) {
        "curl.exe"
    } else {
        "curl"
    }
}

fn cookie_jar_path() -> PathBuf {
    std::env::temp_dir().join(format!("branchefy-welib-{}.cookies", std::process::id()))
}

fn welib_client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .use_native_tls()
        .cookie_store(true)
        .timeout(Duration::from_secs(120))
        .redirect(reqwest::redirect::Policy::limited(10))
        .build()
        .map_err(|e| format!("Client HTTP WeLib: {e}"))
}

fn apply_browser_headers(builder: reqwest::RequestBuilder, referer: Option<&str>) -> reqwest::RequestBuilder {
    let builder = builder
        .header(
            reqwest::header::ACCEPT,
            "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
        )
        .header(reqwest::header::ACCEPT_LANGUAGE, "it-IT,it;q=0.9,en-US;q=0.8,en;q=0.7")
        .header(reqwest::header::CACHE_CONTROL, "no-cache")
        .header("Pragma", "no-cache")
        .header("Sec-Ch-Ua", "\"Google Chrome\";v=\"131\", \"Chromium\";v=\"131\", \"Not_A Brand\";v=\"24\"")
        .header("Sec-Ch-Ua-Mobile", "?0")
        .header("Sec-Ch-Ua-Platform", "\"Windows\"")
        .header("Sec-Fetch-Dest", "document")
        .header("Sec-Fetch-Mode", "navigate")
        .header("Sec-Fetch-Site", if referer.is_some() { "same-origin" } else { "none" })
        .header("Sec-Fetch-User", "?1")
        .header("Upgrade-Insecure-Requests", "1");

    if let Some(referer) = referer {
        builder.header(reqwest::header::REFERER, referer)
    } else {
        builder
    }
}

async fn warm_session(client: &reqwest::Client) -> Result<(), String> {
    let response = apply_browser_headers(client.get(format!("{WELIB_BASE}/")), None)
        .send()
        .await
        .map_err(|e| format!("Sessione WeLib: {e}"))?;

    if response.status().as_u16() == 403 {
        return Err("WeLib HTTP 403".into());
    }

    let _ = response.text().await;
    Ok(())
}

async fn curl_fetch_text(url: &str) -> Result<String, String> {
    let jar = cookie_jar_path();
    let jar_arg = jar.to_string_lossy().replace('\\', "/");
    let _ = tokio::fs::remove_file(&jar).await;

    let warm = tokio::process::Command::new(curl_binary())
        .args([
            "-fsSL",
            "--max-time",
            "45",
            "-c",
            &jar_arg,
            "-b",
            &jar_arg,
            "-A",
            user_agent(),
            "-H",
            "Accept: text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "-H",
            "Accept-Language: it-IT,it;q=0.9,en;q=0.8",
            &format!("{WELIB_BASE}/"),
        ])
        .output()
        .await
        .map_err(|e| format!("curl WeLib non disponibile: {e}"))?;

    if !warm.status.success() {
        let stderr = String::from_utf8_lossy(&warm.stderr);
        return Err(format!(
            "WeLib non raggiungibile (curl). Installa curl o riprova più tardi. {stderr}"
        ));
    }

    let response = tokio::process::Command::new(curl_binary())
        .args([
            "-fsSL",
            "--max-time",
            "90",
            "-c",
            &jar_arg,
            "-b",
            &jar_arg,
            "-A",
            user_agent(),
            "-H",
            "Accept: text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "-H",
            "Accept-Language: it-IT,it;q=0.9,en;q=0.8",
            "-e",
            WELIB_BASE,
            url,
        ])
        .output()
        .await
        .map_err(|e| format!("curl WeLib: {e}"))?;

    let _ = tokio::fs::remove_file(&jar).await;

    if !response.status.success() {
        let stderr = String::from_utf8_lossy(&response.stderr);
        if stderr.contains("403") {
            return Err(
                "WeLib ha bloccato la connessione (Cloudflare 403). Riprova più tardi.".into(),
            );
        }
        return Err(format!("WeLib curl error: {stderr}"));
    }

    let body = String::from_utf8_lossy(&response.stdout).into_owned();
    if body.contains("Just a moment") || body.contains("cf-challenge") {
        return Err("WeLib richiede verifica Cloudflare non disponibile dal server.".into());
    }

    Ok(body)
}

async fn curl_fetch_cdn_bytes(url: &str) -> Result<Vec<u8>, String> {
    let response = tokio::process::Command::new(curl_binary())
        .args([
            "-fsSL",
            "--max-time",
            "180",
            "-A",
            user_agent(),
            "-e",
            WELIB_BASE,
            url,
        ])
        .output()
        .await
        .map_err(|e| format!("curl download CDN: {e}"))?;

    if !response.status.success() {
        let stderr = String::from_utf8_lossy(&response.stderr);
        return Err(format!("Download CDN fallito: {stderr}"));
    }

    Ok(response.stdout)
}

async fn curl_fetch_bytes(url: &str) -> Result<Vec<u8>, String> {
    if url.contains("x-cdn-x.com") {
        return curl_fetch_cdn_bytes(url).await;
    }

    let jar = cookie_jar_path();
    let jar_arg = jar.to_string_lossy().replace('\\', "/");
    let _ = tokio::fs::remove_file(&jar).await;

    let warm = tokio::process::Command::new(curl_binary())
        .args([
            "-fsSL",
            "--max-time",
            "45",
            "-c",
            &jar_arg,
            "-b",
            &jar_arg,
            "-A",
            user_agent(),
            &format!("{WELIB_BASE}/"),
        ])
        .output()
        .await
        .map_err(|e| format!("curl WeLib non disponibile: {e}"))?;

    if !warm.status.success() {
        return Err("WeLib non raggiungibile per il download.".into());
    }

    let response = tokio::process::Command::new(curl_binary())
        .args([
            "-fsSL",
            "--max-time",
            "180",
            "-c",
            &jar_arg,
            "-b",
            &jar_arg,
            "-A",
            user_agent(),
            "-e",
            WELIB_BASE,
            url,
        ])
        .output()
        .await
        .map_err(|e| format!("curl download WeLib: {e}"))?;

    let _ = tokio::fs::remove_file(&jar).await;

    if !response.status.success() {
        return Err("WeLib ha bloccato il download (Cloudflare).".into());
    }

    Ok(response.stdout)
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WelibBook {
    pub md5: String,
    pub title: String,
    pub authors: Vec<String>,
    pub format: Option<String>,
    pub language: Option<String>,
    pub year: Option<String>,
    pub size: Option<String>,
    pub has_audiobook: bool,
    pub cover_url: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WelibPopularResponse {
    pub items: Vec<WelibBook>,
    pub offset: u32,
    pub limit: u32,
}

fn parse_book_card(chunk: &str) -> Option<WelibBook> {
    let md5_re = Regex::new(
        r#"data-md5="([a-f0-9]{32})"|href="/?md5/([a-f0-9]{32})(?:\.html)?""#,
    )
    .ok()?;
    let md5 = md5_re
        .captures(chunk)
        .and_then(|c| c.get(1).or_else(|| c.get(2)))
        .map(|m| m.as_str().to_string())?;

    let title_re =
        Regex::new(r#"(?is)<h2[^>]*class="[^"]*owa[^"]*"[^>]*>([^<]+)</h2>"#).ok()?;
    let title = title_re
        .captures(chunk)
        .and_then(|c| c.get(1))
        .map(|m| decode_html_entities(m.as_str().trim()))
        .filter(|t| !t.is_empty())?;

    let author_re = Regex::new(
        r#"(?is)<i class="icon-\[mingcute--user-edit-line\][^"]*"[^>]*></i>\s*<a[^>]*>([^<]+)</a>"#,
    )
    .ok()?;
    let authors: Vec<String> = author_re
        .captures_iter(chunk)
        .filter_map(|c| c.get(1))
        .map(|m| decode_html_entities(m.as_str().trim()))
        .filter(|a| !a.is_empty())
        .take(3)
        .collect();

    let meta_re = Regex::new(
        r#"<span class="text-gray-800[^"]*font-semibold text-sm uppercase">([^<]+)</span>"#,
    )
    .ok()?;
    let meta: Vec<String> = meta_re
        .captures_iter(chunk)
        .filter_map(|c| c.get(1))
        .map(|m| m.as_str().trim().to_string())
        .collect();

    let format = meta.first().cloned();
    let language = meta
        .get(1)
        .map(|s| s.trim_start_matches('·').trim().to_string());
    let year = meta
        .get(2)
        .map(|s| s.trim_start_matches('·').trim().to_string());
    let size = meta
        .get(3)
        .map(|s| s.trim_start_matches('·').trim().to_string());

    let has_audiobook =
        chunk.contains("listen-btn") && chunk.contains(&format!("data-md5=\"{md5}\""));

    let cover_url = Regex::new(r#"(?i)<img src="(https://img\.x-cdn-x\.com/covers/[^"]+)""#)
        .ok()
        .and_then(|re| {
            re.captures(chunk)
                .and_then(|c| c.get(1))
                .map(|m| decode_html_entities(m.as_str()))
        });

    Some(WelibBook {
        md5,
        title,
        authors,
        format,
        language,
        year,
        size,
        has_audiobook,
        cover_url,
    })
}

fn parse_books_html(html: &str) -> Vec<WelibBook> {
    if html.contains("Just a moment") || html.contains("cf-challenge") {
        return Vec::new();
    }

    html.split("book-card")
        .skip(1)
        .filter_map(|chunk| parse_book_card(&format!("book-card{chunk}")))
        .collect()
}

async fn fetch_text_reqwest(url: &str) -> Result<String, String> {
    let client = welib_client()?;
    warm_session(&client).await?;

    let response = apply_browser_headers(client.get(url), Some(WELIB_BASE))
        .send()
        .await
        .map_err(|e| format!("Connessione WeLib fallita: {e}"))?;

    let status = response.status();
    let body = response
        .text()
        .await
        .map_err(|e| format!("Lettura risposta WeLib: {e}"))?;

    if status.as_u16() == 403 {
        return Err("WeLib HTTP 403".into());
    }
    if !status.is_success() {
        return Err(format!("WeLib HTTP {}", status.as_u16()));
    }
    if body.contains("Just a moment") || body.contains("cf-challenge") {
        return Err("WeLib challenge".into());
    }

    Ok(body)
}

async fn fetch_text(path_and_query: &str) -> Result<String, String> {
    let url = if path_and_query.starts_with("http") {
        path_and_query.to_string()
    } else {
        format!("{WELIB_BASE}{path_and_query}")
    };

    if let Ok(body) = fetch_text_reqwest(&url).await {
        if !body.contains("Just a moment")
            && !body.contains("cf-challenge")
            && !parse_books_html(&body).is_empty()
        {
            return Ok(body);
        }
    }

    curl_fetch_text(&url).await
}

pub async fn fetch_popular(
    interval: &str,
    offset: u32,
    limit: u32,
) -> Result<WelibPopularResponse, String> {
    let path = format!("/popular?interval={interval}&offset={offset}&limit={limit}");
    let html = fetch_text(&path).await?;
    let items = parse_books_html(&html);
    if items.is_empty() {
        return Err(
            "WeLib non ha restituito libri. Il catalogo potrebbe essere temporaneamente bloccato."
                .into(),
        );
    }
    Ok(WelibPopularResponse {
        items,
        offset,
        limit,
    })
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WelibSearchResponse {
    pub items: Vec<WelibBook>,
    pub limited: bool,
}

async fn curl_fetch_search_text(url: &str) -> Result<String, String> {
    let jar = cookie_jar_path();
    let jar_arg = jar.to_string_lossy().replace('\\', "/");
    let _ = tokio::fs::remove_file(&jar).await;

    let warm_home = tokio::process::Command::new(curl_binary())
        .args([
            "-fsSL",
            "--max-time",
            "45",
            "-c",
            &jar_arg,
            "-b",
            &jar_arg,
            "-A",
            user_agent(),
            "-H",
            "Accept: text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "-H",
            "Accept-Language: it-IT,it;q=0.9,en;q=0.8",
            &format!("{WELIB_BASE}/"),
        ])
        .output()
        .await
        .map_err(|e| format!("curl WeLib non disponibile: {e}"))?;

    if !warm_home.status.success() {
        return Err("WeLib non raggiungibile.".into());
    }

    let _ = tokio::process::Command::new(curl_binary())
        .args([
            "-fsSL",
            "--max-time",
            "45",
            "-c",
            &jar_arg,
            "-b",
            &jar_arg,
            "-A",
            user_agent(),
            "-e",
            WELIB_BASE,
            &format!("{WELIB_BASE}/popular?interval=24h&offset=0&limit=1"),
        ])
        .output()
        .await;

    let response = tokio::process::Command::new(curl_binary())
        .args([
            "--compressed",
            "-fsSL",
            "--max-time",
            "90",
            "-c",
            &jar_arg,
            "-b",
            &jar_arg,
            "-A",
            user_agent(),
            "-H",
            "Accept: text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
            "-H",
            "Accept-Language: it-IT,it;q=0.9,en-US;q=0.8,en;q=0.7",
            "-H",
            "Sec-Ch-Ua: \"Google Chrome\";v=\"131\", \"Chromium\";v=\"131\", \"Not_A Brand\";v=\"24\"",
            "-H",
            "Sec-Ch-Ua-Mobile: ?0",
            "-H",
            "Sec-Ch-Ua-Platform: \"Windows\"",
            "-H",
            "Sec-Fetch-Dest: document",
            "-H",
            "Sec-Fetch-Mode: navigate",
            "-H",
            "Sec-Fetch-Site: same-origin",
            "-H",
            "Sec-Fetch-User: ?1",
            "-H",
            "Upgrade-Insecure-Requests: 1",
            "-e",
            WELIB_BASE,
            url,
        ])
        .output()
        .await
        .map_err(|e| format!("curl ricerca WeLib: {e}"))?;

    let _ = tokio::fs::remove_file(&jar).await;

    if !response.status.success() {
        return Err("WeLib search blocked".into());
    }

    let body = String::from_utf8_lossy(&response.stdout).into_owned();
    if body.contains("Just a moment") || body.contains("cf-challenge") {
        return Err("WeLib search challenge".into());
    }

    Ok(body)
}

fn query_terms(query: &str) -> Vec<String> {
    query
        .split_whitespace()
        .map(|s| s.trim().to_ascii_lowercase())
        .filter(|s| s.len() >= 2)
        .collect()
}

fn book_matches_query(book: &WelibBook, terms: &[String]) -> bool {
    if terms.is_empty() {
        return false;
    }
    let haystack = format!(
        "{} {}",
        book.title.to_ascii_lowercase(),
        book.authors
            .iter()
            .map(|author| author.to_ascii_lowercase())
            .collect::<Vec<_>>()
            .join(" ")
    );
    terms.iter().all(|term| haystack.contains(term))
}

async fn lookup_book_by_md5(md5: &str) -> Result<Vec<WelibBook>, String> {
    let html = fetch_book_detail_html(md5).await?;
    let book = parse_books_html(&html)
        .into_iter()
        .find(|book| book.md5 == md5)
        .ok_or_else(|| "Libro non trovato.".to_string())?;
    Ok(vec![book])
}

async fn search_in_popular_catalog(query: &str, page: u32) -> Result<Vec<WelibBook>, String> {
    let terms = query_terms(query);
    if terms.is_empty() {
        return Ok(Vec::new());
    }

    let per_page = 24usize;
    let page = page.max(1) as usize;
    let mut pool: Vec<WelibBook> = Vec::new();

    for interval in ["24h", "7d", "30d", "all"] {
        for offset in (0..400).step_by(100) {
            let path = format!("/popular?interval={interval}&offset={offset}&limit=100");
            let html = fetch_text(&path).await?;
            let batch = parse_books_html(&html);
            if batch.is_empty() {
                break;
            }
            for book in batch {
                if pool.iter().any(|existing| existing.md5 == book.md5) {
                    continue;
                }
                pool.push(book);
            }
        }
    }

    let filtered: Vec<WelibBook> = pool
        .into_iter()
        .filter(|book| book_matches_query(book, &terms))
        .collect();

    let start = (page - 1).saturating_mul(per_page);
    Ok(filtered.into_iter().skip(start).take(per_page).collect())
}

pub async fn search_books(query: &str, page: u32) -> Result<WelibSearchResponse, String> {
    let trimmed = query.trim();
    if trimmed.is_empty() {
        return Ok(WelibSearchResponse {
            items: Vec::new(),
            limited: false,
        });
    }

    if validate_md5(trimmed).is_ok() {
        let items = lookup_book_by_md5(trimmed).await?;
        return Ok(WelibSearchResponse {
            items,
            limited: false,
        });
    }

    let q = urlencoding::encode(trimmed);
    let path = if page <= 1 {
        format!("/search?q={q}")
    } else {
        format!("/search?q={q}&page={page}")
    };
    let search_url = format!("{WELIB_BASE}{path}");

    if let Ok(html) = curl_fetch_search_text(&search_url).await {
        let items = parse_books_html(&html);
        if !items.is_empty() {
            return Ok(WelibSearchResponse {
                items,
                limited: false,
            });
        }
    }

    let items = search_in_popular_catalog(trimmed, page).await?;
    Ok(WelibSearchResponse {
        items,
        limited: true,
    })
}

async fn fetch_bytes_reqwest(url: &str) -> Result<(Vec<u8>, Option<String>), String> {
    let client = welib_client()?;
    warm_session(&client).await?;

    let response = apply_browser_headers(client.get(url), Some(WELIB_BASE))
        .send()
        .await
        .map_err(|e| format!("Download WeLib fallito: {e}"))?;

    let status = response.status();
    if status.as_u16() == 403 {
        return Err("WeLib HTTP 403".into());
    }
    if !status.is_success() {
        return Err(format!("WeLib download HTTP {}", status.as_u16()));
    }

    let content_type = response
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .map(|s| s.to_string());

    let bytes = response
        .bytes()
        .await
        .map_err(|e| format!("Lettura file WeLib: {e}"))?
        .to_vec();

    Ok((bytes, content_type))
}

pub async fn fetch_bytes(path: &str) -> Result<(Vec<u8>, Option<String>), String> {
    let url = if path.starts_with("http") {
        path.to_string()
    } else {
        format!("{WELIB_BASE}{path}")
    };

    match fetch_bytes_reqwest(&url).await {
        Ok(result) => Ok(result),
        Err(_) => {
            let bytes = curl_fetch_bytes(&url).await?;
            Ok((bytes, None))
        }
    }
}

pub fn book_stream_paths(md5: &str) -> Vec<String> {
    vec![
        format!("/auto_download/{md5}/0/0"),
        format!("/slow_download/{md5}/0/0"),
    ]
}

pub async fn fetch_book_detail_html(md5: &str) -> Result<String, String> {
    curl_fetch_text(&format!("{WELIB_BASE}/slow_download/{md5}/0/0")).await
}

fn parse_cdn_file_urls(html: &str) -> Vec<(String, String)> {
    let re =
        Regex::new(r#"(?i)href="(https://x-cdn-x\.com/[^"]+\.(epub|pdf))""#).expect("cdn url regex");
    let mut urls = Vec::new();
    let mut seen = std::collections::HashSet::new();
    for cap in re.captures_iter(html) {
        let url = cap.get(1).map(|m| decode_html_entities(m.as_str()));
        let ext = cap
            .get(2)
            .map(|m| m.as_str().to_ascii_lowercase())
            .unwrap_or_default();
        if let Some(url) = url {
            if seen.insert(url.clone()) {
                urls.push((ext, url));
            }
        }
    }
    urls
}

fn pick_cdn_file_url(
    urls: &[(String, String)],
    md5: &str,
    format_hint: Option<&str>,
) -> Option<String> {
    if urls.is_empty() {
        return None;
    }
    let md5_lower = md5.to_ascii_lowercase();
    let scoped: Vec<(String, String)> = urls
        .iter()
        .filter(|(_, url)| url.to_ascii_lowercase().contains(&md5_lower))
        .cloned()
        .collect();
    let pool = if scoped.is_empty() { urls } else { &scoped };

    let hint = format_hint.unwrap_or("").to_ascii_lowercase();
    let prefer_epub = hint.contains("epub");
    let prefer_pdf = hint.contains("pdf");

    if prefer_epub {
        if let Some((_, url)) = pool.iter().find(|(ext, _)| ext == "epub") {
            return Some(url.clone());
        }
    }
    if prefer_pdf {
        if let Some((_, url)) = pool.iter().find(|(ext, _)| ext == "pdf") {
            return Some(url.clone());
        }
    }
    pool.iter()
        .find(|(ext, _)| ext == "epub")
        .or_else(|| pool.iter().find(|(ext, _)| ext == "pdf"))
        .map(|(_, url)| url.clone())
}

fn encode_cdn_download_url(raw: &str) -> String {
    if !raw.contains([' ', '(', ')']) {
        return raw.to_string();
    }
    raw.chars()
        .map(|c| match c {
            ' ' => "%20".to_string(),
            '(' => "%28".to_string(),
            ')' => "%29".to_string(),
            c => c.to_string(),
        })
        .collect()
}

fn mime_for_book_url(url: &str) -> &'static str {
    if url.to_ascii_lowercase().ends_with(".pdf") {
        "application/pdf"
    } else {
        "application/epub+zip"
    }
}

fn looks_like_html(bytes: &[u8]) -> bool {
    let prefix = String::from_utf8_lossy(&bytes[..bytes.len().min(32)]);
    let trimmed = prefix.trim_start();
    trimmed.starts_with("<!DOCTYPE")
        || trimmed.starts_with("<html")
        || trimmed.starts_with("<!doctype")
}

pub async fn fetch_book_file(
    md5: &str,
    format_hint: Option<&str>,
) -> Result<(Vec<u8>, String), String> {
    let html = fetch_book_detail_html(md5).await?;
    let urls = parse_cdn_file_urls(&html);
    let file_url = pick_cdn_file_url(&urls, md5, format_hint)
        .ok_or_else(|| "File del libro non disponibile su WeLib.".to_string())?;
    let bytes = curl_fetch_bytes(&encode_cdn_download_url(&file_url)).await?;
    if looks_like_html(&bytes) {
        return Err("WeLib ha restituito una pagina web al posto del libro.".into());
    }
    Ok((bytes, mime_for_book_url(&file_url).to_string()))
}

pub async fn fetch_cover_bytes(cover_url: &str) -> Result<Vec<u8>, String> {
    let jar = cookie_jar_path();
    let jar_arg = jar.to_string_lossy().replace('\\', "/");
    let _ = tokio::fs::remove_file(&jar).await;

    let warm = tokio::process::Command::new(curl_binary())
        .args([
            "-fsSL",
            "--max-time",
            "45",
            "-c",
            &jar_arg,
            "-b",
            &jar_arg,
            "-A",
            user_agent(),
            WELIB_BASE,
        ])
        .output()
        .await
        .map_err(|e| format!("curl cover warm: {e}"))?;
    if !warm.status.success() {
        return Err("Copertina non raggiungibile.".into());
    }

    let response = tokio::process::Command::new(curl_binary())
        .args([
            "-fsSL",
            "--max-time",
            "45",
            "-b",
            &jar_arg,
            "-A",
            user_agent(),
            "-e",
            WELIB_BASE,
            cover_url,
        ])
        .output()
        .await
        .map_err(|e| format!("curl cover: {e}"))?;

    let _ = tokio::fs::remove_file(&jar).await;
    if !response.status.success() {
        return Err("Copertina non disponibile.".into());
    }
    Ok(response.stdout)
}

pub fn validate_md5(md5: &str) -> Result<(), String> {
    let re = Regex::new(r"^[a-f0-9]{32}$").expect("md5 regex");
    if re.is_match(md5) {
        Ok(())
    } else {
        Err("MD5 non valido.".to_string())
    }
}

#[tauri::command]
pub async fn welib_popular_cmd(
    interval: Option<String>,
    offset: Option<u32>,
    limit: Option<u32>,
) -> Result<WelibPopularResponse, String> {
    fetch_popular(
        interval.as_deref().unwrap_or("24h"),
        offset.unwrap_or(0),
        limit.unwrap_or(20),
    )
    .await
}

#[tauri::command]
pub async fn welib_search_cmd(
    query: String,
    page: Option<u32>,
) -> Result<WelibSearchResponse, String> {
    search_books(query.trim(), page.unwrap_or(1)).await
}

#[cfg(test)]
mod tests {
    use super::{fetch_book_file, fetch_popular, parse_books_html, search_books};

    const SAMPLE: &str = r#"<div class="book-card border-b">
<a href="/md5/2dd3b49bd557bff3a63ce229a6db2c04">
<h2 class="owa">Secrets of divine love</h2>
<i class="icon-[mingcute--user-edit-line]"></i><a>A. Helwa</a>
<span class="text-gray-800 dark:text-slate-400 font-semibold text-sm uppercase">pdf</span>
</div>"#;

    #[test]
    fn parses_inline_sample() {
        let items = parse_books_html(SAMPLE);
        assert_eq!(items.len(), 1);
        assert_eq!(items[0].md5, "2dd3b49bd557bff3a63ce229a6db2c04");
    }

    #[tokio::test]
    async fn popular_reaches_welib() {
        let result = fetch_popular("24h", 0, 2).await;
        let page = result.expect("welib fetch failed");
        assert!(!page.items.is_empty(), "expected books");
    }

    #[tokio::test]
    async fn search_falls_back_to_popular_catalog() {
        let result = search_books("boundaries", 1)
            .await
            .expect("search should not hard-fail");
        assert!(result.limited);
        assert!(!result.items.is_empty());
    }
}
