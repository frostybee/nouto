// Tauri command handlers - bridge between UI and Rust services

pub mod http;

// Re-export HTTP commands
pub use http::{send_request, cancel_request, init_request_registry};

use serde_json::json;
use tauri::Emitter;

/// Ready command - frontend signals it's ready to receive data
#[tauri::command]
pub fn ready() -> Result<(), String> {
    println!("[HiveFetch] Frontend ready");
    Ok(())
}

/// Load initial data (collections, environments, history)
#[tauri::command]
pub async fn load_data(app: tauri::AppHandle) -> Result<(), String> {
    // TODO: Phase 3 - implement actual storage loading
    // For now, emit empty data
    let initial_data = json!({
        "collections": [],
        "environments": [],
        "history": []
    });

    app.emit("initialData", initial_data)
        .map_err(|e| format!("Failed to emit initialData: {}", e))?;

    Ok(())
}

/// Save collections to disk
#[tauri::command]
pub async fn save_collections(data: String) -> Result<(), String> {
    // TODO: Phase 3 - implement actual storage saving
    println!("[HiveFetch] Save collections called with {} bytes", data.len());
    Ok(())
}

/// Stub command for testing
#[tauri::command]
pub fn greet(name: &str) -> String {
    format!("Hello, {}! Welcome to HiveFetch Desktop.", name)
}
