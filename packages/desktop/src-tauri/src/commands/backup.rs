// Backup & Restore commands - export/import all app state as a single .nouto-backup file
// Format is cross-compatible with the VS Code extension's backup format.

use crate::services::storage::StorageService;
use crate::services::history_storage::HistoryStorage;
use crate::services::runner_history::RunnerHistory;
use serde_json::{json, Value};
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_dialog::DialogExt;

/// Export all app state to a .nouto-backup file.
/// The `data` payload may contain `cookies` (from frontend localStorage) to include in the backup.
#[tauri::command]
pub async fn export_backup(data: Value, app: AppHandle) -> Result<(), String> {
    let storage = app.state::<StorageService>();
    let history = app.state::<HistoryStorage>();
    let runner_history = app.state::<RunnerHistory>();

    let mut warnings = vec![
        "Secrets (passwords, API keys, tokens) stored in your OS keychain are NOT included. You will need to re-enter them after restoring.".to_string(),
    ];

    // Read all data sources, skipping failures gracefully
    let collections = storage.load_collections().await.ok();
    let environments = storage.load_environments().await.ok();
    let settings = storage.load_settings().await.ok();
    let trash = storage.load_trash().await.ok();

    let history_entries = match history.load_all().await {
        Ok(entries) => Some(entries),
        Err(e) => {
            warnings.push(format!("Could not read history: {}", e));
            None
        }
    };

    let runner_entries = match runner_history.load_all().await {
        Ok(entries) => Some(entries),
        Err(e) => {
            warnings.push(format!("Could not read runner history: {}", e));
            None
        }
    };

    // Cookies come from the frontend payload (they live in localStorage)
    let cookies = data.get("cookies").cloned();

    // Build manifest
    let coll_count = collections.as_ref()
        .and_then(|v| v.as_array())
        .map(|a| a.len())
        .unwrap_or(0);

    let env_count = environments.as_ref()
        .and_then(|v| v.get("environments"))
        .and_then(|v| v.as_array())
        .map(|a| a.len())
        .unwrap_or(0);

    let (jar_count, cookie_count) = cookies.as_ref()
        .and_then(|v| v.get("jars"))
        .and_then(|v| v.as_array())
        .map(|jars| {
            let jc = jars.len();
            let cc: usize = jars.iter()
                .filter_map(|j| j.get("cookies").and_then(|c| c.as_array()))
                .map(|a| a.len())
                .sum();
            (jc, cc)
        })
        .unwrap_or((0, 0));

    let history_count = history_entries.as_ref().map(|e| e.len()).unwrap_or(0);
    let trash_count = trash.as_ref()
        .and_then(|v| v.as_array())
        .map(|a| a.len())
        .unwrap_or(0);
    let runner_count = runner_entries.as_ref().map(|e| e.len()).unwrap_or(0);

    let settings_included = settings.as_ref()
        .map(|v| v != &json!({}))
        .unwrap_or(false);

    let manifest = json!({
        "collections": { "included": collections.is_some(), "count": coll_count },
        "environments": { "included": environments.is_some(), "count": env_count },
        "cookies": { "included": cookies.is_some(), "jarCount": jar_count, "cookieCount": cookie_count },
        "history": { "included": history_entries.is_some(), "count": history_count },
        "drafts": { "included": false, "count": 0 },
        "trash": { "included": trash.is_some(), "count": trash_count },
        "runnerHistory": { "included": runner_entries.is_some(), "count": runner_count },
        "mocks": { "included": false, "routeCount": 0 },
        "settings": { "included": settings_included },
    });

    let app_version = app.config().version.clone().unwrap_or_else(|| "0.0.1".to_string());

    let mut backup = json!({
        "_format": "nouto-backup",
        "_version": "1.0",
        "_exportedAt": chrono::Utc::now().to_rfc3339(),
        "_appVersion": app_version,
        "_platform": "desktop",
        "manifest": manifest,
        "_warnings": warnings,
    });

    if let Some(c) = collections { backup["collections"] = c; }
    if let Some(e) = environments { backup["environments"] = e; }
    if let Some(c) = cookies { backup["cookies"] = c; }
    if let Some(ref h) = history_entries { backup["history"] = json!(h); }
    if let Some(t) = trash { backup["trash"] = t; }
    if let Some(ref r) = runner_entries { backup["runnerHistory"] = json!(r); }
    if settings_included {
        if let Some(s) = settings { backup["settings"] = s; }
    }

    let content = serde_json::to_string_pretty(&backup)
        .map_err(|e| format!("Failed to serialize backup: {}", e))?;

    // Show save dialog
    let default_name = format!("nouto-backup-{}.nouto-backup", chrono::Utc::now().format("%Y-%m-%d"));
    let file_path = app.dialog()
        .file()
        .set_file_name(&default_name)
        .add_filter("Nouto Backup", &["nouto-backup"])
        .blocking_save_file();

    if let Some(path) = file_path {
        if let Some(path) = path.as_path() {
            tokio::fs::write(path, &content).await
                .map_err(|e| format!("Failed to write backup file: {}", e))?;

            let size_kb = content.len() / 1024;
            let _ = app.emit("showNotification", json!({
                "data": {
                    "level": "info",
                    "message": format!("Backup exported ({} KB).", size_kb)
                }
            }));
        }
    }

    Ok(())
}

/// Import (restore) app state from a .nouto-backup file.
#[tauri::command]
pub async fn import_backup(app: AppHandle) -> Result<(), String> {
    // Show open dialog
    let file_path = app.dialog()
        .file()
        .add_filter("Nouto Backup", &["nouto-backup", "json"])
        .blocking_pick_file();

    let path = match file_path {
        Some(p) => match p.as_path() {
            Some(path) => path.to_path_buf(),
            None => return Ok(()),
        },
        None => return Ok(()),
    };

    let content = tokio::fs::read_to_string(&path).await
        .map_err(|e| format!("Failed to read backup file: {}", e))?;

    let backup: Value = serde_json::from_str(&content)
        .map_err(|_| "Invalid backup file: not valid JSON.".to_string())?;

    // Validate format
    if backup.get("_format").and_then(|v| v.as_str()) != Some("nouto-backup") {
        return Err("Invalid backup file: missing or incorrect format identifier.".to_string());
    }
    if backup.get("_version").and_then(|v| v.as_str()) != Some("1.0") {
        let ver = backup.get("_version").and_then(|v| v.as_str()).unwrap_or("unknown");
        return Err(format!("Unsupported backup version \"{}\". This version supports \"1.0\".", ver));
    }

    // Create pre-restore snapshot
    create_pre_restore_snapshot(&app).await;

    let storage = app.state::<StorageService>();
    let history = app.state::<HistoryStorage>();
    let runner_history = app.state::<RunnerHistory>();

    let mut restored: Vec<&str> = Vec::new();

    // Restore collections
    if let Some(collections) = backup.get("collections") {
        storage.save_collections(collections).await?;
        restored.push("Collections");
    }

    // Restore environments
    if let Some(environments) = backup.get("environments") {
        storage.save_environments(environments).await?;
        restored.push("Environments");
    }

    // Restore settings
    if let Some(settings) = backup.get("settings") {
        storage.save_settings(settings).await?;
        restored.push("Settings");
    }

    // Restore trash
    if let Some(trash) = backup.get("trash") {
        storage.save_trash(trash).await?;
        restored.push("Trash");
    }

    // Restore history
    if let Some(history_entries) = backup.get("history").and_then(|v| v.as_array()) {
        history.write_all(history_entries).await?;
        restored.push("History");
    }

    // Restore runner history
    if let Some(runner_entries) = backup.get("runnerHistory").and_then(|v| v.as_array()) {
        runner_history.write_all(runner_entries).await?;
        restored.push("Runner history");
    }

    // Restore cookies: emit to frontend (cookies live in localStorage)
    if let Some(cookies) = backup.get("cookies") {
        let _ = app.emit("restoreCookies", json!({ "data": cookies }));
        restored.push("Cookies");
    }

    // Reload all data in the frontend by emitting the same events as load_data
    let collections = storage.load_collections().await.unwrap_or(json!([]));
    let environments = storage.load_environments().await
        .unwrap_or(json!({ "environments": [], "activeId": null }));
    let settings = storage.load_settings().await.unwrap_or(json!({}));
    let trash = storage.load_trash().await.unwrap_or(json!([]));
    let history_all = history.load_all().await.unwrap_or_default();

    let initial_data = json!({
        "collections": collections,
        "environments": environments.get("environments").cloned().unwrap_or(json!([])),
        "history": history_all,
        "trash": trash,
        "projectPath": null
    });

    let _ = app.emit("initialData", json!({ "data": initial_data }));
    let _ = app.emit("loadSettings", json!({ "data": settings }));
    let _ = app.emit("loadEnvironments", json!({ "data": environments }));

    let summary = restored.join(", ");
    let _ = app.emit("showNotification", json!({
        "data": {
            "level": "info",
            "message": format!("Restored: {}. Re-enter any secret variables in Environments.", summary)
        }
    }));

    Ok(())
}

/// Create a pre-restore snapshot of current state (non-fatal on failure).
async fn create_pre_restore_snapshot(app: &AppHandle) {
    let storage = app.state::<StorageService>();
    let history = app.state::<HistoryStorage>();
    let runner_history = app.state::<RunnerHistory>();

    let collections = storage.load_collections().await.unwrap_or(json!([]));
    let environments = storage.load_environments().await
        .unwrap_or(json!({ "environments": [], "activeId": null }));
    let settings = storage.load_settings().await.unwrap_or(json!({}));
    let trash = storage.load_trash().await.unwrap_or(json!([]));
    let history_entries = history.load_all().await.unwrap_or_default();
    let runner_entries = runner_history.load_all().await.unwrap_or_default();

    let snapshot = json!({
        "_format": "nouto-backup",
        "_version": "1.0",
        "_exportedAt": chrono::Utc::now().to_rfc3339(),
        "_appVersion": "pre-restore-snapshot",
        "_platform": "desktop",
        "manifest": {},
        "collections": collections,
        "environments": environments,
        "settings": settings,
        "trash": trash,
        "history": history_entries,
        "runnerHistory": runner_entries,
        "_warnings": [],
    });

    if let Ok(content) = serde_json::to_string_pretty(&snapshot) {
        let path = storage.base_dir().join("pre-restore-snapshot.nouto-backup");
        let _ = tokio::fs::write(path, content).await;
    }
}
