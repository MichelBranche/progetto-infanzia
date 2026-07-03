use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Profile {
    pub id: String,
    pub name: String,
    pub role: String,
    pub avatar_color: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub accent_color: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub avatar_style: Option<String>,
    pub avatar_emoji: Option<String>,
    pub created_at: String,
    pub has_pin: bool,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateProfileInput {
    pub name: Option<String>,
    pub role: Option<String>,
    pub avatar_color: Option<String>,
    pub accent_color: Option<String>,
    pub avatar_style: Option<String>,
    pub avatar_emoji: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateProfileInput {
    pub name: String,
    pub role: String,
    pub avatar_color: String,
    pub accent_color: Option<String>,
    pub avatar_style: Option<String>,
    pub avatar_emoji: Option<String>,
}

pub const PROFILE_COLORS: &[&str] = &[
    "#6b7fff", "#3ddbd9", "#ff8a6b", "#b8a4ff", "#ffc947", "#ff6b9d", "#4ade80", "#f472b6",
];

pub const PROFILE_EMOJIS: &[&str] = &[
    "👨", "👩", "👦", "👧", "🧒", "👶", "🦸", "🧙", "🐻", "⭐", "🎬", "🎨",
];

pub fn role_label(role: &str) -> &str {
    match role {
        "parent" => "Genitore",
        "child" => "Bambino",
        _ => "Ospite",
    }
}

pub fn hash_pin(pin: &str) -> String {
    use std::collections::hash_map::DefaultHasher;
    use std::hash::{Hash, Hasher};
    const SALT: &str = "branchefy-parent-pin-v1";
    let mut hasher = DefaultHasher::new();
    format!("{SALT}:{}", pin.trim()).hash(&mut hasher);
    format!("{:016x}", hasher.finish())
}

pub fn verify_pin(pin: &str, stored_hash: &str) -> bool {
    !stored_hash.is_empty() && hash_pin(pin) == stored_hash
}

pub fn is_valid_pin(pin: &str) -> bool {
    let pin = pin.trim();
    pin.len() >= 4 && pin.len() <= 8 && pin.chars().all(|c| c.is_ascii_digit())
}
