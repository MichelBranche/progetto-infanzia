use serde::{Deserialize, Serialize};

pub const META_INTRO_SOUND: &str = "intro_sound_enabled";
pub const META_HOME_CARD_SOUNDS: &str = "home_card_sounds_enabled";
pub const META_SUBSCRIBED_SERVICES: &str = "subscribed_services";
pub const META_CAST_TRANSCODE: &str = "cast_transcode_enabled";
pub const META_PREFERRED_AUDIO_LANG: &str = "preferred_audio_lang";
pub const META_SC_PROXY_ENABLED: &str = "sc_proxy_enabled";
pub const META_SC_PROXY_URL: &str = "sc_proxy_url";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppSettings {
    pub intro_sound_enabled: bool,
    pub home_card_sounds_enabled: bool,
    pub subscribed_services: Vec<String>,
    pub media_root: String,
    pub last_scan: Option<String>,
    pub stream_port: u16,
    pub tmdb_api_key: Option<String>,
    pub tmdb_enrich_on_scan: bool,
    pub cast_transcode_enabled: bool,
    pub preferred_audio_language: String,
    /// Instrada le richieste StreamingCommunity attraverso `sc_proxy_url` (solo desktop).
    pub sc_proxy_enabled: bool,
    /// Proxy per SC: `http://…`, `https://…`, `socks5://…` o `socks5h://…` (con eventuale user:pass@).
    pub sc_proxy_url: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateSettingsInput {
    pub intro_sound_enabled: Option<bool>,
    pub home_card_sounds_enabled: Option<bool>,
    pub subscribed_services: Option<Vec<String>>,
    pub tmdb_api_key: Option<String>,
    pub tmdb_enrich_on_scan: Option<bool>,
    pub cast_transcode_enabled: Option<bool>,
    pub preferred_audio_language: Option<String>,
    pub sc_proxy_enabled: Option<bool>,
    pub sc_proxy_url: Option<String>,
}

pub const STREAMING_SERVICE_IDS: &[&str] =
    &["netflix", "prime", "disney", "apple", "paramount", "now", "hbo"];
