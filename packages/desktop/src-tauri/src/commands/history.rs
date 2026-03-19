// History command handlers for Tauri

use crate::services::history_storage::HistoryStorage;
use serde_json::json;
use tauri::{AppHandle, Emitter, Manager};

/// Get all history entries
#[tauri::command]
pub async fn get_history(app: AppHandle) -> Result<(), String> {
    let history = app.state::<HistoryStorage>();
    let entries = history.load_all().await?;

    app.emit("historyLoaded", json!({ "data": entries }))
        .map_err(|e| format!("Failed to emit historyLoaded: {}", e))?;

    Ok(())
}

/// Clear all history entries
#[tauri::command]
pub async fn clear_history(app: AppHandle) -> Result<(), String> {
    let history = app.state::<HistoryStorage>();
    history.clear().await?;

    app.emit("historyUpdated", json!({ "data": [] }))
        .map_err(|e| format!("Failed to emit historyUpdated: {}", e))?;

    Ok(())
}

/// Delete a single history entry by ID
#[tauri::command]
pub async fn delete_history_entry(data: serde_json::Value, app: AppHandle) -> Result<(), String> {
    let id = data["id"].as_str().unwrap_or("").to_string();
    if id.is_empty() {
        return Err("No history entry ID provided".to_string());
    }

    let history = app.state::<HistoryStorage>();
    history.delete_entry(&id).await?;

    let entries = history.load_all().await?;
    app.emit("historyUpdated", json!({ "data": entries }))
        .map_err(|e| format!("Failed to emit historyUpdated: {}", e))?;

    Ok(())
}

/// Save a history entry to a collection (just re-emits it for the frontend to handle)
#[tauri::command]
pub async fn save_history_to_collection(_data: serde_json::Value, app: AppHandle) -> Result<(), String> {
    // The actual saving is handled by the frontend; just acknowledge
    app.emit("showNotification", json!({
        "data": { "level": "info", "message": "Use the sidebar to save this request to a collection." }
    }))
    .map_err(|e| format!("Failed to emit: {}", e))?;

    Ok(())
}

/// Append a history entry (called internally after a request completes)
pub async fn append_history_entry(app: &AppHandle, entry: &serde_json::Value) {
    let history = app.state::<HistoryStorage>();
    if let Err(e) = history.append(entry).await {
        eprintln!("[Nouto] Failed to append history entry: {}", e);
    }
}
