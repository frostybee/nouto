// HTTP command handlers for Tauri
// Exposes HTTP client to the frontend via Tauri commands

use crate::error::AppError;
use crate::models::types::{AuthType, KeyValue, ResponseData};
use crate::models::http::{SendRequestData, RequestRegistry};
use crate::services::http_client::HttpRequestConfig;
use crate::services::request_executor::{
    spawn_request_execution, RequestExecutionContext, HistoryMeta,
};
use serde_json::Value;
use std::collections::HashMap;
use tauri::{AppHandle, Emitter};

pub use crate::models::http::init_request_registry;

/// Send an HTTP request
#[tauri::command]
pub async fn send_request(
    data: SendRequestData,
    app: AppHandle,
    registry: tauri::State<'_, RequestRegistry>,
) -> Result<(), AppError> {
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

    // Security warning: credentials over plain HTTP
    if data.url.starts_with("http://")
        && !data.url.contains("localhost")
        && !data.url.contains("127.0.0.1")
        && !data.url.contains("[::1]")
        && (headers_map.contains_key("Authorization")
            || data.auth.auth_type != AuthType::None)
    {
        let _ = app.emit("securityWarning", serde_json::json!({
            "data": { "message": "Sending credentials over unencrypted HTTP connection" }
        }));
    }

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
                match tokio::fs::read(file_path).await {
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
                            remote_address: None,
                            redirect_chain: None,
                            timeline: None,
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

    let history_method = data.method.as_str().to_uppercase();

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

    let ctx = RequestExecutionContext {
        config,
        auth_data: data.auth.clone(),
        assertions: data.assertions.clone().unwrap_or_default(),
        script_chain: data.script_chain.clone(),
        env_data: data.env_data.clone(),
        history: HistoryMeta {
            method: history_method,
            url: data.url.clone(),
            headers: data.headers.iter().map(|h| serde_json::json!({
                "id": h.id, "key": h.key, "value": h.value, "enabled": h.enabled
            })).collect(),
            params: data.params.iter().map(|p| serde_json::json!({
                "id": p.id, "key": p.key, "value": p.value, "enabled": p.enabled
            })).collect(),
            body: serde_json::to_value(&data.body).ok(),
            auth: serde_json::to_value(&data.auth).ok(),
            request_id: data.request_id.clone(),
            request_name: data.request_name.clone(),
        },
        context_request_id: data.request_id.clone(),
        context_request_name: data.request_name.clone(),
        digest_auth,
        ntlm_auth,
        aws_auth,
        cookies: data.cookies.clone(),
    };

    let handle = spawn_request_execution(
        ctx,
        app,
        registry.inner().clone(),
        panel_id.clone(),
    );

    let mut registry_lock = registry.lock().await;
    registry_lock.insert(panel_id, handle);

    Ok(())
}

/// Open a file picker and emit the selected SSL cert/key path back to the frontend
#[tauri::command]
pub async fn pick_ssl_file(app: AppHandle, data: serde_json::Value) -> Result<(), AppError> {
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
        .map_err(|e| AppError::Dialog(e.to_string()))?;
    }
    Ok(())
}

/// Cancel an in-flight HTTP request
#[tauri::command]
pub async fn cancel_request(
    data: Option<Value>,
    app: AppHandle,
    registry: tauri::State<'_, RequestRegistry>,
) -> Result<(), AppError> {
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
        let _ = app.emit("requestCancelled", serde_json::json!({ "data": {} }));
        Ok(())
    } else {
        // Fallback: cancel any active request (desktop usually has one at a time)
        let first_key = registry_lock.keys().next().cloned();
        if let Some(key) = first_key {
            let handle = registry_lock.remove(&key).unwrap();
            handle.abort();
            let _ = app.emit("requestCancelled", serde_json::json!({ "data": {} }));
            Ok(())
        } else {
            Err(AppError::Other(format!("No active request found for panel {}", panel_id)))
        }
    }
}

/// Open a file picker for body file selection (binary upload, form-data files)
#[tauri::command]
pub async fn select_file(app: AppHandle, data: serde_json::Value) -> Result<(), AppError> {
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
pub async fn introspect_graphql(data: serde_json::Value, app: AppHandle) -> Result<(), AppError> {
    let url = data["url"].as_str().unwrap_or("").to_string();
    if url.is_empty() {
        app.emit("graphqlSchemaError", serde_json::json!({ "data": { "message": "URL is required for introspection" } }))
            .map_err(|e| AppError::Other(e.to_string()))?;
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
        .build()?;

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
                .map_err(|err| AppError::Other(err.to_string()))?;
            return Ok(());
        }
    };

    let status = response.status();
    let response_text = response.text().await.unwrap_or_default();

    if !status.is_success() {
        app.emit("graphqlSchemaError", serde_json::json!({ "data": { "message": format!("Introspection failed with status {}: {}", status.as_u16(), response_text) } }))
            .map_err(|e| AppError::Other(e.to_string()))?;
        return Ok(());
    }

    // Parse the response JSON
    let response_json: serde_json::Value = match serde_json::from_str(&response_text) {
        Ok(v) => v,
        Err(e) => {
            app.emit("graphqlSchemaError", serde_json::json!({ "data": { "message": format!("Failed to parse introspection response: {}", e) } }))
                .map_err(|err| AppError::Other(err.to_string()))?;
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
                    .map_err(|e| AppError::Other(e.to_string()))?;
                return Ok(());
            }
        }
    }

    // Extract __schema from response
    let schema = match response_json.get("data").and_then(|d| d.get("__schema")) {
        Some(s) => s.clone(),
        None => {
            app.emit("graphqlSchemaError", serde_json::json!({ "data": { "message": "No __schema found in introspection response" } }))
                .map_err(|e| AppError::Other(e.to_string()))?;
            return Ok(());
        }
    };

    // Emit the schema to the frontend
    app.emit("graphqlSchema", serde_json::json!({ "data": schema }))
        .map_err(|e| AppError::Other(e.to_string()))?;

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::services::request_executor::create_error_response;

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
