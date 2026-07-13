use crate::addon_proxy::AddonProxyRegistry;
use crate::db::Database;
use crate::friend_presence::{get_device_presence, PresenceHello, PresenceRegistry};
use crate::models::STREAM_PORT;
use crate::network::stream_http_base;
use crate::torrent::TorrentEngine;
use crate::watch_party::{self, WatchPartyRegistry, WsConnectParams};
use axum::{
    body::Body,
    extract::{ConnectInfo, Path, Query, State, WebSocketUpgrade},
    http::{header, HeaderMap, Response, StatusCode},
    response::IntoResponse,
    routing::{get, post},
    Json, Router,
};
use std::path::PathBuf;
use std::sync::Arc;
use std::net::SocketAddr;
use tokio::fs::File;
use tokio::io::{AsyncReadExt, AsyncSeekExt, SeekFrom};
use tokio_util::io::ReaderStream;
use tower_http::cors::{Any, CorsLayer};
use serde::Deserialize;

pub struct StreamState {
    pub db: Arc<Database>,
    pub addon_proxy: Arc<AddonProxyRegistry>,
    pub torrent: Arc<TorrentEngine>,
    pub watch_party: Arc<WatchPartyRegistry>,
    pub presence: PresenceRegistry,
}

#[derive(serde::Deserialize)]
struct PresenceLookupQuery {
    code: String,
}

async fn presence_whoami_handler(
    State(state): State<Arc<StreamState>>,
) -> impl IntoResponse {
    match get_device_presence(&state.presence) {
        Some(p) => (StatusCode::OK, Json(p)).into_response(),
        None => StatusCode::NO_CONTENT.into_response(),
    }
}

async fn presence_lookup_handler(
    State(state): State<Arc<StreamState>>,
    Query(query): Query<PresenceLookupQuery>,
) -> impl IntoResponse {
    let wanted = query.code.trim().to_uppercase();
    match get_device_presence(&state.presence) {
        Some(p) if p.friend_code.to_uppercase() == wanted => {
            (StatusCode::OK, Json(p)).into_response()
        }
        _ => StatusCode::NOT_FOUND.into_response(),
    }
}

async fn presence_hello_handler(
    State(state): State<Arc<StreamState>>,
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    Json(body): Json<PresenceHello>,
) -> impl IntoResponse {
    let host = addr.ip().to_string();
    let _ = state
        .db
        .update_friend_hosts_for_code(&body.friend_code, &host);
    StatusCode::NO_CONTENT
}

pub async fn start_server(
    db: Arc<Database>,
    addon_proxy: Arc<AddonProxyRegistry>,
    torrent: Arc<TorrentEngine>,
    watch_party: Arc<WatchPartyRegistry>,
    presence: PresenceRegistry,
) {
    let state = Arc::new(StreamState {
        db,
        addon_proxy,
        torrent,
        watch_party,
        presence,
    });

    let app = build_stream_router::<Arc<StreamState>>().with_state(state);

    let addr = format!("0.0.0.0:{STREAM_PORT}");
    let listener = tokio::net::TcpListener::bind(&addr)
        .await
        .expect("failed to bind stream server");

    axum::serve(
        listener,
        app.into_make_service_with_connect_info::<std::net::SocketAddr>(),
    )
    .await
    .expect("stream server error");
}

pub fn build_stream_router<S>() -> Router<S>
where
    S: Clone + Send + Sync + 'static,
    Arc<StreamState>: axum::extract::FromRef<S>,
{
    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods(Any)
        .allow_headers(Any);

    let stream_route = get(stream_handler).head(stream_head_handler);

    Router::new()
        .route("/stream/{id}", stream_route)
        .route("/cast/{id}", get(cast_handler))
        .route("/poster/{id}", get(poster_handler))
        .route("/series-poster/{id}", get(series_poster_handler))
        .route("/saturn-poster/{*path}", get(saturn_poster_handler))
        .route("/loonex-poster/{*path}", get(loonex_poster_handler))
        .route("/sc-image/{*path}", get(sc_image_handler))
        .route(
            "/welib-book/{md5}",
            get(welib_book_handler).head(welib_book_head_handler),
        )
        .route(
            "/welib-audio/{md5}",
            get(welib_audio_handler).head(welib_audio_head_handler),
        )
        .route("/welib-cover/{*path}", get(welib_cover_handler))
        .route(
            "/remote/{id}",
            get(remote_handler).head(remote_head_handler),
        )
        .route("/remote-cast/{id}", get(remote_cast_handler))
        .route(
            "/torrent/{id}",
            get(torrent_handler).head(torrent_head_handler),
        )
        .route("/watch-party/ws", get(watch_party_ws_handler))
        .route("/presence/whoami", get(presence_whoami_handler))
        .route("/presence/lookup", get(presence_lookup_handler))
        .route("/presence/hello", post(presence_hello_handler))
        .layer(cors)
}

struct StreamFile {
    path: PathBuf,
    size: u64,
    mime: String,
}

async fn resolve_stream_file(state: &StreamState, id: &str) -> Result<StreamFile, StatusCode> {
    let file_path = state
        .db
        .get_file_path(id)
        .map_err(|_| StatusCode::NOT_FOUND)?;
    let path = PathBuf::from(&file_path);

    if !path.exists() {
        return Err(StatusCode::NOT_FOUND);
    }

    let size = tokio::fs::metadata(&path)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
        .len();

    let mime = dlna_mime(&path);

    Ok(StreamFile { path, size, mime })
}

fn dlna_mime(path: &PathBuf) -> String {
    match path
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e.to_ascii_lowercase())
        .as_deref()
    {
        Some("mp4") | Some("m4v") => "video/mp4".into(),
        Some("mkv") => "video/x-matroska".into(),
        Some("avi") => "video/x-msvideo".into(),
        Some("webm") => "video/webm".into(),
        Some("mov") => "video/quicktime".into(),
        Some("ts") | Some("m2ts") => "video/mp2t".into(),
        _ => mime_guess::from_path(path)
            .first_or_octet_stream()
            .to_string(),
    }
}

async fn stream_head_handler(
    State(state): State<Arc<StreamState>>,
    Path(id): Path<String>,
) -> Result<Response<Body>, StatusCode> {
    let file = resolve_stream_file(&state, &id).await?;
    stream_headers(file.size, &file.mime, None)
        .body(Body::empty())
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)
}

async fn stream_handler(
    State(state): State<Arc<StreamState>>,
    Path(id): Path<String>,
    headers: HeaderMap,
) -> Result<Response<Body>, StatusCode> {
    let file = resolve_stream_file(&state, &id).await?;

    let range = headers
        .get(header::RANGE)
        .and_then(|v| v.to_str().ok())
        .and_then(|value| parse_range(value, file.size));

    let mut disk = File::open(&file.path)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    if let Some((start, end)) = range {
        let length = end.saturating_sub(start).saturating_add(1);
        disk.seek(SeekFrom::Start(start))
            .await
            .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

        let body = Body::from_stream(ReaderStream::new(disk.take(length)));
        stream_headers(file.size, &file.mime, Some((start, end)))
            .status(StatusCode::PARTIAL_CONTENT)
            .body(body)
            .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)
    } else {
        disk.seek(SeekFrom::Start(0))
            .await
            .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

        let body = Body::from_stream(ReaderStream::new(disk));
        stream_headers(file.size, &file.mime, None)
            .body(body)
            .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)
    }
}

#[derive(serde::Deserialize)]
struct CastQuery {
    start: Option<f64>,
}

async fn cast_handler(
    State(state): State<Arc<StreamState>>,
    Path(id): Path<String>,
    Query(query): Query<CastQuery>,
) -> Result<Response<Body>, StatusCode> {
    let file = resolve_stream_file(&state, &id).await?;
    let start_secs = query.start.unwrap_or(0.0);

    let mut child = crate::transcode::spawn_transcode(&file.path, start_secs)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let stdout = child
        .stdout
        .take()
        .ok_or(StatusCode::INTERNAL_SERVER_ERROR)?;

    tokio::spawn(crate::transcode::drain_stderr(child));

    let body = Body::from_stream(ReaderStream::new(stdout));

    Response::builder()
        .status(StatusCode::OK)
        .header(header::CONTENT_TYPE, "video/mp4")
        .header(header::CACHE_CONTROL, "no-cache")
        .header(header::CONNECTION, "keep-alive")
        .header(header::TRANSFER_ENCODING, "chunked")
        .body(body)
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)
}

fn stream_headers(
    file_size: u64,
    mime: &str,
    range: Option<(u64, u64)>,
) -> axum::http::response::Builder {
    let mut builder = Response::builder()
        .header(header::CONTENT_TYPE, mime)
        .header(header::ACCEPT_RANGES, "bytes")
        .header(header::CACHE_CONTROL, "no-cache")
        .header(header::CONNECTION, "keep-alive");

    if let Some((start, end)) = range {
        let length = end.saturating_sub(start).saturating_add(1);
        builder = builder
            .header(
                header::CONTENT_RANGE,
                format!("bytes {start}-{end}/{file_size}"),
            )
            .header(header::CONTENT_LENGTH, length.to_string());
    } else {
        builder = builder.header(header::CONTENT_LENGTH, file_size.to_string());
    }

    builder
}

fn parse_range(header: &str, file_size: u64) -> Option<(u64, u64)> {
    if file_size == 0 {
        return None;
    }

    let range = header.strip_prefix("bytes=")?;
    let (start_raw, end_raw) = range.split_once('-')?;

    if start_raw.is_empty() {
        let suffix: u64 = end_raw.parse().ok()?;
        let start = file_size.saturating_sub(suffix);
        return Some((start, file_size - 1));
    }

    let start: u64 = start_raw.parse().ok()?;
    let end = if end_raw.is_empty() {
        file_size - 1
    } else {
        end_raw.parse().ok()?
    };

    if start >= file_size {
        return None;
    }

    Some((start, end.min(file_size - 1)))
}

async fn poster_handler(
    State(state): State<Arc<StreamState>>,
    Path(id): Path<String>,
) -> Result<Response<Body>, StatusCode> {
    serve_image(
        state
            .db
            .get_poster_path(&id)
            .map_err(|_| StatusCode::NOT_FOUND)?,
    )
    .await
}

async fn series_poster_handler(
    State(state): State<Arc<StreamState>>,
    Path(id): Path<String>,
) -> Result<Response<Body>, StatusCode> {
    serve_image(
        state
            .db
            .get_series_poster_path(&id)
            .map_err(|_| StatusCode::NOT_FOUND)?,
    )
    .await
}

async fn loonex_poster_handler(
    State(state): State<Arc<StreamState>>,
    Path(path): Path<String>,
) -> Result<Response<Body>, StatusCode> {
    let decoded = urlencoding::decode(&path).map_err(|_| StatusCode::BAD_REQUEST)?;
    let rel = decoded.replace('\\', "/");
    if let Some(file_path) = crate::loonex_catalog::poster_file_path(state.db.as_ref(), &rel) {
        return serve_image(file_path.to_string_lossy().to_string()).await;
    }
    let upstream =
        crate::loonex_catalog::poster_upstream_url(state.db.as_ref(), &rel);
    serve_remote_image(&upstream).await
}

async fn serve_remote_image(url: &str) -> Result<Response<Body>, StatusCode> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(30))
        .user_agent(
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 \
             (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Branchefy/0.1",
        )
        .build()
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let referer = referer_for_image_url(url);
    let response = client
        .get(url)
        .header("Referer", referer)
        .header("Accept", "image/avif,image/webp,image/apng,image/*,*/*;q=0.8")
        .send()
        .await
        .map_err(|_| StatusCode::BAD_GATEWAY)?
        .error_for_status()
        .map_err(|_| StatusCode::NOT_FOUND)?;

    let content_type = response
        .headers()
        .get(header::CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .unwrap_or("image/jpeg")
        .to_string();

    let data = response
        .bytes()
        .await
        .map_err(|_| StatusCode::BAD_GATEWAY)?;

    Response::builder()
        .status(StatusCode::OK)
        .header(header::CONTENT_TYPE, content_type)
        .header(header::CACHE_CONTROL, "public, max-age=3600")
        .body(Body::from(data))
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)
}

fn referer_for_image_url(url: &str) -> &'static str {
    let lower = url.to_ascii_lowercase();
    if lower.contains("image.tmdb.org") || lower.contains("themoviedb.org") {
        "https://www.themoviedb.org/"
    } else if lower.contains("saturncdn.net") {
        "https://www.animesaturn.ac/"
    } else if lower.contains("streamingcommunity") {
        "https://streamingcommunityz.tech/"
    } else if lower.contains("x-cdn-x.com") || lower.contains("welib.org") {
        "https://welib.org/"
    } else {
        "https://loonex.eu/cartoni/"
    }
}

async fn welib_book_head_handler(
    Path(md5): Path<String>,
    Query(query): Query<WelibBookQuery>,
) -> Result<Response<Body>, StatusCode> {
    welib_book_response(&md5, query.format.as_deref(), true).await
}

async fn welib_book_handler(
    Path(md5): Path<String>,
    Query(query): Query<WelibBookQuery>,
) -> Result<Response<Body>, StatusCode> {
    welib_book_response(&md5, query.format.as_deref(), false).await
}

#[derive(Debug, Deserialize)]
struct WelibBookQuery {
    format: Option<String>,
}

async fn welib_book_response(
    md5: &str,
    format_hint: Option<&str>,
    head_only: bool,
) -> Result<Response<Body>, StatusCode> {
    crate::welib::validate_md5(md5).map_err(|_| StatusCode::BAD_REQUEST)?;

    let (bytes, mime) = crate::welib::fetch_book_file(md5, format_hint)
        .await
        .map_err(|_| StatusCode::NOT_FOUND)?;

    let mut builder = Response::builder()
        .status(StatusCode::OK)
        .header(header::CONTENT_TYPE, mime)
        .header(header::CONTENT_DISPOSITION, "inline")
        .header(header::CACHE_CONTROL, "private, max-age=300");

    if head_only {
        builder = builder.header(header::CONTENT_LENGTH, bytes.len());
        return builder
            .body(Body::empty())
            .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR);
    }

    builder
        .body(Body::from(bytes))
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)
}

async fn welib_cover_handler(
    Path(path): Path<String>,
) -> Result<Response<Body>, StatusCode> {
    let decoded = urlencoding::decode(&path).map_err(|_| StatusCode::BAD_REQUEST)?;
    let cover_url = decoded.into_owned();
    let lower = cover_url.to_ascii_lowercase();
    if !lower.starts_with("https://img.x-cdn-x.com/") {
        return Err(StatusCode::BAD_REQUEST);
    }

    let bytes = crate::welib::fetch_cover_bytes(&cover_url)
        .await
        .map_err(|_| StatusCode::NOT_FOUND)?;

    let mime = if bytes.starts_with(b"\x89PNG") {
        "image/png"
    } else if bytes.starts_with(b"\xff\xd8") {
        "image/jpeg"
    } else if bytes.len() >= 12 && &bytes[0..4] == b"RIFF" && &bytes[8..12] == b"WEBP" {
        "image/webp"
    } else {
        "image/jpeg"
    };

    Response::builder()
        .status(StatusCode::OK)
        .header(header::CONTENT_TYPE, mime)
        .header(header::CACHE_CONTROL, "public, max-age=86400")
        .body(Body::from(bytes))
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)
}

async fn welib_audio_head_handler(
    Path(md5): Path<String>,
) -> Result<Response<Body>, StatusCode> {
    welib_audio_response(&md5, true).await
}

async fn welib_audio_handler(
    Path(md5): Path<String>,
) -> Result<Response<Body>, StatusCode> {
    welib_audio_response(&md5, false).await
}

async fn welib_audio_response(md5: &str, head_only: bool) -> Result<Response<Body>, StatusCode> {
    crate::welib::validate_md5(md5).map_err(|_| StatusCode::BAD_REQUEST)?;

    let path = format!("/audiobooks/{md5}.mp3");
    let (bytes, _) = crate::welib::fetch_bytes(&path)
        .await
        .map_err(|_| StatusCode::NOT_FOUND)?;

    let mut builder = Response::builder()
        .status(StatusCode::OK)
        .header(header::CONTENT_TYPE, "audio/mpeg")
        .header(header::CONTENT_DISPOSITION, "inline")
        .header(header::CACHE_CONTROL, "private, max-age=300");

    if head_only {
        builder = builder.header(header::CONTENT_LENGTH, bytes.len());
        return builder
            .body(Body::empty())
            .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR);
    }

    builder
        .body(Body::from(bytes))
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)
}

async fn sc_image_handler(
    State(state): State<Arc<StreamState>>,
    Path(path): Path<String>,
) -> Result<Response<Body>, StatusCode> {
    let decoded = urlencoding::decode(&path).map_err(|_| StatusCode::BAD_REQUEST)?;
    let rel = decoded
        .replace('\\', "/")
        .trim_start_matches('/')
        .trim_start_matches("images/")
        .to_string();
    if rel.is_empty() || rel.contains("..") {
        return Err(StatusCode::BAD_REQUEST);
    }
    let cdn = crate::sc_catalog::cdn_url(state.db.as_ref());
    let upstream = format!(
        "{}/images/{}",
        cdn.trim_end_matches('/'),
        rel.trim_start_matches('/')
    );
    serve_remote_image(&upstream).await
}

async fn saturn_poster_handler(
    State(state): State<Arc<StreamState>>,
    Path(path): Path<String>,
) -> Result<Response<Body>, StatusCode> {
    let decoded = urlencoding::decode(&path).map_err(|_| StatusCode::BAD_REQUEST)?;
    let rel = decoded.replace('\\', "/");
    if let Some(file_path) = crate::saturn_catalog::poster_file_path(state.db.as_ref(), &rel) {
        return serve_image(file_path.to_string_lossy().to_string()).await;
    }
    let upstream = format!(
        "https://img.saturncdn.net/{}",
        rel.trim_start_matches('/')
    );
    serve_remote_image(&upstream).await
}

async fn serve_image(file_path: String) -> Result<Response<Body>, StatusCode> {
    let path = PathBuf::from(&file_path);

    if !path.exists() {
        return Err(StatusCode::NOT_FOUND);
    }

    let mime = mime_guess::from_path(&path)
        .first_or_octet_stream()
        .to_string();

    let data = tokio::fs::read(&path)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    Response::builder()
        .status(StatusCode::OK)
        .header(header::CONTENT_TYPE, mime)
        .header(header::CACHE_CONTROL, "public, max-age=3600")
        .body(Body::from(data))
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)
}

async fn remote_head_handler(
    State(state): State<Arc<StreamState>>,
    Path(id): Path<String>,
    headers: HeaderMap,
) -> Result<Response<Body>, StatusCode> {
    remote_proxy_response(&state, &id, &headers, true).await
}

async fn remote_cast_handler(
    State(state): State<Arc<StreamState>>,
    Path(id): Path<String>,
    Query(query): Query<CastQuery>,
) -> Result<Response<Body>, StatusCode> {
    let entry = state.addon_proxy.get(&id).ok_or(StatusCode::NOT_FOUND)?;
    let start_secs = query.start.unwrap_or(0.0);

    let mut child = crate::transcode::spawn_remote_transcode(
        &entry.upstream_url,
        &entry.request_headers,
        start_secs,
    )
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let stdout = child
        .stdout
        .take()
        .ok_or(StatusCode::INTERNAL_SERVER_ERROR)?;

    tokio::spawn(crate::transcode::drain_stderr(child));

    let body = Body::from_stream(ReaderStream::new(stdout));

    Response::builder()
        .status(StatusCode::OK)
        .header(header::CONTENT_TYPE, "video/mp4")
        .header(header::CACHE_CONTROL, "no-cache")
        .header(header::CONNECTION, "keep-alive")
        .header(header::TRANSFER_ENCODING, "chunked")
        .body(body)
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)
}

async fn remote_handler(
    State(state): State<Arc<StreamState>>,
    Path(id): Path<String>,
    headers: HeaderMap,
) -> Result<Response<Body>, StatusCode> {
    remote_proxy_response(&state, &id, &headers, false).await
}

fn rewrite_localhost_stream_urls(body: &str) -> String {
    let public = stream_http_base();
    if public.contains("127.0.0.1") {
        return body.to_string();
    }
    let local = format!("http://127.0.0.1:{STREAM_PORT}");
    body.replace(&local, &public)
}

async fn remote_proxy_response(
    state: &StreamState,
    id: &str,
    headers: &HeaderMap,
    head_only: bool,
) -> Result<Response<Body>, StatusCode> {
    let entry = state.addon_proxy.get(id).ok_or(StatusCode::NOT_FOUND)?;

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(120))
        .build()
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let mut req = client.get(&entry.upstream_url);
    for (key, value) in &entry.request_headers {
        req = req.header(key.as_str(), value.as_str());
    }
    if let Some(range) = headers.get(header::RANGE).and_then(|v| v.to_str().ok()) {
        req = req.header(header::RANGE, range);
    }

    let resp = req.send().await.map_err(|_| StatusCode::BAD_GATEWAY)?;

    if entry.rewrite_manifest {
        if !resp.status().is_success() {
            return Err(StatusCode::BAD_GATEWAY);
        }
        let body = resp.text().await.map_err(|_| StatusCode::BAD_GATEWAY)?;
        let rewritten = state.addon_proxy.rewrite_hls_manifest(
            &body,
            &entry.upstream_url,
            &entry.request_headers,
        );
        let rewritten = rewrite_localhost_stream_urls(&rewritten);
        return Response::builder()
            .status(StatusCode::OK)
            .header(header::CONTENT_TYPE, "application/vnd.apple.mpegurl")
            .header(header::CACHE_CONTROL, "no-cache")
            .body(Body::from(rewritten))
            .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR);
    }

    let status = StatusCode::from_u16(resp.status().as_u16()).unwrap_or(StatusCode::BAD_GATEWAY);
    let mut builder = Response::builder().status(status);

    for (key, value) in resp.headers().iter() {
        let name = key.as_str();
        if name.eq_ignore_ascii_case("connection")
            || name.eq_ignore_ascii_case("transfer-encoding")
            || name.eq_ignore_ascii_case("content-encoding")
        {
            continue;
        }
        builder = builder.header(key, value);
    }
    builder = builder.header(header::CACHE_CONTROL, "no-cache");

    if head_only {
        return builder
            .body(Body::empty())
            .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR);
    }

    let stream = resp.bytes_stream();
    builder
        .body(Body::from_stream(stream))
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)
}

async fn torrent_head_handler(
    State(state): State<Arc<StreamState>>,
    Path(id): Path<String>,
) -> Result<Response<Body>, StatusCode> {
    let entry = state.torrent.get(&id).ok_or(StatusCode::NOT_FOUND)?;
    stream_headers(entry.file_len, &entry.mime, None)
        .body(Body::empty())
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)
}

async fn torrent_handler(
    State(state): State<Arc<StreamState>>,
    Path(id): Path<String>,
    headers: HeaderMap,
) -> Result<Response<Body>, StatusCode> {
    let entry = state.torrent.get(&id).ok_or(StatusCode::NOT_FOUND)?;
    let size = entry.file_len;

    let range = headers
        .get(header::RANGE)
        .and_then(|v| v.to_str().ok())
        .and_then(|value| parse_range(value, size));

    let mut fs = entry
        .handle
        .clone()
        .stream(entry.file_id)
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    if let Some((start, end)) = range {
        let length = end.saturating_sub(start).saturating_add(1);
        fs.seek(SeekFrom::Start(start))
            .await
            .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

        let body = Body::from_stream(ReaderStream::new(fs.take(length)));
        stream_headers(size, &entry.mime, Some((start, end)))
            .status(StatusCode::PARTIAL_CONTENT)
            .body(body)
            .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)
    } else {
        let body = Body::from_stream(ReaderStream::new(fs));
        stream_headers(size, &entry.mime, None)
            .body(body)
            .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)
    }
}

async fn watch_party_ws_handler(
    ws: WebSocketUpgrade,
    Query(params): Query<WsConnectParams>,
    State(state): State<Arc<StreamState>>,
) -> impl IntoResponse {
    let registry = state.watch_party.clone();
    ws.on_upgrade(move |socket| watch_party::handle_socket(socket, registry, params))
}
