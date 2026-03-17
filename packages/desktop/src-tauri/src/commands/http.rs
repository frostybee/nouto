// HTTP command handlers for Tauri
// Exposes HTTP client to the frontend via Tauri commands

use crate::models::types::{AuthState, AuthType, HttpMethod, KeyValue, ProxyConfig, ResponseData, SslConfig};
use crate::services::http_client::{HttpClient, HttpRequestConfig};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;
use std::sync::Arc;
use tauri::{AppHandle, Emitter};
use tokio::sync::Mutex;
use tokio::task::JoinHandle;
use chrono::Utc;

/// Refresh an OAuth2 access token using the refresh_token grant
async fn refresh_oauth_token(
    token_url: &str,
    client_id: &str,
    client_secret: Option<&str>,
    refresh_token: &str,
) -> Result<crate::models::types::OAuthToken, String> {
    let http = reqwest::Client::new();
    let mut params = vec![
        ("grant_type", "refresh_token"),
        ("refresh_token", refresh_token),
        ("client_id", client_id),
    ];
    let secret_owned;
    if let Some(s) = client_secret {
        secret_owned = s.to_string();
        params.push(("client_secret", &secret_owned));
    }

    let resp = http
        .post(token_url)
        .form(&params)
        .send()
        .await
        .map_err(|e| format!("Token refresh request failed: {}", e))?;

    let json: serde_json::Value = resp
        .json()
        .await
        .map_err(|e| format!("Failed to parse token refresh response: {}", e))?;

    let access_token = json["access_token"]
        .as_str()
        .ok_or("Missing access_token in refresh response")?
        .to_string();

    let expires_at = json["expires_in"].as_i64().map(|expires_in| {
        Utc::now().timestamp_millis() + expires_in * 1000
    });

    Ok(crate::models::types::OAuthToken {
        access_token,
        refresh_token: json["refresh_token"].as_str().map(|s| s.to_string())
            .or_else(|| Some(refresh_token.to_string())),
        token_type: json["token_type"].as_str().unwrap_or("Bearer").to_string(),
        expires_at,
        scope: json["scope"].as_str().map(|s| s.to_string()),
    })
}

/// Request registry to track and cancel in-flight requests
type RequestRegistry = Arc<Mutex<HashMap<String, JoinHandle<()>>>>;

/// Initialize request registry (call this in main.rs setup)
pub fn init_request_registry() -> RequestRegistry {
    Arc::new(Mutex::new(HashMap::new()))
}

/// Body state from frontend (matches @nouto/core BodyState)
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
    #[serde(skip_serializing_if = "Option::is_none")]
    pub ssl: Option<SslConfig>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub proxy: Option<ProxyConfig>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub timeout: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub follow_redirects: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub max_redirects: Option<u32>,
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
    // NTLM is not supported in the desktop app - emit an early error response
    if data.auth.auth_type == AuthType::Ntlm {
        let _ = app.emit(
            "requestResponse",
            serde_json::json!({
                "data": {
                    "status": 0,
                    "statusText": "Not Supported",
                    "headers": {},
                    "data": "NTLM authentication is not supported in the Nouto desktop app. Use the VS Code extension for NTLM requests.",
                    "duration": 0,
                    "size": 0,
                    "error": true
                }
            }),
        );
        return Ok(());
    }

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
            // OAuth2 token is passed via bearer_token so the auto-refresh override can replace it
            (None, None, data.auth.token.clone())
        }
        AuthType::Aws => {
            // AWS signature not yet implemented in desktop
            // TODO: Implement AWS signature v4
            eprintln!("[WARN] AWS auth not yet supported in desktop app");
            (None, None, None)
        }
        AuthType::Digest => {
            // Digest auth credentials are handled after the initial request (challenge-response)
            (None, None, None)
        }
        AuthType::Ntlm | AuthType::None => (None, None, None),
    };

    // Extract digest credentials if applicable
    let digest_auth = if data.auth.auth_type == AuthType::Digest {
        Some((
            data.auth.username.clone().unwrap_or_default(),
            data.auth.password.clone().unwrap_or_default(),
        ))
    } else {
        None
    };

    // Handle body
    let mut binary_body: Option<Vec<u8>> = None;
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
        "xml" => {
            if let Some(content) = &data.body.content {
                headers_map
                    .entry("Content-Type".to_string())
                    .or_insert("application/xml".to_string());
                (Some(content.clone()), "xml".to_string())
            } else {
                (None, "none".to_string())
            }
        }
        "x-www-form-urlencoded" => {
            if let Some(content) = &data.body.content {
                headers_map
                    .entry("Content-Type".to_string())
                    .or_insert("application/x-www-form-urlencoded".to_string());
                // Parse the JSON array of form items into URL-encoded key=value pairs
                let encoded = if let Ok(items) = serde_json::from_str::<Vec<Value>>(content) {
                    let mut serializer = form_urlencoded::Serializer::new(String::new());
                    for item in &items {
                        let enabled = item.get("enabled").and_then(|v| v.as_bool()).unwrap_or(false);
                        let key = item.get("key").and_then(|v| v.as_str()).unwrap_or("");
                        if !enabled || key.is_empty() { continue; }
                        let value = item.get("value").and_then(|v| v.as_str()).unwrap_or("");
                        serializer.append_pair(key, value);
                    }
                    serializer.finish()
                } else {
                    content.clone()
                };
                (Some(encoded), "x-www-form-urlencoded".to_string())
            } else {
                (None, "none".to_string())
            }
        }
        "form-data" => {
            if let Some(content) = &data.body.content {
                // Don't set Content-Type here; reqwest's multipart will set it with the boundary
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
            if let Some(file_path) = &data.body.content {
                if let Some(mime) = &data.body.file_mime_type {
                    headers_map
                        .entry("Content-Type".to_string())
                        .or_insert(mime.clone());
                } else {
                    headers_map
                        .entry("Content-Type".to_string())
                        .or_insert("application/octet-stream".to_string());
                }
                // Read the file and store bytes for the HTTP client
                match std::fs::read(file_path) {
                    Ok(bytes) => {
                        binary_body = Some(bytes);
                        (None, "binary".to_string())
                    }
                    Err(e) => {
                        let _ = app.emit("requestResponse", ResponseData {
                            status: 0,
                            status_text: "File Error".to_string(),
                            headers: HashMap::new(),
                            data: Value::String(format!("Failed to read file '{}': {}", file_path, e)),
                            duration: 0,
                            size: 0,
                            error: Some(true),
                            timing: None,
                            content_category: None,
                            request_headers: None,
                            request_url: None,
                        });
                        return Ok(());
                    }
                }
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
        body_bytes: binary_body,
        body_type,
        timeout_ms: data.timeout.unwrap_or(30000),
        follow_redirects: data.follow_redirects.unwrap_or(true),
        max_redirects: data.max_redirects.unwrap_or(10),
        auth_username,
        auth_password,
        bearer_token,
        ssl: data.ssl.clone(),
        proxy: data.proxy.clone(),
    };

    // Clone registry for cleanup after request completes
    let registry_for_cleanup = registry.inner().clone();
    let panel_id_for_cleanup = panel_id.clone();

    // Clone auth data needed for OAuth2 auto-refresh
    let auth_for_refresh = data.auth.clone();
    let app_for_refresh = app.clone();

    // Spawn async task to execute request
    let handle = tokio::spawn(async move {
        // OAuth2 auto-refresh: if token is within 30s of expiry and we have a refresh token, refresh it
        let mut config = config;
        if auth_for_refresh.auth_type == AuthType::OAuth2 {
            if let Some(token_data) = &auth_for_refresh.oauth_token_data {
                if let (Some(expires_at), Some(refresh_token)) =
                    (&token_data.expires_at, &token_data.refresh_token)
                {
                    let now = Utc::now().timestamp_millis();
                    if expires_at - now < 30_000 {
                        if let Some(oauth2_cfg) = &auth_for_refresh.oauth2 {
                            if let Some(token_url) = &oauth2_cfg.token_url {
                                match refresh_oauth_token(
                                    token_url,
                                    &oauth2_cfg.client_id,
                                    oauth2_cfg.client_secret.as_deref(),
                                    refresh_token,
                                )
                                .await
                                {
                                    Ok(new_token) => {
                                        // Use new access token for this request
                                        let new_access_token = new_token.access_token.clone();
                                        // Notify UI of the refreshed token
                                        let _ = app_for_refresh.emit(
                                            "oauthTokenRefreshed",
                                            serde_json::json!({ "data": new_token }),
                                        );
                                        config.bearer_token = Some(new_access_token);
                                    }
                                    Err(e) => {
                                        eprintln!("[Nouto] OAuth2 token refresh failed: {}", e);
                                        // Proceed with the stale token - request will likely 401
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }

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

        // Execute request with download progress
        let app_for_progress = app.clone();
        let on_progress = move |loaded: usize, total: Option<u64>| {
            let _ = app_for_progress.emit("downloadProgress", serde_json::json!({
                "data": { "loaded": loaded, "total": total }
            }));
        };
        match client.execute(config.clone(), Some(on_progress)).await {
            Ok(response) => {
                // Digest auth challenge-response: if 401 with WWW-Authenticate, retry with credentials
                if response.status == 401 && digest_auth.is_some() {
                    if let Some(www_auth) = response.headers.get("www-authenticate") {
                        if let Some(challenge) = crate::services::digest_auth::parse_digest_challenge(www_auth) {
                            let (ref username, ref password) = *digest_auth.as_ref().unwrap();
                            let uri = reqwest::Url::parse(&config.url)
                                .map(|u| {
                                    let path = u.path().to_string();
                                    match u.query() {
                                        Some(q) => format!("{}?{}", path, q),
                                        None => path,
                                    }
                                })
                                .unwrap_or_else(|_| config.url.clone());
                            let auth_header = crate::services::digest_auth::compute_digest_auth(
                                username, password, config.method.as_str(), &uri, &challenge,
                            );
                            let mut retry_config = config.clone();
                            retry_config.headers.push(KeyValue {
                                id: String::new(),
                                key: "Authorization".to_string(),
                                value: auth_header,
                                enabled: true,
                            });
                            let no_progress = |_loaded: usize, _total: Option<u64>| {};
                            match client.execute(retry_config, Some(no_progress)).await {
                                Ok(retry_response) => {
                                    println!("[Nouto] Digest auth retry successful, status: {}", retry_response.status);
                                    if let Err(e) = app.emit("requestResponse", serde_json::json!({ "data": retry_response })) {
                                        eprintln!("[Nouto] Failed to emit response: {}", e);
                                    }
                                }
                                Err(e) => {
                                    eprintln!("[Nouto] Digest auth retry failed: {}", e);
                                    if let Err(err) = app.emit("requestResponse", serde_json::json!({ "data": create_error_response(e) })) {
                                        eprintln!("[Nouto] Failed to emit error response: {}", err);
                                    }
                                }
                            }
                        } else {
                            if let Err(e) = app.emit("requestResponse", serde_json::json!({ "data": response })) {
                                eprintln!("[Nouto] Failed to emit response: {}", e);
                            }
                        }
                    } else {
                        if let Err(e) = app.emit("requestResponse", serde_json::json!({ "data": response })) {
                            eprintln!("[Nouto] Failed to emit response: {}", e);
                        }
                    }
                } else {
                    println!("[Nouto] Request successful, status: {}", response.status);
                    if let Err(e) = app.emit("requestResponse", serde_json::json!({ "data": response })) {
                        eprintln!("[Nouto] Failed to emit response: {}", e);
                    }
                }
            }
            Err(e) => {
                eprintln!("[Nouto] Request failed: {}", e);
                if let Err(err) = app.emit("requestResponse", serde_json::json!({ "data": create_error_response(e) })) {
                    eprintln!("[Nouto] Failed to emit error response: {}", err);
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

/// Open a file picker and emit the selected SSL cert/key path back to the frontend
#[tauri::command]
pub async fn pick_ssl_file(app: AppHandle, data: serde_json::Value) -> Result<(), String> {
    use tauri_plugin_dialog::DialogExt;
    let field = data["field"].as_str().unwrap_or("cert").to_string();

    let path = app
        .dialog()
        .file()
        .add_filter("Certificate files", &["pem", "crt", "key", "p12", "pfx", "der"])
        .blocking_pick_file();

    if let Some(file_path) = path {
        app.emit(
            "sslFilePicked",
            serde_json::json!({
                "data": { "field": field, "path": file_path.to_string() }
            }),
        )
        .map_err(|e| e.to_string())?;
    }
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
        request_headers: None,
        request_url: None,
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
