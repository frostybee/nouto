// Tauri command handlers - bridge between UI and Rust services

pub mod updater;
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
pub mod fonts;
pub mod backup;

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

use crate::models::types::{Collection, Environment};
use crate::services::storage::{StorageService, ProjectStorageService};
use crate::services::history_storage::HistoryStorage;
use crate::services::secret_extraction;
use serde_json::json;
use std::path::PathBuf;
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};
use tauri::{Emitter, Manager};
use tokio::sync::Mutex;

/// Flag to ensure auto-reopen only happens on the first load_data call
static AUTO_REOPEN_DONE: AtomicBool = AtomicBool::new(false);

/// Managed state for the currently open project directory
pub type ProjectDirState = Arc<Mutex<Option<PathBuf>>>;

/// Ready command - frontend signals it's ready to receive data
#[tauri::command]
pub fn ready() -> Result<(), String> {
    println!("[Nouto] Frontend ready");
    Ok(())
}

/// Load initial data (collections, environments, history)
/// Checks ProjectDirState: if a project dir is set, loads from ProjectStorageService;
/// otherwise falls back to default StorageService.
/// On first load, auto-reopens the last project if one exists.
#[tauri::command]
pub async fn load_data(
    app: tauri::AppHandle,
    project_dir: tauri::State<'_, ProjectDirState>,
) -> Result<(), String> {
    // Auto-reopen last project on first load (when no project is set yet)
    if !AUTO_REOPEN_DONE.swap(true, Ordering::SeqCst) {
        // Check and set project dir with the lock held briefly, then release before async I/O
        let should_reopen = {
            let state = project_dir.lock().await;
            if state.is_none() {
                if let Ok(app_data_dir) = app.path().app_data_dir() {
                    crate::services::storage::get_last_project_path(&app_data_dir).await
                } else {
                    None
                }
            } else {
                None
            }
        }; // lock dropped here

        if let Some(last_path) = should_reopen {
            let path_buf = PathBuf::from(&last_path);
            if path_buf.exists() {
                {
                    let mut state = project_dir.lock().await;
                    *state = Some(path_buf.clone());
                } // lock dropped before async I/O
                let watcher_state = app.state::<crate::services::file_watcher::FileWatcherState>();
                let _ = crate::services::file_watcher::start_watching(
                    path_buf,
                    app.clone(),
                    watcher_state.inner().clone(),
                ).await;
                let _ = app.emit("projectOpened", json!({ "data": { "path": last_path } }));
                println!("[Nouto] Auto-reopened last project: {}", last_path);
            }
        }
    }

    let project_path = project_dir.lock().await.clone();

    let (collections_raw, environments_raw, project_path_str, meta_path, collections_path, environments_path) =
        if let Some(ref dir) = project_path {
            let project_storage = ProjectStorageService::new(dir.clone());
            let collections = match project_storage.load_collections().await {
                Ok(c) => c,
                Err(e) => {
                    eprintln!("[Nouto] Failed to load project collections (starting fresh): {}", e);
                    serde_json::json!([])
                }
            };
            let environments = project_storage.load_environments().await?;
            let path_str = dir.to_string_lossy().to_string();
            let meta = project_storage.meta_path();
            let env_path = project_storage.environments_path_public();
            // For project storage, collections are stored per-file, so we use a synthetic path
            let coll_path = dir.join(".nouto").join("collections.json");
            (collections, environments, Some(path_str), meta, coll_path, env_path)
        } else {
            let storage = app.state::<StorageService>();
            let collections = match storage.load_collections().await {
                Ok(c) => c,
                Err(e) => {
                    eprintln!("[Nouto] Failed to load collections (starting fresh): {}", e);
                    serde_json::json!([])
                }
            };
            let environments = storage.load_environments().await?;
            let meta = storage.meta_path();
            let coll_path = storage.collections_path_public();
            let env_path = storage.environments_path_public();
            (collections, environments, None, meta, coll_path, env_path)
        };

    // Run plaintext-to-keychain migration on first load (if storageVersion < 2)
    let _ = secret_extraction::migrate_plaintext_secrets(
        &collections_path,
        &environments_path,
        &meta_path,
    ).await;

    // Resolve secrets: replace refs with actual values from the OS keychain
    let collections = match serde_json::from_value::<Vec<Collection>>(collections_raw.clone()) {
        Ok(mut typed_collections) => {
            secret_extraction::resolve_auth_secrets(&mut typed_collections);
            serde_json::to_value(&typed_collections).unwrap_or(collections_raw)
        }
        Err(_) => collections_raw,
    };

    let environments = {
        let mut env_data = environments_raw.clone();
        if let Some(envs_value) = env_data.get("environments") {
            if let Ok(mut typed_envs) = serde_json::from_value::<Vec<Environment>>(envs_value.clone()) {
                secret_extraction::resolve_env_secrets(&mut typed_envs);
                env_data["environments"] = serde_json::to_value(&typed_envs)
                    .unwrap_or(envs_value.clone());
            }
        }
        env_data
    };

    // Settings always come from default storage (app-level, not per-project)
    let default_storage = app.state::<StorageService>();
    let settings = default_storage.load_settings().await?;

    let history_storage = app.state::<HistoryStorage>();
    let history = history_storage.load_all().await.unwrap_or_default();

    // Load trash (always from default storage, not per-project)
    let default_storage_for_trash = app.state::<StorageService>();
    let trash = default_storage_for_trash.load_trash().await.unwrap_or(json!([]));

    let initial_data = json!({
        "collections": collections,
        "environments": environments.get("environments").cloned().unwrap_or(json!([])),
        "history": history,
        "trash": trash,
        "projectPath": project_path_str
    });

    // Emit settings separately so the UI loads them
    if settings != json!({}) {
        let _ = app.emit("loadSettings", json!({ "data": settings }));
    }

    // Emit environment active ID separately via loadEnvironments
    let _ = app.emit("loadEnvironments", json!({ "data": environments }));

    app.emit("initialData", json!({ "data": initial_data }))
        .map_err(|e| format!("Failed to emit initialData: {}", e))?;

    Ok(())
}

/// Save collections to disk
/// Routes to ProjectStorageService if a project dir is open, otherwise default StorageService.
/// Extracts credential values and stores them in the OS keychain before writing to disk.
#[tauri::command]
pub async fn save_collections(
    data: serde_json::Value,
    app: tauri::AppHandle,
    project_dir: tauri::State<'_, ProjectDirState>,
) -> Result<(), String> {
    let project_path = project_dir.lock().await.clone();

    // Extract secrets from collections before saving to disk
    let sanitized_data = match serde_json::from_value::<Vec<Collection>>(data.clone()) {
        Ok(mut collections) => {
            let secrets = secret_extraction::extract_auth_secrets(&mut collections);
            if !secrets.is_empty() {
                let (stored, errors) = secret_extraction::store_secrets(&secrets);
                if !errors.is_empty() {
                    eprintln!("[Nouto] Warning: {} secret(s) failed to store in keychain", errors.len());
                    for err in &errors {
                        eprintln!("[Nouto]   {}", err);
                    }
                }
                if stored > 0 {
                    println!("[Nouto] Stored {} credential(s) in OS keychain", stored);
                }
            }
            // Re-serialize with refs (credential values cleared)
            serde_json::to_value(&collections).unwrap_or(data)
        }
        Err(_) => {
            // If deserialization fails, save as-is (graceful degradation)
            data
        }
    };

    if let Some(ref dir) = project_path {
        let project_storage = ProjectStorageService::new(dir.clone());
        project_storage.save_collections(&sanitized_data).await?;
        println!("[Nouto] Collections saved to project: {}", dir.display());
    } else {
        let storage = app.state::<StorageService>();
        storage.save_collections(&sanitized_data).await?;
        println!("[Nouto] Collections saved to disk");
    }

    app.emit("collectionsSaved", json!({ "success": true }))
        .map_err(|e| format!("Failed to emit collectionsSaved: {}", e))?;

    Ok(())
}

/// Save environments to disk
/// Routes to ProjectStorageService if a project dir is open, otherwise default StorageService.
/// Extracts secret variable values and stores them in the OS keychain before writing to disk.
#[tauri::command]
pub async fn save_environments(
    data: serde_json::Value,
    app: tauri::AppHandle,
    project_dir: tauri::State<'_, ProjectDirState>,
) -> Result<(), String> {
    let project_path = project_dir.lock().await.clone();

    // Extract secret environment variables before saving to disk
    let sanitized_data = if let Some(envs_value) = data.get("environments") {
        match serde_json::from_value::<Vec<Environment>>(envs_value.clone()) {
            Ok(mut environments) => {
                let secrets = secret_extraction::extract_env_secrets(&mut environments);
                if !secrets.is_empty() {
                    let (stored, errors) = secret_extraction::store_secrets(&secrets);
                    if !errors.is_empty() {
                        eprintln!("[Nouto] Warning: {} env secret(s) failed to store in keychain", errors.len());
                    }
                    if stored > 0 {
                        println!("[Nouto] Stored {} env secret(s) in OS keychain", stored);
                    }
                }
                // Rebuild the wrapper object with sanitized environments
                let mut sanitized = data.clone();
                sanitized["environments"] = serde_json::to_value(&environments)
                    .unwrap_or(envs_value.clone());
                sanitized
            }
            Err(_) => data.clone(),
        }
    } else {
        data.clone()
    };

    if let Some(ref dir) = project_path {
        let project_storage = ProjectStorageService::new(dir.clone());
        project_storage.save_environments(&sanitized_data).await?;
        println!("[Nouto] Environments saved to project: {}", dir.display());
    } else {
        let storage = app.state::<StorageService>();
        storage.save_environments(&sanitized_data).await?;
        println!("[Nouto] Environments saved to disk");
    }

    // Emit the original data (with actual values) back to the UI
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
            {
                let mut state = project_dir.lock().await;
                *state = Some(path_buf.clone());
            }

            // Start file watcher for the project directory
            let _ = crate::services::file_watcher::start_watching(
                path_buf,
                app.clone(),
                watcher_state.inner().clone(),
            ).await;

            // Add to recent projects
            let app_data_dir = app.path().app_data_dir()
                .map_err(|e| format!("Failed to resolve app data dir: {}", e))?;
            let dir_name = path.file_name()
                .map(|n| n.to_string_lossy().to_string())
                .unwrap_or_else(|| path_str.clone());
            let projects = crate::services::storage::add_recent_project(&app_data_dir, &path_str, &dir_name).await?;
            let _ = app.emit("recentProjectsLoaded", json!({ "data": projects }));

            // Emit event to frontend
            let _ = app.emit("projectOpened", json!({ "data": { "path": path_str } }));

            // Reload data from the new project directory
            let _ = load_data(app.clone(), project_dir.clone()).await;

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
    {
        let mut state = project_dir.lock().await;
        *state = None;
    }

    // Stop file watcher
    crate::services::file_watcher::stop_watching(watcher_state.inner().clone()).await;

    let _ = app.emit("projectClosed", json!({ "data": {} }));

    // Reload data from default storage
    let _ = load_data(app.clone(), project_dir.clone()).await;

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

/// Get the list of recent projects
#[tauri::command]
pub async fn get_recent_projects(app: tauri::AppHandle) -> Result<(), String> {
    let app_data_dir = app.path().app_data_dir()
        .map_err(|e| format!("Failed to resolve app data dir: {}", e))?;
    let projects = crate::services::storage::load_recent_projects(&app_data_dir).await;
    app.emit("recentProjectsLoaded", json!({ "data": projects }))
        .map_err(|e| format!("Failed to emit recentProjectsLoaded: {}", e))?;
    Ok(())
}

/// Remove a recent project entry by path
#[tauri::command]
pub async fn remove_recent_project(data: serde_json::Value, app: tauri::AppHandle) -> Result<(), String> {
    let path = data["path"].as_str().unwrap_or("").to_string();
    if path.is_empty() {
        return Err("No path provided".to_string());
    }
    let app_data_dir = app.path().app_data_dir()
        .map_err(|e| format!("Failed to resolve app data dir: {}", e))?;
    let projects = crate::services::storage::remove_recent_project(&app_data_dir, &path).await?;
    app.emit("recentProjectsLoaded", json!({ "data": projects }))
        .map_err(|e| format!("Failed to emit recentProjectsLoaded: {}", e))?;
    Ok(())
}

/// Clear all recent projects
#[tauri::command]
pub async fn clear_recent_projects_cmd(app: tauri::AppHandle) -> Result<(), String> {
    let app_data_dir = app.path().app_data_dir()
        .map_err(|e| format!("Failed to resolve app data dir: {}", e))?;
    crate::services::storage::clear_recent_projects(&app_data_dir).await?;
    app.emit("recentProjectsLoaded", json!({ "data": [] }))
        .map_err(|e| format!("Failed to emit recentProjectsLoaded: {}", e))?;
    Ok(())
}

/// Open a specific project by path (used for "Open Recent" items)
#[tauri::command]
pub async fn open_recent_project(
    data: serde_json::Value,
    app: tauri::AppHandle,
    project_dir: tauri::State<'_, ProjectDirState>,
    watcher_state: tauri::State<'_, crate::services::file_watcher::FileWatcherState>,
) -> Result<(), String> {
    let path_str = data["path"].as_str().unwrap_or("").to_string();
    if path_str.is_empty() {
        return Err("No path provided".to_string());
    }

    let path_buf = PathBuf::from(&path_str);
    if !path_buf.exists() {
        // Remove stale entry from recent projects
        let app_data_dir = app.path().app_data_dir()
            .map_err(|e| format!("Failed to resolve app data dir: {}", e))?;
        let projects = crate::services::storage::remove_recent_project(&app_data_dir, &path_str).await?;
        app.emit("recentProjectsLoaded", json!({ "data": projects }))
            .map_err(|e| format!("Failed to emit: {}", e))?;
        return Err(format!("Directory no longer exists: {}", path_str));
    }

    // Store in managed state
    {
        let mut state = project_dir.lock().await;
        *state = Some(path_buf.clone());
    }

    // Start file watcher
    let _ = crate::services::file_watcher::start_watching(
        path_buf,
        app.clone(),
        watcher_state.inner().clone(),
    ).await;

    // Update recent projects
    let app_data_dir = app.path().app_data_dir()
        .map_err(|e| format!("Failed to resolve app data dir: {}", e))?;
    let dir_name = PathBuf::from(&path_str)
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_else(|| path_str.clone());
    let projects = crate::services::storage::add_recent_project(&app_data_dir, &path_str, &dir_name).await?;
    app.emit("recentProjectsLoaded", json!({ "data": projects }))
        .map_err(|e| format!("Failed to emit: {}", e))?;

    // Emit project opened event
    let _ = app.emit("projectOpened", json!({ "data": { "path": path_str } }));

    // Reload data from the new project directory
    let _ = load_data(app.clone(), project_dir.clone()).await;

    println!("[Nouto] Opened recent project: {}", path_str);
    Ok(())
}

/// Create a new project: opens folder picker, creates .nouto/ structure, sets project state
#[tauri::command]
pub async fn create_project(
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

            // Create .nouto/ project structure
            let project_storage = ProjectStorageService::new(path_buf.clone());
            project_storage.save_collections(&serde_json::json!([])).await?;
            project_storage.save_environments(&serde_json::json!({
                "environments": [],
                "activeId": null
            })).await?;
            project_storage.ensure_gitignore().await?;

            // Store in managed state
            {
                let mut state = project_dir.lock().await;
                *state = Some(path_buf.clone());
            }

            // Start file watcher
            let _ = crate::services::file_watcher::start_watching(
                path_buf,
                app.clone(),
                watcher_state.inner().clone(),
            ).await;

            // Add to recent projects
            let app_data_dir = app.path().app_data_dir()
                .map_err(|e| format!("Failed to resolve app data dir: {}", e))?;
            let dir_name = path.file_name()
                .map(|n| n.to_string_lossy().to_string())
                .unwrap_or_else(|| path_str.clone());
            let projects = crate::services::storage::add_recent_project(&app_data_dir, &path_str, &dir_name).await?;
            let _ = app.emit("recentProjectsLoaded", json!({ "data": projects }));

            // Emit project opened event
            let _ = app.emit("projectOpened", json!({ "data": { "path": path_str } }));

            // Reload data from the new project directory
            let _ = load_data(app.clone(), project_dir.clone()).await;

            println!("[Nouto] Created new project: {}", path_str);
        }
    }

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

/// Save trash items to disk
#[tauri::command]
pub async fn save_trash(data: serde_json::Value, app: tauri::AppHandle) -> Result<(), String> {
    let storage = app.state::<StorageService>();
    storage.save_trash(&data).await?;
    Ok(())
}

/// Stub command for testing
#[tauri::command]
pub fn greet(name: &str) -> String {
    format!("Hello, {}! Welcome to Nouto Desktop.", name)
}
