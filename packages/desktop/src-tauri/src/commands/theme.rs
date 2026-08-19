// Theme file import: a native picker filtered to VS Code / Shiki theme JSON,
// read back as text for the frontend converter (which does all the parsing).

use std::fs;

use serde::Serialize;
use tauri::AppHandle;

use crate::error::AppError;

/// Themes are small; anything past this is not a theme file.
const MAX_THEME_BYTES: u64 = 2 * 1024 * 1024;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ThemeFilePayload {
    pub file_name: String,
    pub content: String,
}

/// Opens a file picker and returns the chosen theme file's name and text.
/// `Ok(None)` when the user cancels.
#[tauri::command]
pub async fn read_theme_file(app: AppHandle) -> Result<Option<ThemeFilePayload>, AppError> {
    use tauri_plugin_dialog::DialogExt;

    let picked = app
        .dialog()
        .file()
        .add_filter("Theme files", &["json", "jsonc"])
        .blocking_pick_file();

    let Some(file_path) = picked else {
        return Ok(None);
    };
    let path = file_path
        .into_path()
        .map_err(|e| AppError::Dialog(e.to_string()))?;

    let size = fs::metadata(&path)?.len();
    if size > MAX_THEME_BYTES {
        return Err(AppError::Other(format!(
            "Theme file is too large ({} KB); the limit is {} KB",
            size / 1024,
            MAX_THEME_BYTES / 1024
        )));
    }

    let content = fs::read_to_string(&path)?;
    let file_name = path
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_else(|| "theme.json".to_string());

    Ok(Some(ThemeFilePayload { file_name, content }))
}
