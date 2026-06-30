use serde::{Deserialize, Serialize};

pub const STREAM_PORT: u16 = 17890;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FriendRecord {
    pub friend_code: String,
    pub display_name: String,
    pub last_host: Option<String>,
    pub added_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MediaItem {
    pub id: String,
    pub title: String,
    pub media_type: String,
    pub year: Option<i32>,
    pub file_path: String,
    pub file_name: String,
    pub description: Option<String>,
    pub tag: Option<String>,
    pub series_title: Option<String>,
    pub season: Option<i32>,
    pub episode: Option<i32>,
    pub poster_path: Option<String>,
    pub poster_url: Option<String>,
    pub series_poster_path: Option<String>,
    pub series_poster_url: Option<String>,
    pub watch_position: Option<f64>,
    pub watch_duration: Option<f64>,
    pub watch_updated_at: Option<String>,
    pub is_favorite: bool,
    pub kid_friendly: bool,
    pub tmdb_id: Option<i64>,
    pub tmdb_type: Option<String>,
    pub genres: Vec<String>,
    pub runtime_mins: Option<i32>,
    pub streaming_services: Vec<String>,
    pub gradient: String,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PosterAsset {
    pub path: String,
    pub label: String,
    pub kind: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MediaCollection {
    pub id: String,
    pub title: String,
    pub subtitle: String,
    pub items: Vec<MediaItem>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Library {
    pub items: Vec<MediaItem>,
    pub collections: Vec<MediaCollection>,
    pub featured: Option<MediaItem>,
    pub media_root: String,
    pub total_count: usize,
    pub last_scan: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScanResult {
    pub added: usize,
    pub updated: usize,
    pub removed: usize,
    pub total: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StreamInfo {
    pub url: String,
    pub lan_url: Option<String>,
    pub media: MediaItem,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CastDevice {
    pub id: String,
    pub name: String,
    pub location: String,
    pub control_url: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CastPosition {
    pub position_secs: f64,
    pub duration_secs: f64,
    pub playing: bool,
}

pub fn gradient_for_type(media_type: &str, index: usize) -> String {
    const PALETTES: &[&[&str]] = &[
        &[
            "from-accent to-[#3a4a9f]",
            "from-warm to-accent",
            "from-mint to-[#2a6b6a]",
            "from-lavender to-mint",
            "from-accent to-warm",
        ],
        &[
            "from-warm to-lavender",
            "from-mint to-accent",
            "from-lavender to-warm",
            "from-accent to-lavender",
            "from-[#3a4a9f] to-mint",
        ],
        &[
            "from-lavender to-accent",
            "from-warm to-lavender",
            "from-accent to-mint",
            "from-mint to-warm",
            "from-[#3a4a9f] to-lavender",
        ],
        &[
            "from-warm to-[#8a6b4a]",
            "from-lavender to-accent",
            "from-mint to-[#2a6b6a]",
            "from-accent to-lavender",
        ],
    ];

    let palette_idx = match media_type {
        "film" => 0,
        "cartone" => 1,
        "serie" => 2,
        _ => 3,
    };

    let palette = PALETTES[palette_idx];
    palette[index % palette.len()].to_string()
}

pub fn format_duration_label(seconds: Option<f64>) -> Option<String> {
    let total = seconds? as u64;
    if total == 0 {
        return None;
    }
    let hours = total / 3600;
    let minutes = (total % 3600) / 60;
    if hours > 0 {
        Some(format!("{hours}h {minutes:02}m"))
    } else {
        Some(format!("{minutes}m"))
    }
}
