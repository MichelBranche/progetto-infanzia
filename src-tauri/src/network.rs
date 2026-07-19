use crate::models::STREAM_PORT;
use if_addrs::{get_if_addrs, IfAddr};
use local_ip_address::local_ip;
use std::net::Ipv4Addr;

/// Normalizes `BRANCHEFY_PUBLIC_URL` (adds `https://` when the scheme is omitted).
pub fn normalize_http_origin(url: &str) -> String {
    let trimmed = url.trim().trim_end_matches('/');
    if trimmed.is_empty() {
        return format!("http://127.0.0.1:{STREAM_PORT}");
    }
    if trimmed.starts_with("http://") || trimmed.starts_with("https://") {
        trimmed.to_string()
    } else {
        format!("https://{trimmed}")
    }
}

/// HTTP origin for stream/proxy routes (`/remote`, `/stream`, …).
pub fn stream_http_base() -> String {
    match std::env::var("BRANCHEFY_PUBLIC_URL") {
        Ok(url) if !url.trim().is_empty() => normalize_http_origin(&url),
        _ => format!("http://127.0.0.1:{STREAM_PORT}"),
    }
}

pub fn stream_remote_url(proxy_id: &str) -> String {
    format!("{}/remote/{proxy_id}", stream_http_base())
}

pub fn localhost_stream_url(media_id: &str) -> String {
    format!("http://127.0.0.1:{STREAM_PORT}/stream/{media_id}")
}

fn usable_lan_v4(ip: &Ipv4Addr) -> bool {
    !ip.is_loopback() && (ip.is_private() || ip.is_link_local())
}

/// Priorità VPN/virtuale (deprioritizzata): la TV di casa non raggiunge questi IP.
const IFACE_PRIORITY_VPN: u8 = 9;

fn is_vpn_iface_name(lower: &str) -> bool {
    lower.contains("vpn")
        || lower.contains("virtual")
        || lower.contains("vether")
        || lower.contains("hyper-v")
        || lower.contains("wsl")
        // VPN comuni (es. NordVPN usa NordLynx/WireGuard): il loro IP non è
        // raggiungibile dalla TV sulla rete di casa.
        || lower.contains("nord")
        || lower.contains("wireguard")
        || lower.contains("wg-")
        || lower.contains("openvpn")
        || lower.contains("tap-windows")
        || lower.contains("tunnel")
        || lower.contains("proton")
        || lower.contains("mullvad")
        || lower.contains("tailscale")
        || lower.contains("zerotier")
}

fn interface_priority(name: &str) -> u8 {
    let lower = name.to_ascii_lowercase();
    if is_vpn_iface_name(&lower) {
        return IFACE_PRIORITY_VPN;
    }
    if lower.contains("ethernet") || lower.starts_with("eth") {
        return 0;
    }
    if lower.contains("wi-fi")
        || lower.contains("wifi")
        || lower.contains("wlan")
        || lower.contains("wireless")
    {
        return 1;
    }
    3
}

/// Nome dell'interfaccia che possiede questo IPv4, se enumerabile.
fn iface_name_for_ip(ip: &Ipv4Addr) -> Option<String> {
    let ifaces = get_if_addrs().ok()?;
    ifaces.into_iter().find_map(|iface| match iface.addr {
        IfAddr::V4(v4) if v4.ip == *ip => Some(iface.name),
        _ => None,
    })
}

/// True se l'IP appartiene a un'interfaccia VPN/virtuale (irraggiungibile dalla TV).
fn is_vpn_or_virtual_ip(ip: &Ipv4Addr) -> bool {
    iface_name_for_ip(ip)
        .map(|name| interface_priority(&name) >= IFACE_PRIORITY_VPN)
        .unwrap_or(false)
}

fn ip_priority(ip: &Ipv4Addr) -> u8 {
    let [a, b, _, _] = ip.octets();
    if a == 192 && b == 168 {
        0
    } else if a == 10 {
        1
    } else if a == 172 && (16..=31).contains(&b) {
        2
    } else {
        4
    }
}

pub fn best_lan_ipv4() -> Option<Ipv4Addr> {
    // `local_ip()` = IP dell'interfaccia con la rotta di default. Di norma è
    // quella giusta, ma con una VPN full-tunnel (es. NordVPN) restituisce l'IP
    // della VPN: la TV sulla rete di casa non lo raggiunge. Lo accettiamo solo
    // se NON appartiene a un'interfaccia VPN/virtuale.
    if let Ok(std::net::IpAddr::V4(v4)) = local_ip() {
        if usable_lan_v4(&v4) && !is_vpn_or_virtual_ip(&v4) {
            return Some(v4);
        }
    }

    let mut candidates = Vec::<(u8, u8, Ipv4Addr)>::new();
    if let Ok(ifaces) = get_if_addrs() {
        for iface in ifaces {
            if iface.is_loopback() {
                continue;
            }
            if let IfAddr::V4(v4) = iface.addr {
                let ip = v4.ip;
                if usable_lan_v4(&ip) {
                    candidates.push((interface_priority(&iface.name), ip_priority(&ip), ip));
                }
            }
        }
    }

    candidates.sort_by(|a, b| a.0.cmp(&b.0).then(a.1.cmp(&b.1)));
    if let Some((_, _, ip)) = candidates.first() {
        return Some(*ip);
    }

    // Ultima spiaggia: se non riusciamo a enumerare le interfacce, meglio l'IP
    // di default (anche se VPN) che niente.
    match local_ip() {
        Ok(std::net::IpAddr::V4(v4)) if usable_lan_v4(&v4) => Some(v4),
        _ => None,
    }
}

pub fn lan_stream_url(media_id: &str) -> Option<String> {
    let ip = best_lan_ipv4()?;
    Some(format!("http://{ip}:{STREAM_PORT}/stream/{media_id}"))
}

pub fn lan_cast_url(media_id: &str, start_secs: f64) -> Option<String> {
    let ip = best_lan_ipv4()?;
    if start_secs > 5.0 {
        Some(format!(
            "http://{ip}:{STREAM_PORT}/cast/{media_id}?start={start_secs:.1}"
        ))
    } else {
        Some(format!("http://{ip}:{STREAM_PORT}/cast/{media_id}"))
    }
}

pub fn lan_remote_url(proxy_id: &str) -> Option<String> {
    let ip = best_lan_ipv4()?;
    Some(format!("http://{ip}:{STREAM_PORT}/remote/{proxy_id}"))
}

pub fn lan_remote_cast_url(proxy_id: &str, start_secs: f64) -> Option<String> {
    let ip = best_lan_ipv4()?;
    if start_secs > 5.0 {
        Some(format!(
            "http://{ip}:{STREAM_PORT}/remote-cast/{proxy_id}?start={start_secs:.1}"
        ))
    } else {
        Some(format!("http://{ip}:{STREAM_PORT}/remote-cast/{proxy_id}"))
    }
}

pub fn lan_host_label() -> Option<String> {
    best_lan_ipv4().map(|ip| ip.to_string())
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
