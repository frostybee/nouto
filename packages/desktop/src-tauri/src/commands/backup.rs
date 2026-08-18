// Backup & Restore commands - export/import all app state as a .zip archive.
// The importer also reads the old .nouto-backup JSON format for backward compatibility.

use crate::commands::ProjectDirState;
use crate::error::AppError;
use crate::services::history_storage::HistoryStorage;
use crate::services::runner_history::RunnerHistory;
use crate::services::storage::ProjectStorageService;
use crate::services::storage::StorageService;
use serde_json::{json, Value};
use std::io::{Cursor, Read, Write};
use std::path::PathBuf;
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_dialog::DialogExt;
use zip::{write::SimpleFileOptions, CompressionMethod, ZipWriter};

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

/// Export all app state to a .zip archive.
/// The `data` payload may contain `cookies` (from frontend localStorage) to include in the backup.
#[tauri::command]
pub async fn export_backup(
    data: Option<Value>,
    app: AppHandle,
    project_dir: tauri::State<'_, ProjectDirState>,
) -> Result<(), AppError> {
    let storage = app.state::<StorageService>();
    let history = app.state::<HistoryStorage>();
    let runner_history = app.state::<RunnerHistory>();
    let active_project = active_project_path(&project_dir).await;

    let mut warnings = vec![
        "Secrets (passwords, API keys, tokens) stored in your OS keychain are NOT included. You will need to re-enter them after restoring.".to_string(),
        "Cookies may include session tokens and are included when cookie data is present in the export payload.".to_string(),
    ];

    // Read all data sources, skipping failures gracefully
    let (collections, environments) =
        load_backup_collections_and_environments(&storage, active_project.as_ref()).await;
    let settings = storage.load_settings().await.unwrap_or(json!({}));
    let trash = storage.load_trash().await.unwrap_or(json!([]));

    let history_entries = match history.load_all().await {
        Ok(entries) => entries,
        Err(e) => {
            warnings.push(format!("Could not read history: {}", e));
            vec![]
        }
    };

    let runner_entries = match runner_history.load_all().await {
        Ok(entries) => entries,
        Err(e) => {
            warnings.push(format!("Could not read runner history: {}", e));
            vec![]
        }
    };

    // Cookies come from the frontend payload (they live in localStorage)
    let cookies = data
        .as_ref()
        .and_then(|d| d.get("cookies"))
        .cloned()
        .unwrap_or(json!(null));

    // Build manifest
    let coll_count = collections.as_array().map(|a| a.len()).unwrap_or(0);
    let env_count = environments
        .get("environments")
        .and_then(|v| v.as_array())
        .map(|a| a.len())
        .unwrap_or(0);
    let (jar_count, cookie_count) = cookies
        .get("jars")
        .and_then(|v| v.as_array())
        .map(|jars| {
            let jc = jars.len();
            let cc: usize = jars
                .iter()
                .filter_map(|j| j.get("cookies").and_then(|c| c.as_array()))
                .map(|a| a.len())
                .sum();
            (jc, cc)
        })
        .unwrap_or((0, 0));

    let settings_included = settings != json!({});

    let app_version = app
        .config()
        .version
        .clone()
        .unwrap_or_else(|| "0.0.1".to_string());
    let exported_at = chrono::Utc::now().to_rfc3339();

    let manifest = json!({
        "_format": "nouto-backup",
        "_version": "2.0",
        "_exportedAt": exported_at,
        "_appVersion": app_version,
        "_platform": "desktop",
        "_warnings": warnings,
        "collections": { "count": coll_count },
        "environments": { "count": env_count },
        "cookies": { "jarCount": jar_count, "cookieCount": cookie_count },
        "history": { "count": history_entries.len() },
        "runnerHistory": { "count": runner_entries.len() },
        "trash": { "count": collections.as_array().map(|_| 0usize).unwrap_or(0) },
        "settings": { "included": settings_included },
    });

    let result: Result<(), AppError> = async {
        // Build ZIP in memory
        let zip_bytes = build_zip(
            &manifest,
            &collections,
            &environments,
            &settings,
            &trash,
            &history_entries,
            &runner_entries,
            &cookies,
        )
        .map_err(|e| AppError::Other(format!("Failed to create backup archive: {}", e)))?;

        // Show save dialog
        let default_name = format!("nouto-backup-{}.zip", chrono::Utc::now().format("%Y-%m-%d"));
        let file_path = app
            .dialog()
            .file()
            .set_file_name(&default_name)
            .add_filter("Nouto Backup", &["zip"])
            .blocking_save_file();

        if let Some(path) = file_path {
            if let Some(path) = path.as_path() {
                tokio::fs::write(path, &zip_bytes)
                    .await
                    .map_err(|e| AppError::Other(format!("Failed to write backup file: {}", e)))?;

                let size_kb = zip_bytes.len() / 1024;
                let _ = app.emit(
                    "showNotification",
                    json!({
                        "data": {
                            "level": "info",
                            "message": format!("Backup exported ({} KB).", size_kb)
                        }
                    }),
                );
            }
        }

        Ok(())
    }
    .await;

    let _ = app.emit("backupExportDone", json!({ "data": {} }));
    result
}

/// Build a ZIP archive in memory containing all backup data.
fn build_zip(
    manifest: &Value,
    collections: &Value,
    environments: &Value,
    settings: &Value,
    trash: &Value,
    history_entries: &[Value],
    runner_entries: &[Value],
    cookies: &Value,
) -> Result<Vec<u8>, AppError> {
    let buf = Cursor::new(Vec::new());
    let mut zip = ZipWriter::new(buf);
    let opts = SimpleFileOptions::default().compression_method(CompressionMethod::Deflated);

    // manifest.json
    zip.start_file("manifest.json", opts)
        .map_err(|e| AppError::Other(e.to_string()))?;
    zip.write_all(serde_json::to_string_pretty(manifest)?.as_bytes())?;

    // collections.json
    zip.start_file("collections.json", opts)
        .map_err(|e| AppError::Other(e.to_string()))?;
    zip.write_all(serde_json::to_string_pretty(collections)?.as_bytes())?;

    // environments.json
    zip.start_file("environments.json", opts)
        .map_err(|e| AppError::Other(e.to_string()))?;
    zip.write_all(serde_json::to_string_pretty(environments)?.as_bytes())?;

    // settings.json
    zip.start_file("settings.json", opts)
        .map_err(|e| AppError::Other(e.to_string()))?;
    zip.write_all(serde_json::to_string_pretty(settings)?.as_bytes())?;

    // trash.json
    zip.start_file("trash.json", opts)
        .map_err(|e| AppError::Other(e.to_string()))?;
    zip.write_all(serde_json::to_string_pretty(trash)?.as_bytes())?;

    // history.jsonl — one JSON object per line
    zip.start_file("history.jsonl", opts)
        .map_err(|e| AppError::Other(e.to_string()))?;
    let history_jsonl: String = history_entries
        .iter()
        .filter_map(|e| serde_json::to_string(e).ok())
        .collect::<Vec<_>>()
        .join("\n");
    zip.write_all(history_jsonl.as_bytes())?;

    // runner-history.jsonl
    zip.start_file("runner-history.jsonl", opts)
        .map_err(|e| AppError::Other(e.to_string()))?;
    let runner_jsonl: String = runner_entries
        .iter()
        .filter_map(|e| serde_json::to_string(e).ok())
        .collect::<Vec<_>>()
        .join("\n");
    zip.write_all(runner_jsonl.as_bytes())?;

    // cookies.json (may be null if no cookies data from frontend)
    zip.start_file("cookies.json", opts)
        .map_err(|e| AppError::Other(e.to_string()))?;
    zip.write_all(serde_json::to_string_pretty(cookies)?.as_bytes())?;

    let result = zip.finish().map_err(|e| AppError::Other(e.to_string()))?;
    Ok(result.into_inner())
}

// ---------------------------------------------------------------------------
// Import
// ---------------------------------------------------------------------------

/// Import (restore) app state from a backup file.
/// Supports .zip (new format) and .nouto-backup/.json (old JSON format).
#[tauri::command]
pub async fn import_backup(
    app: AppHandle,
    project_dir: tauri::State<'_, ProjectDirState>,
) -> Result<(), AppError> {
    let file_path = app
        .dialog()
        .file()
        .add_filter("Nouto Backup", &["zip", "nouto-backup", "json"])
        .blocking_pick_file();

    let path = match file_path {
        Some(p) => match p.as_path() {
            Some(path) => path.to_path_buf(),
            None => {
                let _ = app.emit("backupImportDone", json!({ "data": {} }));
                return Ok(());
            }
        },
        None => {
            let _ = app.emit("backupImportDone", json!({ "data": {} }));
            return Ok(());
        }
    };

    // Create pre-restore snapshot before touching anything
    let active_project = active_project_path(&project_dir).await;
    create_pre_restore_snapshot(&app, active_project.as_ref()).await;

    // Detect format: try ZIP first, fall back to JSON
    let result: Result<(), AppError> = async {
        let raw_bytes = tokio::fs::read(&path).await
            .map_err(|e| AppError::Other(format!("Failed to read backup file: {}", e)))?;

        let restored = if is_zip(&raw_bytes) {
            import_from_zip(&app, active_project.clone(), raw_bytes).await?
        } else {
            import_from_json(&app, active_project.clone(), raw_bytes).await?
        };

        let summary = restored.join(", ");
        let _ = app.emit("showNotification", json!({
            "data": {
                "level": "info",
                "message": format!("Restored: {}. Re-enter any secret variables in Environments.", summary)
            }
        }));

        Ok(())
    }.await;

    let _ = app.emit("backupImportDone", json!({ "data": {} }));
    result
}

/// Returns true if the bytes look like a ZIP file (PK magic bytes).
fn is_zip(bytes: &[u8]) -> bool {
    bytes.len() >= 4 && bytes[0] == 0x50 && bytes[1] == 0x4B
}

/// Import from the new .zip format.
async fn import_from_zip(
    app: &AppHandle,
    active_project: Option<PathBuf>,
    bytes: Vec<u8>,
) -> Result<Vec<&'static str>, AppError> {
    let cursor = Cursor::new(bytes);
    let mut archive = zip::ZipArchive::new(cursor)
        .map_err(|e| AppError::Other(format!("Failed to open backup archive: {}", e)))?;

    let collections = read_zip_json(&mut archive, "collections.json");
    let environments = read_zip_json(&mut archive, "environments.json");
    let settings = read_zip_json(&mut archive, "settings.json");
    let trash = read_zip_json(&mut archive, "trash.json");
    let history = read_zip_jsonl(&mut archive, "history.jsonl");
    let runner_history = read_zip_jsonl(&mut archive, "runner-history.jsonl");
    let cookies = read_zip_json(&mut archive, "cookies.json");

    restore_data(
        app,
        active_project,
        collections,
        environments,
        settings,
        trash,
        history,
        runner_history,
        cookies,
    )
    .await
}

/// Import from the old .nouto-backup JSON format (v1.0).
async fn import_from_json(
    app: &AppHandle,
    active_project: Option<PathBuf>,
    bytes: Vec<u8>,
) -> Result<Vec<&'static str>, AppError> {
    let content = String::from_utf8(bytes)
        .map_err(|_| AppError::Other("Invalid backup file: not valid UTF-8.".to_string()))?;

    let backup: Value = serde_json::from_str(&content)
        .map_err(|_| AppError::Other("Invalid backup file: not valid JSON.".to_string()))?;

    if backup.get("_format").and_then(|v| v.as_str()) != Some("nouto-backup") {
        return Err(AppError::Other(
            "Invalid backup file: missing or incorrect format identifier.".to_string(),
        ));
    }

    let collections = backup.get("collections").cloned();
    let environments = backup.get("environments").cloned();
    let settings = backup.get("settings").cloned();
    let trash = backup.get("trash").cloned();
    let history = backup
        .get("history")
        .and_then(|v| v.as_array())
        .map(|a| a.to_vec());
    let runner_history = backup
        .get("runnerHistory")
        .and_then(|v| v.as_array())
        .map(|a| a.to_vec());
    let cookies = backup.get("cookies").cloned();

    restore_data(
        app,
        active_project,
        collections,
        environments,
        settings,
        trash,
        history,
        runner_history,
        cookies,
    )
    .await
}

/// Read a JSON entry from a ZIP archive by name. Returns None if the entry is missing or invalid.
fn read_zip_json(archive: &mut zip::ZipArchive<Cursor<Vec<u8>>>, name: &str) -> Option<Value> {
    let mut entry = archive.by_name(name).ok()?;
    let mut content = String::new();
    entry.read_to_string(&mut content).ok()?;
    let value: Value = serde_json::from_str(&content).ok()?;
    // Treat explicit JSON null as absent
    if value.is_null() {
        None
    } else {
        Some(value)
    }
}

/// Read a JSONL entry from a ZIP archive. Each non-empty line is parsed as a JSON object.
fn read_zip_jsonl(
    archive: &mut zip::ZipArchive<Cursor<Vec<u8>>>,
    name: &str,
) -> Option<Vec<Value>> {
    let mut entry = archive.by_name(name).ok()?;
    let mut content = String::new();
    entry.read_to_string(&mut content).ok()?;
    let entries: Vec<Value> = content
        .lines()
        .filter(|l| !l.trim().is_empty())
        .filter_map(|l| serde_json::from_str(l).ok())
        .collect();
    Some(entries)
}

/// Apply restored data to storage services and emit reload events to the frontend.
async fn restore_data(
    app: &AppHandle,
    active_project: Option<PathBuf>,
    collections: Option<Value>,
    environments: Option<Value>,
    settings: Option<Value>,
    trash: Option<Value>,
    history: Option<Vec<Value>>,
    runner_history: Option<Vec<Value>>,
    cookies: Option<Value>,
) -> Result<Vec<&'static str>, AppError> {
    let storage = app.state::<StorageService>();
    let history_svc = app.state::<HistoryStorage>();
    let runner_svc = app.state::<RunnerHistory>();

    let mut restored: Vec<&str> = Vec::new();

    if let Some(c) = &collections {
        save_restored_collections(&storage, active_project.as_ref(), c).await?;
        restored.push("Collections");
    }
    if let Some(e) = &environments {
        save_restored_environments(&storage, active_project.as_ref(), e).await?;
        restored.push("Environments");
    }
    if let Some(s) = &settings {
        storage.save_settings(s).await.map_err(AppError::Storage)?;
        restored.push("Settings");
    }
    if let Some(t) = &trash {
        storage.save_trash(t).await.map_err(AppError::Storage)?;
        restored.push("Trash");
    }
    if let Some(h) = &history {
        let as_values: Vec<Value> = h.to_vec();
        history_svc
            .write_all(&as_values)
            .await
            .map_err(AppError::Storage)?;
        restored.push("History");
    }
    if let Some(r) = &runner_history {
        let as_values: Vec<Value> = r.to_vec();
        runner_svc
            .write_all(&as_values)
            .await
            .map_err(AppError::Storage)?;
        restored.push("Runner history");
    }
    if let Some(c) = &cookies {
        let _ = app.emit("restoreCookies", json!({ "data": c }));
        restored.push("Cookies");
    }

    // Reload all data in the frontend
    let (coll, envs) =
        load_backup_collections_and_environments(&storage, active_project.as_ref()).await;
    let sett = storage.load_settings().await.unwrap_or(json!({}));
    let tr = storage.load_trash().await.unwrap_or(json!([]));
    let hist = history_svc.load_all().await.unwrap_or_default();

    let initial_data = json!({
        "collections": coll,
        "environments": envs.get("environments").cloned().unwrap_or(json!([])),
        "history": hist,
        "trash": tr,
        "projectPath": active_project.as_ref().map(|path| path.to_string_lossy().to_string())
    });

    let _ = app.emit("initialData", json!({ "data": initial_data }));
    let _ = app.emit("loadSettings", json!({ "data": sett }));
    let _ = app.emit("loadEnvironments", json!({ "data": envs }));

    Ok(restored)
}

async fn active_project_path(project_dir: &tauri::State<'_, ProjectDirState>) -> Option<PathBuf> {
    project_dir.lock().await.clone()
}

async fn load_backup_collections_and_environments(
    storage: &StorageService,
    active_project: Option<&PathBuf>,
) -> (Value, Value) {
    if let Some(project_dir) = active_project {
        let project_storage = ProjectStorageService::new(project_dir.clone());
        let collections = project_storage
            .load_collections()
            .await
            .unwrap_or(json!([]));
        let mut environments = project_storage
            .load_environments()
            .await
            .unwrap_or(json!({ "environments": [], "activeId": null }));

        let global_envs = storage
            .load_environments()
            .await
            .unwrap_or(json!({ "environments": [], "activeId": null }));
        let global_variables = global_envs
            .get("globalVariables")
            .cloned()
            .unwrap_or(json!([]));
        environments
            .as_object_mut()
            .map(|o| o.insert("globalVariables".to_string(), global_variables));

        (collections, environments)
    } else {
        let collections = storage.load_collections().await.unwrap_or(json!([]));
        let environments = storage
            .load_environments()
            .await
            .unwrap_or(json!({ "environments": [], "activeId": null }));
        (collections, environments)
    }
}

async fn save_restored_collections(
    storage: &StorageService,
    active_project: Option<&PathBuf>,
    collections: &Value,
) -> Result<(), AppError> {
    if let Some(project_dir) = active_project {
        ProjectStorageService::new(project_dir.clone())
            .save_collections(collections)
            .await
            .map_err(AppError::Storage)
    } else {
        storage
            .save_collections(collections)
            .await
            .map_err(AppError::Storage)
    }
}

async fn save_restored_environments(
    storage: &StorageService,
    active_project: Option<&PathBuf>,
    environments: &Value,
) -> Result<(), AppError> {
    if let Some(project_dir) = active_project {
        let mut workspace_environments = environments.clone();
        if let Some(global_variables) = workspace_environments
            .as_object_mut()
            .and_then(|o| o.remove("globalVariables"))
        {
            let mut global_envs = storage
                .load_environments()
                .await
                .unwrap_or(json!({ "environments": [], "activeId": null }));
            global_envs
                .as_object_mut()
                .map(|o| o.insert("globalVariables".to_string(), global_variables));
            storage
                .save_environments(&global_envs)
                .await
                .map_err(AppError::Storage)?;
        }

        ProjectStorageService::new(project_dir.clone())
            .save_environments(&workspace_environments)
            .await
            .map_err(AppError::Storage)
    } else {
        storage
            .save_environments(environments)
            .await
            .map_err(AppError::Storage)
    }
}

// ---------------------------------------------------------------------------
// Pre-restore snapshot
// ---------------------------------------------------------------------------

/// Create a snapshot of current state before restoring (non-fatal on failure).
async fn create_pre_restore_snapshot(app: &AppHandle, active_project: Option<&PathBuf>) {
    let storage = app.state::<StorageService>();
    let history = app.state::<HistoryStorage>();
    let runner_history = app.state::<RunnerHistory>();

    let (collections, environments) =
        load_backup_collections_and_environments(&storage, active_project).await;
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
