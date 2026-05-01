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
pub mod project;

// Re-export HTTP commands
pub use http::{send_request, cancel_request, pick_ssl_file, init_request_registry};
pub use crate::models::http::RequestRegistry;

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

use crate::error::AppError;
use crate::models::types::{Collection, Environment};
use crate::services::storage::{StorageService, ProjectStorageService};
use crate::services::secret_extraction;
use serde_json::json;
use std::path::PathBuf;
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use tauri::{Emitter, Manager};
use tokio::sync::Mutex;

/// Flag to ensure auto-reopen only happens on the first load_data call
static AUTO_REOPEN_DONE: AtomicBool = AtomicBool::new(false);

/// Generation counter for load_data calls — used to discard stale secretsResolved events
static LOAD_GENERATION: AtomicU64 = AtomicU64::new(0);

/// Managed state for the currently open project directory
pub type ProjectDirState = Arc<Mutex<Option<PathBuf>>>;

/// Ready command - frontend signals it's ready to receive data
#[tauri::command]
pub fn ready() -> Result<(), AppError> {
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
) -> Result<(), AppError> {
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
                let last_write_ts = app.state::<crate::services::file_watcher::LastWriteTimestamp>();
                let _ = crate::services::file_watcher::start_watching(
                    path_buf,
                    app.clone(),
                    watcher_state.inner().clone(),
                    last_write_ts.inner().clone(),
                ).await;
                let _ = app.emit("projectOpened", json!({ "data": { "path": last_path } }));
                println!("[Nouto] Auto-reopened last project: {}", last_path);
            }
        }
    }

    let project_path = project_dir.lock().await.clone();

    // Load workspace metadata if a project is open
    let workspace_meta = if let Some(ref dir) = project_path {
        ProjectStorageService::new(dir.clone()).load_workspace_meta().await.ok().flatten()
    } else {
        None
    };

    // Always load globalVariables from global storage (they feed the Global Variables tab)
    let global_storage_for_vars = app.state::<StorageService>();
    let global_envs_for_vars = global_storage_for_vars.load_environments().await.map_err(AppError::Storage)?;
    let global_variables = global_envs_for_vars.get("globalVariables").cloned().unwrap_or(json!([]));

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

            // Load workspace environments and tag with scope
            let mut ws_envs = project_storage.load_environments().await.map_err(AppError::Storage)?;
            if let Some(envs_arr) = ws_envs.get_mut("environments").and_then(|v| v.as_array_mut()) {
                for env in envs_arr.iter_mut() {
                    env.as_object_mut().map(|o| o.insert("scope".to_string(), json!("workspace")));
                }
            }
            // Inject globalVariables from global storage into workspace env data
            ws_envs.as_object_mut().map(|o| o.insert("globalVariables".to_string(), global_variables.clone()));

            let path_str = dir.to_string_lossy().to_string();
            let meta = project_storage.meta_path();
            let env_path = project_storage.environments_path_public();
            let coll_path = dir.join(".nouto").join("collections.json");
            (collections, ws_envs, Some(path_str), meta, coll_path, env_path)
        } else {
            let storage = app.state::<StorageService>();
            let collections = match storage.load_collections().await {
                Ok(c) => c,
                Err(e) => {
                    eprintln!("[Nouto] Failed to load collections (starting fresh): {}", e);
                    serde_json::json!([])
                }
            };
            let mut environments = storage.load_environments().await.map_err(AppError::Storage)?;
            // Tag all environments with scope="global" when no project is open
            if let Some(envs_arr) = environments.get_mut("environments").and_then(|v| v.as_array_mut()) {
                for env in envs_arr.iter_mut() {
                    env.as_object_mut().map(|o| o.insert("scope".to_string(), json!("global")));
                }
            }
            let meta = storage.meta_path();
            let coll_path = storage.collections_path_public();
            let env_path = storage.environments_path_public();
            (collections, environments, None, meta, coll_path, env_path)
        };

    // Load settings + trash in parallel (both from default storage)
    let default_storage = app.state::<StorageService>();
    let default_storage2 = app.state::<StorageService>();
    let (settings_result, trash_result) = tokio::join!(
        default_storage.load_settings(),
        default_storage2.load_trash(),
    );
    let settings = settings_result.map_err(AppError::Storage)?;
    let trash = trash_result.unwrap_or(json!([]));

    // Clone data for the background secret resolution before emitting
    let collections_raw_bg = collections_raw.clone();
    let environments_raw_bg = environments_raw.clone();

    // Increment generation counter to invalidate any in-flight secretsResolved from prior calls
    let gen = LOAD_GENERATION.fetch_add(1, Ordering::Relaxed) + 1;

    // Emit initial data immediately (without secret resolution for fast startup)
    let initial_data = json!({
        "collections": collections_raw,
        "environments": environments_raw.get("environments").cloned().unwrap_or(json!([])),
        "trash": trash,
        "projectPath": project_path_str,
        "workspaceMeta": workspace_meta,
        "generation": gen,
    });

    if settings != json!({}) {
        let _ = app.emit("loadSettings", json!({ "data": settings }));
    }
    let _ = app.emit("loadEnvironments", json!({ "data": environments_raw }));
    let _ = app.emit("workspaceMetaLoaded", json!({ "data": workspace_meta }));

    app.emit("initialData", json!({ "data": initial_data }))
        .map_err(|e| AppError::Other(format!("Failed to emit initialData: {}", e)))?;

    // Resolve secrets in background (keychain access can be slow)
    let app_clone = app.clone();
    tokio::spawn(async move {
        // Run plaintext-to-keychain migration (if storageVersion < 2)
        let _ = secret_extraction::migrate_plaintext_secrets(
            &collections_path,
            &environments_path,
            &meta_path,
        ).await;

        // Resolve collection auth secrets from OS keychain
        let resolved_collections = match serde_json::from_value::<Vec<Collection>>(collections_raw_bg.clone()) {
            Ok(mut typed_collections) => {
                secret_extraction::resolve_auth_secrets(&mut typed_collections);
                serde_json::to_value(&typed_collections).unwrap_or(collections_raw_bg)
            }
            Err(_) => collections_raw_bg,
        };

        // Resolve environment secrets from OS keychain
        let resolved_environments = {
            let mut env_data = environments_raw_bg.clone();
            if let Some(envs_value) = env_data.get("environments") {
                if let Ok(mut typed_envs) = serde_json::from_value::<Vec<Environment>>(envs_value.clone()) {
                    secret_extraction::resolve_env_secrets(&mut typed_envs);
                    env_data["environments"] = serde_json::to_value(&typed_envs)
                        .unwrap_or(envs_value.clone());
                }
            }
            env_data
        };

        // Emit resolved data as updates (include generation so frontend can discard stale results)
        let _ = app_clone.emit("secretsResolved", json!({
            "data": {
                "collections": resolved_collections,
                "environments": resolved_environments,
                "generation": gen
            }
        }));
    });

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
    last_write: tauri::State<'_, crate::services::file_watcher::LastWriteTimestamp>,
) -> Result<(), AppError> {
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
        // Mark timestamp before writing so the file watcher ignores our own changes
        let now_ms = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis() as u64;
        last_write.store(now_ms, std::sync::atomic::Ordering::Relaxed);

        let project_storage = ProjectStorageService::new(dir.clone());
        project_storage.save_collections(&sanitized_data).await.map_err(AppError::Storage)?;
        println!("[Nouto] Collections saved to project: {}", dir.display());
    } else {
        let storage = app.state::<StorageService>();
        storage.save_collections(&sanitized_data).await.map_err(AppError::Storage)?;
        println!("[Nouto] Collections saved to disk");
    }

    app.emit("collectionsSaved", json!({ "success": true }))
        .map_err(|e| AppError::Other(format!("Failed to emit collectionsSaved: {}", e)))?;

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
    last_write: tauri::State<'_, crate::services::file_watcher::LastWriteTimestamp>,
) -> Result<(), AppError> {
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

    // Strip scope field before persisting (it's runtime metadata)
    let mut save_data = sanitized_data.clone();
    if let Some(envs_arr) = save_data.get_mut("environments").and_then(|v| v.as_array_mut()) {
        for env in envs_arr.iter_mut() {
            env.as_object_mut().map(|o| o.remove("scope"));
        }
    }

    // Always save globalVariables to global storage
    let global_vars = save_data.get("globalVariables").cloned().unwrap_or(json!([]));
    {
        let storage = app.state::<StorageService>();
        let mut global_env_data = storage.load_environments().await.unwrap_or(json!({}));
        global_env_data.as_object_mut().map(|o| o.insert("globalVariables".to_string(), global_vars));
        storage.save_environments(&global_env_data).await.map_err(AppError::Storage)?;
    }

    if let Some(ref dir) = project_path {
        let now_ms = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis() as u64;
        last_write.store(now_ms, std::sync::atomic::Ordering::Relaxed);

        // Save environments (without globalVariables) to workspace
        let mut ws_data = save_data.clone();
        ws_data.as_object_mut().map(|o| o.remove("globalVariables"));
        let project_storage = ProjectStorageService::new(dir.clone());
        project_storage.save_environments(&ws_data).await.map_err(AppError::Storage)?;
        println!("[Nouto] Environments saved to project: {}", dir.display());
    } else {
        let storage = app.state::<StorageService>();
        storage.save_environments(&save_data).await.map_err(AppError::Storage)?;
        println!("[Nouto] Environments saved to disk");
    }

    // Emit the original data (with actual values) back to the UI
    app.emit("loadEnvironments", json!({ "data": data }))
        .map_err(|e| AppError::Other(format!("Failed to emit loadEnvironments: {}", e)))?;

    Ok(())
}

/// Update settings (save to disk and emit back)
#[tauri::command]
pub async fn update_settings(data: serde_json::Value, app: tauri::AppHandle) -> Result<(), AppError> {
    let storage = app.state::<StorageService>();
    storage.save_settings(&data).await.map_err(AppError::Storage)?;
    println!("[Nouto] Settings saved to disk");

    app.emit("loadSettings", json!({ "data": data }))
        .map_err(|e| AppError::Other(format!("Failed to emit loadSettings: {}", e)))?;

    Ok(())
}

/// Open a URL in the system's default browser
#[tauri::command]
pub async fn open_external(data: serde_json::Value, app: tauri::AppHandle) -> Result<(), AppError> {
    use tauri_plugin_opener::OpenerExt;
    let url = data["url"].as_str().unwrap_or("").to_string();
    if url.is_empty() {
        return Err(AppError::Other("No URL provided".to_string()));
    }
    app.opener().open_url(&url, None::<&str>)
        .map_err(|e| AppError::Other(format!("Failed to open URL: {}", e)))?;
    Ok(())
}

/// Save trash items to disk
#[tauri::command]
pub async fn save_trash(data: serde_json::Value, app: tauri::AppHandle) -> Result<(), AppError> {
    let storage = app.state::<StorageService>();
    storage.save_trash(&data).await.map_err(AppError::Storage)?;
    Ok(())
}

pub use project::{
    open_project_dir, close_project, get_recent_projects, remove_recent_project,
    clear_recent_projects_cmd, open_recent_project, create_project,
    get_workspace_meta, update_workspace_meta, delete_workspace_meta,
    link_env_file, unlink_env_file, parse_env_content,
};
