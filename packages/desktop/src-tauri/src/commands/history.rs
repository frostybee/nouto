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
        return;
    }
    let entries = history.load_all().await.unwrap_or_default();
    let _ = app.emit("historyUpdated", serde_json::json!({ "data": entries }));
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
            "avgResponseTime": 0,
            "errorRate": 0,
            "timeRange": { "from": "", "to": "" },
            "statusDistribution": { "2xx": 0, "3xx": 0, "4xx": 0, "5xx": 0, "error": 0 },
            "topEndpoints": [],
            "requestsPerDay": []
        }}))
        .map_err(|e| format!("Failed to emit historyStatsLoaded: {}", e))?;
        return Ok(());
    }

    let mut total_duration: f64 = 0.0;
    let mut s2xx: usize = 0;
    let mut s3xx: usize = 0;
    let mut s4xx: usize = 0;
    let mut s5xx: usize = 0;
    let mut serr: usize = 0;
    let mut error_count: usize = 0;

    // (url, method) -> (count, total_duration, error_count)
    let mut endpoint_map: HashMap<(String, String), (usize, f64, usize)> = HashMap::new();

    // date string (YYYY-MM-DD) -> count
    let mut day_map: HashMap<String, usize> = HashMap::new();

    let mut timestamps: Vec<String> = Vec::new();

    for entry in &entries {
        // Duration: stored as responseDuration
        let duration = entry.get("responseDuration")
            .and_then(|v| v.as_f64())
            .unwrap_or(0.0);
        total_duration += duration;

        // Status: stored as responseStatus
        let status = entry.get("responseStatus")
            .and_then(|v| v.as_i64())
            .unwrap_or(0);

        let is_error;
        if status >= 200 && status < 300 {
            s2xx += 1;
            is_error = false;
        } else if status >= 300 && status < 400 {
            s3xx += 1;
            is_error = false;
        } else if status >= 400 && status < 500 {
            s4xx += 1;
            is_error = true;
            error_count += 1;
        } else if status >= 500 {
            s5xx += 1;
            is_error = true;
            error_count += 1;
        } else {
            // 0 or unknown = network error
            serr += 1;
            is_error = true;
            error_count += 1;
        }

        // Endpoint tracking
        let method = entry.get("method")
            .and_then(|v| v.as_str())
            .unwrap_or("GET")
            .to_string();
        let url = entry.get("url")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();
        if !url.is_empty() {
            let ep = endpoint_map.entry((url, method)).or_insert((0, 0.0, 0));
            ep.0 += 1;
            ep.1 += duration;
            if is_error { ep.2 += 1; }
        }

        // Timestamp for timeRange and requestsPerDay
        let ts = entry.get("timestamp")
            .and_then(|v| v.as_str())
            .unwrap_or("");
        if !ts.is_empty() {
            timestamps.push(ts.to_string());
            // ISO timestamp: first 10 chars are YYYY-MM-DD
            let date = ts.get(..10).unwrap_or(ts).to_string();
            *day_map.entry(date).or_insert(0) += 1;
        }
    }

    let avg_response_time = total_duration / total as f64;
    let error_rate = (error_count * 100) / total;

    // Time range
    timestamps.sort();
    let time_from = timestamps.first().cloned().unwrap_or_default();
    let time_to = timestamps.last().cloned().unwrap_or_default();

    // Top endpoints by count (top 10)
    let mut ep_vec: Vec<((String, String), (usize, f64, usize))> = endpoint_map.into_iter().collect();
    ep_vec.sort_by(|a, b| b.1.0.cmp(&a.1.0));
    let top_endpoints: Vec<serde_json::Value> = ep_vec.iter().take(10)
        .map(|((url, method), (count, total_dur, err_count))| {
            let avg_dur = if *count > 0 { (total_dur / *count as f64) as i64 } else { 0 };
            let ep_error_rate = if *count > 0 { (err_count * 100) / count } else { 0 };
            json!({
                "url": url,
                "method": method,
                "count": count,
                "avgDuration": avg_dur,
                "errorRate": ep_error_rate
            })
        })
        .collect();

    // Requests per day sorted by date
    let mut rpd: Vec<(String, usize)> = day_map.into_iter().collect();
    rpd.sort_by(|a, b| a.0.cmp(&b.0));
    let requests_per_day: Vec<serde_json::Value> = rpd.iter()
        .map(|(date, count)| json!({ "date": date, "count": count }))
        .collect();

    app.emit("historyStatsLoaded", json!({ "data": {
        "totalRequests": total,
        "avgResponseTime": avg_response_time as i64,
        "errorRate": error_rate,
        "timeRange": { "from": time_from, "to": time_to },
        "statusDistribution": {
            "2xx": s2xx,
            "3xx": s3xx,
            "4xx": s4xx,
            "5xx": s5xx,
            "error": serr
        },
        "topEndpoints": top_endpoints,
        "requestsPerDay": requests_per_day
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
