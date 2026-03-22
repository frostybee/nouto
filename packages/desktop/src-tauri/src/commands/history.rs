// History command handlers for Tauri

use crate::services::history_storage::HistoryStorage;
use serde_json::json;
use std::collections::HashMap;
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

/// Pin or unpin a history entry
#[tauri::command]
pub async fn pin_history_entry(data: serde_json::Value, app: AppHandle) -> Result<(), String> {
    let id = data["id"].as_str().unwrap_or("").to_string();
    let pinned = data["pinned"].as_bool().unwrap_or(false);
    if id.is_empty() {
        return Err("No history entry ID provided".to_string());
    }

    let history = app.state::<HistoryStorage>();
    history.pin_entry(&id, pinned).await?;

    // Re-emit full list with pinned entries first
    let mut entries = history.load_all().await?;
    if let Some(arr) = entries.as_array_mut() {
        let mut pinned_entries: Vec<serde_json::Value> = arr.iter().filter(|e| e.get("pinned").and_then(|v| v.as_bool()).unwrap_or(false)).cloned().collect();
        let unpinned: Vec<serde_json::Value> = arr.iter().filter(|e| !e.get("pinned").and_then(|v| v.as_bool()).unwrap_or(false)).cloned().collect();
        pinned_entries.extend(unpinned);
        *arr = pinned_entries;
    }

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

// --- Phase 14.1: History detail operations ---

/// Get a single history entry by ID
#[tauri::command]
pub async fn get_history_entry(data: serde_json::Value, app: AppHandle) -> Result<(), String> {
    let id = data["id"].as_str().unwrap_or("").to_string();
    if id.is_empty() {
        return Err("No history entry ID provided".to_string());
    }

    let history = app.state::<HistoryStorage>();
    let entries = history.load_all().await?;
    let entry = entries.into_iter().find(|e| e["id"].as_str() == Some(&id));

    match entry {
        Some(e) => {
            app.emit("historyEntryLoaded", json!({ "data": e }))
                .map_err(|e| format!("Failed to emit historyEntryLoaded: {}", e))?;
        }
        None => {
            return Err(format!("History entry '{}' not found", id));
        }
    }

    Ok(())
}

/// Compute aggregate history stats
#[tauri::command]
pub async fn get_history_stats(app: AppHandle) -> Result<(), String> {
    let history = app.state::<HistoryStorage>();
    let entries = history.load_all().await?;

    let total = entries.len();
    if total == 0 {
        app.emit("historyStatsLoaded", json!({ "data": {
            "totalRequests": 0,
            "avgDuration": 0,
            "statusCodeDistribution": {},
            "methodDistribution": {},
            "topUrls": []
        }}))
        .map_err(|e| format!("Failed to emit historyStatsLoaded: {}", e))?;
        return Ok(());
    }

    let mut total_duration: f64 = 0.0;
    let mut status_codes: HashMap<String, usize> = HashMap::new();
    let mut methods: HashMap<String, usize> = HashMap::new();
    let mut url_counts: HashMap<String, usize> = HashMap::new();

    for entry in &entries {
        // Duration
        if let Some(d) = entry.get("duration").and_then(|v| v.as_f64()) {
            total_duration += d;
        } else if let Some(d) = entry.get("duration").and_then(|v| v.as_i64()) {
            total_duration += d as f64;
        }

        // Status code
        let status = entry.get("status")
            .and_then(|v| v.as_i64())
            .map(|s| s.to_string())
            .unwrap_or_else(|| "0".to_string());
        *status_codes.entry(status).or_insert(0) += 1;

        // Method
        let method = entry.get("method")
            .and_then(|v| v.as_str())
            .unwrap_or("GET")
            .to_string();
        *methods.entry(method).or_insert(0) += 1;

        // URL
        let url = entry.get("url")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();
        if !url.is_empty() {
            *url_counts.entry(url).or_insert(0) += 1;
        }
    }

    let avg_duration = total_duration / total as f64;

    // Top 10 URLs sorted by count descending
    let mut url_vec: Vec<(String, usize)> = url_counts.into_iter().collect();
    url_vec.sort_by(|a, b| b.1.cmp(&a.1));
    let top_urls: Vec<serde_json::Value> = url_vec.iter().take(10)
        .map(|(url, count)| json!({ "url": url, "count": count }))
        .collect();

    app.emit("historyStatsLoaded", json!({ "data": {
        "totalRequests": total,
        "avgDuration": avg_duration,
        "statusCodeDistribution": status_codes,
        "methodDistribution": methods,
        "topUrls": top_urls
    }}))
    .map_err(|e| format!("Failed to emit historyStatsLoaded: {}", e))?;

    Ok(())
}

/// Get history entries filtered by request ID
#[tauri::command]
pub async fn get_request_history(data: serde_json::Value, app: AppHandle) -> Result<(), String> {
    let request_id = data["requestId"].as_str().unwrap_or("").to_string();
    if request_id.is_empty() {
        return Err("No requestId provided".to_string());
    }

    let history = app.state::<HistoryStorage>();
    let entries = history.load_all().await?;
    let filtered: Vec<&serde_json::Value> = entries.iter()
        .filter(|e| e.get("requestId").and_then(|v| v.as_str()) == Some(&request_id)
            || e.get("request_id").and_then(|v| v.as_str()) == Some(&request_id))
        .collect();

    app.emit("historyLoaded", json!({ "data": filtered }))
        .map_err(|e| format!("Failed to emit historyLoaded: {}", e))?;

    Ok(())
}

// --- Phase 14.2: Paginated history ---

/// Get paginated history entries for the drawer
#[tauri::command]
pub async fn get_drawer_history(data: serde_json::Value, app: AppHandle) -> Result<(), String> {
    let page = data["page"].as_u64().unwrap_or(1) as usize;
    let page_size = data["pageSize"].as_u64().unwrap_or(50) as usize;
    let search = data["search"].as_str().map(|s| s.to_lowercase());

    let history = app.state::<HistoryStorage>();
    let mut entries = history.load_all().await?;

    // Most recent first
    entries.reverse();

    // Filter by search query if provided
    if let Some(ref query) = search {
        entries.retain(|e| {
            let url = e.get("url").and_then(|v| v.as_str()).unwrap_or("").to_lowercase();
            let method = e.get("method").and_then(|v| v.as_str()).unwrap_or("").to_lowercase();
            let name = e.get("name").and_then(|v| v.as_str()).unwrap_or("").to_lowercase();
            url.contains(query) || method.contains(query) || name.contains(query)
        });
    }

    let total = entries.len();
    let start = (page - 1) * page_size;
    let page_entries: Vec<serde_json::Value> = entries.into_iter()
        .skip(start)
        .take(page_size)
        .collect();

    app.emit("drawerHistoryLoaded", json!({ "data": {
        "entries": page_entries,
        "total": total,
        "page": page,
        "pageSize": page_size
    }}))
    .map_err(|e| format!("Failed to emit drawerHistoryLoaded: {}", e))?;

    Ok(())
}

// --- Phase 14.3: History export and import ---

/// Export all history entries as JSON or CSV
#[tauri::command]
pub async fn export_history(data: serde_json::Value, app: AppHandle) -> Result<(), String> {
    use tauri_plugin_dialog::DialogExt;

    let format = data["format"].as_str().unwrap_or("json").to_string();
    let history = app.state::<HistoryStorage>();
    let entries = history.load_all().await?;

    let (content, default_name, filter_name, filter_ext) = if format == "csv" {
        let header = "timestamp,method,URL,status,duration,size";
        let rows: Vec<String> = entries.iter().map(|e| {
            let timestamp = e.get("timestamp").and_then(|v| v.as_str())
                .or_else(|| e.get("createdAt").and_then(|v| v.as_str()))
                .unwrap_or("");
            let method = e.get("method").and_then(|v| v.as_str()).unwrap_or("");
            let url = e.get("url").and_then(|v| v.as_str()).unwrap_or("");
            let status = e.get("status").and_then(|v| v.as_i64()).unwrap_or(0);
            let duration = e.get("duration").and_then(|v| v.as_i64()).unwrap_or(0);
            let size = e.get("size").and_then(|v| v.as_u64()).unwrap_or(0);
            format!("{},{},\"{}\",{},{},{}", timestamp, method, url.replace('"', "\"\""), status, duration, size)
        }).collect();
        let csv_content = format!("{}\n{}", header, rows.join("\n"));
        (csv_content, "history.csv".to_string(), "CSV Files", "csv")
    } else {
        let json_content = serde_json::to_string_pretty(&entries)
            .unwrap_or_else(|_| "[]".to_string());
        (json_content, "history.json".to_string(), "JSON Files", "json")
    };

    let file_path = app.dialog()
        .file()
        .set_file_name(&default_name)
        .add_filter(filter_name, &[filter_ext])
        .blocking_save_file();

    if let Some(path) = file_path {
        if let Some(path) = path.as_path() {
            tokio::fs::write(path, content).await
                .map_err(|e| format!("Failed to write export file: {}", e))?;
            let _ = app.emit("showNotification", json!({
                "data": { "level": "info", "message": "History exported successfully." }
            }));
        }
    }

    Ok(())
}

/// Import history entries from a JSON file
#[tauri::command]
pub async fn import_history(app: AppHandle) -> Result<(), String> {
    use tauri_plugin_dialog::DialogExt;

    let file_path = app.dialog()
        .file()
        .add_filter("JSON Files", &["json"])
        .blocking_pick_file();

    if let Some(path) = file_path {
        if let Some(path) = path.as_path() {
            let content = tokio::fs::read_to_string(path).await
                .map_err(|e| format!("Failed to read import file: {}", e))?;

            let imported: Vec<serde_json::Value> = serde_json::from_str(&content)
                .map_err(|e| format!("Failed to parse import file: {}", e))?;

            let history = app.state::<HistoryStorage>();
            let mut existing = history.load_all().await?;

            // Deduplicate by timestamp+url+method
            let existing_keys: std::collections::HashSet<String> = existing.iter()
                .map(|e| {
                    let ts = e.get("timestamp").and_then(|v| v.as_str())
                        .or_else(|| e.get("createdAt").and_then(|v| v.as_str()))
                        .unwrap_or("");
                    let url = e.get("url").and_then(|v| v.as_str()).unwrap_or("");
                    let method = e.get("method").and_then(|v| v.as_str()).unwrap_or("");
                    format!("{}|{}|{}", ts, url, method)
                })
                .collect();

            for entry in imported {
                let ts = entry.get("timestamp").and_then(|v| v.as_str())
                    .or_else(|| entry.get("createdAt").and_then(|v| v.as_str()))
                    .unwrap_or("");
                let url = entry.get("url").and_then(|v| v.as_str()).unwrap_or("");
                let method = entry.get("method").and_then(|v| v.as_str()).unwrap_or("");
                let key = format!("{}|{}|{}", ts, url, method);

                if !existing_keys.contains(&key) {
                    existing.push(entry);
                }
            }

            // Write back (HistoryStorage handles capping)
            // We need to clear and re-append since write_all is private
            // Instead, use the append approach for each new entry
            // Actually, let's just write all at once via clear + bulk
            history.clear().await?;
            for entry in &existing {
                history.append(entry).await?;
            }

            let entries = history.load_all().await?;
            let _ = app.emit("historyUpdated", json!({ "data": entries }));
            let _ = app.emit("showNotification", json!({
                "data": { "level": "info", "message": "History imported successfully." }
            }));
        }
    }

    Ok(())
}
