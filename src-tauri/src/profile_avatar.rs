use std::fs;
use std::path::Path;

use tauri::AppHandle;
use tauri::Manager;

use crate::db::Database;

pub const AVATAR_JPEG_MAX_BYTES: usize = 1024 * 1024;
pub const AVATAR_DB_SENTINEL: &str = "db:jpeg";

pub fn is_jpeg(bytes: &[u8]) -> bool {
    bytes.len() >= 3 && bytes[0] == 0xFF && bytes[1] == 0xD8 && bytes[2] == 0xFF
}

pub fn validate_avatar_bytes(bytes: &[u8]) -> Result<(), String> {
    if !is_jpeg(bytes) {
        return Err("Formato non supportato. Carica solo immagini JPEG (.jpg).".into());
    }
    if bytes.len() > AVATAR_JPEG_MAX_BYTES {
        return Err("L'immagine è troppo grande (max 1 MB).".into());
    }
    Ok(())
}

pub fn remove_legacy_avatar_files(dir: &Path, profile_id: &str) {
    for ext in ["jpg", "jpeg", "png"] {
        let path = dir.join(format!("{profile_id}.{ext}"));
        let _ = fs::remove_file(path);
    }
}

pub fn save_profile_avatar_bytes(
    db: &Database,
    profile_id: &str,
    bytes: &[u8],
) -> Result<(), String> {
    validate_avatar_bytes(bytes)?;
    db.set_profile_avatar_jpeg(profile_id, bytes)
}

pub fn save_profile_avatar_from_file(
    db: &Database,
    profile_id: &str,
    source_path: &str,
) -> Result<(), String> {
    let source = Path::new(source_path);
    if !source.is_file() {
        return Err("File immagine non trovato".into());
    }

    let bytes = fs::read(source).map_err(|e| e.to_string())?;
    validate_avatar_bytes(&bytes)?;
    db.set_profile_avatar_jpeg(profile_id, &bytes)
}

pub fn migrate_filesystem_avatars_to_db(app: &AppHandle, db: &Database) -> Result<(), String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("profile-avatars");
    if !dir.is_dir() {
        return Ok(());
    }

    let profiles = db.get_profiles()?;
    for profile in profiles {
        let Some(path) = profile.avatar_image_path.as_deref() else {
            continue;
        };
        if path == AVATAR_DB_SENTINEL {
            continue;
        }
        let file = Path::new(path);
        if !file.is_file() {
            let legacy = dir.join(format!("{}.jpg", profile.id));
            if legacy.is_file() {
                let bytes = fs::read(&legacy).map_err(|e| e.to_string())?;
                if validate_avatar_bytes(&bytes).is_ok() {
                    db.set_profile_avatar_jpeg(&profile.id, &bytes)?;
                    remove_legacy_avatar_files(&dir, &profile.id);
                }
            }
            continue;
        }
        let bytes = fs::read(file).map_err(|e| e.to_string())?;
        if validate_avatar_bytes(&bytes).is_ok() {
            db.set_profile_avatar_jpeg(&profile.id, &bytes)?;
            remove_legacy_avatar_files(&dir, &profile.id);
        }
    }
    Ok(())
}

pub fn profile_avatar_data_url(bytes: &[u8]) -> String {
    use base64::Engine;
    format!(
        "data:image/jpeg;base64,{}",
        base64::engine::general_purpose::STANDARD.encode(bytes)
    )
}
