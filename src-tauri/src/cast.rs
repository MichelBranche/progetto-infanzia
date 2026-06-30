use crate::models::{CastDevice, CastPosition};
use regex::Regex;
use reqwest::Client;
use socket2::{Domain, Protocol, SockAddr, Socket, Type};
use std::collections::hash_map::DefaultHasher;
use std::collections::HashSet;
use std::hash::{Hash, Hasher};
use std::net::{Ipv4Addr, SocketAddr};
use std::path::Path;
use std::time::Duration;
use tokio::net::UdpSocket;
use tokio::time::{sleep, timeout, Instant};
use url::Url;

const MULTICAST_SSDP: &str = "239.255.255.250:1900";
const GLOBAL_BROADCAST: &str = "255.255.255.255:1900";
const AV_TRANSPORT: &str = "urn:schemas-upnp-org:service:AVTransport:1";

const SEARCH_TYPES: &[&str] = &[
    "urn:schemas-upnp-org:device:MediaRenderer:1",
    "urn:schemas-upnp-org:device:MediaRenderer:2",
    "urn:schemas-upnp-org:device:MediaRenderer:3",
    "upnp:rootdevice",
    "ssdp:all",
];

const MANUAL_DESCRIPTION_PATHS: &[&str] = &[
    "/description.xml",
    "/dmr/description.xml",
    "/MediaRenderer/desc.xml",
    "/upnp/desc.xml",
    "/smp_2_0.xml",
    "/dmr.xml",
];

const MANUAL_PORTS: &[u16] = &[80, 7676, 8080, 9197, 5000, 1900];

pub async fn discover_devices(wait_ms: u64) -> Result<Vec<CastDevice>, String> {
    let socket = create_discovery_socket()?;
    let targets = discovery_targets();

    let mut seen_locations = HashSet::<String>::new();
    let mut devices = Vec::<CastDevice>::new();
    let deadline = Instant::now() + Duration::from_millis(wait_ms);
    let mut buffer = [0u8; 8192];
    let mut last_wave = Instant::now() - Duration::from_secs(2);

    while Instant::now() < deadline {
        if last_wave.elapsed() >= Duration::from_millis(1200) {
            send_msearch_waves(&socket, &targets).await?;
            last_wave = Instant::now();
        }

        let remaining = deadline.saturating_duration_since(Instant::now());
        let recv_wait = remaining.min(Duration::from_millis(400));

        let Ok(Ok((len, _))) = timeout(recv_wait, socket.recv_from(&mut buffer)).await else {
            continue;
        };

        let text = String::from_utf8_lossy(&buffer[..len]);
        if !looks_like_ssdp(&text) {
            continue;
        }

        let Some(location) = header_value(&text, "LOCATION") else {
            continue;
        };

        if !seen_locations.insert(location.clone()) {
            continue;
        }

        if let Some(device) = describe_device(&location).await {
            devices.push(device);
        }
    }

    devices.sort_by(|a, b| a.name.cmp(&b.name));
    devices.dedup_by(|a, b| a.control_url == b.control_url);
    Ok(devices)
}

pub async fn probe_device_at(host: &str) -> Option<CastDevice> {
    let host = host.trim().trim_start_matches("http://").trim_start_matches("https://");
    let host = host.split('/').next()?.split(':').next()?.trim();
    if host.is_empty() {
        return None;
    }

    for port in MANUAL_PORTS {
        for path in MANUAL_DESCRIPTION_PATHS {
            let url = format!("http://{host}:{port}{path}");
            if let Some(device) = describe_device(&url).await {
                return Some(device);
            }
        }
    }

    None
}

fn create_discovery_socket() -> Result<UdpSocket, String> {
    let socket = Socket::new(Domain::IPV4, Type::DGRAM, Some(Protocol::UDP))
        .map_err(|e| format!("Socket SSDP non disponibile: {e}"))?;
    socket
        .set_reuse_address(true)
        .map_err(|e| format!("Socket SSDP: {e}"))?;
    socket
        .set_broadcast(true)
        .map_err(|e| format!("Broadcast non disponibile: {e}"))?;
    socket
        .bind(&SockAddr::from(SocketAddr::from(([0, 0, 0, 0], 0))))
        .map_err(|e| format!("Bind SSDP fallito: {e}"))?;

    if let Ok(ip) = local_ip_address::local_ip() {
        if let std::net::IpAddr::V4(ipv4) = ip {
            let multicast: Ipv4Addr = "239.255.255.250".parse().unwrap();
            let _ = socket.join_multicast_v4(&multicast, &ipv4);
        }
    }

    socket
        .set_nonblocking(true)
        .map_err(|e| format!("Socket non blocking: {e}"))?;

    let std_socket: std::net::UdpSocket = socket.into();
    std_socket
        .set_nonblocking(true)
        .map_err(|e| format!("Socket UDP: {e}"))?;

    UdpSocket::from_std(std_socket).map_err(|e| format!("Socket async: {e}"))
}

fn discovery_targets() -> Vec<SocketAddr> {
    let mut targets = vec![
        MULTICAST_SSDP.parse().expect("multicast"),
        GLOBAL_BROADCAST.parse().expect("broadcast"),
    ];

    if let Ok(interfaces) = if_addrs::get_if_addrs() {
        for iface in interfaces {
            if iface.is_loopback() {
                continue;
            }
            let if_addrs::IfAddr::V4(v4) = iface.addr else {
                continue;
            };
            if let Some(broadcast) = v4.broadcast {
                if let Ok(addr) = format!("{broadcast}:1900").parse() {
                    targets.push(addr);
                }
            }
        }
    }

    targets.sort_by_key(|a: &SocketAddr| a.to_string());
    targets.dedup();
    targets
}

async fn send_msearch_waves(socket: &UdpSocket, targets: &[SocketAddr]) -> Result<(), String> {
    for st in SEARCH_TYPES {
        let payload = build_msearch(st);
        for target in targets {
            if let Err(e) = socket.send_to(payload.as_bytes(), target).await {
                return Err(format!("Invio ricerca TV fallito: {e}"));
            }
            sleep(Duration::from_millis(15)).await;
        }
    }
    Ok(())
}

fn build_msearch(st: &str) -> String {
    format!(
        "M-SEARCH * HTTP/1.1\r\n\
         HOST: 239.255.255.250:1900\r\n\
         MAN: \"ssdp:discover\"\r\n\
         MX: 2\r\n\
         ST: {st}\r\n\
         USER-AGENT: Branchefy/1.0 UPnP/1.1\r\n\
         \r\n"
    )
}

fn looks_like_ssdp(packet: &str) -> bool {
    let upper = packet.to_ascii_uppercase();
    upper.contains("HTTP/1.1 200")
        || upper.contains("NOTIFY * HTTP/1.1")
        || upper.contains("LOCATION:")
}

pub async fn play_on_device(
    device: &CastDevice,
    title: &str,
    stream_url: &str,
    mime: &str,
    start_secs: f64,
) -> Result<(), String> {
    let client = http_client()?;

    // Sblocca eventuale sessione precedente sulla TV.
    let stop_body = soap_envelope(&format!(
        r#"<u:Stop xmlns:u="{AV_TRANSPORT}">
  <InstanceID>0</InstanceID>
</u:Stop>"#,
    ));
    let _ = post_soap(
        &client,
        &device.control_url,
        "Stop",
        r#""urn:schemas-upnp-org:service:AVTransport:1#Stop""#,
        &stop_body,
    )
    .await;

    let mime = mime;
    let metadata = build_didl_metadata_minimal(title, stream_url, mime);
    set_av_transport_uri(&client, device, stream_url, &metadata).await?;

    sleep(Duration::from_millis(250)).await;

    let play_body = soap_envelope(&format!(
        r#"<u:Play xmlns:u="{AV_TRANSPORT}">
  <InstanceID>0</InstanceID>
  <Speed>1</Speed>
</u:Play>"#,
    ));

    post_soap(
        &client,
        &device.control_url,
        "Play",
        r#""urn:schemas-upnp-org:service:AVTransport:1#Play""#,
        &play_body,
    )
    .await?;

    if start_secs > 5.0 {
        sleep(Duration::from_millis(600)).await;
        // Il seek iniziale può fallire su alcune TV: non bloccare la riproduzione.
        let _ = seek_on_device(&client, &device.control_url, start_secs).await;
    }

    Ok(())
}

async fn set_av_transport_uri(
    client: &Client,
    device: &CastDevice,
    stream_url: &str,
    metadata: &str,
) -> Result<(), String> {
    let set_body = soap_envelope(&format!(
        r#"<u:SetAVTransportURI xmlns:u="{AV_TRANSPORT}">
  <InstanceID>0</InstanceID>
  <CurrentURI>{url}</CurrentURI>
  <CurrentURIMetaData>{meta}</CurrentURIMetaData>
</u:SetAVTransportURI>"#,
        url = xml_escape(stream_url),
        meta = xml_escape(metadata),
    ));

    post_soap(
        client,
        &device.control_url,
        "SetAVTransportURI",
        r#""urn:schemas-upnp-org:service:AVTransport:1#SetAVTransportURI""#,
        &set_body,
    )
    .await
}

pub async fn pause_on_device(device: &CastDevice) -> Result<(), String> {
    let client = http_client()?;
    let body = soap_envelope(&format!(
        r#"<u:Pause xmlns:u="{AV_TRANSPORT}">
  <InstanceID>0</InstanceID>
</u:Pause>"#,
    ));
    post_soap(
        &client,
        &device.control_url,
        "Pause",
        r#""urn:schemas-upnp-org:service:AVTransport:1#Pause""#,
        &body,
    )
    .await
}

pub async fn resume_on_device(device: &CastDevice) -> Result<(), String> {
    let client = http_client()?;
    let body = soap_envelope(&format!(
        r#"<u:Play xmlns:u="{AV_TRANSPORT}">
  <InstanceID>0</InstanceID>
  <Speed>1</Speed>
</u:Play>"#,
    ));
    post_soap(
        &client,
        &device.control_url,
        "Play",
        r#""urn:schemas-upnp-org:service:AVTransport:1#Play""#,
        &body,
    )
    .await
}

pub async fn stop_on_device(device: &CastDevice) -> Result<(), String> {
    let client = http_client()?;
    let body = soap_envelope(&format!(
        r#"<u:Stop xmlns:u="{AV_TRANSPORT}">
  <InstanceID>0</InstanceID>
</u:Stop>"#,
    ));
    post_soap(
        &client,
        &device.control_url,
        "Stop",
        r#""urn:schemas-upnp-org:service:AVTransport:1#Stop""#,
        &body,
    )
    .await
}

pub async fn seek_device(device: &CastDevice, position_secs: f64) -> Result<(), String> {
    let client = http_client()?;
    seek_on_device(&client, &device.control_url, position_secs).await
}

pub async fn get_position(device: &CastDevice) -> Result<CastPosition, String> {
    let client = http_client()?;
    let body = soap_envelope(&format!(
        r#"<u:GetPositionInfo xmlns:u="{AV_TRANSPORT}">
  <InstanceID>0</InstanceID>
</u:GetPositionInfo>"#,
    ));

    let response = client
        .post(&device.control_url)
        .header("Content-Type", r#"text/xml; charset="utf-8""#)
        .header(
            "SOAPAction",
            r#""urn:schemas-upnp-org:service:AVTransport:1#GetPositionInfo""#,
        )
        .body(body)
        .send()
        .await
        .map_err(|e| format!("Connessione alla TV fallita: {e}"))?;

    if !response.status().is_success() {
        return Err("Impossibile leggere lo stato dalla TV".to_string());
    }

    let text = response.text().await.unwrap_or_default();
    let position_secs = extract_xml_tag(&text, "RelTime")
        .as_deref()
        .and_then(parse_dlna_time)
        .unwrap_or(0.0);
    let duration_secs = extract_xml_tag(&text, "TrackDuration")
        .as_deref()
        .and_then(parse_dlna_time)
        .unwrap_or(0.0);
    let state = extract_xml_tag(&text, "TransportState").unwrap_or_default();
    let playing = state.eq_ignore_ascii_case("PLAYING");

    Ok(CastPosition {
        position_secs,
        duration_secs,
        playing,
    })
}

async fn seek_on_device(
    client: &Client,
    control_url: &str,
    position_secs: f64,
) -> Result<(), String> {
    let target = format_dlna_time(position_secs.max(0.0));
    let body = soap_envelope(&format!(
        r#"<u:Seek xmlns:u="{AV_TRANSPORT}">
  <InstanceID>0</InstanceID>
  <Unit>REL_TIME</Unit>
  <Target>{target}</Target>
</u:Seek>"#,
    ));
    post_soap(
        client,
        control_url,
        "Seek",
        r#""urn:schemas-upnp-org:service:AVTransport:1#Seek""#,
        &body,
    )
    .await
}

async fn describe_device(location: &str) -> Option<CastDevice> {
    let client = http_client().ok()?;
    let response = client
        .get(location)
        .header("User-Agent", "Branchefy/1.0 UPnP/1.1")
        .send()
        .await
        .ok()?;

    if !response.status().is_success() {
        return None;
    }

    let xml = response.text().await.ok()?;
    if !xml.contains("AVTransport") && !xml.contains("MediaRenderer") {
        return None;
    }

    let control_url = parse_av_transport_control_url(&xml, location)?;
    let friendly_name = extract_xml_tag(&xml, "friendlyName")
        .or_else(|| extract_xml_tag(&xml, "modelName"))
        .or_else(|| extract_xml_tag(&xml, "manufacturer"))
        .unwrap_or_else(|| fallback_name(location));

    let mut hasher = DefaultHasher::new();
    location.hash(&mut hasher);
    control_url.hash(&mut hasher);
    let id = format!("{:x}", hasher.finish());

    Some(CastDevice {
        id,
        name: friendly_name,
        location: location.to_string(),
        control_url,
    })
}

fn parse_av_transport_control_url(xml: &str, location: &str) -> Option<String> {
    let patterns = [
        r"(?is)<serviceType>\s*urn:schemas-upnp-org:service:AVTransport:1\s*</serviceType>[\s\S]*?<controlURL>\s*([^<]+?)\s*</controlURL>",
        r#"(?is)<service[^>]*>[\s\S]*?AVTransport[\s\S]*?<controlURL>\s*([^<]+?)\s*</controlURL>"#,
        r"(?is)AVTransport[\s\S]{0,800}?<controlURL>\s*([^<]+?)\s*</controlURL>",
    ];

    for pattern in patterns {
        let re = Regex::new(pattern).ok()?;
        if let Some(cap) = re.captures(xml) {
            let control = cap.get(1)?.as_str().trim();
            if let Some(url) = resolve_url(location, control) {
                return Some(url);
            }
        }
    }

    None
}

fn extract_xml_tag(xml: &str, tag: &str) -> Option<String> {
    let open = format!("<{tag}>");
    let close = format!("</{tag}>");
    let value = xml.split(&open).nth(1)?.split(&close).next()?.trim();
    if value.is_empty() {
        None
    } else {
        Some(value.to_string())
    }
}

fn fallback_name(location: &str) -> String {
    Url::parse(location)
        .ok()
        .and_then(|url| url.host_str().map(str::to_string))
        .unwrap_or_else(|| "TV in rete".to_string())
}

fn resolve_url(base: &str, path: &str) -> Option<String> {
    if path.starts_with("http://") || path.starts_with("https://") {
        return Some(path.to_string());
    }
    Url::parse(base).ok()?.join(path).ok().map(|u| u.to_string())
}

fn header_value(packet: &str, name: &str) -> Option<String> {
    for line in packet.lines() {
        let line = line.trim();
        let Some((key, value)) = line.split_once(':') else {
            continue;
        };
        if key.trim().eq_ignore_ascii_case(name) {
            return Some(value.trim().to_string());
        }
    }
    None
}

fn http_client() -> Result<Client, String> {
    Client::builder()
        .timeout(Duration::from_secs(8))
        .user_agent("Branchefy/1.0 UPnP/1.1")
        .build()
        .map_err(|e| e.to_string())
}

fn soap_envelope(body: &str) -> String {
    format!(
        r#"<?xml version="1.0" encoding="utf-8"?>
<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/">
  <s:Body>
    {body}
  </s:Body>
</s:Envelope>"#,
    )
}

async fn post_soap(
    client: &Client,
    control_url: &str,
    action_label: &str,
    action: &str,
    body: &str,
) -> Result<(), String> {
    let response = client
        .post(control_url)
        .header("Content-Type", r#"text/xml; charset="utf-8""#)
        .header("SOAPAction", action)
        .body(body.to_string())
        .send()
        .await
        .map_err(|e| format!("Connessione alla TV fallita ({action_label}): {e}"))?;

    if response.status().is_success() {
        return Ok(());
    }

    let status = response.status();
    let text = response.text().await.unwrap_or_default();
    let fault = extract_xml_tag(&text, "faultstring")
        .or_else(|| extract_xml_tag(&text, "errorDescription"))
        .unwrap_or_default();
    let detail = if fault.is_empty() {
        text.chars().take(180).collect::<String>()
    } else {
        fault
    };
    Err(format!(
        "La TV ha rifiutato {action_label} ({status}): {detail}"
    ))
}

fn build_didl_metadata_minimal(title: &str, stream_url: &str, mime: &str) -> String {
    format!(
        r#"<DIDL-Lite xmlns="urn:schemas-upnp-org:metadata-1-0/DIDL-Lite/" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:upnp="urn:schemas-upnp-org:metadata-1-0/upnp/"><item id="0" parentID="-1" restricted="1"><dc:title>{title}</dc:title><res protocolInfo="http-get:*:{mime}:*">{url}</res><upnp:class>object.item.videoItem</upnp:class></item></DIDL-Lite>"#,
        title = xml_escape(title),
        mime = mime,
        url = xml_escape(stream_url),
    )
}

fn format_dlna_time(seconds: f64) -> String {
    let total = seconds.max(0.0).floor() as u64;
    let hours = total / 3600;
    let minutes = (total % 3600) / 60;
    let secs = total % 60;
    format!("{hours:02}:{minutes:02}:{secs:02}")
}

fn parse_dlna_time(value: &str) -> Option<f64> {
    let value = value.trim();
    if value.is_empty() || value == "NOT_IMPLEMENTED" {
        return None;
    }

    let parts: Vec<&str> = value.split(':').collect();
    match parts.len() {
        3 => {
            let hours: f64 = parts[0].parse().ok()?;
            let minutes: f64 = parts[1].parse().ok()?;
            let seconds: f64 = parts[2].parse().ok()?;
            Some(hours * 3600.0 + minutes * 60.0 + seconds)
        }
        2 => {
            let minutes: f64 = parts[0].parse().ok()?;
            let seconds: f64 = parts[1].parse().ok()?;
            Some(minutes * 60.0 + seconds)
        }
        _ => None,
    }
}

pub fn video_mime(path: &str) -> &'static str {
    match Path::new(path)
        .extension()
        .and_then(|ext| ext.to_str())
        .map(|ext| ext.to_ascii_lowercase())
        .as_deref()
    {
        Some("mp4") | Some("m4v") => "video/mp4",
        Some("mkv") => "video/x-matroska",
        Some("avi") => "video/x-msvideo",
        Some("webm") => "video/webm",
        Some("mov") => "video/quicktime",
        Some("ts") | Some("m2ts") => "video/mp2t",
        _ => "video/mp4",
    }
}

fn xml_escape(value: &str) -> String {
    value
        .replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
        .replace('\'', "&apos;")
}
