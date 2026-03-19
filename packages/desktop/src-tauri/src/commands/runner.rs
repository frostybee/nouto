// Collection Runner command handlers for Tauri
// Executes a sequence of HTTP requests from a collection, emitting progress events

use crate::models::types::{
    AuthState, AuthType, CollectionRunConfig, CollectionRunRequestResult,
    CollectionRunResult, HttpMethod, KeyValue,
};
use crate::services::http_client::{HttpClient, HttpRequestConfig};
use crate::services::storage::StorageService;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use tauri::{AppHandle, Emitter, Manager};

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
}

/// Start a collection run: execute requests sequentially, emitting progress events
#[tauri::command]
pub async fn start_collection_run(
    data: StartCollectionRunData,
    app: AppHandle,
    registry: tauri::State<'_, RunnerRegistry>,
) -> Result<(), String> {
    // Reset cancellation flag
    registry.0.store(false, Ordering::SeqCst);
    let cancelled = registry.0.clone();

    // Load collections from disk to resolve request data
    let storage = app.state::<StorageService>();
    let collections_json = storage.load_collections().await?;

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
    let total = ordered_requests.len();
    let collection_id = data.collection_id.clone();
    let stop_on_failure = data.config.stop_on_failure;
    let delay_ms = data.config.delay_ms;

    // Clone request data for the async task
    let requests_owned: Vec<Value> = ordered_requests.into_iter().cloned().collect();

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

        for (index, request_json) in requests_owned.iter().enumerate() {
            // Check cancellation
            if cancelled.load(Ordering::SeqCst) {
                stopped_early = true;
                break;
            }

            let req_name = request_json.get("name").and_then(|v| v.as_str()).unwrap_or("").to_string();
            let req_id = request_json.get("id").and_then(|v| v.as_str()).unwrap_or("").to_string();
            let req_method_str = request_json.get("method").and_then(|v| v.as_str()).unwrap_or("GET").to_string();
            let req_url = request_json.get("url").and_then(|v| v.as_str()).unwrap_or("").to_string();

            // Emit progress
            let _ = app.emit("collectionRunProgress", serde_json::json!({
                "data": {
                    "current": index + 1,
                    "total": total,
                    "requestName": req_name
                }
            }));

            // Execute the request
            let result = execute_request_from_json(&http_client, request_json).await;

            let request_result = match result {
                Ok(response) => {
                    let passed = response.error.is_none() || !response.error.unwrap_or(false);
                    CollectionRunRequestResult {
                        request_id: req_id,
                        request_name: req_name,
                        method: HttpMethod(req_method_str),
                        url: req_url,
                        status: response.status,
                        status_text: response.status_text.clone(),
                        duration: response.duration,
                        size: response.size,
                        passed,
                        error: if !passed {
                            Some(response.data.as_str().unwrap_or("Request failed").to_string())
                        } else {
                            None
                        },
                        assertion_results: None,
                        script_test_results: None,
                        response_data: Some(response.data),
                        response_headers: Some(response.headers),
                        script_logs: None,
                    }
                }
                Err(error_msg) => CollectionRunRequestResult {
                    request_id: req_id,
                    request_name: req_name,
                    method: HttpMethod(req_method_str),
                    url: req_url,
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
                break;
            }

            // Delay between requests
            if delay_ms > 0 && index < total - 1 {
                tokio::time::sleep(tokio::time::Duration::from_millis(delay_ms as u64)).await;
            }
        }

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
        .unwrap_or(AuthState {
            auth_type: AuthType::None,
            username: None,
            password: None,
            token: None,
            api_key_name: None,
            api_key_value: None,
            api_key_in: None,
            oauth2: None,
            oauth_token_data: None,
            aws_access_key: None,
            aws_secret_key: None,
            aws_region: None,
            aws_service: None,
            aws_session_token: None,
            ntlm_domain: None,
            ntlm_workstation: None,
        });

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
        })
        .collect();

    let params_vec: Vec<KeyValue> = params_map
        .into_iter()
        .map(|(key, value)| KeyValue {
            id: uuid::Uuid::new_v4().to_string(),
            key,
            value,
            enabled: true,
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
    let url = request.get("url").and_then(|v| v.as_str()).unwrap_or("").to_string();

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
