// HTTP command handlers for Tauri
// Exposes HTTP client to the frontend via Tauri commands

use crate::models::types::{AuthState, AuthType, HttpMethod, KeyValue, ResponseData};
use crate::services::http_client::{HttpClient, HttpRequestConfig};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;
use std::sync::Arc;
use tauri::{AppHandle, Emitter};
use tokio::sync::Mutex;
use tokio::task::JoinHandle;

/// Request registry to track and cancel in-flight requests
type RequestRegistry = Arc<Mutex<HashMap<String, JoinHandle<()>>>>;

/// Initialize request registry (call this in main.rs setup)
pub fn init_request_registry() -> RequestRegistry {
    Arc::new(Mutex::new(HashMap::new()))
}

/// Body state from frontend (matches @hivefetch/core BodyState)
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BodyState {
    #[serde(rename = "type")]
    pub body_type: String, // "none" | "json" | "text" | "x-www-form-urlencoded" | "form-data" | "graphql" | "binary"
    #[serde(skip_serializing_if = "Option::is_none")]
    pub content: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub graphql_variables: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub graphql_operation_name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub file_mime_type: Option<String>,
}

/// Full request data from frontend (matches what UI sends via sendRequest message)
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SendRequestData {
    pub method: HttpMethod,
    pub url: String,
    #[serde(default)]
    pub headers: Vec<KeyValue>,
    #[serde(default)]
    pub params: Vec<KeyValue>,
    pub body: BodyState,
    pub auth: AuthState,
}

/// Send an HTTP request
#[tauri::command]
pub async fn send_request(
    data: SendRequestData,
    app: AppHandle,
    registry: tauri::State<'_, RequestRegistry>,
) -> Result<(), String> {
    // Use URL as panel_id for now (since we don't have panel concept in desktop)
    let panel_id = format!("desktop-{}", data.url);

    // Transform SendRequestData to HttpRequestConfig
    let mut headers_map: HashMap<String, String> = HashMap::new();
    for h in &data.headers {
        if h.enabled && !h.key.is_empty() {
            headers_map.insert(h.key.clone(), h.value.clone());
        }
    }

    let mut params_map: HashMap<String, String> = HashMap::new();
    for p in &data.params {
        if p.enabled && !p.key.is_empty() {
            params_map.insert(p.key.clone(), p.value.clone());
        }
    }

    // Handle authentication
    let (auth_username, auth_password, bearer_token) = match data.auth.auth_type {
        AuthType::Basic => (
            data.auth.username.clone(),
            data.auth.password.clone(),
            None,
        ),
        AuthType::Bearer => (None, None, data.auth.token.clone()),
        AuthType::ApiKey => {
            // API Key in header or query param
            if let (Some(name), Some(value)) = (&data.auth.api_key_name, &data.auth.api_key_value)
            {
                if data.auth.api_key_in.as_deref() == Some("query") {
                    params_map.insert(name.clone(), value.clone());
                } else {
                    headers_map.insert(name.clone(), value.clone());
                }
            }
            (None, None, None)
        }
        AuthType::OAuth2 => {
            // OAuth2 token should be in the token field
            if let Some(token) = &data.auth.token {
                headers_map.insert("Authorization".to_string(), format!("Bearer {}", token));
            }
            (None, None, None)
        }
        AuthType::Aws => {
            // AWS signature not yet implemented in desktop
            // TODO: Implement AWS signature v4
            eprintln!("[WARN] AWS auth not yet supported in desktop app");
            (None, None, None)
        }
        AuthType::None => (None, None, None),
    };

    // Handle body
    let (body_content, body_type) = match data.body.body_type.as_str() {
        "none" => (None, "none".to_string()),
        "json" => {
            if let Some(content) = &data.body.content {
                headers_map
                    .entry("Content-Type".to_string())
                    .or_insert("application/json".to_string());
                (Some(content.clone()), "json".to_string())
            } else {
                (None, "none".to_string())
            }
        }
        "text" => {
            if let Some(content) = &data.body.content {
                headers_map
                    .entry("Content-Type".to_string())
                    .or_insert("text/plain".to_string());
                (Some(content.clone()), "text".to_string())
            } else {
                (None, "none".to_string())
            }
        }
        "x-www-form-urlencoded" => {
            if let Some(content) = &data.body.content {
                headers_map
                    .entry("Content-Type".to_string())
                    .or_insert("application/x-www-form-urlencoded".to_string());
                // Content should already be URL-encoded string
                (Some(content.clone()), "x-www-form-urlencoded".to_string())
            } else {
                (None, "none".to_string())
            }
        }
        "form-data" => {
            if let Some(content) = &data.body.content {
                headers_map
                    .entry("Content-Type".to_string())
                    .or_insert("multipart/form-data".to_string());
                // TODO: Handle file uploads in form-data
                (Some(content.clone()), "form-data".to_string())
            } else {
                (None, "none".to_string())
            }
        }
        "graphql" => {
            if let Some(query) = &data.body.content {
                // Build GraphQL payload
                let mut payload = serde_json::json!({ "query": query });
                if let Some(vars) = &data.body.graphql_variables {
                    if let Ok(vars_json) = serde_json::from_str::<Value>(vars) {
                        payload["variables"] = vars_json;
                    }
                }
                if let Some(op_name) = &data.body.graphql_operation_name {
                    payload["operationName"] = Value::String(op_name.clone());
                }
                headers_map
                    .entry("Content-Type".to_string())
                    .or_insert("application/json".to_string());
                (Some(payload.to_string()), "json".to_string())
            } else {
                (None, "none".to_string())
            }
        }
        "binary" => {
            if let Some(content) = &data.body.content {
                if let Some(mime) = &data.body.file_mime_type {
                    headers_map
                        .entry("Content-Type".to_string())
                        .or_insert(mime.clone());
                } else {
                    headers_map
                        .entry("Content-Type".to_string())
                        .or_insert("application/octet-stream".to_string());
                }
                // TODO: Handle binary file uploads
                (Some(content.clone()), "binary".to_string())
            } else {
                (None, "none".to_string())
            }
        }
        _ => (None, "none".to_string()),
    };

    // Convert HashMap to Vec<KeyValue> for HTTP client
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

    // Create HTTP client config
    let config = HttpRequestConfig {
        method: data.method,
        url: data.url.clone(),
        headers: headers_vec,
        params: params_vec,
        body: body_content,
        body_type,
        timeout_ms: 120000,
        auth_username,
        auth_password,
        bearer_token,
    };

    // Clone registry for cleanup after request completes
    let registry_for_cleanup = registry.inner().clone();
    let panel_id_for_cleanup = panel_id.clone();

    // Spawn async task to execute request
    let handle = tokio::spawn(async move {
        // Create HTTP client
        let client = match HttpClient::new() {
            Ok(c) => c,
            Err(e) => {
                let _ = app.emit(
                    "requestResponse",
                    serde_json::json!({ "data": create_error_response(format!("Failed to create HTTP client: {}", e)) }),
                );
                // Cleanup registry on error
                let mut registry_lock = registry_for_cleanup.lock().await;
                registry_lock.remove(&panel_id_for_cleanup);
                return;
            }
        };

        // Execute request
        match client.execute(config).await {
            Ok(response) => {
                println!("[HiveFetch] Request successful, status: {}", response.status);
                // Emit success response (wrap in data field to match IncomingMessage format)
                if let Err(e) = app.emit("requestResponse", serde_json::json!({ "data": response })) {
                    eprintln!("[HiveFetch] Failed to emit response: {}", e);
                }
            }
            Err(e) => {
                eprintln!("[HiveFetch] Request failed: {}", e);
                // Emit error response (wrap in data field to match IncomingMessage format)
                if let Err(err) = app.emit("requestResponse", serde_json::json!({ "data": create_error_response(e) })) {
                    eprintln!("[HiveFetch] Failed to emit error response: {}", err);
                }
            }
        }

        // Cleanup registry after request completes
        let mut registry_lock = registry_for_cleanup.lock().await;
        registry_lock.remove(&panel_id_for_cleanup);
    });

    // Store handle in registry for cancellation
    let mut registry_lock = registry.lock().await;
    registry_lock.insert(panel_id, handle);

    Ok(())
}

/// Cancel an in-flight HTTP request
#[tauri::command]
pub async fn cancel_request(
    panel_id: String,
    app: AppHandle,
    registry: tauri::State<'_, RequestRegistry>,
) -> Result<(), String> {
    let mut registry_lock = registry.lock().await;

    if let Some(handle) = registry_lock.remove(&panel_id) {
        // Abort the task
        handle.abort();

        // Emit cancellation event
        let _ = app.emit("requestCancelled", ());

        Ok(())
    } else {
        Err(format!("No active request found for panel {}", panel_id))
    }
}

/// Create an error response
fn create_error_response(message: String) -> ResponseData {
    ResponseData {
        status: 0,
        status_text: "Error".to_string(),
        headers: HashMap::new(),
        data: serde_json::json!({ "error": message }),
        duration: 0,
        size: 0,
        error: Some(true),
        timing: None,
        content_category: None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    // --- Error Response Tests ---

    #[test]
    fn test_create_error_response() {
        let response = create_error_response("Test error".to_string());
        assert_eq!(response.status, 0);
        assert_eq!(response.status_text, "Error");
        assert_eq!(response.error, Some(true));
        assert_eq!(response.data["error"], "Test error");
    }

    #[test]
    fn test_create_error_response_with_long_message() {
        let long_message = "A".repeat(1000);
        let response = create_error_response(long_message.clone());
        assert_eq!(response.data["error"], long_message);
        assert!(response.headers.is_empty());
        assert_eq!(response.duration, 0);
        assert_eq!(response.size, 0);
    }

    #[test]
    fn test_create_error_response_with_special_characters() {
        let message = "Error with \"quotes\" and \n newlines \t tabs";
        let response = create_error_response(message.to_string());
        assert_eq!(response.data["error"], message);
    }

    // --- Request Registry Tests ---

    #[test]
    fn test_init_request_registry() {
        let registry = init_request_registry();
        assert!(registry.try_lock().is_ok());
        let lock = registry.try_lock().unwrap();
        assert_eq!(lock.len(), 0);
    }

    #[tokio::test]
    async fn test_request_registry_insert_and_remove() {
        let registry = init_request_registry();

        // Create a dummy handle
        let handle = tokio::spawn(async {
            tokio::time::sleep(tokio::time::Duration::from_millis(100)).await;
        });

        // Insert
        {
            let mut lock = registry.lock().await;
            lock.insert("test-panel".to_string(), handle);
            assert_eq!(lock.len(), 1);
        }

        // Remove
        {
            let mut lock = registry.lock().await;
            let removed = lock.remove("test-panel");
            assert!(removed.is_some());
            assert_eq!(lock.len(), 0);
        }
    }

    #[tokio::test]
    async fn test_request_registry_multiple_panels() {
        let registry = init_request_registry();

        let handle1 = tokio::spawn(async {});
        let handle2 = tokio::spawn(async {});
        let handle3 = tokio::spawn(async {});

        {
            let mut lock = registry.lock().await;
            lock.insert("panel1".to_string(), handle1);
            lock.insert("panel2".to_string(), handle2);
            lock.insert("panel3".to_string(), handle3);
            assert_eq!(lock.len(), 3);
        }

        // Remove one
        {
            let mut lock = registry.lock().await;
            lock.remove("panel2");
            assert_eq!(lock.len(), 2);
            assert!(lock.contains_key("panel1"));
            assert!(!lock.contains_key("panel2"));
            assert!(lock.contains_key("panel3"));
        }
    }
}
