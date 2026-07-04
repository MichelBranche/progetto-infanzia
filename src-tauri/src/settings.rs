use serde::{Deserialize, Serialize};

pub const META_INTRO_SOUND: &str = "intro_sound_enabled";
pub const META_SUBSCRIBED_SERVICES: &str = "subscribed_services";
pub const META_CAST_TRANSCODE: &str = "cast_transcode_enabled";
pub const META_PREFERRED_AUDIO_LANG: &str = "preferred_audio_lang";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppSettings {
    pub intro_sound_enabled: bool,
    pub subscribed_services: Vec<String>,
    pub media_root: String,
    pub last_scan: Option<String>,
    pub stream_port: u16,
    pub tmdb_api_key: Option<String>,
    pub tmdb_enrich_on_scan: bool,
    pub cast_transcode_enabled: bool,
    pub preferred_audio_language: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateSettingsInput {
    pub intro_sound_enabled: Option<bool>,
    pub subscribed_services: Option<Vec<String>>,
    pub tmdb_api_key: Option<String>,
    pub tmdb_enrich_on_scan: Option<bool>,
    pub cast_transcode_enabled: Option<bool>,
    pub preferred_audio_language: Option<String>,
}

pub const STREAMING_SERVICE_IDS: &[&str] =
    &["netflix", "prime", "disney", "apple", "paramount", "now"];
