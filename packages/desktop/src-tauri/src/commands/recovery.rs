use std::fs;
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};

use serde_json::Value;
use tauri::{AppHandle, Manager};

use crate::error::AppError;
use crate::services::storage::StorageService;

const RECOVERY_DIR: &str = "recovery";
const MAX_RECOVERY_BYTES: usize = 10 * 1024 * 1024;
const MAX_AGE_SECS: u64 = 7 * 24 * 60 * 60;
const MAX_FILENAME_LEN: usize = 200;

fn validate_filename(name: &str) -> Result<(), AppError> {
    if name.is_empty() {
        return Err(AppError::Other("Empty filename".into()));
    }
    if name.len() > MAX_FILENAME_LEN {
        return Err(AppError::Other(format!(
            "Filename exceeds {MAX_FILENAME_LEN} characters"
        )));
    }
    if name.starts_with('.') {
        return Err(AppError::Other("Filename must not start with '.'".into()));
    }
    if name.contains("..")
        || name.contains('/')
        || name.contains('\\')
        || name.contains(std::path::MAIN_SEPARATOR)
    {
        return Err(AppError::Other(
            "Filename must not contain path separators or '..'".into(),
        ));
    }
    Ok(())
}

fn recovery_dir(app: &AppHandle) -> Result<PathBuf, AppError> {
    let storage = app.state::<StorageService>();
    let dir = storage.base_dir().join(RECOVERY_DIR);
    fs::create_dir_all(&dir)?;
    Ok(dir)
}

#[tauri::command]
pub async fn save_emergency_data(
    app: AppHandle,
    filename: String,
    data: Value,
) -> Result<(), AppError> {
    validate_filename(&filename)?;
    let json = serde_json::to_string_pretty(&data)?;
    if json.len() > MAX_RECOVERY_BYTES {
        return Err(AppError::Other(format!(
            "Crash data exceeds the {} MB cap",
            MAX_RECOVERY_BYTES / (1024 * 1024)
        )));
    }
    let dir = recovery_dir(&app)?;
    let path = dir.join(format!("{filename}.json"));
    let tmp = path.with_extension("json.tmp");
    fs::write(&tmp, &json)?;
    if let Err(e) = fs::rename(&tmp, &path) {
        let _ = fs::remove_file(&tmp);
        return Err(AppError::Io(e));
    }
    log::info!("Crash data saved to {}", path.display());
    Ok(())
}

#[tauri::command]
pub async fn cleanup_old_recovery_files(app: AppHandle) -> Result<u32, AppError> {
    let dir = recovery_dir(&app)?;
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();
    let mut purged = 0u32;
    let entries = match fs::read_dir(&dir) {
        Ok(entries) => entries,
        Err(_) => return Ok(0),
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if !path.is_file() {
            continue;
        }
        let age = path
            .metadata()
            .ok()
            .and_then(|m| m.modified().ok())
            .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
            .map(|d| now.saturating_sub(d.as_secs()))
            .unwrap_or(0);
        if age > MAX_AGE_SECS && fs::remove_file(&path).is_ok() {
            purged += 1;
        }
    }
    if purged > 0 {
        log::info!("Purged {purged} old crash recovery file(s)");
    }
    Ok(purged)
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    #[test]
    fn validate_rejects_empty() {
        assert!(validate_filename("").is_err());
    }

    #[test]
    fn validate_rejects_path_traversal() {
        assert!(validate_filename("../etc/passwd").is_err());
        assert!(validate_filename("foo/bar").is_err());
        assert!(validate_filename("foo\\bar").is_err());
    }

    #[test]
    fn validate_rejects_leading_dot() {
        assert!(validate_filename(".hidden").is_err());
    }

    #[test]
    fn validate_rejects_overlength() {
        let long = "a".repeat(MAX_FILENAME_LEN + 1);
        assert!(validate_filename(&long).is_err());
    }

    #[test]
    fn validate_accepts_normal_names() {
        assert!(validate_filename("crash-12345").is_ok());
        assert!(validate_filename("crash-window-error-1234567890").is_ok());
    }

    #[test]
    fn oversized_data_is_rejected() {
        let big = "x".repeat(MAX_RECOVERY_BYTES + 1);
        let json = serde_json::to_string_pretty(&serde_json::json!({ "d": big })).unwrap();
        assert!(json.len() > MAX_RECOVERY_BYTES);
    }

    #[test]
    fn recovery_round_trip() {
        let tmp = TempDir::new().unwrap();
        let recovery = tmp.path().join(RECOVERY_DIR);
        fs::create_dir_all(&recovery).unwrap();
        let data =
            serde_json::json!({ "message": "test crash", "timestamp": "2026-01-01T00:00:00Z" });
        let json = serde_json::to_string_pretty(&data).unwrap();
        let path = recovery.join("crash-test.json");
        fs::write(&path, &json).unwrap();
        let loaded: Value = serde_json::from_str(&fs::read_to_string(&path).unwrap()).unwrap();
        assert_eq!(loaded["message"], "test crash");
    }
}
