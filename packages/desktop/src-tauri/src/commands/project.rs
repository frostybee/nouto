use crate::error::AppError;
use crate::services::storage::ProjectStorageService;
use serde_json::json;
use std::path::PathBuf;
use tauri::{Emitter, Manager};

use super::ProjectDirState;

/// Open a project directory via folder picker dialog
#[tauri::command]
pub async fn open_project_dir(
    app: tauri::AppHandle,
    project_dir: tauri::State<'_, ProjectDirState>,
    watcher_state: tauri::State<'_, crate::services::file_watcher::FileWatcherState>,
    last_write_ts: tauri::State<'_, crate::services::file_watcher::LastWriteTimestamp>,
) -> Result<(), AppError> {
    use tauri_plugin_dialog::DialogExt;

    let picked = app
        .dialog()
        .file()
        .blocking_pick_folder();

    if let Some(folder) = picked {
        if let Some(path) = folder.as_path() {
            let path_str = path.to_string_lossy().to_string();
            let path_buf = path.to_path_buf();

            {
                let mut state = project_dir.lock().await;
                *state = Some(path_buf.clone());
            }

            let _ = crate::services::file_watcher::start_watching(
                path_buf,
                app.clone(),
                watcher_state.inner().clone(),
                last_write_ts.inner().clone(),
            ).await;

            let app_data_dir = app.path().app_data_dir()
                .map_err(|e| AppError::Other(format!("Failed to resolve app data dir: {}", e)))?;
            let dir_name = path.file_name()
                .map(|n| n.to_string_lossy().to_string())
                .unwrap_or_else(|| path_str.clone());
            let projects = crate::services::storage::add_recent_project(&app_data_dir, &path_str, &dir_name).await
                .map_err(|e| AppError::Storage(e))?;
            let _ = app.emit("recentProjectsLoaded", json!({ "data": projects }));

            let _ = app.emit("projectOpened", json!({ "data": { "path": path_str } }));

            let _ = super::load_data(app.clone(), project_dir.clone()).await;

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
) -> Result<(), AppError> {
    {
        let mut state = project_dir.lock().await;
        *state = None;
    }

    crate::services::file_watcher::stop_watching(watcher_state.inner().clone()).await;

    let _ = app.emit("projectClosed", json!({ "data": {} }));

    let _ = super::load_data(app.clone(), project_dir.clone()).await;

    println!("[Nouto] Project directory closed");

    Ok(())
}

/// Link a .env file: opens a file dialog, parses key=value pairs, emits envFileVariablesUpdated
#[tauri::command]
pub async fn link_env_file(
    app: tauri::AppHandle,
    watcher_state: tauri::State<'_, crate::services::file_watcher::EnvFileWatcherState>,
) -> Result<(), AppError> {
    use tauri_plugin_dialog::DialogExt;

    let picked = app.dialog()
        .file()
        .add_filter("Environment Files", &["env"])
        .blocking_pick_file();

    if let Some(path_ref) = picked {
        if let Some(path) = path_ref.as_path() {
            let path_str = path.to_string_lossy().to_string();
            let variables = parse_env_file(path).await?;

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
) -> Result<(), AppError> {
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
pub async fn get_recent_projects(app: tauri::AppHandle) -> Result<(), AppError> {
    let app_data_dir = app.path().app_data_dir()
        .map_err(|e| AppError::Other(format!("Failed to resolve app data dir: {}", e)))?;
    let projects = crate::services::storage::load_recent_projects(&app_data_dir).await;
    app.emit("recentProjectsLoaded", json!({ "data": projects }))
        .map_err(|e| AppError::Other(format!("Failed to emit recentProjectsLoaded: {}", e)))?;
    Ok(())
}

/// Remove a recent project entry by path
#[tauri::command]
pub async fn remove_recent_project(data: serde_json::Value, app: tauri::AppHandle) -> Result<(), AppError> {
    let path = data["path"].as_str().unwrap_or("").to_string();
    if path.is_empty() {
        return Err(AppError::Other("No path provided".to_string()));
    }
    let app_data_dir = app.path().app_data_dir()
        .map_err(|e| AppError::Other(format!("Failed to resolve app data dir: {}", e)))?;
    let projects = crate::services::storage::remove_recent_project(&app_data_dir, &path).await
        .map_err(|e| AppError::Storage(e))?;
    app.emit("recentProjectsLoaded", json!({ "data": projects }))
        .map_err(|e| AppError::Other(format!("Failed to emit recentProjectsLoaded: {}", e)))?;
    Ok(())
}

/// Clear all recent projects
#[tauri::command]
pub async fn clear_recent_projects_cmd(app: tauri::AppHandle) -> Result<(), AppError> {
    let app_data_dir = app.path().app_data_dir()
        .map_err(|e| AppError::Other(format!("Failed to resolve app data dir: {}", e)))?;
    crate::services::storage::clear_recent_projects(&app_data_dir).await
        .map_err(|e| AppError::Storage(e))?;
    app.emit("recentProjectsLoaded", json!({ "data": [] }))
        .map_err(|e| AppError::Other(format!("Failed to emit recentProjectsLoaded: {}", e)))?;
    Ok(())
}

/// Open a specific project by path (used for "Open Recent" items)
#[tauri::command]
pub async fn open_recent_project(
    data: serde_json::Value,
    app: tauri::AppHandle,
    project_dir: tauri::State<'_, ProjectDirState>,
    watcher_state: tauri::State<'_, crate::services::file_watcher::FileWatcherState>,
    last_write_ts: tauri::State<'_, crate::services::file_watcher::LastWriteTimestamp>,
) -> Result<(), AppError> {
    let path_str = data["path"].as_str().unwrap_or("").to_string();
    if path_str.is_empty() {
        return Err(AppError::Other("No path provided".to_string()));
    }

    let path_buf = PathBuf::from(&path_str);
    if !path_buf.exists() {
        let app_data_dir = app.path().app_data_dir()
            .map_err(|e| AppError::Other(format!("Failed to resolve app data dir: {}", e)))?;
        let projects = crate::services::storage::remove_recent_project(&app_data_dir, &path_str).await
            .map_err(|e| AppError::Storage(e))?;
        app.emit("recentProjectsLoaded", json!({ "data": projects }))
            .map_err(|e| AppError::Other(format!("Failed to emit: {}", e)))?;
        return Err(AppError::Other(format!("Directory no longer exists: {}", path_str)));
    }

    {
        let mut state = project_dir.lock().await;
        *state = Some(path_buf.clone());
    }

    let _ = crate::services::file_watcher::start_watching(
        path_buf,
        app.clone(),
        watcher_state.inner().clone(),
        last_write_ts.inner().clone(),
    ).await;

    let app_data_dir = app.path().app_data_dir()
        .map_err(|e| AppError::Other(format!("Failed to resolve app data dir: {}", e)))?;
    let dir_name = PathBuf::from(&path_str)
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_else(|| path_str.clone());
    let projects = crate::services::storage::add_recent_project(&app_data_dir, &path_str, &dir_name).await
        .map_err(|e| AppError::Storage(e))?;
    app.emit("recentProjectsLoaded", json!({ "data": projects }))
        .map_err(|e| AppError::Other(format!("Failed to emit: {}", e)))?;

    let _ = app.emit("projectOpened", json!({ "data": { "path": path_str } }));

    let _ = super::load_data(app.clone(), project_dir.clone()).await;

    println!("[Nouto] Opened recent project: {}", path_str);
    Ok(())
}

/// Create a new project: opens folder picker, creates .nouto/ structure, sets project state
#[tauri::command]
pub async fn create_project(
    app: tauri::AppHandle,
    project_dir: tauri::State<'_, ProjectDirState>,
    watcher_state: tauri::State<'_, crate::services::file_watcher::FileWatcherState>,
    last_write_ts: tauri::State<'_, crate::services::file_watcher::LastWriteTimestamp>,
) -> Result<(), AppError> {
    use tauri_plugin_dialog::DialogExt;

    let picked = app
        .dialog()
        .file()
        .blocking_pick_folder();

    if let Some(folder) = picked {
        if let Some(path) = folder.as_path() {
            let path_str = path.to_string_lossy().to_string();
            let path_buf = path.to_path_buf();

            let project_storage = ProjectStorageService::new(path_buf.clone());
            project_storage.save_collections(&serde_json::json!([])).await
                .map_err(|e| AppError::Storage(e))?;
            project_storage.save_environments(&serde_json::json!({
                "environments": [],
                "activeId": null
            })).await
                .map_err(|e| AppError::Storage(e))?;
            project_storage.ensure_gitignore().await
                .map_err(|e| AppError::Storage(e))?;

            {
                let mut state = project_dir.lock().await;
                *state = Some(path_buf.clone());
            }

            let _ = crate::services::file_watcher::start_watching(
                path_buf,
                app.clone(),
                watcher_state.inner().clone(),
                last_write_ts.inner().clone(),
            ).await;

            let app_data_dir = app.path().app_data_dir()
                .map_err(|e| AppError::Other(format!("Failed to resolve app data dir: {}", e)))?;
            let dir_name = path.file_name()
                .map(|n| n.to_string_lossy().to_string())
                .unwrap_or_else(|| path_str.clone());
            let projects = crate::services::storage::add_recent_project(&app_data_dir, &path_str, &dir_name).await
                .map_err(|e| AppError::Storage(e))?;
            let _ = app.emit("recentProjectsLoaded", json!({ "data": projects }));

            let _ = app.emit("projectOpened", json!({ "data": { "path": path_str } }));

            let _ = super::load_data(app.clone(), project_dir.clone()).await;

            println!("[Nouto] Created new project: {}", path_str);
        }
    }

    Ok(())
}

// ── Workspace metadata (.nouto/workspace.json) ──────────────────────────

/// Read the workspace metadata for the currently open project.
#[tauri::command]
pub async fn get_workspace_meta(
    app: tauri::AppHandle,
    project_dir: tauri::State<'_, ProjectDirState>,
) -> Result<(), AppError> {
    let path = project_dir.lock().await.clone();
    let meta = match path {
        Some(dir) => ProjectStorageService::new(dir).load_workspace_meta().await
            .map_err(|e| AppError::Storage(e))?,
        None => None,
    };
    let _ = app.emit("workspaceMetaLoaded", json!({ "data": meta }));
    Ok(())
}

/// Write the workspace metadata for the currently open project.
#[tauri::command]
pub async fn update_workspace_meta(
    data: serde_json::Value,
    app: tauri::AppHandle,
    project_dir: tauri::State<'_, ProjectDirState>,
) -> Result<(), AppError> {
    let dir = project_dir.lock().await.clone()
        .ok_or_else(|| AppError::Other("No workspace is open".to_string()))?;
    let meta: crate::models::types::WorkspaceMeta = serde_json::from_value(data)?;
    ProjectStorageService::new(dir).save_workspace_meta(&meta).await
        .map_err(|e| AppError::Storage(e))?;
    let _ = app.emit("workspaceMetaLoaded", json!({ "data": meta }));
    Ok(())
}

/// Remove the workspace metadata file. Closes the project after deletion.
#[tauri::command]
pub async fn delete_workspace_meta(
    app: tauri::AppHandle,
    project_dir: tauri::State<'_, ProjectDirState>,
    watcher_state: tauri::State<'_, crate::services::file_watcher::FileWatcherState>,
) -> Result<(), AppError> {
    let dir = project_dir.lock().await.clone()
        .ok_or_else(|| AppError::Other("No workspace is open".to_string()))?;
    ProjectStorageService::new(dir).delete_workspace_meta().await
        .map_err(|e| AppError::Storage(e))?;
    close_project(app, project_dir, watcher_state).await
}

/// Parse a .env file into key=value pairs
async fn parse_env_file(path: &std::path::Path) -> Result<Vec<serde_json::Value>, AppError> {
    let content = tokio::fs::read_to_string(path).await
        .map_err(|e| AppError::Other(format!("Failed to read .env file: {}", e)))?;
    Ok(parse_env_content(&content))
}

/// Parse .env content string into variables array
pub fn parse_env_content(content: &str) -> Vec<serde_json::Value> {
    let mut variables = Vec::new();

    for line in content.lines() {
        let trimmed = line.trim();

        if trimmed.is_empty() || trimmed.starts_with('#') {
            continue;
        }

        if let Some(eq_pos) = trimmed.find('=') {
            let key = trimmed[..eq_pos].trim().to_string();
            let mut value = trimmed[eq_pos + 1..].trim().to_string();

            if (value.starts_with('"') && value.ends_with('"'))
                || (value.starts_with('\'') && value.ends_with('\''))
            {
                value = value[1..value.len() - 1].to_string();
            }

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

    variables
}

