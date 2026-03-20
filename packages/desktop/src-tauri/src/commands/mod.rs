// Tauri command handlers - bridge between UI and Rust services

pub mod http;
pub mod grpc;
pub mod history;
pub mod websocket;
pub mod sse;
pub mod oauth;
pub mod runner;
pub mod mock_server;
pub mod benchmark;
pub mod secrets;
pub mod graphql_sub;

// Re-export HTTP commands
pub use http::{send_request, cancel_request, pick_ssl_file, init_request_registry};

// Re-export gRPC commands
pub use grpc::{grpc_reflect, grpc_load_proto, grpc_invoke, grpc_send_message, grpc_end_stream, pick_proto_file, pick_proto_import_dir, init_grpc_stream_registry};

// Re-export WebSocket commands
pub use websocket::init_ws_registry;

// Re-export SSE commands
pub use sse::init_sse_registry;

// Re-export Runner commands
pub use runner::init_runner_registry;

// Re-export Benchmark commands
pub use benchmark::init_benchmark_registry;

// Re-export GraphQL Subscription commands
pub use graphql_sub::init_gql_sub_registry;

use crate::services::storage::StorageService;
use crate::services::history_storage::HistoryStorage;
use serde_json::json;
use std::path::PathBuf;
use std::sync::Arc;
use tauri::{Emitter, Manager};
use tokio::sync::Mutex;

/// Managed state for the currently open project directory
pub type ProjectDirState = Arc<Mutex<Option<PathBuf>>>;

/// Ready command - frontend signals it's ready to receive data
#[tauri::command]
pub fn ready() -> Result<(), String> {
    println!("[Nouto] Frontend ready");
    Ok(())
}

/// Load initial data (collections, environments, history)
#[tauri::command]
pub async fn load_data(app: tauri::AppHandle) -> Result<(), String> {
    let storage = app.state::<StorageService>();
    let collections = match storage.load_collections().await {
        Ok(c) => c,
        Err(e) => {
            eprintln!("[Nouto] Failed to load collections (starting fresh): {}", e);
            serde_json::json!([])
        }
    };
    let environments = storage.load_environments().await?;
    let settings = storage.load_settings().await?;

    let history_storage = app.state::<HistoryStorage>();
    let history = history_storage.load_all().await.unwrap_or_default();

    let initial_data = json!({
        "collections": collections,
        "environments": environments.get("environments").cloned().unwrap_or(json!([])),
        "history": history
    });

    // Emit settings separately so the UI loads them
    if settings != json!({}) {
        let _ = app.emit("loadSettings", json!({ "data": settings }));
    }

    // Emit environment active ID separately via loadEnvironments
    let _ = app.emit("loadEnvironments", json!({ "data": environments }));

    app.emit("initialData", initial_data)
        .map_err(|e| format!("Failed to emit initialData: {}", e))?;

    Ok(())
}

/// Save collections to disk
#[tauri::command]
pub async fn save_collections(data: serde_json::Value, app: tauri::AppHandle) -> Result<(), String> {
    let storage = app.state::<StorageService>();
    storage.save_collections(&data).await?;
    println!("[Nouto] Collections saved to disk");

    app.emit("collectionsSaved", json!({ "success": true }))
        .map_err(|e| format!("Failed to emit collectionsSaved: {}", e))?;

    Ok(())
}

/// Save environments to disk
#[tauri::command]
pub async fn save_environments(data: serde_json::Value, app: tauri::AppHandle) -> Result<(), String> {
    let storage = app.state::<StorageService>();
    storage.save_environments(&data).await?;
    println!("[Nouto] Environments saved to disk");

    app.emit("loadEnvironments", json!({ "data": data }))
        .map_err(|e| format!("Failed to emit loadEnvironments: {}", e))?;

    Ok(())
}

/// Update settings (save to disk and emit back)
#[tauri::command]
pub async fn update_settings(data: serde_json::Value, app: tauri::AppHandle) -> Result<(), String> {
    let storage = app.state::<StorageService>();
    storage.save_settings(&data).await?;
    println!("[Nouto] Settings saved to disk");

    app.emit("loadSettings", json!({ "data": data }))
        .map_err(|e| format!("Failed to emit loadSettings: {}", e))?;

    Ok(())
}

/// Open a URL in the system's default browser
#[tauri::command]
pub async fn open_external(data: serde_json::Value, app: tauri::AppHandle) -> Result<(), String> {
    use tauri_plugin_opener::OpenerExt;
    let url = data["url"].as_str().unwrap_or("").to_string();
    if url.is_empty() {
        return Err("No URL provided".to_string());
    }
    app.opener().open_url(&url, None::<&str>)
        .map_err(|e| format!("Failed to open URL: {}", e))?;
    Ok(())
}

/// Open a project directory via folder picker dialog
#[tauri::command]
pub async fn open_project_dir(
    app: tauri::AppHandle,
    project_dir: tauri::State<'_, ProjectDirState>,
    watcher_state: tauri::State<'_, crate::services::file_watcher::FileWatcherState>,
) -> Result<(), String> {
    use tauri_plugin_dialog::DialogExt;

    let picked = app
        .dialog()
        .file()
        .blocking_pick_folder();

    if let Some(folder) = picked {
        if let Some(path) = folder.as_path() {
            let path_str = path.to_string_lossy().to_string();
            let path_buf = path.to_path_buf();

            // Store in managed state
            let mut state = project_dir.lock().await;
            *state = Some(path_buf.clone());

            // Start file watcher for the project directory
            let _ = crate::services::file_watcher::start_watching(
                path_buf,
                app.clone(),
                watcher_state.inner().clone(),
            ).await;

            // Emit event to frontend
            let _ = app.emit("projectOpened", json!({ "data": { "path": path_str } }));

            println!("[Nouto] Project directory opened: {}", path_str);
        }
    }

    Ok(())
}

/// Close the current project directory (revert to app-data storage)
#[tauri::command]
pub async fn close_project(
    app: tauri::AppHandle,
    project_dir: tauri::State<'_, ProjectDirState>,
    watcher_state: tauri::State<'_, crate::services::file_watcher::FileWatcherState>,
) -> Result<(), String> {
    let mut state = project_dir.lock().await;
    *state = None;

    // Stop file watcher
    crate::services::file_watcher::stop_watching(watcher_state.inner().clone()).await;

    let _ = app.emit("projectClosed", json!({ "data": {} }));
    println!("[Nouto] Project directory closed");

    Ok(())
}

/// Link a .env file: opens a file dialog, parses key=value pairs, emits envFileVariablesUpdated
#[tauri::command]
pub async fn link_env_file(
    app: tauri::AppHandle,
    watcher_state: tauri::State<'_, crate::services::file_watcher::EnvFileWatcherState>,
) -> Result<(), String> {
    use tauri_plugin_dialog::DialogExt;

    let picked = app.dialog()
        .file()
        .add_filter("Environment Files", &["env"])
        .blocking_pick_file();

    if let Some(path_ref) = picked {
        if let Some(path) = path_ref.as_path() {
            let path_str = path.to_string_lossy().to_string();
            let variables = parse_env_file(path).await?;

            // Start watching the .env file
            let _ = crate::services::file_watcher::start_env_file_watching(
                path.to_path_buf(),
                app.clone(),
                watcher_state.inner().clone(),
            ).await;

            let _ = app.emit("envFileVariablesUpdated", json!({
                "data": {
                    "variables": variables,
                    "filePath": path_str
                }
            }));
        }
    }

    Ok(())
}

/// Unlink the .env file: clears path and emits empty variables
#[tauri::command]
pub async fn unlink_env_file(
    app: tauri::AppHandle,
    watcher_state: tauri::State<'_, crate::services::file_watcher::EnvFileWatcherState>,
) -> Result<(), String> {
    // Stop watching the .env file
    crate::services::file_watcher::stop_env_file_watching(watcher_state.inner().clone()).await;

    let _ = app.emit("envFileVariablesUpdated", json!({
        "data": {
            "variables": [],
            "filePath": null
        }
    }));

    Ok(())
}

/// Parse a .env file into key=value pairs, handling comments, quoted values, and empty lines
async fn parse_env_file(path: &std::path::Path) -> Result<Vec<serde_json::Value>, String> {
    let content = tokio::fs::read_to_string(path).await
        .map_err(|e| format!("Failed to read .env file: {}", e))?;

    parse_env_content(&content)
}

/// Parse .env content string into variables array
pub fn parse_env_content(content: &str) -> Result<Vec<serde_json::Value>, String> {
    let mut variables = Vec::new();

    for line in content.lines() {
        let trimmed = line.trim();

        // Skip empty lines and comments
        if trimmed.is_empty() || trimmed.starts_with('#') {
            continue;
        }

        // Find the first '=' to split key=value
        if let Some(eq_pos) = trimmed.find('=') {
            let key = trimmed[..eq_pos].trim().to_string();
            let mut value = trimmed[eq_pos + 1..].trim().to_string();

            // Handle quoted values (single or double quotes)
            if (value.starts_with('"') && value.ends_with('"'))
                || (value.starts_with('\'') && value.ends_with('\''))
            {
                value = value[1..value.len() - 1].to_string();
            }

            // Handle inline comments (only for unquoted values)
            if !trimmed[eq_pos + 1..].trim().starts_with('"')
                && !trimmed[eq_pos + 1..].trim().starts_with('\'')
            {
                if let Some(comment_pos) = value.find(" #") {
                    value = value[..comment_pos].trim().to_string();
                }
            }

            if !key.is_empty() {
                variables.push(json!({
                    "key": key,
                    "value": value,
                    "enabled": true
                }));
            }
        }
    }

    Ok(variables)
}

/// Stub command for testing
#[tauri::command]
pub fn greet(name: &str) -> String {
    format!("Hello, {}! Welcome to Nouto Desktop.", name)
}
