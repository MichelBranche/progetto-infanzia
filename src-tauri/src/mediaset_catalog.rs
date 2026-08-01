use crate::db::Database;
use crate::sc_catalog::ScCatalogRow;
use crate::stremio::StremioMetaPreview;
use reqwest::blocking::Client;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::sync::Mutex;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

const META_ENABLED: &str = "mediaset_catalog_enabled";
const HTTP_TIMEOUT_SECS: u64 = 30;
const APP_ORIGIN: &str = "https://mediasetinfinity.mediaset.it";
const API_BASE: &str = "https://api-ott-prod-fe.mediaset.net/PROD/play";
const NOWNEXT_BASE: &str = "https://static3.mediasetplay.mediaset.it/apigw/nownext";
const GIGYA_LOGIN_URL: &str = "https://login.mediaset.it/accounts.login";
/// Chiave pubblica Gigya del sito Mediaset Infinity (stessa del web client).
const GIGYA_API_KEY: &str =
    "3_l-A-KKZVONJdGd272x41mezO6AUV4mUoxOdZCMfccvEXAJa6COVXyT_tUdQI03dh";
const USER_AGENT: &str = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 \
     (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Branchefy/0.1";
const APP_NAME: &str = "web/mediasetplay-web/576ea90";
const ROW_LIVE: &str = "mediaset-live";
const SESSION_TTL_GUEST: Duration = Duration::from_secs(4 * 3600);
const SESSION_TTL_USER: Duration = Duration::from_secs(12 * 3600);

pub const KIND_LIVE: &str = "live";

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SessionKind {
    Guest,
    User,
}

#[derive(Debug, Clone, Copy)]
pub struct LiveChannel {
    pub call_sign: &'static str,
    pub name: &'static str,
    pub color_hint: &'static str,
}

/// Canali TV free (niente radio). `call_sign` = id nownext / SMIL.
pub const LIVE_CHANNELS: &[LiveChannel] = &[
    LiveChannel {
        call_sign: "C5",
        name: "Canale 5",
        color_hint: "#00a0e0",
    },
    LiveChannel {
        call_sign: "I1",
        name: "Italia 1",
        color_hint: "#e31c23",
    },
    LiveChannel {
        call_sign: "R4",
        name: "Rete 4",
        color_hint: "#5c2d91",
    },
    LiveChannel {
        call_sign: "KA",
        name: "La5",
        color_hint: "#e87722",
    },
    LiveChannel {
        call_sign: "KI",
        name: "Iris",
        color_hint: "#8b3a62",
    },
    LiveChannel {
        call_sign: "KQ",
        name: "Mediaset Extra",
        color_hint: "#3d4f66",
    },
    LiveChannel {
        call_sign: "LB",
        name: "20 Mediaset",
        color_hint: "#1a7a4c",
    },
    LiveChannel {
        call_sign: "B6",
        name: "Cine34",
        color_hint: "#c45c26",
    },
    LiveChannel {
        call_sign: "LT",
        name: "Top Crime",
        color_hint: "#7a1f2b",
    },
    LiveChannel {
        call_sign: "FU",
        name: "Focus",
        color_hint: "#4a90a4",
    },
    LiveChannel {
        call_sign: "I2",
        name: "Italia 2",
        color_hint: "#e31c23",
    },
    LiveChannel {
        call_sign: "KB",
        name: "Boing",
        color_hint: "#f5a623",
    },
    LiveChannel {
        call_sign: "LA",
        name: "Cartoonito",
        color_hint: "#00a3e0",
    },
];

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MediasetCatalogResponse {
    pub rows: Vec<ScCatalogRow>,
    pub index: Vec<StremioMetaPreview>,
    pub synced_at: i64,
    pub total_count: usize,
}

#[derive(Debug, Clone)]
pub struct MediasetSession {
    pub be_token: String,
    pub sid: String,
    pub kind: SessionKind,
    /// Header opzionali restituiti da account/login v1 (alcuni endpoint li usano).
    pub t_apigw: Option<String>,
    pub t_cts: Option<String>,
    created_at: Instant,
}

impl MediasetSession {
    pub fn is_fresh(&self) -> bool {
        let ttl = match self.kind {
            SessionKind::Guest => SESSION_TTL_GUEST,
            SessionKind::User => SESSION_TTL_USER,
        };
        self.created_at.elapsed() < ttl
    }

    pub fn is_user(&self) -> bool {
        self.kind == SessionKind::User
    }
}

/// Alias storico — stesso tipo.
pub type GuestSession = MediasetSession;

static SESSION_CACHE: Mutex<Option<MediasetSession>> = Mutex::new(None);
/// Evita di martellare Gigya (400006) a ogni canale: cooldown dopo un fallimento.
static USER_LOGIN_COOLDOWN: Mutex<Option<(Instant, String)>> = Mutex::new(None);
const USER_FAIL_COOLDOWN: Duration = Duration::from_secs(30 * 60);

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CachedLive {
    slug: String,
    call_sign: String,
    name: String,
    poster: Option<String>,
    background: Option<String>,
    logo: Option<String>,
    live_title: Option<String>,
    live_start_hour: Option<String>,
    live_duration_mins: Option<u32>,
    public_url: Option<String>,
}

fn now_ts() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0)
}

fn http_client() -> Result<Client, String> {
    Client::builder()
        .timeout(Duration::from_secs(HTTP_TIMEOUT_SECS))
        .user_agent(USER_AGENT)
        .redirect(reqwest::redirect::Policy::limited(8))
        .build()
        .map_err(|e| e.to_string())
}

pub fn ensure_defaults(db: &Database) -> Result<(), String> {
    if db.get_meta(META_ENABLED)?.is_none() {
        db.set_meta(META_ENABLED, "1")?;
    }
    Ok(())
}

pub fn enabled(db: &Database) -> bool {
    db.get_meta(META_ENABLED)
        .ok()
        .flatten()
        .map(|v| {
            let t = v.trim();
            t != "0" && !t.eq_ignore_ascii_case("false")
        })
        .unwrap_or(true)
}

pub fn is_live_slug(slug: &str) -> bool {
    slug.trim().to_ascii_lowercase().starts_with("live-")
}

pub fn live_channel_from_slug(slug: &str) -> Option<String> {
    let raw = slug.trim();
    let stripped = raw
        .strip_prefix("live-")
        .or_else(|| raw.strip_prefix("LIVE-"))
        .unwrap_or(raw)
        .trim();
    if stripped.is_empty() {
        return None;
    }
    Some(stripped.to_ascii_uppercase())
}

pub fn channel_by_call_sign(call_sign: &str) -> Option<&'static LiveChannel> {
    let key = call_sign.trim().to_ascii_uppercase();
    LIVE_CHANNELS.iter().find(|c| c.call_sign == key)
}

/// Credenziali account Mediaset da env (mai in codice / git).
/// `MEDIASET_LOGIN_ID` + `MEDIASET_PASSWORD` (alias `BRANCHEFY_MEDIASET_*`).
pub fn configured_user_credentials() -> Option<(String, String)> {
    let id = std::env::var("MEDIASET_LOGIN_ID")
        .or_else(|_| std::env::var("BRANCHEFY_MEDIASET_LOGIN_ID"))
        .ok()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())?;
    let password = std::env::var("MEDIASET_PASSWORD")
        .or_else(|_| std::env::var("BRANCHEFY_MEDIASET_PASSWORD"))
        .ok()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())?;
    Some((id, password))
}

pub fn user_auth_configured() -> bool {
    configured_user_credentials().is_some()
}

fn user_login_in_cooldown() -> bool {
    if let Ok(guard) = USER_LOGIN_COOLDOWN.lock() {
        if let Some((at, _)) = guard.as_ref() {
            return at.elapsed() < USER_FAIL_COOLDOWN;
        }
    }
    false
}

fn mark_user_login_failed(err: &str) {
    if let Ok(mut guard) = USER_LOGIN_COOLDOWN.lock() {
        let already = guard
            .as_ref()
            .is_some_and(|(at, _)| at.elapsed() < USER_FAIL_COOLDOWN);
        *guard = Some((Instant::now(), err.to_string()));
        if !already {
            eprintln!(
                "[mediaset] login utente fallito (uso guest per {} min): {err}",
                USER_FAIL_COOLDOWN.as_secs() / 60
            );
            if err.contains("400006") || err.to_ascii_lowercase().contains("security") {
                eprintln!(
                    "[mediaset] Gigya blocca il login da server (anti-bot). \
                     Le credenziali in .env restano valide sul sito; da API server-side spesso falliscono."
                );
            }
        }
    }
}

/// Sessione preferita: account env se configurato, altrimenti guest anonimo.
pub fn session(client: &Client) -> Result<MediasetSession, String> {
    if let Ok(guard) = SESSION_CACHE.lock() {
        if let Some(existing) = guard.as_ref() {
            if existing.is_fresh() {
                if existing.is_user() {
                    return Ok(existing.clone());
                }
                // Guest fresco: riusa se non c'è account, o se il login utente è in cooldown.
                if !user_auth_configured() || user_login_in_cooldown() {
                    return Ok(existing.clone());
                }
            }
        }
    }

    if let Some((login_id, password)) = configured_user_credentials() {
        if !user_login_in_cooldown() {
            match user_session(client, &login_id, &password) {
                Ok(session) => {
                    if let Ok(mut guard) = USER_LOGIN_COOLDOWN.lock() {
                        *guard = None;
                    }
                    if let Ok(mut guard) = SESSION_CACHE.lock() {
                        *guard = Some(session.clone());
                    }
                    return Ok(session);
                }
                Err(err) => {
                    mark_user_login_failed(&err);
                }
            }
        }
    }

    guest_session(client)
}

pub fn guest_session(client: &Client) -> Result<MediasetSession, String> {
    if let Ok(guard) = SESSION_CACHE.lock() {
        if let Some(existing) = guard.as_ref() {
            if existing.is_fresh() && existing.kind == SessionKind::Guest {
                return Ok(existing.clone());
            }
        }
    }

    let client_id = uuid_v4();
    let body = serde_json::json!({
        "client_id": client_id,
        "appName": APP_NAME,
    });
    let res = client
        .post(format!("{API_BASE}/idm/anonymous/login/v2.0"))
        .header("Accept", "application/json, text/plain, */*")
        .header("Content-Type", "application/json")
        .header("Origin", APP_ORIGIN)
        .header("Referer", format!("{APP_ORIGIN}/"))
        .json(&body)
        .send()
        .map_err(|e| format!("Login guest Mediaset: {e}"))?
        .error_for_status()
        .map_err(|e| format!("Login guest Mediaset non disponibile: {e}"))?;

    let json: Value = res
        .json()
        .map_err(|e| format!("Risposta login Mediaset non valida: {e}"))?;
    if json.get("isOk").and_then(|v| v.as_bool()) == Some(false) {
        let msg = json
            .pointer("/error/message")
            .and_then(|v| v.as_str())
            .unwrap_or("errore sconosciuto");
        return Err(format!("Login guest Mediaset fallito: {msg}"));
    }
    let be_token = json
        .pointer("/response/beToken")
        .and_then(|v| v.as_str())
        .filter(|s| !s.is_empty())
        .ok_or_else(|| "Token guest Mediaset assente".to_string())?
        .to_string();
    let sid = json
        .pointer("/response/sid")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();

    let session = MediasetSession {
        be_token,
        sid,
        kind: SessionKind::Guest,
        t_apigw: None,
        t_cts: None,
        created_at: Instant::now(),
    };
    if let Ok(mut guard) = SESSION_CACHE.lock() {
        *guard = Some(session.clone());
    }
    Ok(session)
}

fn user_session(client: &Client, login_id: &str, password: &str) -> Result<MediasetSession, String> {
    let gigya = gigya_accounts_login(client, login_id, password)?;
    account_login_with_gigya(client, &gigya)
}

#[derive(Debug, Clone)]
struct GigyaTokens {
    uid: String,
    uid_signature: String,
    signature_timestamp: String,
}

fn gigya_accounts_login(
    client: &Client,
    login_id: &str,
    password: &str,
) -> Result<GigyaTokens, String> {
    let params = [
        ("loginID", login_id),
        ("password", password),
        ("sessionExpiration", "31536000"),
        ("targetEnv", "jssdk"),
        (
            "include",
            "profile,data,emails,subscriptions,preferences,",
        ),
        ("includeUserInfo", "true"),
        ("loginMode", "standard"),
        ("lang", "it"),
        ("APIKey", GIGYA_API_KEY),
        ("cid", "mediaset-web-mediaset.it programmi-mediaset Default"),
        ("source", "showScreenSet"),
        ("sdk", "js_latest"),
        ("authMode", "cookie"),
        ("pageURL", APP_ORIGIN),
        ("format", "json"),
    ];

    let res = client
        .post(GIGYA_LOGIN_URL)
        .header("Accept", "application/json")
        .header("Origin", APP_ORIGIN)
        .header("Referer", format!("{APP_ORIGIN}/"))
        .form(&params)
        .send()
        .map_err(|e| format!("Gigya login: {e}"))?
        .error_for_status()
        .map_err(|e| format!("Gigya login HTTP: {e}"))?;

    let text = res.text().map_err(|e| e.to_string())?;
    let json: Value = parse_gigya_json(&text)?;
    let error_code = json.get("errorCode").and_then(|v| v.as_i64()).unwrap_or(-1);
    if error_code != 0 {
        let details = json
            .get("errorDetails")
            .or_else(|| json.get("errorMessage"))
            .and_then(|v| v.as_str())
            .unwrap_or("login fallito");
        if details.to_ascii_lowercase().contains("captcha")
            || json.pointer("/validationErrors").is_some()
        {
            return Err(format!(
                "Gigya richiede captcha ({details}). Usa un account senza challenge o login da browser."
            ));
        }
        return Err(format!("Gigya error {error_code}: {details}"));
    }

    let uid = json
        .get("UID")
        .and_then(|v| v.as_str())
        .filter(|s| !s.is_empty())
        .ok_or_else(|| "Gigya UID assente".to_string())?
        .to_string();
    let uid_signature = json
        .get("UIDSignature")
        .and_then(|v| v.as_str())
        .filter(|s| !s.is_empty())
        .ok_or_else(|| "Gigya UIDSignature assente".to_string())?
        .to_string();
    let signature_timestamp = json
        .get("signatureTimestamp")
        .and_then(|v| {
            v.as_str()
                .map(|s| s.to_string())
                .or_else(|| v.as_i64().map(|n| n.to_string()))
                .or_else(|| v.as_u64().map(|n| n.to_string()))
        })
        .filter(|s| !s.is_empty())
        .ok_or_else(|| "Gigya signatureTimestamp assente".to_string())?;

    Ok(GigyaTokens {
        uid,
        uid_signature,
        signature_timestamp,
    })
}

fn parse_gigya_json(text: &str) -> Result<Value, String> {
    let trimmed = text.trim();
    if let Ok(v) = serde_json::from_str::<Value>(trimmed) {
        return Ok(v);
    }
    // Alcune risposte arrivano come JSONP: gigya.callback({...});
    let start = trimmed.find('{').ok_or_else(|| "JSON Gigya non trovato".to_string())?;
    let end = trimmed
        .rfind('}')
        .ok_or_else(|| "JSON Gigya non valido".to_string())?;
    serde_json::from_str(&trimmed[start..=end]).map_err(|e| format!("JSON Gigya: {e}"))
}

fn account_login_with_gigya(
    client: &Client,
    gigya: &GigyaTokens,
) -> Result<MediasetSession, String> {
    let client_id = uuid_v4();
    // Preferisci v2.0 (beToken come guest); fallback v1.0.
    let body_v2 = serde_json::json!({
        "client_id": client_id,
        "appName": APP_NAME,
        "UID": gigya.uid,
        "UIDSignature": gigya.uid_signature,
        "signatureTimestamp": gigya.signature_timestamp,
        "platform": "pc",
    });

    let res_v2 = client
        .post(format!("{API_BASE}/idm/account/login/v2.0"))
        .header("Accept", "application/json, text/plain, */*")
        .header("Content-Type", "application/json")
        .header("Origin", APP_ORIGIN)
        .header("Referer", format!("{APP_ORIGIN}/"))
        .json(&body_v2)
        .send()
        .map_err(|e| format!("Account login Mediaset v2: {e}"))?;

    if res_v2.status().is_success() {
        let json: Value = res_v2
            .json()
            .map_err(|e| format!("Account login v2 JSON: {e}"))?;
        if json.get("isOk").and_then(|v| v.as_bool()) != Some(false) {
            if let Some(be_token) = json
                .pointer("/response/beToken")
                .and_then(|v| v.as_str())
                .filter(|s| !s.is_empty())
            {
                let sid = json
                    .pointer("/response/sid")
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .to_string();
                return Ok(MediasetSession {
                    be_token: be_token.to_string(),
                    sid,
                    kind: SessionKind::User,
                    t_apigw: None,
                    t_cts: None,
                    created_at: Instant::now(),
                });
            }
        }
    }

    let body_v1 = serde_json::json!({
        "platform": "pc",
        "UID": gigya.uid,
        "UIDSignature": gigya.uid_signature,
        "signatureTimestamp": gigya.signature_timestamp,
        "appName": APP_NAME,
    });
    let res = client
        .post(format!("{API_BASE}/idm/account/login/v1.0"))
        .header("Accept", "application/json, text/plain, */*")
        .header("Content-Type", "application/json")
        .header("Origin", APP_ORIGIN)
        .header("Referer", format!("{APP_ORIGIN}/"))
        .json(&body_v1)
        .send()
        .map_err(|e| format!("Account login Mediaset v1: {e}"))?;

    let t_apigw = res
        .headers()
        .get("t-apigw")
        .and_then(|v| v.to_str().ok())
        .map(|s| s.to_string());
    let t_cts = res
        .headers()
        .get("t-cts")
        .and_then(|v| v.to_str().ok())
        .map(|s| s.to_string());

    let json: Value = res
        .error_for_status()
        .map_err(|e| format!("Account login Mediaset non disponibile: {e}"))?
        .json()
        .map_err(|e| format!("Account login v1 JSON: {e}"))?;

    if json.get("isOk").and_then(|v| v.as_bool()) == Some(false) {
        let msg = json
            .pointer("/error/message")
            .and_then(|v| v.as_str())
            .unwrap_or("errore sconosciuto");
        return Err(format!("Account login Mediaset fallito: {msg}"));
    }

    let be_token = json
        .pointer("/response/beToken")
        .and_then(|v| v.as_str())
        .filter(|s| !s.is_empty())
        .map(|s| s.to_string())
        .or_else(|| t_cts.clone())
        .ok_or_else(|| "Token account Mediaset assente (beToken/t-cts)".to_string())?;

    let sid = json
        .pointer("/response/sid")
        .or_else(|| json.pointer("/response/cwId"))
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();

    Ok(MediasetSession {
        be_token,
        sid,
        kind: SessionKind::User,
        t_apigw,
        t_cts,
        created_at: Instant::now(),
    })
}

fn uuid_v4() -> String {
    use std::fmt::Write;
    let mut bytes = [0u8; 16];
    // Non-crypto random is fine for client_id.
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    for (i, b) in bytes.iter_mut().enumerate() {
        *b = ((nanos >> (i * 8)) ^ ((i as u128) * 0x9E) ^ 0xA5) as u8;
    }
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    let mut out = String::with_capacity(36);
    for (i, b) in bytes.iter().enumerate() {
        if i == 4 || i == 6 || i == 8 || i == 10 {
            out.push('-');
        }
        let _ = write!(out, "{b:02x}");
    }
    out
}

pub fn fetch_nownext(client: &Client, session: &MediasetSession, call_sign: &str) -> Result<Value, String> {
    let url = format!("{NOWNEXT_BASE}/{}.json", call_sign.trim().to_ascii_uppercase());
    let mut req = client
        .get(&url)
        .header("Accept", "application/json")
        .header("Origin", APP_ORIGIN)
        .header("Referer", format!("{APP_ORIGIN}/"))
        .header("Authorization", format!("Bearer {}", session.be_token));
    if let Some(ref gw) = session.t_apigw {
        req = req.header("t-apigw", gw);
    }
    if let Some(ref cts) = session.t_cts {
        req = req.header("t-cts", cts);
    }
    let text = req
        .send()
        .map_err(|e| format!("NowNext Mediaset: {e}"))?
        .error_for_status()
        .map_err(|e| format!("NowNext Mediaset non disponibile: {e}"))?
        .text()
        .map_err(|e| e.to_string())?;
    serde_json::from_str(&text).map_err(|e| format!("JSON NowNext non valido: {e}"))
}

fn parse_live_from_nownext(ch: &LiveChannel, json: &Value) -> CachedLive {
    let response = json.get("response").unwrap_or(json);
    let listing = response.get("currentListing");
    let program = listing.and_then(|l| l.get("program"));
    let live_title = program
        .and_then(|p| p.get("title"))
        .and_then(|v| v.as_str())
        .map(|s| s.trim().trim_end_matches('-').trim().to_string())
        .filter(|s| !s.is_empty());

    let (live_start_hour, live_duration_mins) = listing
        .and_then(|l| {
            let start_ms = l
                .get("startTime")
                .or_else(|| l.get("mediasetlisting$startTime"))
                .and_then(|v| v.as_i64().or_else(|| v.as_f64().map(|f| f as i64)));
            let end_ms = l
                .get("endTime")
                .or_else(|| l.get("mediasetlisting$endTime"))
                .and_then(|v| v.as_i64().or_else(|| v.as_f64().map(|f| f as i64)));
            let start_ms = start_ms?;
            let end_ms = end_ms.unwrap_or(start_ms + 3_600_000);
            let mins = ((end_ms - start_ms).max(60_000) / 60_000) as u32;
            // startTime often epoch ms
            let secs = if start_ms > 10_000_000_000 {
                start_ms / 1000
            } else {
                start_ms
            };
            let hour = chrono_hhmm(secs);
            Some((hour, Some(mins)))
        })
        .unwrap_or((None, None));

    let station = response
        .get("stations")
        .and_then(|s| s.as_object())
        .and_then(|obj| obj.values().next());
    let station_title = station
        .and_then(|s| s.get("title"))
        .and_then(|v| v.as_str())
        .map(str::to_string);
    let thumb = listing
        .and_then(|l| {
            l.pointer("/program/thumbnails/image_horizontal/url")
                .or_else(|| l.pointer("/program/thumbnails/image_header_poster/url"))
                .or_else(|| l.pointer("/program/mediasetprogram$thumbURL"))
                .and_then(|v| v.as_str())
        })
        .map(|u| absolute_url(u));

    let public_url = response
        .get("publicUrl")
        .and_then(|v| v.as_str())
        .map(str::to_string);

    CachedLive {
        slug: format!("live-{}", ch.call_sign),
        call_sign: ch.call_sign.to_string(),
        name: station_title.unwrap_or_else(|| ch.name.to_string()),
        poster: thumb.clone(),
        background: thumb,
        logo: None,
        live_title,
        live_start_hour,
        live_duration_mins,
        public_url,
    }
}

fn chrono_hhmm(unix_secs: i64) -> Option<String> {
    // Approximate local IT (UTC+2 summer) without chrono crate: use UTC+2.
    let shifted = unix_secs + 2 * 3600;
    let tod = shifted.rem_euclid(86_400) as u32;
    let hh = tod / 3600;
    let mm = (tod % 3600) / 60;
    Some(format!("{hh:02}:{mm:02}"))
}

fn absolute_url(path: &str) -> String {
    let t = path.trim();
    if t.starts_with("http://") || t.starts_with("https://") {
        t.to_string()
    } else if t.starts_with("//") {
        format!("https:{t}")
    } else {
        format!("https:{t}")
    }
}

fn preview_from_cached(p: &CachedLive) -> StremioMetaPreview {
    let release_info = match (&p.live_start_hour, p.live_duration_mins) {
        (Some(hour), Some(mins)) => Some(format!("live|{hour}|{mins}")),
        _ => Some("In diretta".to_string()),
    };
    let description = p
        .live_title
        .as_ref()
        .map(|t| format!("In onda: {t}"))
        .or_else(|| Some("In diretta".to_string()));

    StremioMetaPreview {
        id: p.slug.clone(),
        r#type: "movie".to_string(),
        name: p.name.clone(),
        poster: p.poster.clone(),
        background: p.background.clone(),
        logo: p.logo.clone(),
        poster_shape: Some("landscape".to_string()),
        description,
        release_info,
        catalog_prefix: Some("mediaset".to_string()),
        slug: Some(p.slug.clone()),
        genres: vec!["Live".to_string(), "Diretta".to_string()],
        cast: Vec::new(),
        directors: Vec::new(),
        streaming_services: Some(vec!["mediaset".to_string()]),
        source_row_key: Some(ROW_LIVE.to_string()),
        source_row_title: Some("In diretta · Mediaset Infinity".to_string()),
        resume_video_id: None,
        coming_soon: false,
    }
}

fn static_cached(ch: &LiveChannel) -> CachedLive {
    CachedLive {
        slug: format!("live-{}", ch.call_sign),
        call_sign: ch.call_sign.to_string(),
        name: ch.name.to_string(),
        poster: None,
        background: None,
        logo: None,
        live_title: None,
        live_start_hour: None,
        live_duration_mins: None,
        public_url: None,
    }
}

fn load_live_channels(client: &Client, enrich: bool) -> Vec<CachedLive> {
    let session = if enrich {
        session(client).ok()
    } else {
        None
    };
    LIVE_CHANNELS
        .iter()
        .map(|ch| {
            if let Some(ref session) = session {
                match fetch_nownext(client, session, ch.call_sign) {
                    Ok(json) if json.get("isOk").and_then(|v| v.as_bool()) != Some(false) => {
                        parse_live_from_nownext(ch, &json)
                    }
                    _ => static_cached(ch),
                }
            } else {
                static_cached(ch)
            }
        })
        .collect()
}

pub fn fetch_catalog(db: &Database) -> Result<MediasetCatalogResponse, String> {
    if !enabled(db) {
        return Ok(MediasetCatalogResponse {
            rows: Vec::new(),
            index: Vec::new(),
            synced_at: now_ts(),
            total_count: 0,
        });
    }
    let client = http_client()?;
    // Catalog boot: static list is enough; on-air refresh happens via fetch_on_air_live.
    let channels = load_live_channels(&client, false);
    let index: Vec<StremioMetaPreview> = channels.iter().map(preview_from_cached).collect();
    let items = index.clone();
    let rows = vec![ScCatalogRow {
        key: ROW_LIVE.to_string(),
        title: "In diretta · Mediaset Infinity".to_string(),
        subtitle: "Canali TV Mediaset free".to_string(),
        items,
    }];
    Ok(MediasetCatalogResponse {
        total_count: index.len(),
        synced_at: now_ts(),
        rows,
        index,
    })
}

pub fn refresh_catalog_index(db: &Database) -> Result<MediasetCatalogResponse, String> {
    fetch_catalog(db)
}

pub fn fetch_on_air_live(db: &Database) -> Result<Vec<StremioMetaPreview>, String> {
    if !enabled(db) {
        return Ok(Vec::new());
    }
    let client = http_client()?;
    let channels = load_live_channels(&client, true);
    Ok(channels.iter().map(preview_from_cached).collect())
}

pub fn search_titles(db: &Database, query: &str) -> Vec<StremioMetaPreview> {
    if !enabled(db) {
        return Vec::new();
    }
    let q = query.trim().to_ascii_lowercase();
    if q.is_empty() {
        return Vec::new();
    }
    LIVE_CHANNELS
        .iter()
        .filter(|ch| {
            ch.name.to_ascii_lowercase().contains(&q)
                || ch.call_sign.to_ascii_lowercase().contains(&q)
        })
        .map(|ch| preview_from_cached(&static_cached(ch)))
        .collect()
}

pub fn public_url_for_channel(client: &Client, call_sign: &str) -> Result<String, String> {
    let sess = session(client)?;
    let json = fetch_nownext(client, &sess, call_sign)?;
    json.pointer("/response/publicUrl")
        .and_then(|v| v.as_str())
        .filter(|s| !s.is_empty())
        .map(str::to_string)
        .ok_or_else(|| "URL pubblica canale Mediaset assente".into())
}

pub fn app_origin() -> &'static str {
    APP_ORIGIN
}

pub fn user_agent() -> &'static str {
    USER_AGENT
}
