use crate::models::STREAM_PORT;
use local_ip_address::local_ip;

pub fn localhost_stream_url(media_id: &str) -> String {
    format!("http://127.0.0.1:{STREAM_PORT}/stream/{media_id}")
}

pub fn lan_stream_url(media_id: &str) -> Option<String> {
    let ip = local_ip().ok()?;
    if ip.is_loopback() {
        return None;
    }
    Some(format!("http://{ip}:{STREAM_PORT}/stream/{media_id}"))
}

pub fn lan_cast_url(media_id: &str, start_secs: f64) -> Option<String> {
    let ip = local_ip().ok()?;
    if ip.is_loopback() {
        return None;
    }
    if start_secs > 5.0 {
        Some(format!(
            "http://{ip}:{STREAM_PORT}/cast/{media_id}?start={start_secs:.1}"
        ))
    } else {
        Some(format!("http://{ip}:{STREAM_PORT}/cast/{media_id}"))
    }
}

pub fn lan_remote_url(proxy_id: &str) -> Option<String> {
    let ip = local_ip().ok()?;
    if ip.is_loopback() {
        return None;
    }
    Some(format!("http://{ip}:{STREAM_PORT}/remote/{proxy_id}"))
}

pub fn lan_remote_cast_url(proxy_id: &str, start_secs: f64) -> Option<String> {
    let ip = local_ip().ok()?;
    if ip.is_loopback() {
        return None;
    }
    if start_secs > 5.0 {
        Some(format!(
            "http://{ip}:{STREAM_PORT}/remote-cast/{proxy_id}?start={start_secs:.1}"
        ))
    } else {
        Some(format!("http://{ip}:{STREAM_PORT}/remote-cast/{proxy_id}"))
    }
}

pub fn lan_host_label() -> Option<String> {
    local_ip().ok().map(|ip| ip.to_string())
}

pub fn localhost_watch_party_ws_url(code: &str, profile_id: &str, name: &str) -> String {
    let name = urlencoding::encode(name);
    format!(
        "ws://127.0.0.1:{STREAM_PORT}/watch-party/ws?code={}&profileId={}&name={}",
        urlencoding::encode(code),
        urlencoding::encode(profile_id),
        name,
    )
}

pub fn lan_watch_party_ws_url(host: &str, code: &str, profile_id: &str, name: &str) -> String {
    let name = urlencoding::encode(name);
    format!(
        "ws://{host}:{STREAM_PORT}/watch-party/ws?code={}&profileId={}&name={}",
        urlencoding::encode(code),
        urlencoding::encode(profile_id),
        name,
    )
}
