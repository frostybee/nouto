// Collection Runner command handlers for Tauri
// Executes a sequence of HTTP requests from a collection, emitting progress events

use crate::models::types::{
    AuthState, AuthType, CollectionRunConfig, CollectionRunRequestResult,
    CollectionRunResult, HttpMethod, KeyValue,
};
use crate::services::http_client::{HttpClient, HttpRequestConfig};
use crate::services::storage::{StorageService, ProjectStorageService};
use crate::services::runner_history::RunnerHistory as RunnerHistorySvc;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use tauri::{AppHandle, Emitter, Manager};
use super::ProjectDirState;

/// Registry for cancelling in-flight collection runs (newtype to avoid Tauri manage collision)
pub struct RunnerRegistry(pub Arc<AtomicBool>);

pub fn init_runner_registry() -> RunnerRegistry {
    RunnerRegistry(Arc::new(AtomicBool::new(false)))
}

/// Payload for start_collection_run command
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StartCollectionRunData {
    pub collection_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub folder_id: Option<String>,
    pub config: CollectionRunConfig,
    pub request_ids: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub environment_id: Option<String>,
}

/// Start a collection run: execute requests sequentially, emitting progress events
#[tauri::command]
pub async fn start_collection_run(
    data: StartCollectionRunData,
    app: AppHandle,
    registry: tauri::State<'_, RunnerRegistry>,
    project_dir: tauri::State<'_, ProjectDirState>,
) -> Result<(), String> {
    // Reset cancellation flag
    registry.0.store(false, Ordering::SeqCst);
    let cancelled = registry.0.clone();

    // Load collections from disk: use project storage if a project is open, else default
    let project_path: Option<PathBuf> = project_dir.lock().await.clone();
    let (collections_json, environments_json) = if let Some(ref dir) = project_path {
        let project_storage = ProjectStorageService::new(dir.clone());
        let cols = project_storage.load_collections().await
            .unwrap_or(serde_json::json!([]));
        let envs = project_storage.load_environments().await.unwrap_or(Value::Null);
        (cols, envs)
    } else {
        let storage = app.state::<StorageService>();
        let cols = storage.load_collections().await?;
        let envs = storage.load_environments().await.unwrap_or(Value::Null);
        (cols, envs)
    };
    let mut env_variables = build_env_variable_map(&environments_json, data.environment_id.as_deref());

    // Find the target collection
    let collections = collections_json.as_array()
        .ok_or("Collections is not an array")?;

    let collection = collections.iter()
        .find(|c| c.get("id").and_then(|v| v.as_str()) == Some(&data.collection_id))
        .ok_or("Collection not found")?;

    let collection_name = collection.get("name")
        .and_then(|v| v.as_str())
        .unwrap_or("Unknown")
        .to_string();

    // Collect collection-level and folder-level scoped variables
    // (these override global/env variables with lower priority than active environment)
    collect_scoped_variables(collection, data.folder_id.as_deref(), &mut env_variables);

    // Recursively collect all requests from items
    let items = if let Some(folder_id) = &data.folder_id {
        find_folder_items(collection.get("items").and_then(|v| v.as_array()), folder_id)
            .ok_or("Folder not found")?
    } else {
        collection.get("items")
            .and_then(|v| v.as_array())
            .cloned()
            .unwrap_or_default()
    };

    let all_requests = collect_requests(&items);

    // Filter and order by request_ids
    let request_map: HashMap<&str, &Value> = all_requests.iter()
        .filter_map(|r| r.get("id").and_then(|v| v.as_str()).map(|id| (id, *r)))
        .collect();

    let ordered_requests: Vec<&Value> = data.request_ids.iter()
        .filter_map(|id| request_map.get(id.as_str()).copied())
        .collect();

    let started_at = chrono::Utc::now().to_rfc3339();
    let collection_id = data.collection_id.clone();
    let stop_on_failure = data.config.stop_on_failure;
    let delay_ms = data.config.delay_ms;
    let data_rows = data.config.data_rows.clone();

    // Clone request data and collection for the async task
    let requests_owned: Vec<Value> = ordered_requests.into_iter().cloned().collect();
    let collection = collection.clone();

    // For data-driven testing: if data_rows is present, run the full sequence once per row
    let data_iterations: Vec<Option<HashMap<String, String>>> = match &data_rows {
        Some(rows) if !rows.is_empty() => rows.iter().map(|r| Some(r.clone())).collect(),
        _ => vec![None], // Single iteration with no substitution
    };

    let total_iterations = data_iterations.len();
    let requests_per_iteration = requests_owned.len();
    let total = requests_per_iteration * total_iterations;

    tokio::spawn(async move {
        let http_client = match HttpClient::new() {
            Ok(c) => c,
            Err(e) => {
                let _ = app.emit("collectionRunComplete", serde_json::json!({
                    "data": {
                        "collectionId": collection_id,
                        "collectionName": collection_name,
                        "startedAt": started_at,
                        "completedAt": chrono::Utc::now().to_rfc3339(),
                        "totalRequests": total,
                        "passedRequests": 0,
                        "failedRequests": total,
                        "skippedRequests": 0,
                        "totalDuration": 0,
                        "results": [],
                        "stoppedEarly": true
                    }
                }));
                eprintln!("[Nouto Runner] Failed to create HTTP client: {}", e);
                return;
            }
        };

        let mut results: Vec<CollectionRunRequestResult> = Vec::new();
        let mut stopped_early = false;
        let mut global_index = 0;

        'outer: for (_iter_index, data_row) in data_iterations.iter().enumerate() {
            // Build name→index and id→index maps for setNextRequest jump support
            let name_to_idx: HashMap<String, usize> = requests_owned
                .iter()
                .enumerate()
                .filter_map(|(i, r)| r["name"].as_str().map(|n| (n.to_string(), i)))
                .collect();
            let id_to_idx: HashMap<String, usize> = requests_owned
                .iter()
                .enumerate()
                .filter_map(|(i, r)| r["id"].as_str().map(|id| (id.to_string(), i)))
                .collect();

            let mut cursor: usize = 0;
            let max_steps = requests_owned.len() * 10;
            let mut steps_taken: usize = 0;

            while cursor < requests_owned.len() {
                steps_taken += 1;
                if steps_taken > max_steps {
                    let _ = app.emit("collectionRunWarning", serde_json::json!({
                        "data": { "message": "setNextRequest loop guard triggered — stopping after too many jumps" }
                    }));
                    stopped_early = true;
                    break 'outer;
                }
                let request_json = &requests_owned[cursor];
                // Check cancellation
                if cancelled.load(Ordering::SeqCst) {
                    stopped_early = true;
                    break 'outer;
                }

                // Apply variable substitution: environment variables first, then data row overrides
                let mut effective_request = substitute_env_variables(request_json, &env_variables);
                if let Some(row) = data_row {
                    effective_request = substitute_data_variables(&effective_request, row);
                }

                let req_name = effective_request.get("name").and_then(|v| v.as_str()).unwrap_or("").to_string();
                let req_id = effective_request.get("id").and_then(|v| v.as_str()).unwrap_or("").to_string();
                let req_method_str = effective_request.get("method").and_then(|v| v.as_str()).unwrap_or("GET").to_string();
                let req_url = effective_request.get("url").and_then(|v| v.as_str()).unwrap_or("").to_string();

                // Emit progress
                let _ = app.emit("collectionRunProgress", serde_json::json!({
                    "data": {
                        "current": global_index + 1,
                        "total": total,
                        "requestName": req_name
                    }
                }));

                // Resolve script chain (collection -> folders -> request)
                let (mut pre_scripts, mut post_scripts) = resolve_script_chain(
                    &collection, &req_id
                );

                // Add request-level scripts
                let script_inheritance = effective_request.get("scriptInheritance")
                    .and_then(|v| v.as_str()).unwrap_or("inherit");
                if script_inheritance == "own" {
                    // Only use request's own scripts
                    pre_scripts.clear();
                    post_scripts.clear();
                }
                if let Some(scripts) = effective_request.get("scripts") {
                    if let Some(pre) = scripts.get("preRequest").and_then(|v| v.as_str()) {
                        if !pre.trim().is_empty() {
                            pre_scripts.push((req_name.clone(), pre.to_string()));
                        }
                    }
                    if let Some(post) = scripts.get("postResponse").and_then(|v| v.as_str()) {
                        if !post.trim().is_empty() {
                            post_scripts.push((req_name.clone(), post.to_string()));
                        }
                    }
                }

                // Build script context environment data
                let env_vars_for_script: Vec<Value> = env_variables.iter()
                    .map(|(k, v)| serde_json::json!({"key": k, "value": v, "enabled": true}))
                    .collect();
                let script_env = serde_json::json!({ "variables": env_vars_for_script });

                let mut all_test_results: Vec<crate::services::script_engine::ScriptTestResult> = Vec::new();
                let mut all_logs: Vec<crate::services::script_engine::ScriptLogEntry> = Vec::new();
                let mut script_error: Option<String> = None;

                // Run pre-request scripts
                for (_source_name, script_code) in &pre_scripts {
                    let request_json = serde_json::json!({
                        "method": req_method_str,
                        "url": effective_request.get("url").and_then(|v| v.as_str()).unwrap_or(""),
                        "headers": effective_request.get("headers")
                            .and_then(|v| v.as_array())
                            .map(|arr| arr.iter()
                                .filter(|h| h.get("enabled").and_then(|v| v.as_bool()).unwrap_or(false))
                                .map(|h| (
                                    h.get("key").and_then(|v| v.as_str()).unwrap_or("").to_string(),
                                    h.get("value").and_then(|v| v.as_str()).unwrap_or("").to_string(),
                                ))
                                .collect::<std::collections::HashMap<String, String>>())
                            .unwrap_or_default(),
                    });

                    let ctx = crate::services::script_engine::ScriptContext {
                        request: request_json,
                        response: None,
                        environment: script_env.clone(),
                        global_variables: Value::Array(vec![]),
                        info: Some(serde_json::json!({
                            "requestName": req_name,
                            "currentIteration": _iter_index,
                            "totalIterations": total_iterations,
                        })),
                        cookies: vec![],
                    };

                    let result = crate::services::script_engine::ScriptEngine::execute_pre_request(
                        script_code, &ctx
                    ).await;

                    if !result.cookie_mutations.is_empty() {
                        let _ = app.emit("cookieMutations",
                            serde_json::json!({ "data": result.cookie_mutations }));
                    }

                    all_logs.extend(result.logs);
                    all_test_results.extend(result.test_results);

                    // Apply variable mutations to runner env
                    for var in &result.variables_to_set {
                        env_variables.insert(var.key.clone(), var.value.clone());
                    }

                    // Apply request modifications
                    if let Some(ref modified) = result.modified_request {
                        if let Some(url) = modified["url"].as_str() {
                            if let Some(obj) = effective_request.as_object_mut() {
                                obj.insert("url".to_string(), Value::String(url.to_string()));
                            }
                        }
                        if let Some(method) = modified["method"].as_str() {
                            if let Some(obj) = effective_request.as_object_mut() {
                                obj.insert("method".to_string(), Value::String(method.to_string()));
                            }
                        }
                    }

                    if let Some(ref err) = result.error {
                        script_error = Some(err.clone());
                        break;
                    }
                }

                // Execute the HTTP request
                let result = execute_request_from_json(&http_client, &effective_request).await;

                let mut next_request_name: Option<String> = None;

                let request_result = match result {
                    Ok(response) => {
                        let passed = response.error.is_none() || !response.error.unwrap_or(false);

                        // Run post-response scripts (always, even on failed requests)
                        {
                            let response_json = serde_json::json!({
                                "status": response.status,
                                "statusText": response.status_text,
                                "headers": response.headers,
                                "body": response.data,
                                "duration": response.duration,
                                "size": response.size,
                                "error": response.error,
                            });

                            // Rebuild env vars for script (may have been updated by pre-request scripts)
                            let env_vars_for_post: Vec<Value> = env_variables.iter()
                                .map(|(k, v)| serde_json::json!({"key": k, "value": v, "enabled": true}))
                                .collect();
                            let script_env_post = serde_json::json!({ "variables": env_vars_for_post });

                            for (_source_name, script_code) in &post_scripts {
                                let request_json = serde_json::json!({
                                    "method": response.request_url.as_deref().unwrap_or(&req_method_str),
                                    "url": req_url,
                                });

                                let ctx = crate::services::script_engine::ScriptContext {
                                    request: request_json,
                                    response: Some(response_json.clone()),
                                    environment: script_env_post.clone(),
                                    global_variables: Value::Array(vec![]),
                                    info: Some(serde_json::json!({
                                        "requestName": req_name,
                                        "currentIteration": _iter_index,
                                        "totalIterations": total_iterations,
                                    })),
                                    cookies: vec![],
                                };

                                let script_result = crate::services::script_engine::ScriptEngine::execute_post_response(
                                    script_code, &ctx
                                ).await;

                                if !script_result.cookie_mutations.is_empty() {
                                    let _ = app.emit("cookieMutations",
                                        serde_json::json!({ "data": script_result.cookie_mutations }));
                                }

                                all_logs.extend(script_result.logs);
                                all_test_results.extend(script_result.test_results);

                                // Apply variable mutations to runner env
                                for var in &script_result.variables_to_set {
                                    env_variables.insert(var.key.clone(), var.value.clone());
                                }

                                // Capture setNextRequest
                                if let Some(ref next) = script_result.next_request {
                                    next_request_name = Some(next.clone());
                                }

                                if let Some(ref err) = script_result.error {
                                    script_error = Some(err.clone());
                                    break;
                                }
                            }
                        }

                        // Convert script engine types to runner types for the result
                        let test_results_for_result: Option<Vec<crate::models::types::ScriptTestResult>> =
                            if all_test_results.is_empty() { None } else {
                                Some(all_test_results.iter().map(|t| crate::models::types::ScriptTestResult {
                                    name: t.name.clone(),
                                    passed: t.passed,
                                    error: t.error.clone(),
                                }).collect())
                            };

                        let logs_for_result: Option<Vec<crate::models::types::ScriptLogEntry>> =
                            if all_logs.is_empty() { None } else {
                                Some(all_logs.iter().map(|l| crate::models::types::ScriptLogEntry {
                                    level: l.level.clone(),
                                    args: vec![l.message.clone()],
                                    timestamp: chrono::Utc::now().timestamp_millis(),
                                }).collect())
                            };

                        // Check if any script tests failed
                        let script_tests_passed = all_test_results.iter().all(|t| t.passed);

                        CollectionRunRequestResult {
                            request_id: req_id.clone(),
                            request_name: req_name.clone(),
                            method: HttpMethod(req_method_str.clone()),
                            url: req_url.clone(),
                            status: response.status,
                            status_text: response.status_text.clone(),
                            duration: response.duration,
                            size: response.size,
                            passed: passed && script_tests_passed && script_error.is_none(),
                            error: if !passed {
                                Some(response.data.as_str().unwrap_or("Request failed").to_string())
                            } else if let Some(ref err) = script_error {
                                Some(format!("Script error: {}", err))
                            } else if !script_tests_passed {
                                let failed: Vec<&str> = all_test_results.iter()
                                    .filter(|t| !t.passed)
                                    .map(|t| t.name.as_str())
                                    .collect();
                                Some(format!("Failed tests: {}", failed.join(", ")))
                            } else {
                                None
                            },
                            assertion_results: None,
                            script_test_results: test_results_for_result,
                            response_data: Some(response.data),
                            response_headers: Some(response.headers),
                            script_logs: logs_for_result,
                        }
                    }
                    Err(error_msg) => CollectionRunRequestResult {
                        request_id: req_id.clone(),
                        request_name: req_name.clone(),
                        method: HttpMethod(req_method_str.clone()),
                        url: req_url.clone(),
                        status: 0,
                        status_text: "Error".to_string(),
                        duration: 0,
                        size: 0,
                        passed: false,
                        error: Some(error_msg),
                        assertion_results: None,
                        script_test_results: None,
                        response_data: None,
                        response_headers: None,
                        script_logs: None,
                    },
                };

                // Emit individual result
                let _ = app.emit("collectionRunRequestResult", serde_json::json!({
                    "data": &request_result
                }));

                let failed = !request_result.passed;
                results.push(request_result);

                // Stop on failure if configured
                if failed && stop_on_failure {
                    stopped_early = true;
                    break 'outer;
                }

                // Handle setNextRequest — jump to named/id request, stop, or fall through
                if let Some(next_name) = next_request_name.take() {
                    if next_name == "null" || next_name == "__stop__" {
                        stopped_early = true;
                        break;
                    }
                    if let Some(&target_idx) = name_to_idx.get(&next_name)
                        .or_else(|| id_to_idx.get(&next_name))
                    {
                        cursor = target_idx;
                        global_index += 1;
                        continue; // jump — skip delay and sequential cursor advance
                    }
                    eprintln!("[Nouto] setNextRequest: '{}' not found, advancing sequentially", next_name);
                }

                // Delay between requests
                if delay_ms > 0 && global_index < total - 1 {
                    tokio::time::sleep(tokio::time::Duration::from_millis(delay_ms as u64)).await;
                }

                cursor += 1;
                global_index += 1;
            } // end while cursor
        } // end 'outer data_iterations loop

        // Check if cancelled during delay
        if cancelled.load(Ordering::SeqCst) && results.len() < total {
            let _ = app.emit("collectionRunCancelled", serde_json::json!({
                "data": {}
            }));
            return;
        }

        // Build summary
        let passed_count = results.iter().filter(|r| r.passed).count();
        let failed_count = results.iter().filter(|r| !r.passed).count();
        let skipped_count = total - results.len();
        let total_duration: i64 = results.iter().map(|r| r.duration).sum();

        let run_result = CollectionRunResult {
            collection_id,
            collection_name,
            started_at,
            completed_at: chrono::Utc::now().to_rfc3339(),
            total_requests: total,
            passed_requests: passed_count,
            failed_requests: failed_count,
            skipped_requests: skipped_count,
            total_duration,
            results,
            stopped_early,
        };

        // Persist runner history to disk
        let history = app.state::<RunnerHistorySvc>();
        let run_value = serde_json::to_value(&run_result).unwrap_or(Value::Null);
        if let Err(e) = history.save_run(&run_value).await {
            eprintln!("[Nouto] Failed to save runner history: {}", e);
        }

        let _ = app.emit("collectionRunComplete", serde_json::json!({
            "data": &run_result
        }));
    });

    Ok(())
}

/// Cancel the current collection run
#[tauri::command]
pub async fn cancel_collection_run(
    registry: tauri::State<'_, RunnerRegistry>,
) -> Result<(), String> {
    registry.0.store(true, Ordering::SeqCst);
    Ok(())
}

// --- Phase 14.4: Runner history persistence ---

use crate::services::runner_history::RunnerHistory;

/// Get all runner history entries (summaries without full results)
#[tauri::command]
pub async fn get_runner_history(app: AppHandle) -> Result<(), String> {
    let history = app.state::<RunnerHistory>();
    let runs = history.list_runs().await?;

    app.emit("runnerHistoryLoaded", serde_json::json!({ "data": runs }))
        .map_err(|e| format!("Failed to emit runnerHistoryLoaded: {}", e))?;

    Ok(())
}

/// Get a single runner history entry with full detail
#[tauri::command]
pub async fn get_runner_history_detail(data: Value, app: AppHandle) -> Result<(), String> {
    let id = data["id"].as_str().unwrap_or("").to_string();
    if id.is_empty() {
        return Err("No run ID provided".to_string());
    }

    let history = app.state::<RunnerHistory>();
    match history.get_run(&id).await? {
        Some(run) => {
            app.emit("runnerHistoryDetailLoaded", serde_json::json!({ "data": run }))
                .map_err(|e| format!("Failed to emit runnerHistoryDetailLoaded: {}", e))?;
        }
        None => {
            return Err(format!("Runner history entry '{}' not found", id));
        }
    }

    Ok(())
}

/// Delete a single runner history entry
#[tauri::command]
pub async fn delete_runner_history_entry(data: Value, app: AppHandle) -> Result<(), String> {
    let id = data["id"].as_str().unwrap_or("").to_string();
    if id.is_empty() {
        return Err("No run ID provided".to_string());
    }

    let history = app.state::<RunnerHistory>();
    history.delete_run(&id).await?;

    // Emit updated list
    let runs = history.list_runs().await?;
    app.emit("runnerHistoryLoaded", serde_json::json!({ "data": runs }))
        .map_err(|e| format!("Failed to emit runnerHistoryLoaded: {}", e))?;

    Ok(())
}

/// Clear all runner history
#[tauri::command]
pub async fn clear_runner_history(app: AppHandle) -> Result<(), String> {
    let history = app.state::<RunnerHistory>();
    history.clear_all().await?;

    app.emit("runnerHistoryLoaded", serde_json::json!({ "data": [] }))
        .map_err(|e| format!("Failed to emit runnerHistoryLoaded: {}", e))?;

    Ok(())
}

// --- Phase 14.5: Data-driven testing ---

/// Open a file dialog to select a data file (CSV, JSON, or XLSX) for data-driven testing
#[tauri::command]
pub async fn select_data_file(app: AppHandle) -> Result<(), String> {
    use tauri_plugin_dialog::DialogExt;

    let file_path = app.dialog()
        .file()
        .add_filter("Data Files", &["csv", "json", "xlsx"])
        .blocking_pick_file();

    if let Some(path_ref) = file_path {
        if let Some(path) = path_ref.as_path() {
            let file_name = path.file_name()
                .map(|n| n.to_string_lossy().to_string())
                .unwrap_or_default();
            let ext = path.extension()
                .map(|e| e.to_string_lossy().to_lowercase())
                .unwrap_or_default();

            let (rows, columns) = match ext.as_str() {
                "csv" => parse_csv_file(path).await?,
                "json" => parse_json_data_file(path).await?,
                "xlsx" => parse_xlsx_file(path)?,
                _ => return Err(format!("Unsupported file format: {}", ext)),
            };

            app.emit("dataFileLoaded", serde_json::json!({
                "data": {
                    "rows": rows,
                    "columns": columns,
                    "fileName": file_name
                }
            }))
            .map_err(|e| format!("Failed to emit dataFileLoaded: {}", e))?;
        }
    }

    Ok(())
}

async fn parse_csv_file(path: &std::path::Path) -> Result<(Vec<HashMap<String, String>>, Vec<String>), String> {
    let content = tokio::fs::read_to_string(path).await
        .map_err(|e| format!("Failed to read CSV file: {}", e))?;

    let mut reader = csv::Reader::from_reader(content.as_bytes());
    let headers: Vec<String> = reader.headers()
        .map_err(|e| format!("Failed to read CSV headers: {}", e))?
        .iter()
        .map(|h| h.to_string())
        .collect();

    let mut rows = Vec::new();
    for result in reader.records() {
        let record = result.map_err(|e| format!("Failed to read CSV record: {}", e))?;
        let mut row = HashMap::new();
        for (i, field) in record.iter().enumerate() {
            if let Some(header) = headers.get(i) {
                row.insert(header.clone(), field.to_string());
            }
        }
        rows.push(row);
    }

    Ok((rows, headers))
}

async fn parse_json_data_file(path: &std::path::Path) -> Result<(Vec<HashMap<String, String>>, Vec<String>), String> {
    let content = tokio::fs::read_to_string(path).await
        .map_err(|e| format!("Failed to read JSON file: {}", e))?;

    let parsed: Vec<serde_json::Map<String, Value>> = serde_json::from_str(&content)
        .map_err(|e| format!("Failed to parse JSON data file (expected array of objects): {}", e))?;

    let mut columns: Vec<String> = Vec::new();
    let mut columns_seen = std::collections::HashSet::new();
    let mut rows = Vec::new();

    for obj in &parsed {
        let mut row = HashMap::new();
        for (key, value) in obj {
            if columns_seen.insert(key.clone()) {
                columns.push(key.clone());
            }
            let str_value = match value {
                Value::String(s) => s.clone(),
                Value::Null => String::new(),
                other => other.to_string(),
            };
            row.insert(key.clone(), str_value);
        }
        rows.push(row);
    }
    Ok((rows, columns))
}

fn parse_xlsx_file(path: &std::path::Path) -> Result<(Vec<HashMap<String, String>>, Vec<String>), String> {
    use calamine::{open_workbook, Reader, Xlsx};

    let mut workbook: Xlsx<_> = open_workbook(path)
        .map_err(|e| format!("Failed to open XLSX file: {}", e))?;

    let sheet_names = workbook.sheet_names().to_vec();
    let first_sheet = sheet_names.first()
        .ok_or("XLSX file has no sheets")?
        .clone();

    let range = workbook.worksheet_range(&first_sheet)
        .map_err(|e| format!("Failed to read sheet '{}': {}", first_sheet, e))?;

    let mut row_iter = range.rows();

    // First row is headers
    let headers: Vec<String> = match row_iter.next() {
        Some(header_row) => header_row.iter().map(|cell| cell.to_string()).collect(),
        None => return Ok((vec![], vec![])),
    };

    let mut rows = Vec::new();
    for row in row_iter {
        let mut map = HashMap::new();
        for (i, cell) in row.iter().enumerate() {
            if let Some(header) = headers.get(i) {
                map.insert(header.clone(), cell.to_string());
            }
        }
        rows.push(map);
    }

    Ok((rows, headers))
}

/// Substitute {{column_name}} variables in a request JSON with values from a data row
fn substitute_data_variables(request: &Value, row: &HashMap<String, String>) -> Value {
    let json_str = serde_json::to_string(request).unwrap_or_default();
    let mut result = json_str;
    for (key, value) in row {
        let placeholder = format!("{{{{{}}}}}", key);
        result = result.replace(&placeholder, value);
    }
    serde_json::from_str(&result).unwrap_or_else(|_| request.clone())
}

/// Build a map of environment variable names to values.
/// Priority (lowest to highest): global variables, active environment variables.
fn build_env_variable_map(
    environments_json: &Value,
    environment_id: Option<&str>,
) -> HashMap<String, String> {
    let mut vars = HashMap::new();

    // 1. Global variables (lowest priority)
    if let Some(globals) = environments_json.get("globalVariables").and_then(|v| v.as_array()) {
        for v in globals {
            let enabled = v.get("enabled").and_then(|b| b.as_bool()).unwrap_or(false);
            let key = v.get("key").and_then(|s| s.as_str()).unwrap_or("");
            let value = v.get("value").and_then(|s| s.as_str()).unwrap_or("");
            if enabled && !key.is_empty() {
                vars.insert(key.to_string(), value.to_string());
            }
        }
    }

    // 2. Active environment variables (highest priority)
    if let Some(id) = environment_id {
        if !id.is_empty() {
            if let Some(envs) = environments_json.get("environments").and_then(|v| v.as_array()) {
                for env in envs {
                    let env_id = env.get("id").and_then(|v| v.as_str()).unwrap_or("");
                    if env_id == id {
                        if let Some(env_vars) = env.get("variables").and_then(|v| v.as_array()) {
                            for v in env_vars {
                                let enabled = v.get("enabled").and_then(|b| b.as_bool()).unwrap_or(false);
                                let key = v.get("key").and_then(|s| s.as_str()).unwrap_or("");
                                let value = v.get("value").and_then(|s| s.as_str()).unwrap_or("");
                                if enabled && !key.is_empty() {
                                    vars.insert(key.to_string(), value.to_string());
                                }
                            }
                        }
                        break;
                    }
                }
            }
        }
    }

    vars
}

/// Substitute {{variable}} placeholders in a request JSON with environment variable values
fn substitute_env_variables(request: &Value, variables: &HashMap<String, String>) -> Value {
    if variables.is_empty() {
        return request.clone();
    }
    let json_str = serde_json::to_string(request).unwrap_or_default();
    let mut result = json_str;
    for (key, value) in variables {
        let placeholder = format!("{{{{{}}}}}", key);
        // Escape the value for JSON string context (handle quotes, backslashes, newlines)
        let escaped_value = value
            .replace('\\', "\\\\")
            .replace('"', "\\\"")
            .replace('\n', "\\n")
            .replace('\r', "\\r")
            .replace('\t', "\\t");
        result = result.replace(&placeholder, &escaped_value);
    }
    serde_json::from_str(&result).unwrap_or_else(|_| request.clone())
}

/// Collect scoped variables from collection and folder ancestors.
/// Variables are inserted into the map (overriding globals but not env variables,
/// since env variables are already in the map with highest priority).
fn collect_scoped_variables(collection: &Value, folder_id: Option<&str>, vars: &mut HashMap<String, String>) {
    // Extract variables helper
    fn extract_vars(item: &Value, vars: &mut HashMap<String, String>) {
        if let Some(variables) = item.get("variables").and_then(|v| v.as_array()) {
            for v in variables {
                let enabled = v.get("enabled").and_then(|b| b.as_bool()).unwrap_or(false);
                let key = v.get("key").and_then(|s| s.as_str()).unwrap_or("");
                let value = v.get("value").and_then(|s| s.as_str()).unwrap_or("");
                if enabled && !key.is_empty() {
                    // Only insert if not already set by environment (higher priority)
                    vars.entry(key.to_string()).or_insert_with(|| value.to_string());
                }
            }
        }
    }

    // Collection-level variables
    extract_vars(collection, vars);

    // If running a folder, also include the folder's variables
    if let Some(fid) = folder_id {
        if let Some(items) = collection.get("items").and_then(|v| v.as_array()) {
            if let Some(folder) = find_folder_recursive(items, fid) {
                extract_vars(&folder, vars);
            }
        }
    }
}

/// Recursively find a folder by ID
fn find_folder_recursive(items: &[Value], folder_id: &str) -> Option<Value> {
    for item in items {
        let item_type = item.get("type").and_then(|v| v.as_str()).unwrap_or("");
        let item_id = item.get("id").and_then(|v| v.as_str()).unwrap_or("");

        if item_type == "folder" && item_id == folder_id {
            return Some(item.clone());
        }

        if item_type == "folder" {
            if let Some(children) = item.get("children").and_then(|v| v.as_array()) {
                if let Some(found) = find_folder_recursive(children, folder_id) {
                    return Some(found);
                }
            }
        }
    }
    None
}

/// Recursively find a folder's items by folder ID
fn find_folder_items(items: Option<&Vec<Value>>, folder_id: &str) -> Option<Vec<Value>> {
    let items = items?;
    for item in items {
        let item_type = item.get("type").and_then(|v| v.as_str()).unwrap_or("");
        let item_id = item.get("id").and_then(|v| v.as_str()).unwrap_or("");

        if item_type == "folder" && item_id == folder_id {
            return item.get("children").and_then(|v| v.as_array()).cloned();
        }

        // Recurse into nested folders
        if item_type == "folder" {
            if let Some(found) = find_folder_items(item.get("children").and_then(|v| v.as_array()), folder_id) {
                return Some(found);
            }
        }
    }
    None
}

/// Recursively collect all request items from a list of collection items
fn collect_requests(items: &[Value]) -> Vec<&Value> {
    let mut requests = Vec::new();
    for item in items {
        let item_type = item.get("type").and_then(|v| v.as_str()).unwrap_or("");
        if item_type == "request" {
            requests.push(item);
        } else if item_type == "folder" {
            if let Some(children) = item.get("children").and_then(|v| v.as_array()) {
                requests.extend(collect_requests(children));
            }
        }
    }
    requests
}

/// Resolve the script chain for a request: collection → folder(s) → request.
/// Returns (pre_request_scripts, post_response_scripts) as Vec<(source_name, script_code)>.
fn resolve_script_chain(
    collection: &Value,
    request_id: &str,
) -> (Vec<(String, String)>, Vec<(String, String)>) {
    let mut pre_scripts = Vec::new();
    let mut post_scripts = Vec::new();

    // Collection-level scripts
    let collection_name = collection.get("name").and_then(|v| v.as_str()).unwrap_or("Collection").to_string();
    if let Some(scripts) = collection.get("scripts") {
        if let Some(pre) = scripts.get("preRequest").and_then(|v| v.as_str()) {
            if !pre.trim().is_empty() {
                pre_scripts.push((collection_name.clone(), pre.to_string()));
            }
        }
        if let Some(post) = scripts.get("postResponse").and_then(|v| v.as_str()) {
            if !post.trim().is_empty() {
                post_scripts.push((collection_name.clone(), post.to_string()));
            }
        }
    }

    // Walk the tree to find the path from root to the request, collecting folder scripts
    if let Some(items) = collection.get("items").and_then(|v| v.as_array()) {
        let mut path = Vec::new();
        if find_path_to_request(items, request_id, &mut path) {
            // path contains the ancestor folders (not the request itself)
            for folder in &path {
                let folder_name = folder.get("name").and_then(|v| v.as_str()).unwrap_or("Folder").to_string();
                if let Some(scripts) = folder.get("scripts") {
                    if let Some(pre) = scripts.get("preRequest").and_then(|v| v.as_str()) {
                        if !pre.trim().is_empty() {
                            pre_scripts.push((folder_name.clone(), pre.to_string()));
                        }
                    }
                    if let Some(post) = scripts.get("postResponse").and_then(|v| v.as_str()) {
                        if !post.trim().is_empty() {
                            post_scripts.push((folder_name.clone(), post.to_string()));
                        }
                    }
                }
            }
        }
    }

    // Request-level scripts
    // (These are added by the caller since the request JSON is already available)

    (pre_scripts, post_scripts)
}

/// Recursively find the path of ancestor folders to a request by ID.
/// Returns true if found, populating `path` with folder Values.
fn find_path_to_request(items: &[Value], request_id: &str, path: &mut Vec<Value>) -> bool {
    for item in items {
        let item_type = item.get("type").and_then(|v| v.as_str()).unwrap_or("");
        let item_id = item.get("id").and_then(|v| v.as_str()).unwrap_or("");

        if item_type == "request" && item_id == request_id {
            return true;
        }

        if item_type == "folder" {
            if let Some(children) = item.get("children").and_then(|v| v.as_array()) {
                path.push(item.clone());
                if find_path_to_request(children, request_id, path) {
                    return true;
                }
                path.pop();
            }
        }
    }
    false
}

/// Execute a single HTTP request from raw JSON (SavedRequest format from collections)
async fn execute_request_from_json(
    http_client: &HttpClient,
    request: &Value,
) -> Result<crate::models::types::ResponseData, String> {
    let mut headers_map: HashMap<String, String> = HashMap::new();
    let mut params_map: HashMap<String, String> = HashMap::new();

    // Parse headers
    if let Some(headers) = request.get("headers").and_then(|v| v.as_array()) {
        for h in headers {
            let enabled = h.get("enabled").and_then(|v| v.as_bool()).unwrap_or(false);
            let key = h.get("key").and_then(|v| v.as_str()).unwrap_or("");
            let value = h.get("value").and_then(|v| v.as_str()).unwrap_or("");
            if enabled && !key.is_empty() {
                headers_map.insert(key.to_string(), value.to_string());
            }
        }
    }

    // Parse params
    if let Some(params) = request.get("params").and_then(|v| v.as_array()) {
        for p in params {
            let enabled = p.get("enabled").and_then(|v| v.as_bool()).unwrap_or(false);
            let key = p.get("key").and_then(|v| v.as_str()).unwrap_or("");
            let value = p.get("value").and_then(|v| v.as_str()).unwrap_or("");
            if enabled && !key.is_empty() {
                params_map.insert(key.to_string(), value.to_string());
            }
        }
    }

    // Parse auth
    let auth: AuthState = request.get("auth")
        .and_then(|v| serde_json::from_value(v.clone()).ok())
        .unwrap_or_default();

    let (auth_username, auth_password, bearer_token) = match auth.auth_type {
        AuthType::Basic => (auth.username.clone(), auth.password.clone(), None),
        AuthType::Bearer | AuthType::OAuth2 => (None, None, auth.token.clone()),
        AuthType::ApiKey => {
            if let (Some(name), Some(value)) = (&auth.api_key_name, &auth.api_key_value) {
                if auth.api_key_in.as_deref() == Some("query") {
                    params_map.insert(name.clone(), value.clone());
                } else {
                    headers_map.insert(name.clone(), value.clone());
                }
            }
            (None, None, None)
        }
        _ => (None, None, None),
    };

    // Parse body
    let (body_content, body_type) = if let Some(body) = request.get("body") {
        let btype = body.get("type").and_then(|v| v.as_str()).unwrap_or("none");
        let content = body.get("content").and_then(|v| v.as_str()).map(|s| s.to_string());

        match btype {
            "json" => {
                if let Some(c) = &content {
                    headers_map.entry("Content-Type".to_string()).or_insert("application/json".to_string());
                    (Some(c.clone()), "json".to_string())
                } else { (None, "none".to_string()) }
            }
            "text" => {
                if let Some(c) = &content {
                    headers_map.entry("Content-Type".to_string()).or_insert("text/plain".to_string());
                    (Some(c.clone()), "text".to_string())
                } else { (None, "none".to_string()) }
            }
            "xml" => {
                if let Some(c) = &content {
                    headers_map.entry("Content-Type".to_string()).or_insert("application/xml".to_string());
                    (Some(c.clone()), "xml".to_string())
                } else { (None, "none".to_string()) }
            }
            "x-www-form-urlencoded" => {
                if let Some(c) = &content {
                    headers_map.entry("Content-Type".to_string()).or_insert("application/x-www-form-urlencoded".to_string());
                    (Some(c.clone()), "x-www-form-urlencoded".to_string())
                } else { (None, "none".to_string()) }
            }
            "graphql" => {
                if let Some(query) = &content {
                    let mut payload = serde_json::json!({ "query": query });
                    if let Some(vars) = body.get("graphqlVariables").and_then(|v| v.as_str()) {
                        if let Ok(vars_json) = serde_json::from_str::<Value>(vars) {
                            payload["variables"] = vars_json;
                        }
                    }
                    if let Some(op) = body.get("graphqlOperationName").and_then(|v| v.as_str()) {
                        if !op.is_empty() {
                            payload["operationName"] = Value::String(op.to_string());
                        }
                    }
                    headers_map.entry("Content-Type".to_string()).or_insert("application/json".to_string());
                    (Some(payload.to_string()), "json".to_string())
                } else { (None, "none".to_string()) }
            }
            _ => (None, "none".to_string()),
        }
    } else {
        (None, "none".to_string())
    };

    // Convert to Vec<KeyValue>
    let headers_vec: Vec<KeyValue> = headers_map
        .into_iter()
        .map(|(key, value)| KeyValue {
            id: uuid::Uuid::new_v4().to_string(),
            key,
            value,
            enabled: true,
            ..Default::default()
        })
        .collect();

    let params_vec: Vec<KeyValue> = params_map
        .into_iter()
        .map(|(key, value)| KeyValue {
            id: uuid::Uuid::new_v4().to_string(),
            key,
            value,
            enabled: true,
            ..Default::default()
        })
        .collect();

    // Parse SSL and proxy from JSON
    let ssl = request.get("ssl")
        .and_then(|v| serde_json::from_value(v.clone()).ok());
    let proxy = request.get("proxy")
        .and_then(|v| serde_json::from_value(v.clone()).ok());

    let timeout = request.get("timeout").and_then(|v| v.as_u64()).unwrap_or(30000);
    let follow_redirects = request.get("followRedirects").and_then(|v| v.as_bool()).unwrap_or(true);
    let max_redirects = request.get("maxRedirects").and_then(|v| v.as_u64()).unwrap_or(10) as u32;

    let method_str = request.get("method").and_then(|v| v.as_str()).unwrap_or("GET");
    let mut url = request.get("url").and_then(|v| v.as_str()).unwrap_or("").to_string();
    // Auto-prepend http:// if no protocol specified (matches Postman/Insomnia behavior;
    // servers requiring HTTPS will redirect via 301/302)
    if !url.is_empty() && !url.contains("://") {
        url = format!("http://{}", url);
    }

    let config = HttpRequestConfig {
        method: HttpMethod(method_str.to_string()),
        url,
        headers: headers_vec,
        params: params_vec,
        body: body_content,
        body_bytes: None,
        body_type,
        timeout_ms: timeout,
        follow_redirects,
        max_redirects,
        auth_username,
        auth_password,
        bearer_token,
        ssl,
        proxy,
    };

    http_client
        .execute(config, None::<fn(usize, Option<u64>)>)
        .await
}
