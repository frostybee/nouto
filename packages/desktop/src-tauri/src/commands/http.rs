// HTTP command handlers for Tauri
// Exposes HTTP client to the frontend via Tauri commands

use crate::models::types::{AuthState, AuthType, HttpMethod, KeyValue, ProxyConfig, ResponseData, SslConfig};
use crate::services::http_client::{HttpClient, HttpRequestConfig};
use crate::services::script_engine::VariableToSet;
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
    #[serde(skip_serializing_if = "Option::is_none")]
    pub request_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub request_name: Option<String>,
    #[serde(default)]
    pub assertions: Option<Vec<Value>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub script_chain: Option<crate::models::types::ScriptChainData>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub env_data: Option<crate::models::types::EnvDataPayload>,
    #[serde(default)]
    pub cookies: Vec<Value>,
}

/// Send an HTTP request
#[tauri::command]
pub async fn send_request(
    data: SendRequestData,
    app: AppHandle,
    registry: tauri::State<'_, RequestRegistry>,
) -> Result<(), String> {
    // Use request_id if available, else a constant key for the active desktop request
    let panel_id = data.request_id.clone().unwrap_or_else(|| "desktop-active".to_string());

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
            // OAuth2 token is passed via bearer_token so the auto-refresh override can replace it
            (None, None, data.auth.token.clone())
        }
        AuthType::Aws => {
            // AWS SigV4 headers are computed and injected before sending (see aws_auth block below)
            (None, None, None)
        }
        AuthType::Digest => {
            // Digest auth credentials are handled after the initial request (challenge-response)
            (None, None, None)
        }
        AuthType::Ntlm => {
            // NTLM auth credentials are handled after the initial request (challenge-response)
            (None, None, None)
        }
        AuthType::None => (None, None, None),
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

    // Extract NTLM credentials if applicable
    let ntlm_auth = if data.auth.auth_type == AuthType::Ntlm {
        Some((
            data.auth.username.clone().unwrap_or_default(),
            data.auth.password.clone().unwrap_or_default(),
            data.auth.ntlm_domain.clone().unwrap_or_default(),
            data.auth.ntlm_workstation.clone().unwrap_or_default(),
        ))
    } else {
        None
    };

    // Extract AWS signing params if applicable
    let aws_auth = if data.auth.auth_type == AuthType::Aws {
        match (&data.auth.aws_access_key, &data.auth.aws_secret_key, &data.auth.aws_region, &data.auth.aws_service) {
            (Some(access_key), Some(secret_key), Some(region), Some(service))
                if !access_key.is_empty() && !secret_key.is_empty() && !region.is_empty() && !service.is_empty() =>
            {
                Some(crate::services::aws_auth::AwsSigningParams {
                    access_key_id: access_key.clone(),
                    secret_access_key: secret_key.clone(),
                    session_token: data.auth.aws_session_token.clone(),
                    region: region.clone(),
                    service: service.clone(),
                })
            }
            _ => {
                eprintln!("[Nouto] AWS auth missing required fields (access_key, secret_key, region, service)");
                None
            }
        }
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
                        let error_response = ResponseData {
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
                        };
                        let _ = app.emit("requestResponse", serde_json::json!({ "data": error_response }));
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

    // Clone request identity for storeResponseContext emission
    let req_id_for_context = data.request_id.clone();
    let req_name_for_context = data.request_name.clone();

    // Clone request data for history recording
    let history_method = config.method.as_str().to_uppercase();
    let history_url = data.url.clone();
    let history_headers: Vec<Value> = data.headers.iter().map(|h| serde_json::json!({
        "id": h.id, "key": h.key, "value": h.value, "enabled": h.enabled
    })).collect();
    let history_params: Vec<Value> = data.params.iter().map(|p| serde_json::json!({
        "id": p.id, "key": p.key, "value": p.value, "enabled": p.enabled
    })).collect();
    let history_body = serde_json::to_value(&data.body).ok();
    let history_auth = serde_json::to_value(&data.auth).ok();
    let history_req_id = data.request_id.clone();
    let history_req_name = data.request_name.clone();
    let app_for_history = app.clone();
    let assertions_for_eval = data.assertions.clone().unwrap_or_default();
    let script_chain = data.script_chain.clone();
    let env_data = data.env_data.clone();
    let app_for_scripts = app.clone();

    // Spawn async task to execute request
    let handle = tokio::spawn(async move {
        // Helper to build response JSON with assertion results
        let build_response_json = |response: &ResponseData| -> Value {
            let mut resp_json = serde_json::json!({ "data": response });
            if !assertions_for_eval.is_empty() {
                let eval = evaluate_assertions(&assertions_for_eval, response);
                if let Some(data_obj) = resp_json.get_mut("data").and_then(|d| d.as_object_mut()) {
                    data_obj.insert("assertionResults".to_string(), Value::Array(eval.results));
                }
                if !eval.variables_to_set.is_empty() {
                    let _ = app.emit("setVariables", serde_json::json!({ "data": eval.variables_to_set }));
                }
            }
            resp_json
        };

        // Helper to record history after a response
        let record_history = |app: &AppHandle, response: &ResponseData| {
            let response_body = match &response.data {
                Value::String(s) => {
                    // Cap at 256 KB
                    if s.len() > 256 * 1024 {
                        Some(s[..256 * 1024].to_string())
                    } else {
                        Some(s.clone())
                    }
                }
                other => serde_json::to_string(other).ok(),
            };
            let body_truncated = response_body.as_ref().map(|b| b.len() >= 256 * 1024).unwrap_or(false);

            let entry = serde_json::json!({
                "id": uuid::Uuid::new_v4().to_string(),
                "timestamp": Utc::now().to_rfc3339(),
                "method": history_method,
                "url": history_url,
                "headers": history_headers,
                "params": history_params,
                "body": history_body,
                "auth": history_auth,
                "responseStatus": response.status,
                "responseHeaders": response.headers,
                "responseBody": response_body,
                "bodyTruncated": body_truncated,
                "responseDuration": response.duration,
                "responseSize": response.size,
                "requestId": history_req_id,
                "requestName": history_req_name,
            });

            let app_clone = app.clone();
            tokio::spawn(async move {
                crate::commands::history::append_history_entry(&app_clone, &entry).await;
            });
        };

        // Helper to emit storeResponseContext after a successful response
        let emit_response_context = |app: &AppHandle, response: &ResponseData| {
            if let Some(ref rid) = req_id_for_context {
                let _ = app.emit("storeResponseContext", serde_json::json!({
                    "data": {
                        "requestId": rid,
                        "response": response,
                        "requestName": req_name_for_context
                    }
                }));
            }
        };

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

        // Run pre-request scripts (collection -> folders -> request)
        // Variables set by earlier scripts flow to subsequent scripts in the chain.
        if let Some(ref chain) = script_chain {
            let mut current_env = env_data.as_ref()
                .and_then(|e| e.active_environment.clone())
                .unwrap_or(serde_json::json!({}));
            let mut current_globals = env_data.as_ref()
                .and_then(|e| e.global_variables.clone())
                .unwrap_or_default();

            for entry in &chain.entries {
                if entry.pre_request.trim().is_empty() { continue; }

                let request_json = serde_json::json!({
                    "method": config.method.as_str().to_uppercase(),
                    "url": config.url,
                    "headers": config.headers.iter()
                        .filter(|h| h.enabled)
                        .map(|h| (h.key.clone(), h.value.clone()))
                        .collect::<std::collections::HashMap<String, String>>(),
                });

                let script_context = crate::services::script_engine::ScriptContext {
                    request: request_json,
                    response: None,
                    environment: current_env.clone(),
                    global_variables: Value::Array(current_globals.clone()),
                    info: Some(serde_json::json!({
                        "requestName": history_req_name,
                        "currentIteration": 0,
                        "totalIterations": 1,
                    })),
                    cookies: data.cookies.iter()
                        .filter_map(|v| serde_json::from_value::<crate::services::script_engine::ScriptCookie>(v.clone()).ok())
                        .collect(),
                };

                let result = crate::services::script_engine::ScriptEngine::execute_pre_request(
                    &entry.pre_request, &script_context
                ).await;

                if !result.cookie_mutations.is_empty() {
                    let _ = app_for_scripts.emit("cookieMutations",
                        serde_json::json!({ "data": result.cookie_mutations }));
                }

                // Emit script output
                let _ = app_for_scripts.emit("scriptOutput", serde_json::json!({
                    "data": {
                        "phase": "preRequest",
                        "result": {
                            "success": result.error.is_none(),
                            "logs": result.logs,
                            "testResults": result.test_results,
                            "variablesToSet": result.variables_to_set,
                            "error": result.error,
                        }
                    }
                }));

                // Emit variables to set and apply to in-memory env for next script
                if !result.variables_to_set.is_empty() {
                    let _ = app_for_scripts.emit("setVariables", serde_json::json!({
                        "data": result.variables_to_set
                    }));
                    // Flow variables to next script in chain
                    for var in &result.variables_to_set {
                        if var.scope == "global" {
                            current_globals.push(serde_json::json!({
                                "key": var.key, "value": var.value, "enabled": true
                            }));
                        } else if let Some(vars) = current_env.get_mut("variables").and_then(|v| v.as_array_mut()) {
                            // Update existing or add new
                            let mut found = false;
                            for v in vars.iter_mut() {
                                if v["key"].as_str() == Some(&var.key) {
                                    v["value"] = Value::String(var.value.clone());
                                    found = true;
                                    break;
                                }
                            }
                            if !found {
                                vars.push(serde_json::json!({
                                    "key": var.key, "value": var.value, "enabled": true
                                }));
                            }
                        }
                    }
                }

                // Apply modified request to config
                if let Some(ref modified) = result.modified_request {
                    if let Some(url) = modified["url"].as_str() {
                        config.url = url.to_string();
                    }
                    if let Some(method) = modified["method"].as_str() {
                        config.method = HttpMethod(method.to_string());
                    }
                    // Apply header changes from script
                    if let Some(headers) = modified["headers"].as_object() {
                        for (key, val) in headers {
                            if let Some(val_str) = val.as_str() {
                                // Update existing or add new header
                                let mut found = false;
                                for h in config.headers.iter_mut() {
                                    if h.key.eq_ignore_ascii_case(key) {
                                        h.value = val_str.to_string();
                                        found = true;
                                        break;
                                    }
                                }
                                if !found {
                                    config.headers.push(KeyValue {
                                        id: String::new(),
                                        key: key.clone(),
                                        value: val_str.to_string(),
                                        enabled: true,
                                        ..Default::default()
                                    });
                                }
                            }
                        }
                    }
                }

                if !result.error.is_none() { break; }
            }
        }

        // AWS Signature v4: sign the request and inject auth headers
        if let Some(ref aws_params) = aws_auth {
            let existing_headers: Vec<(String, String)> = config.headers.iter()
                .filter(|h| h.enabled && !h.key.is_empty())
                .map(|h| (h.key.clone(), h.value.clone()))
                .collect();
            let body_bytes = config.body.as_ref().map(|b| b.as_bytes());

            // Build full URL with query params for signing
            let sign_url = if config.params.iter().any(|p| p.enabled && !p.key.is_empty()) {
                let mut url = reqwest::Url::parse(&config.url).unwrap_or_else(|_| reqwest::Url::parse("http://localhost").unwrap());
                for p in &config.params {
                    if p.enabled && !p.key.is_empty() {
                        url.query_pairs_mut().append_pair(&p.key, &p.value);
                    }
                }
                url.to_string()
            } else {
                config.url.clone()
            };

            match crate::services::aws_auth::sign_request(
                config.method.as_str(),
                &sign_url,
                &existing_headers,
                body_bytes,
                aws_params,
            ) {
                Ok(signed) => {
                    config.headers.push(KeyValue {
                        id: String::new(),
                        key: "Authorization".to_string(),
                        value: signed.authorization,
                        enabled: true,
                        ..Default::default()
                    });
                    config.headers.push(KeyValue {
                        id: String::new(),
                        key: "x-amz-date".to_string(),
                        value: signed.x_amz_date,
                        enabled: true,
                        ..Default::default()
                    });
                    config.headers.push(KeyValue {
                        id: String::new(),
                        key: "x-amz-content-sha256".to_string(),
                        value: signed.x_amz_content_sha256,
                        enabled: true,
                        ..Default::default()
                    });
                    if let Some(token) = signed.x_amz_security_token {
                        config.headers.push(KeyValue {
                            id: String::new(),
                            key: "x-amz-security-token".to_string(),
                            value: token,
                            enabled: true,
                            ..Default::default()
                        });
                    }
                }
                Err(e) => {
                    eprintln!("[Nouto] AWS SigV4 signing failed: {}", e);
                    let _ = app.emit(
                        "requestResponse",
                        serde_json::json!({ "data": create_error_response(format!("AWS signing failed: {}", e)) }),
                    );
                    let mut registry_lock = registry_for_cleanup.lock().await;
                    registry_lock.remove(&panel_id_for_cleanup);
                    return;
                }
            }
        }

        // NTLM: inject Type 1 (Negotiate) header on the initial request
        if ntlm_auth.is_some() {
            let type1_msg = crate::services::ntlm_auth::create_type1_message();
            config.headers.push(KeyValue {
                id: String::new(),
                key: "Authorization".to_string(),
                value: crate::services::ntlm_auth::encode_authorization(&type1_msg),
                enabled: true,
                ..Default::default()
            });
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
        // Capture response data for post-response scripts
        let mut script_response_json: Option<Value> = None;
        let build_script_response = |resp: &ResponseData| -> Value {
            serde_json::json!({
                "status": resp.status,
                "statusText": resp.status_text,
                "headers": resp.headers,
                "body": resp.data,
                "duration": resp.duration,
                "size": resp.size,
            })
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
                                ..Default::default()
                            });
                            let no_progress = |_loaded: usize, _total: Option<u64>| {};
                            match client.execute(retry_config, Some(no_progress)).await {
                                Ok(retry_response) => {
                                    println!("[Nouto] Digest auth retry successful, status: {}", retry_response.status);
                                    emit_response_context(&app, &retry_response);
                                    script_response_json = Some(build_script_response(&retry_response));
                                    record_history(&app_for_history, &retry_response);
                                    if let Err(e) = app.emit("requestResponse", build_response_json(&retry_response)) {
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
                            emit_response_context(&app, &response);
                            script_response_json = Some(build_script_response(&response));
                            record_history(&app_for_history, &response);
                            if let Err(e) = app.emit("requestResponse", build_response_json(&response)) {
                                eprintln!("[Nouto] Failed to emit response: {}", e);
                            }
                        }
                    } else {
                        emit_response_context(&app, &response);
                        script_response_json = Some(build_script_response(&response));
                        record_history(&app_for_history, &response);
                        if let Err(e) = app.emit("requestResponse", build_response_json(&response)) {
                            eprintln!("[Nouto] Failed to emit response: {}", e);
                        }
                    }
                // NTLM challenge-response: Type 1 was sent, parse Type 2, send Type 3
                } else if response.status == 401 && ntlm_auth.is_some() {
                    let www_auth = response.headers.get("www-authenticate");
                    let type2_data = www_auth.and_then(|v| crate::services::ntlm_auth::extract_type2_from_header(v));
                    if let Some(type2_bytes) = type2_data {
                        match crate::services::ntlm_auth::parse_type2_message(&type2_bytes) {
                            Ok(challenge) => {
                                let (ref username, ref password, ref domain, ref workstation) =
                                    *ntlm_auth.as_ref().unwrap();
                                let type3_msg = crate::services::ntlm_auth::create_type3_message(
                                    username, password, domain, workstation, &challenge,
                                );
                                let auth_header = crate::services::ntlm_auth::encode_authorization(&type3_msg);
                                let mut retry_config = config.clone();
                                // Replace the Type 1 Authorization header with Type 3
                                retry_config.headers.retain(|h| {
                                    !(h.key.eq_ignore_ascii_case("authorization")
                                        && h.value.to_lowercase().starts_with("ntlm "))
                                });
                                retry_config.headers.push(KeyValue {
                                    id: String::new(),
                                    key: "Authorization".to_string(),
                                    value: auth_header,
                                    enabled: true,
                                    ..Default::default()
                                });
                                let no_progress = |_loaded: usize, _total: Option<u64>| {};
                                match client.execute(retry_config, Some(no_progress)).await {
                                    Ok(retry_response) => {
                                        println!("[Nouto] NTLM auth successful, status: {}", retry_response.status);
                                        emit_response_context(&app, &retry_response);
                                        script_response_json = Some(build_script_response(&retry_response));
                                        record_history(&app_for_history, &retry_response);
                                        if let Err(e) = app.emit("requestResponse", build_response_json(&retry_response)) {
                                            eprintln!("[Nouto] Failed to emit response: {}", e);
                                        }
                                    }
                                    Err(e) => {
                                        eprintln!("[Nouto] NTLM auth retry failed: {}", e);
                                        if let Err(err) = app.emit("requestResponse", serde_json::json!({ "data": create_error_response(e) })) {
                                            eprintln!("[Nouto] Failed to emit error response: {}", err);
                                        }
                                    }
                                }
                            }
                            Err(e) => {
                                eprintln!("[Nouto] Failed to parse NTLM Type 2 challenge: {}", e);
                                // Emit the original 401 response so the user can see what happened
                                emit_response_context(&app, &response);
                                script_response_json = Some(build_script_response(&response));
                                record_history(&app_for_history, &response);
                                if let Err(err) = app.emit("requestResponse", build_response_json(&response)) {
                                    eprintln!("[Nouto] Failed to emit response: {}", err);
                                }
                            }
                        }
                    } else {
                        // No NTLM challenge in WWW-Authenticate, emit original response
                        emit_response_context(&app, &response);
                        script_response_json = Some(build_script_response(&response));
                        record_history(&app_for_history, &response);
                        if let Err(e) = app.emit("requestResponse", build_response_json(&response)) {
                            eprintln!("[Nouto] Failed to emit response: {}", e);
                        }
                    }
                } else {
                    println!("[Nouto] Request successful, status: {}", response.status);
                    emit_response_context(&app, &response);
                    script_response_json = Some(build_script_response(&response));
                    record_history(&app_for_history, &response);
                    if let Err(e) = app.emit("requestResponse", build_response_json(&response)) {
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

        // Run post-response scripts (collection -> folders -> request)
        // Note: We run these after response emission so the UI gets the response immediately.
        // Variables set by earlier scripts flow to subsequent scripts in the chain.
        if let Some(ref chain) = script_chain {
            if let Some(ref resp_json) = script_response_json {
                let mut current_env = env_data.as_ref()
                    .and_then(|e| e.active_environment.clone())
                    .unwrap_or(serde_json::json!({}));
                let mut current_globals = env_data.as_ref()
                    .and_then(|e| e.global_variables.clone())
                    .unwrap_or_default();

                let request_json = serde_json::json!({
                    "method": history_method,
                    "url": history_url,
                });

                for entry in &chain.entries {
                    if entry.post_response.trim().is_empty() { continue; }

                    let script_context = crate::services::script_engine::ScriptContext {
                        request: request_json.clone(),
                        response: Some(resp_json.clone()),
                        environment: current_env.clone(),
                        global_variables: Value::Array(current_globals.clone()),
                        info: Some(serde_json::json!({
                            "requestName": history_req_name,
                            "currentIteration": 0,
                            "totalIterations": 1,
                        })),
                        cookies: data.cookies.iter()
                            .filter_map(|v| serde_json::from_value::<crate::services::script_engine::ScriptCookie>(v.clone()).ok())
                            .collect(),
                    };

                    let result = crate::services::script_engine::ScriptEngine::execute_post_response(
                        &entry.post_response, &script_context
                    ).await;

                    if !result.cookie_mutations.is_empty() {
                        let _ = app_for_scripts.emit("cookieMutations",
                            serde_json::json!({ "data": result.cookie_mutations }));
                    }

                    let _ = app_for_scripts.emit("scriptOutput", serde_json::json!({
                        "data": {
                            "phase": "postResponse",
                            "result": {
                                "success": result.error.is_none(),
                                "logs": result.logs,
                                "testResults": result.test_results,
                                "variablesToSet": result.variables_to_set,
                                "error": result.error,
                            }
                        }
                    }));

                    if !result.variables_to_set.is_empty() {
                        let _ = app_for_scripts.emit("setVariables", serde_json::json!({
                            "data": result.variables_to_set
                        }));
                        // Flow variables to next script in chain
                        for var in &result.variables_to_set {
                            if var.scope == "global" {
                                current_globals.push(serde_json::json!({
                                    "key": var.key, "value": var.value, "enabled": true
                                }));
                            } else if let Some(vars) = current_env.get_mut("variables").and_then(|v| v.as_array_mut()) {
                                let mut found = false;
                                for v in vars.iter_mut() {
                                    if v["key"].as_str() == Some(&var.key) {
                                        v["value"] = Value::String(var.value.clone());
                                        found = true;
                                        break;
                                    }
                                }
                                if !found {
                                    vars.push(serde_json::json!({
                                        "key": var.key, "value": var.value, "enabled": true
                                    }));
                                }
                            }
                        }
                    }

                    if !result.error.is_none() { break; }
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
    data: Option<Value>,
    app: AppHandle,
    registry: tauri::State<'_, RequestRegistry>,
) -> Result<(), String> {
    let mut registry_lock = registry.lock().await;

    // Try to cancel by panel_id if provided, else cancel the first active request
    let panel_id = data
        .as_ref()
        .and_then(|d| d.get("panelId"))
        .and_then(|v| v.as_str())
        .unwrap_or("desktop-active")
        .to_string();

    if let Some(handle) = registry_lock.remove(&panel_id) {
        handle.abort();
        let _ = app.emit("requestCancelled", ());
        Ok(())
    } else {
        // Fallback: cancel any active request (desktop usually has one at a time)
        let first_key = registry_lock.keys().next().cloned();
        if let Some(key) = first_key {
            let handle = registry_lock.remove(&key).unwrap();
            handle.abort();
            let _ = app.emit("requestCancelled", ());
            Ok(())
        } else {
            Err(format!("No active request found for panel {}", panel_id))
        }
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
        redirect_chain: None,
    }
}

/// Open a file picker for body file selection (binary upload, form-data files)
#[tauri::command]
pub async fn select_file(app: AppHandle, data: serde_json::Value) -> Result<(), String> {
    use tauri_plugin_dialog::DialogExt;

    let multiple = data["multiple"].as_bool().unwrap_or(false);

    if multiple {
        let paths = app.dialog().file().blocking_pick_files();
        if let Some(file_paths) = paths {
            for file_path in file_paths {
                let path_str = file_path.to_string();
                let meta = std::fs::metadata(&path_str).ok();
                let name = std::path::Path::new(&path_str)
                    .file_name()
                    .map(|n| n.to_string_lossy().to_string())
                    .unwrap_or_default();
                let size = meta.as_ref().map(|m| m.len()).unwrap_or(0);
                let mime = mime_from_extension(&path_str);

                let _ = app.emit("fileSelected", serde_json::json!({
                    "data": { "path": path_str, "name": name, "size": size, "mimeType": mime }
                }));
            }
        }
    } else {
        let path = app.dialog().file().blocking_pick_file();
        if let Some(file_path) = path {
            let path_str = file_path.to_string();
            let meta = std::fs::metadata(&path_str).ok();
            let name = std::path::Path::new(&path_str)
                .file_name()
                .map(|n| n.to_string_lossy().to_string())
                .unwrap_or_default();
            let size = meta.as_ref().map(|m| m.len()).unwrap_or(0);
            let mime = mime_from_extension(&path_str);

            let _ = app.emit("fileSelected", serde_json::json!({
                "data": { "path": path_str, "name": name, "size": size, "mimeType": mime }
            }));
        }
    }

    Ok(())
}

/// Guess MIME type from file extension
fn mime_from_extension(path: &str) -> String {
    let ext = std::path::Path::new(path)
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_lowercase();

    match ext.as_str() {
        "json" => "application/json",
        "xml" => "application/xml",
        "html" | "htm" => "text/html",
        "css" => "text/css",
        "js" => "application/javascript",
        "txt" | "text" | "log" => "text/plain",
        "csv" => "text/csv",
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "gif" => "image/gif",
        "svg" => "image/svg+xml",
        "webp" => "image/webp",
        "pdf" => "application/pdf",
        "zip" => "application/zip",
        "gz" | "gzip" => "application/gzip",
        "tar" => "application/x-tar",
        "mp3" => "audio/mpeg",
        "mp4" => "video/mp4",
        "wasm" => "application/wasm",
        "yaml" | "yml" => "application/yaml",
        _ => "application/octet-stream",
    }
    .to_string()
}

struct AssertionEvalResult {
    results: Vec<Value>,
    variables_to_set: Vec<VariableToSet>,
}

/// Evaluate assertions against a response, returning results and any variables to set
fn evaluate_assertions(assertions: &[Value], response: &ResponseData) -> AssertionEvalResult {
    let mut results = Vec::new();
    let mut variables_to_set = Vec::new();

    for assertion in assertions {
        let enabled = assertion["enabled"].as_bool().unwrap_or(false);
        if !enabled { continue; }

        let id = assertion["id"].as_str().unwrap_or("").to_string();
        let target = assertion["target"].as_str().unwrap_or("");
        let operator = assertion["operator"].as_str().unwrap_or("equals");
        let expected = assertion["expected"].as_str().map(|s| s.to_string());
        let property = assertion["property"].as_str().map(|s| s.to_string());

        // Handle special targets that bypass compare_assertion()
        match target {
            "schema" => {
                let (passed, message) = evaluate_schema_assertion(assertion, response);
                results.push(serde_json::json!({
                    "assertionId": id,
                    "passed": passed,
                    "actual": null,
                    "expected": assertion["expected"].as_str(),
                    "message": message,
                }));
                continue;
            }
            "setVariable" => {
                let var_name = match assertion["variableName"].as_str().filter(|s| !s.is_empty()) {
                    Some(n) => n.to_string(),
                    None => {
                        results.push(serde_json::json!({
                            "assertionId": id, "passed": false,
                            "actual": null, "expected": null,
                            "message": "setVariable requires a variableName",
                        }));
                        continue;
                    }
                };
                let extracted = property.as_deref()
                    .and_then(|prop| extract_json_path(&response.data, prop));
                match extracted {
                    Some(val) => {
                        variables_to_set.push(VariableToSet {
                            key: var_name,
                            value: val.clone(),
                            scope: "environment".to_string(),
                        });
                        results.push(serde_json::json!({
                            "assertionId": id, "passed": true,
                            "actual": val, "expected": null,
                            "message": "Variable extracted successfully",
                        }));
                    }
                    None => {
                        results.push(serde_json::json!({
                            "assertionId": id, "passed": false,
                            "actual": null, "expected": null,
                            "message": format!("Could not extract value at path '{}'",
                                property.as_deref().unwrap_or("")),
                        }));
                    }
                }
                continue;
            }
            _ => {}
        }

        let actual = match target {
            "status" => Some(response.status.to_string()),
            "responseTime" => Some(response.duration.to_string()),
            "responseSize" => Some(response.size.to_string()),
            "body" => {
                match &response.data {
                    Value::String(s) => Some(s.clone()),
                    other => Some(other.to_string()),
                }
            }
            "header" => {
                if let Some(prop) = &property {
                    let prop_lower = prop.to_lowercase();
                    response.headers.iter()
                        .find(|(k, _)| k.to_lowercase() == prop_lower)
                        .map(|(_, v)| v.clone())
                } else {
                    None
                }
            }
            "contentType" => {
                response.headers.iter()
                    .find(|(k, _)| k.to_lowercase() == "content-type")
                    .map(|(_, v)| v.clone())
            }
            "jsonQuery" => {
                if let Some(prop) = &property {
                    extract_json_path(&response.data, prop)
                } else {
                    None
                }
            }
            _ => None,
        };

        let (passed, message) = compare_assertion(operator, actual.as_deref(), expected.as_deref());

        results.push(serde_json::json!({
            "assertionId": id,
            "passed": passed,
            "actual": actual,
            "expected": expected,
            "message": message,
        }));
    }

    AssertionEvalResult { results, variables_to_set }
}

/// JSONPath extraction using RFC 9535 (serde_json_path)
/// Supports recursive descent ($..field), wildcards ($.*), filter expressions, and more.
fn extract_json_path(data: &Value, path: &str) -> Option<String> {
    // Parse string responses as JSON first
    let parsed: Value;
    let json_data = if let Value::String(s) = data {
        match serde_json::from_str(s) {
            Ok(v) => { parsed = v; &parsed }
            Err(_) => return None,
        }
    } else {
        data
    };

    // Ensure path starts with $ (RFC 9535 requires it)
    let normalized = if path.starts_with('$') {
        path.to_string()
    } else {
        format!("$.{}", path)
    };

    let Ok(jpath) = serde_json_path::JsonPath::parse(&normalized) else {
        return None;
    };

    jpath.query(json_data).first().map(|v| match v {
        Value::String(s) => s.clone(),
        other => other.to_string(),
    })
}

/// Compare actual vs expected using the given operator
fn compare_assertion(operator: &str, actual: Option<&str>, expected: Option<&str>) -> (bool, String) {
    match operator {
        "exists" => {
            let passed = actual.is_some() && !actual.unwrap().is_empty();
            (passed, if passed { "Value exists".into() } else { "Value does not exist".into() })
        }
        "notExists" => {
            let passed = actual.is_none() || actual.unwrap().is_empty();
            (passed, if passed { "Value does not exist".into() } else { "Value exists".into() })
        }
        "equals" => {
            let exp = expected.unwrap_or("");
            let act = actual.unwrap_or("");
            let passed = act == exp;
            (passed, if passed {
                format!("'{}' equals '{}'", act, exp)
            } else {
                format!("Expected '{}' but got '{}'", exp, act)
            })
        }
        "notEquals" => {
            let exp = expected.unwrap_or("");
            let act = actual.unwrap_or("");
            let passed = act != exp;
            (passed, if passed {
                format!("'{}' does not equal '{}'", act, exp)
            } else {
                format!("Value equals '{}' but should not", act)
            })
        }
        "contains" => {
            let exp = expected.unwrap_or("");
            let act = actual.unwrap_or("");
            let passed = act.contains(exp);
            (passed, if passed {
                format!("'{}' contains '{}'", act, exp)
            } else {
                format!("'{}' does not contain '{}'", act, exp)
            })
        }
        "notContains" => {
            let exp = expected.unwrap_or("");
            let act = actual.unwrap_or("");
            let passed = !act.contains(exp);
            (passed, if passed {
                format!("Value does not contain '{}'", exp)
            } else {
                format!("Value contains '{}' but should not", exp)
            })
        }
        "greaterThan" | "lessThan" | "greaterThanOrEqual" | "lessThanOrEqual" => {
            let act_num: f64 = actual.unwrap_or("0").parse().unwrap_or(0.0);
            let exp_num: f64 = expected.unwrap_or("0").parse().unwrap_or(0.0);
            let passed = match operator {
                "greaterThan" => act_num > exp_num,
                "lessThan" => act_num < exp_num,
                "greaterThanOrEqual" => act_num >= exp_num,
                "lessThanOrEqual" => act_num <= exp_num,
                _ => false,
            };
            (passed, if passed {
                format!("{} {} {}", act_num, operator, exp_num)
            } else {
                format!("Expected {} {} {} but got {}", act_num, operator, exp_num, act_num)
            })
        }
        "matches" => {
            let exp = expected.unwrap_or("");
            let act = actual.unwrap_or("");
            let passed = regex::Regex::new(exp).map(|re| re.is_match(act)).unwrap_or(false);
            (passed, if passed {
                format!("Value matches pattern '{}'", exp)
            } else {
                format!("Value '{}' does not match pattern '{}'", act, exp)
            })
        }
        "isJson" => {
            let act = actual.unwrap_or("");
            let passed = serde_json::from_str::<Value>(act).is_ok();
            (passed, if passed { "Value is valid JSON".into() } else { "Value is not valid JSON".into() })
        }
        "isType" => {
            let act = actual.unwrap_or("");
            let exp = expected.unwrap_or("");
            let passed = match exp {
                "string" => true, // everything is a string at this level
                "number" => act.parse::<f64>().is_ok(),
                "boolean" => act == "true" || act == "false",
                "null" => act == "null",
                "array" => act.starts_with('['),
                "object" => act.starts_with('{'),
                _ => false,
            };
            (passed, if passed {
                format!("Value is of type '{}'", exp)
            } else {
                format!("Value '{}' is not of type '{}'", act, exp)
            })
        }
        _ => {
            (false, format!("Unknown operator: {}", operator))
        }
    }
}

/// Validate the response body against a JSON Schema (assertion["expected"] is the schema as JSON text)
fn evaluate_schema_assertion(assertion: &Value, response: &ResponseData) -> (bool, String) {
    let Some(schema_str) = assertion["expected"].as_str() else {
        return (false, "No JSON Schema provided in expected field".to_string());
    };
    let schema: Value = match serde_json::from_str(schema_str) {
        Ok(v) => v,
        Err(e) => return (false, format!("Invalid JSON Schema: {}", e)),
    };
    let body: Value = match &response.data {
        Value::String(s) => match serde_json::from_str(s) {
            Ok(v) => v,
            Err(_) => return (false, "Response body is not valid JSON".to_string()),
        },
        other => other.clone(),
    };
    let compiled = match jsonschema::compile(&schema) {
        Ok(c) => c,
        Err(e) => return (false, format!("Invalid JSON Schema: {}", e)),
    };
    let errors: Vec<String> = compiled
        .iter_errors(&body)
        .take(3)
        .map(|e| e.to_string())
        .collect();
    if errors.is_empty() {
        (true, "Response body matches the JSON Schema".to_string())
    } else {
        (false, errors.join("; "))
    }
}

/// Standard GraphQL introspection query
const INTROSPECTION_QUERY: &str = r#"
  query IntrospectionQuery {
    __schema {
      queryType { name }
      mutationType { name }
      subscriptionType { name }
      types {
        kind
        name
        description
        fields(includeDeprecated: true) {
          name
          description
          type { ...TypeRef }
          args {
            name
            description
            type { ...TypeRef }
            defaultValue
          }
          isDeprecated
          deprecationReason
        }
        interfaces { ...TypeRef }
        possibleTypes { ...TypeRef }
        enumValues(includeDeprecated: true) {
          name
          description
          isDeprecated
          deprecationReason
        }
        inputFields {
          name
          description
          type { ...TypeRef }
          defaultValue
        }
      }
    }
  }

  fragment TypeRef on __Type {
    kind
    name
    ofType {
      kind
      name
      ofType {
        kind
        name
        ofType {
          kind
          name
          ofType {
            kind
            name
            ofType {
              kind
              name
              ofType {
                kind
                name
                ofType {
                  kind
                  name
                }
              }
            }
          }
        }
      }
    }
  }
"#;

/// GraphQL introspection: send the standard introspection query and emit the schema
#[tauri::command]
pub async fn introspect_graphql(data: serde_json::Value, app: AppHandle) -> Result<(), String> {
    let url = data["url"].as_str().unwrap_or("").to_string();
    if url.is_empty() {
        app.emit("graphqlSchemaError", serde_json::json!({ "data": { "message": "URL is required for introspection" } }))
            .map_err(|e| format!("Failed to emit: {}", e))?;
        return Ok(());
    }

    // Build headers from the data payload
    let mut header_map = reqwest::header::HeaderMap::new();
    header_map.insert(
        reqwest::header::CONTENT_TYPE,
        reqwest::header::HeaderValue::from_static("application/json"),
    );

    if let Some(headers) = data["headers"].as_array() {
        for h in headers {
            let enabled = h["enabled"].as_bool().unwrap_or(true);
            if !enabled { continue; }
            let key = h["key"].as_str().unwrap_or("");
            let value = h["value"].as_str().unwrap_or("");
            if key.is_empty() { continue; }
            if let (Ok(name), Ok(val)) = (
                reqwest::header::HeaderName::from_bytes(key.as_bytes()),
                reqwest::header::HeaderValue::from_str(value),
            ) {
                header_map.insert(name, val);
            }
        }
    }

    // Apply auth (bearer token or basic)
    if let Some(auth) = data.get("auth") {
        let auth_type = auth["type"].as_str().unwrap_or("");
        match auth_type {
            "bearer" => {
                if let Some(token) = auth["token"].as_str() {
                    if !token.is_empty() {
                        if let Ok(val) = reqwest::header::HeaderValue::from_str(&format!("Bearer {}", token)) {
                            header_map.insert(reqwest::header::AUTHORIZATION, val);
                        }
                    }
                }
            }
            "basic" => {
                let username = auth["username"].as_str().unwrap_or("");
                let password = auth["password"].as_str().unwrap_or("");
                let credentials = base64::Engine::encode(
                    &base64::engine::general_purpose::STANDARD,
                    format!("{}:{}", username, password),
                );
                if let Ok(val) = reqwest::header::HeaderValue::from_str(&format!("Basic {}", credentials)) {
                    header_map.insert(reqwest::header::AUTHORIZATION, val);
                }
            }
            _ => {}
        }
    }

    // Build the introspection request body
    let body = serde_json::json!({
        "query": INTROSPECTION_QUERY,
        "operationName": "IntrospectionQuery"
    });

    // Send the introspection request
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(30))
        .build()
        .map_err(|e| format!("Failed to create HTTP client: {}", e))?;

    let response = match client
        .post(&url)
        .headers(header_map)
        .json(&body)
        .send()
        .await
    {
        Ok(resp) => resp,
        Err(e) => {
            app.emit("graphqlSchemaError", serde_json::json!({ "data": { "message": format!("Introspection request failed: {}", e) } }))
                .map_err(|err| format!("Failed to emit: {}", err))?;
            return Ok(());
        }
    };

    let status = response.status();
    let response_text = response.text().await.unwrap_or_default();

    if !status.is_success() {
        app.emit("graphqlSchemaError", serde_json::json!({ "data": { "message": format!("Introspection failed with status {}: {}", status.as_u16(), response_text) } }))
            .map_err(|e| format!("Failed to emit: {}", e))?;
        return Ok(());
    }

    // Parse the response JSON
    let response_json: serde_json::Value = match serde_json::from_str(&response_text) {
        Ok(v) => v,
        Err(e) => {
            app.emit("graphqlSchemaError", serde_json::json!({ "data": { "message": format!("Failed to parse introspection response: {}", e) } }))
                .map_err(|err| format!("Failed to emit: {}", err))?;
            return Ok(());
        }
    };

    // Check for GraphQL errors
    if let Some(errors) = response_json.get("errors") {
        if let Some(arr) = errors.as_array() {
            if !arr.is_empty() {
                let error_messages: Vec<String> = arr.iter()
                    .filter_map(|e| e["message"].as_str().map(|s| s.to_string()))
                    .collect();
                let combined = error_messages.join("; ");
                app.emit("graphqlSchemaError", serde_json::json!({ "data": { "message": format!("GraphQL errors: {}", combined) } }))
                    .map_err(|e| format!("Failed to emit: {}", e))?;
                return Ok(());
            }
        }
    }

    // Extract __schema from response
    let schema = match response_json.get("data").and_then(|d| d.get("__schema")) {
        Some(s) => s.clone(),
        None => {
            app.emit("graphqlSchemaError", serde_json::json!({ "data": { "message": "No __schema found in introspection response" } }))
                .map_err(|e| format!("Failed to emit: {}", e))?;
            return Ok(());
        }
    };

    // Emit the schema to the frontend
    app.emit("graphqlSchema", serde_json::json!({ "data": schema }))
        .map_err(|e| format!("Failed to emit graphqlSchema: {}", e))?;

    Ok(())
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
