use crate::addon_proxy::AddonProxyRegistry;
use crate::db::Database;
use crate::mediaset_catalog::{
    self, app_origin, channel_by_call_sign, is_live_slug, live_channel_from_slug,
    public_url_for_channel, session, user_agent, MediasetSession, SessionKind,
};
use crate::network::stream_http_base;
use crate::stremio::{PlayableStream, StremioMeta, StremioVideo};
use reqwest::blocking::Client;
use std::collections::HashMap;
use std::sync::{LazyLock, Mutex};
use std::time::{Duration, Instant};

const HTTP_TIMEOUT_SECS: u64 = 30;
const WV_ACCOUNT: &str = "http://access.auth.theplatform.com/data/Account/2702976343";
const WV_LICENSE_TTL: Duration = Duration::from_secs(6 * 3600);
const DRM_MSG: &str =
    "Stream Mediaset non riproducibile: manca Widevine (usa Chrome/Edge) o la licenza non è disponibile.";

struct WvLicenseEntry {
    be_token: String,
    release_pid: String,
    created_at: Instant,
}

static WV_LICENSES: LazyLock<Mutex<HashMap<String, WvLicenseEntry>>> =
    LazyLock::new(|| Mutex::new(HashMap::new()));

fn http_client() -> Result<Client, String> {
    Client::builder()
        .timeout(Duration::from_secs(HTTP_TIMEOUT_SECS))
        .user_agent(user_agent())
        .redirect(reqwest::redirect::Policy::limited(8))
        .build()
        .map_err(|e| e.to_string())
}

fn basic_anonymous() -> String {
    use base64::Engine;
    base64::engine::general_purpose::STANDARD.encode(b"anonymous:anonymous")
}

fn register_wv_license(be_token: String, release_pid: String) -> String {
    let id = format!("{:016x}", {
        use std::collections::hash_map::DefaultHasher;
        use std::hash::{Hash, Hasher};
        let mut h = DefaultHasher::new();
        be_token.hash(&mut h);
        release_pid.hash(&mut h);
        h.finish()
    });
    let mut guard = WV_LICENSES.lock().expect("wv license lock");
    let now = Instant::now();
    guard.retain(|_, e| now.duration_since(e.created_at) < WV_LICENSE_TTL);
    guard.insert(
        id.clone(),
        WvLicenseEntry {
            be_token,
            release_pid,
            created_at: now,
        },
    );
    id
}

pub fn wv_license_proxy_url(id: &str) -> String {
    format!("{}/mediaset-wv/{}", stream_http_base(), id)
}

pub fn wv_upstream_license_url(id: &str) -> Option<String> {
    let guard = WV_LICENSES.lock().ok()?;
    let entry = guard.get(id)?;
    Some(format!(
        "https://widevine.entitlement.theplatform.eu/wv/web/ModularDrm/getRawWidevineLicense?releasePid={}&account={}&schema=1.0&token={}",
        urlencoding::encode(&entry.release_pid),
        urlencoding::encode(WV_ACCOUNT),
        urlencoding::encode(&entry.be_token),
    ))
}

struct SmilMedia {
    url: String,
    #[allow(dead_code)]
    is_hls: bool,
    is_dash: bool,
    release_pid: Option<String>,
    widevine: bool,
}

/// Risolve SMIL Widevine → MPD + releasePid.
fn resolve_smil_media(
    client: &Client,
    public_url: &str,
    auth: &MediasetSession,
) -> Result<SmilMedia, String> {
    // Senza assetTypes lunghi: protectionScheme=Widevine restituisce MPD Widevine.
    // Con assetTypes "geoIT|…" thePlatform spesso risponde PlayReady-only.
    let smil_url = format!(
        "{public_url}?auto=true&balance=true&format=SMIL&formats=MPEG-DASH&tracking=true&protectionScheme=Widevine"
    );
    let auth_header = if auth.kind == SessionKind::User {
        format!("Bearer {}", auth.be_token)
    } else {
        format!("Basic {}", basic_anonymous())
    };
    let mut req = client
        .get(&smil_url)
        .header("Accept", "*/*")
        .header("Origin", app_origin())
        .header("Referer", format!("{}/", app_origin()))
        .header("Authorization", auth_header);
    if let Some(ref gw) = auth.t_apigw {
        req = req.header("t-apigw", gw);
    }
    if let Some(ref cts) = auth.t_cts {
        req = req.header("t-cts", cts);
    }
    let text = req
        .send()
        .map_err(|e| format!("SMIL Mediaset: {e}"))?
        .error_for_status()
        .map_err(|e| format!("SMIL Mediaset non disponibile: {e}"))?
        .text()
        .map_err(|e| e.to_string())?;

    if text.to_ascii_lowercase().contains("isexception")
        || text.to_ascii_lowercase().contains("name=\"exception\"")
    {
        let code = extract_param(&text, "exception").unwrap_or_else(|| "unknown".into());
        let abstract_msg = extract_attr(&text, "abstract").unwrap_or_default();
        if code.eq_ignore_ascii_case("UnknownFormat") {
            return Err(format!(
                "SMIL Mediaset: formato non riconosciuto ({abstract_msg})."
            ));
        }
        return Err(format!(
            "Canale Mediaset non disponibile ({code}{}).",
            if abstract_msg.is_empty() {
                String::new()
            } else {
                format!(": {abstract_msg}")
            }
        ));
    }

    let security = extract_attr(&text, "security").unwrap_or_default();
    let media_type = extract_attr(&text, "type").unwrap_or_default();
    let src =
        extract_src(&text).ok_or_else(|| "Stream Mediaset assente nella risposta SMIL".to_string())?;
    let release_pid = extract_tracking_pid(&text);

    let src_l = src.to_ascii_lowercase();
    let is_hls = src_l.contains(".m3u8") || media_type.contains("mpegURL");
    let is_dash = src_l.contains(".mpd") || media_type.contains("dash");
    let widevine = src_l.contains("widevine")
        || security.eq_ignore_ascii_case("widevine")
        || (security.eq_ignore_ascii_case("commonEncryption") && src_l.contains("widevine"));

    if !widevine && !security.is_empty() && !security.eq_ignore_ascii_case("none") {
        return Err(DRM_MSG.into());
    }
    if src_l.contains("playready") && !widevine {
        return Err(DRM_MSG.into());
    }

    Ok(SmilMedia {
        url: src,
        is_hls,
        is_dash,
        release_pid,
        widevine,
    })
}

fn extract_attr(smil: &str, name: &str) -> Option<String> {
    let needle = format!("{name}=\"");
    let idx = smil.find(&needle)?;
    let rest = &smil[idx + needle.len()..];
    let end = rest.find('"')?;
    Some(rest[..end].to_string())
}

fn extract_param(smil: &str, name: &str) -> Option<String> {
    let needle = format!("name=\"{name}\"");
    let idx = smil.find(&needle)?;
    let rest = &smil[idx..];
    let v = rest.find("value=\"")?;
    let after = &rest[v + "value=\"".len()..];
    let end = after.find('"')?;
    Some(after[..end].to_string())
}

fn extract_tracking_pid(smil: &str) -> Option<String> {
    let td = extract_param(smil, "trackingData")?;
    // thePlatform: aid=…|pid=Uu6TqJ9PmRzo|…
    for part in td.split(|c| c == '|' || c == '&') {
        let mut kv = part.splitn(2, '=');
        let key = kv.next()?.trim();
        let val = kv.next()?.trim();
        if key.eq_ignore_ascii_case("pid") && !val.is_empty() {
            return Some(val.to_string());
        }
    }
    None
}

fn extract_src(smil: &str) -> Option<String> {
    for part in smil.split("<ref ").skip(1) {
        if let Some(src) = attr_in_tag(part, "src") {
            if src.starts_with("http") {
                return Some(src);
            }
        }
    }
    for part in smil.split("<video ").skip(1) {
        if let Some(src) = attr_in_tag(part, "src") {
            if src.starts_with("http") {
                return Some(src);
            }
        }
    }
    None
}

fn attr_in_tag(tag_rest: &str, name: &str) -> Option<String> {
    let needle = format!("{name}=\"");
    let idx = tag_rest.find(&needle)?;
    let rest = &tag_rest[idx + needle.len()..];
    let end = rest.find('"')?;
    Some(rest[..end].to_string())
}

pub fn fetch_title_meta(db: &Database, slug: &str) -> Result<StremioMeta, String> {
    if !mediaset_catalog::enabled(db) {
        return Err("Catalogo Mediaset Infinity disabilitato".into());
    }
    let call_sign = live_channel_from_slug(slug)
        .ok_or_else(|| "Canale Mediaset non specificato".to_string())?;
    let channel = channel_by_call_sign(&call_sign)
        .ok_or_else(|| format!("Canale Mediaset sconosciuto: {call_sign}"))?;

    let client = http_client()?;
    let sess = session(&client).ok();
    let mut name = channel.name.to_string();
    let mut description = Some("In diretta".to_string());
    let mut poster = None;
    let mut background = None;
    let mut release_info = Some("In diretta".to_string());

    if let Some(session) = sess.as_ref() {
        if let Ok(json) = mediaset_catalog::fetch_nownext(&client, session, &call_sign) {
            let response = json.get("response").unwrap_or(&json);
            if let Some(title) = response
                .pointer("/currentListing/program/title")
                .and_then(|v| v.as_str())
            {
                let clean = title.trim().trim_end_matches('-').trim();
                if !clean.is_empty() {
                    description = Some(format!("In onda: {clean}"));
                }
            }
            if let Some(station) = response
                .get("stations")
                .and_then(|s| s.as_object())
                .and_then(|o| o.values().next())
            {
                if let Some(t) = station.get("title").and_then(|v| v.as_str()) {
                    name = t.to_string();
                }
            }
            if let Some(url) = response
                .pointer("/currentListing/program/thumbnails/image_horizontal/url")
                .and_then(|v| v.as_str())
            {
                let abs = if url.starts_with("//") {
                    format!("https:{url}")
                } else {
                    url.to_string()
                };
                poster = Some(abs.clone());
                background = Some(abs);
            }
            release_info = Some("In diretta".to_string());
        }
    }

    let video_id = format!("live-{call_sign}");
    Ok(StremioMeta {
        id: video_id.clone(),
        r#type: "movie".to_string(),
        name: name.clone(),
        poster,
        background,
        description,
        release_info,
        genres: vec!["Live".to_string(), "Diretta".to_string()],
        videos: vec![StremioVideo {
            id: video_id,
            title: format!("{name} · Diretta"),
            season: None,
            episode: None,
            thumbnail: None,
            released: None,
            description: None,
            runtime: None,
        }],
        runtime: None,
        logo: None,
        rating: None,
        cast: Vec::new(),
        directors: Vec::new(),
        view_count: None,
        quality: None,
        has_preview: false,
        season_numbers: Vec::new(),
        coming_soon: false,
    })
}

pub fn resolve_playback(
    db: &Database,
    slug: &str,
    _episode_id: Option<&str>,
    proxy: &AddonProxyRegistry,
) -> Result<PlayableStream, String> {
    if !mediaset_catalog::enabled(db) {
        return Err("Catalogo Mediaset Infinity disabilitato".into());
    }
    if !is_live_slug(slug) && live_channel_from_slug(slug).is_none() {
        return Err("Solo le dirette free Mediaset Infinity sono supportate".into());
    }
    let call_sign = live_channel_from_slug(slug)
        .ok_or_else(|| "Canale Mediaset non specificato".to_string())?;
    let _channel = channel_by_call_sign(&call_sign)
        .ok_or_else(|| format!("Canale Mediaset sconosciuto: {call_sign}"))?;

    let client = http_client()?;
    let auth = session(&client)?;
    let public_url = public_url_for_channel(&client, &call_sign)?;
    let media = resolve_smil_media(&client, &public_url, &auth)?;

    if !media.widevine || !media.is_dash {
        return Err(DRM_MSG.into());
    }
    let release_pid = media
        .release_pid
        .ok_or_else(|| "SMIL Mediaset: releasePid assente (licenza Widevine)".to_string())?;

    let mut headers = HashMap::new();
    headers.insert("Referer".into(), format!("{}/", app_origin()));
    headers.insert("Origin".into(), app_origin().to_string());
    headers.insert("User-Agent".into(), user_agent().to_string());
    if auth.is_user() {
        headers.insert("Authorization".into(), format!("Bearer {}", auth.be_token));
    }

    // rewrite_manifest=true → sniff MPD e riscrivi BaseURL verso /mediaset-dash/{id}/
    let proxy_id = proxy.register(media.url, headers, true, false);
    let license_id = register_wv_license(auth.be_token.clone(), release_pid);

    let auth_label = if auth.is_user() {
        "Mediaset Infinity Diretta (account · Widevine)"
    } else {
        "Mediaset Infinity Diretta (guest · Widevine)"
    };

    Ok(PlayableStream {
        url: proxy.playback_url(&proxy_id),
        name: Some(auth_label.into()),
        description: Some(call_sign),
        addon_id: "mediaset".into(),
        addon_name: "Mediaset Infinity".into(),
        is_hls: false,
        is_dash: true,
        proxied: true,
        needs_debrid: false,
        info_hash: None,
        file_idx: None,
        sources: Vec::new(),
        drm_widevine_license_url: Some(wv_license_proxy_url(&license_id)),
    })
}
