// gRPC command handlers for Tauri
// Exposes gRPC client to the frontend via Tauri commands

use crate::error::AppError;
use crate::models::types::{GrpcConnection, GrpcEvent};
use crate::services::grpc_client::{GrpcClient, GrpcPoolCache};
use crate::services::script_engine::VariableToSet;
use crate::models::http::AssertionEvalResult;
use crate::services::assertions::{compare_assertion, extract_json_path};
use serde::Deserialize;
use std::collections::HashMap;
use std::path::Path;
use std::sync::Arc;
use tauri::{AppHandle, Emitter};
use tokio::sync::Mutex;

/// Registry of active gRPC streaming connections (keyed by connection ID)
pub type GrpcStreamRegistry = Arc<Mutex<HashMap<String, GrpcStreamHandle>>>;

pub struct GrpcStreamHandle {
    pub sender: tokio::sync::mpsc::Sender<GrpcStreamCommand>,
    pub cancel: tokio::sync::watch::Sender<bool>,
}

pub enum GrpcStreamCommand {
    SendMessage(String), // JSON-encoded message body
    Commit,              // Graceful close of send side (response reading continues)
    EndStream,           // Hard cancel (abort everything)
}

/// Initialize an empty gRPC streaming connection registry
pub fn init_grpc_stream_registry() -> GrpcStreamRegistry {
    Arc::new(Mutex::new(HashMap::new()))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GrpcReflectData {
    pub address: String,
    pub metadata: Option<std::collections::HashMap<String, String>>,
    pub tls: Option<bool>,
    pub tls_cert_path: Option<String>,
    pub tls_key_path: Option<String>,
    pub tls_ca_cert_path: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GrpcLoadProtoData {
    pub proto_paths: Vec<String>,
    pub import_dirs: Vec<String>,
}

/// Auth state from the UI, mirroring the TypeScript AuthState union
#[derive(Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct AuthState {
    #[serde(rename = "type")]
    pub auth_type: String,
    pub token: Option<String>,
    pub username: Option<String>,
    pub password: Option<String>,
    pub api_key_name: Option<String>,
    pub api_key_value: Option<String>,
    pub api_key_in: Option<String>,
    pub oauth_token: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GrpcInvokeData {
    pub address: String,
    pub service_name: String,
    pub method_name: String,
    pub metadata: Option<Vec<MetadataEntry>>,
    pub auth: Option<AuthState>,
    pub body: String,
    pub use_reflection: bool,
    pub proto_paths: Option<Vec<String>>,
    pub import_dirs: Option<Vec<String>>,
    pub tls: Option<bool>,
    pub tls_cert_path: Option<String>,
    pub tls_key_path: Option<String>,
    pub tls_ca_cert_path: Option<String>,
    pub timeout: Option<u64>,
    pub assertions: Option<Vec<serde_json::Value>>,
}

/// A single metadata key-value entry from the UI (mirrors KeyValue)
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MetadataEntry {
    pub key: String,
    pub value: String,
    pub enabled: Option<bool>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GrpcSendMessageData {
    pub connection_id: String,
    pub body: Option<String>,
    #[serde(rename = "message")]
    pub message_body: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GrpcEndStreamData {
    pub connection_id: String,
}

/// Convert UI metadata array + auth into a flat HashMap for gRPC metadata headers
fn build_metadata_map(
    metadata: Option<Vec<MetadataEntry>>,
    auth: Option<&AuthState>,
) -> HashMap<String, String> {
    let mut map = HashMap::new();

    // Apply explicit metadata entries
    if let Some(entries) = metadata {
        for entry in entries {
            if entry.enabled.unwrap_or(true) && !entry.key.is_empty() {
                map.insert(entry.key, entry.value);
            }
        }
    }

    // Apply auth as metadata (auth takes precedence)
    if let Some(auth) = auth {
        match auth.auth_type.as_str() {
            "bearer" => {
                if let Some(ref token) = auth.token {
                    if !token.is_empty() {
                        map.insert("Authorization".to_string(), format!("Bearer {}", token));
                    }
                }
            }
            "basic" => {
                if let Some(ref username) = auth.username {
                    if !username.is_empty() {
                        use base64::Engine;
                        let credentials = format!("{}:{}", username, auth.password.as_deref().unwrap_or(""));
                        let encoded = base64::engine::general_purpose::STANDARD.encode(credentials);
                        map.insert("Authorization".to_string(), format!("Basic {}", encoded));
                    }
                }
            }
            "apikey" => {
                if let (Some(ref name), Some(ref value)) = (&auth.api_key_name, &auth.api_key_value) {
                    // Only add as metadata if apiKeyIn is not "query"
                    let in_loc = auth.api_key_in.as_deref().unwrap_or("header");
                    if in_loc != "query" && !name.is_empty() {
                        map.insert(name.clone(), value.clone());
                    }
                }
            }
            "oauth2" => {
                if let Some(ref token) = auth.oauth_token {
                    if !token.is_empty() {
                        map.insert("Authorization".to_string(), format!("Bearer {}", token));
                    }
                }
            }
            _ => {}
        }
    }

    map
}

#[tauri::command]
pub async fn grpc_reflect(app: AppHandle, data: GrpcReflectData, pool_cache: tauri::State<'_, GrpcPoolCache>) -> Result<(), AppError> {
    let client = GrpcClient::new(pool_cache.inner().clone());
    match client
        .reflect(
            &data.address,
            data.metadata,
            data.tls,
            data.tls_cert_path.as_deref(),
            data.tls_key_path.as_deref(),
            data.tls_ca_cert_path.as_deref(),
        )
        .await
    {
        Ok(descriptor) => {
            let _ = app.emit("grpcProtoLoaded", serde_json::json!({ "data": descriptor }));
            Ok(())
        }
        Err(e) => {
            let _ = app.emit(
                "grpcProtoError",
                serde_json::json!({ "data": { "message": e } }),
            );
            Ok(())
        }
    }
}

#[tauri::command]
pub async fn grpc_load_proto(app: AppHandle, data: GrpcLoadProtoData, pool_cache: tauri::State<'_, GrpcPoolCache>) -> Result<(), AppError> {
    let client = GrpcClient::new(pool_cache.inner().clone());
    match client
        .load_proto(&data.proto_paths, &data.import_dirs)
        .await
    {
        Ok(descriptor) => {
            let _ = app.emit("grpcProtoLoaded", serde_json::json!({ "data": descriptor }));
            Ok(())
        }
        Err(e) => {
            let _ = app.emit(
                "grpcProtoError",
                serde_json::json!({ "data": { "message": e } }),
            );
            Ok(())
        }
    }
}

#[tauri::command]
pub async fn grpc_invoke(
    app: AppHandle,
    data: GrpcInvokeData,
    registry: tauri::State<'_, GrpcStreamRegistry>,
    pool_cache: tauri::State<'_, GrpcPoolCache>,
) -> Result<(), AppError> {
    let client = GrpcClient::new(pool_cache.inner().clone());

    // Build metadata from array + auth
    let metadata = build_metadata_map(data.metadata, data.auth.as_ref());

    // Check if this is a streaming method by inspecting proto descriptors (uses cache)
    let proto_paths = data.proto_paths.clone();
    let import_dirs = data.import_dirs.clone();
    let paths = proto_paths.as_deref().unwrap_or(&[]);
    let dirs = import_dirs.as_deref().unwrap_or(&[]);

    if let Some(method_info) = client.get_method_info_cached(&data.address, paths, dirs, data.use_reflection, &data.service_name, &data.method_name).await {
        let is_client_streaming = method_info.0;
        let is_server_streaming = method_info.1;

        if is_client_streaming || is_server_streaming {
            // Use streaming invocation
            let registry_clone = registry.inner().clone();
            match client
                .invoke_streaming(
                    &data.address,
                    &data.service_name,
                    &data.method_name,
                    Some(metadata),
                    &data.body,
                    data.proto_paths,
                    data.import_dirs,
                    data.tls,
                    data.tls_cert_path.as_deref(),
                    data.tls_key_path.as_deref(),
                    data.tls_ca_cert_path.as_deref(),
                    data.timeout,
                    is_client_streaming,
                    is_server_streaming,
                    app.clone(),
                    registry_clone,
                    data.assertions.clone(),
                )
                .await
            {
                Ok(()) => return Ok(()),
                Err(e) => {
                    let _ = app.emit(
                        "grpcProtoError",
                        serde_json::json!({ "data": { "message": e } }),
                    );
                    return Ok(());
                }
            }
        }
    }

    // Fall back to unary call
    match client
        .invoke(
            &data.address,
            &data.service_name,
            &data.method_name,
            Some(metadata),
            &data.body,
            data.use_reflection,
            data.proto_paths,
            data.import_dirs,
            data.tls,
            data.tls_cert_path.as_deref(),
            data.tls_key_path.as_deref(),
            data.tls_ca_cert_path.as_deref(),
            data.timeout,
        )
        .await
    {
        Ok((connection, events)) => {
            let _ = app.emit("grpcConnectionStart", serde_json::json!({ "data": connection }));
            for event in &events {
                let _ = app.emit("grpcEvent", serde_json::json!({ "data": event }));
            }

            // Evaluate assertions if provided
            let mut end_data = serde_json::json!({ "data": connection });
            if let Some(assertions) = &data.assertions {
                if !assertions.is_empty() {
                    let eval_result = evaluate_grpc_assertions(assertions, &connection, &events);
                    end_data["data"]["assertionResults"] = serde_json::json!(eval_result.results);
                    if !eval_result.variables_to_set.is_empty() {
                        let _ = app.emit("setVariables", serde_json::json!({
                            "data": eval_result.variables_to_set.iter().map(|v| {
                                serde_json::json!({ "key": v.key, "value": v.value, "scope": v.scope })
                            }).collect::<Vec<_>>()
                        }));
                    }
                }
            }
            let _ = app.emit("grpcConnectionEnd", end_data);
            Ok(())
        }
        Err(e) => {
            let _ = app.emit(
                "grpcProtoError",
                serde_json::json!({ "data": { "message": e } }),
            );
            Ok(())
        }
    }
}

/// Send a message to an active client/bidirectional streaming connection
#[tauri::command]
pub async fn grpc_send_message(
    app: AppHandle,
    data: GrpcSendMessageData,
    registry: tauri::State<'_, GrpcStreamRegistry>,
) -> Result<(), AppError> {
    let reg = registry.lock().await;
    if let Some(handle) = reg.get(&data.connection_id) {
        // Accept body from either "body" or "message" field
        let msg = data.body.or(data.message_body).unwrap_or_else(|| "{}".to_string());
        handle
            .sender
            .send(GrpcStreamCommand::SendMessage(msg))
            .await
            .map_err(|_| AppError::Grpc("Stream connection is closed".to_string()))?;
        Ok(())
    } else {
        let _ = app.emit(
            "grpcProtoError",
            serde_json::json!({ "data": { "message": format!("No active stream for connection {}", data.connection_id) } }),
        );
        Err(AppError::Grpc(format!(
            "No active stream for connection {}",
            data.connection_id
        )))
    }
}

/// Close the client-side of an active streaming connection (hard cancel)
#[tauri::command]
pub async fn grpc_end_stream(
    app: AppHandle,
    data: GrpcEndStreamData,
    registry: tauri::State<'_, GrpcStreamRegistry>,
) -> Result<(), AppError> {
    let mut reg = registry.lock().await;
    if let Some(handle) = reg.remove(&data.connection_id) {
        // Send EndStream to close the send loop, then signal cancel to abort response reading
        let _ = handle.sender.send(GrpcStreamCommand::EndStream).await;
        let _ = handle.cancel.send(true);
        Ok(())
    } else {
        let _ = app.emit(
            "grpcProtoError",
            serde_json::json!({ "data": { "message": format!("No active stream for connection {}", data.connection_id) } }),
        );
        Err(AppError::Grpc(format!(
            "No active stream for connection {}",
            data.connection_id
        )))
    }
}

/// Invalidate all cached gRPC descriptor pools (forces re-parse on next load)
#[tauri::command]
pub async fn grpc_invalidate_pool(pool_cache: tauri::State<'_, GrpcPoolCache>) -> Result<(), AppError> {
    let client = GrpcClient::new(pool_cache.inner().clone());
    client.invalidate_all_pools().await;
    Ok(())
}

/// Commit (gracefully close) the send side of a client/bidi streaming connection.
/// The server response reading continues until the server closes its side.
#[tauri::command]
pub async fn grpc_commit_stream(
    app: AppHandle,
    data: GrpcEndStreamData,
    registry: tauri::State<'_, GrpcStreamRegistry>,
) -> Result<(), AppError> {
    let reg = registry.lock().await;
    if let Some(handle) = reg.get(&data.connection_id) {
        let _ = handle.sender.send(GrpcStreamCommand::Commit).await;
        Ok(())
    } else {
        let _ = app.emit(
            "grpcProtoError",
            serde_json::json!({ "data": { "message": format!("No active stream for connection {}", data.connection_id) } }),
        );
        Err(AppError::Grpc(format!(
            "No active stream for connection {}",
            data.connection_id
        )))
    }
}

#[tauri::command]
pub async fn pick_proto_file(app: AppHandle) -> Result<(), AppError> {
    use tauri_plugin_dialog::DialogExt;

    let file_paths = app
        .dialog()
        .file()
        .add_filter("Protocol Buffer", &["proto"])
        .blocking_pick_files();

    if let Some(paths) = file_paths {
        let path_strings: Vec<String> = paths
            .iter()
            .filter_map(|p| p.as_path().map(|path| path.to_string_lossy().to_string()))
            .collect();
        let _ = app.emit(
            "protoFilesPicked",
            serde_json::json!({ "data": { "paths": path_strings } }),
        );
    }
    Ok(())
}

#[tauri::command]
pub async fn pick_proto_import_dir(app: AppHandle) -> Result<(), AppError> {
    use tauri_plugin_dialog::DialogExt;

    let dir_paths = app.dialog().file().blocking_pick_folders();

    if let Some(paths) = dir_paths {
        let path_strings: Vec<String> = paths
            .iter()
            .filter_map(|p| p.as_path().map(|path| path.to_string_lossy().to_string()))
            .collect();
        let _ = app.emit(
            "protoImportDirsPicked",
            serde_json::json!({ "data": { "paths": path_strings } }),
        );
    }
    Ok(())
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScanProtoDirData {
    #[serde(alias = "dir")]
    pub dir_path: String,
}

/// Recursively collect all .proto file paths under a directory
fn collect_proto_files(dir: &Path, out: &mut Vec<String>) {
    if let Ok(entries) = std::fs::read_dir(dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() {
                collect_proto_files(&path, out);
            } else if path.extension().map_or(false, |ext| ext == "proto") {
                out.push(path.to_string_lossy().to_string());
            }
        }
    }
}

#[tauri::command]
pub async fn scan_proto_dir(app: AppHandle, data: ScanProtoDirData) -> Result<(), AppError> {
    let dir = Path::new(&data.dir_path);
    if !dir.is_dir() {
        let _ = app.emit(
            "grpcProtoError",
            serde_json::json!({ "data": { "message": format!("Not a directory: {}", data.dir_path) } }),
        );
        return Ok(());
    }
    let mut proto_files = Vec::new();
    collect_proto_files(dir, &mut proto_files);
    let _ = app.emit(
        "protoFilesPicked",
        serde_json::json!({ "data": { "paths": proto_files } }),
    );
    Ok(())
}

/// Evaluate assertions against a gRPC response
pub(crate) fn evaluate_grpc_assertions(
    assertions: &[serde_json::Value],
    connection: &GrpcConnection,
    events: &[GrpcEvent],
) -> AssertionEvalResult {
    let mut results = Vec::new();
    let mut variables_to_set = Vec::new();

    // Collect server messages for stream-related targets
    let stream_messages: Vec<&GrpcEvent> = events.iter()
        .filter(|e| e.event_type == "server_message")
        .collect();

    for assertion in assertions {
        let enabled = assertion["enabled"].as_bool().unwrap_or(false);
        if !enabled { continue; }

        let id = assertion["id"].as_str().unwrap_or("").to_string();
        let target = assertion["target"].as_str().unwrap_or("");
        let operator = assertion["operator"].as_str().unwrap_or("equals");
        let expected = assertion["expected"].as_str().map(|s| s.to_string());
        let property = assertion["property"].as_str().map(|s| s.to_string());

        // Handle setVariable target
        if target == "setVariable" {
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
            let last_body = stream_messages.last()
                .map(|e| e.content.clone())
                .unwrap_or_default();
            let body_val: serde_json::Value = serde_json::from_str(&last_body)
                .unwrap_or(serde_json::Value::String(last_body));
            let extracted = property.as_deref()
                .and_then(|prop| extract_json_path(&body_val, prop));
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

        let actual = match target {
            "grpcStatusMessage" => {
                connection.status_message.clone()
                    .or_else(|| Some(grpc_status_name(connection.status)))
            }
            "trailer" => {
                property.as_deref().and_then(|prop| {
                    let prop_lower = prop.to_lowercase();
                    connection.trailers.iter()
                        .find(|(k, _)| k.to_lowercase() == prop_lower)
                        .map(|(_, v)| v.clone())
                })
            }
            "streamMessageCount" => {
                Some(stream_messages.len().to_string())
            }
            "streamMessage" => {
                // property format: "index" or "index.$.jsonpath"
                property.as_deref().and_then(|prop| {
                    let dot_idx = prop.find('.');
                    let index_str = match dot_idx {
                        Some(i) => &prop[..i],
                        None => prop,
                    };
                    let idx: usize = index_str.parse().ok()?;
                    let msg = stream_messages.get(idx)?;
                    let content = &msg.content;

                    match dot_idx {
                        None => Some(content.clone()),
                        Some(i) => {
                            let json_path = &prop[i + 1..];
                            let data: serde_json::Value = serde_json::from_str(content).ok()?;
                            extract_json_path(&data, json_path)
                                .or_else(|| Some(content.clone()))
                        }
                    }
                })
            }
            "status" => Some(connection.status.to_string()),
            "responseTime" => Some(connection.elapsed.to_string()),
            "body" => {
                stream_messages.last().map(|e| e.content.clone())
            }
            "header" => {
                property.as_deref().and_then(|prop| {
                    let prop_lower = prop.to_lowercase();
                    connection.initial_metadata.as_ref()?.iter()
                        .find(|(k, _)| k.to_lowercase() == prop_lower)
                        .map(|(_, v)| v.clone())
                })
            }
            "jsonQuery" => {
                property.as_deref().and_then(|prop| {
                    let last = stream_messages.last()?;
                    let data: serde_json::Value = serde_json::from_str(&last.content).ok()?;
                    extract_json_path(&data, prop)
                })
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

/// Map gRPC status code to human-readable name
fn grpc_status_name(code: i32) -> String {
    match code {
        0 => "OK",
        1 => "CANCELLED",
        2 => "UNKNOWN",
        3 => "INVALID_ARGUMENT",
        4 => "DEADLINE_EXCEEDED",
        5 => "NOT_FOUND",
        6 => "ALREADY_EXISTS",
        7 => "PERMISSION_DENIED",
        8 => "RESOURCE_EXHAUSTED",
        9 => "FAILED_PRECONDITION",
        10 => "ABORTED",
        11 => "OUT_OF_RANGE",
        12 => "UNIMPLEMENTED",
        13 => "INTERNAL",
        14 => "UNAVAILABLE",
        15 => "DATA_LOSS",
        16 => "UNAUTHENTICATED",
        _ => "UNKNOWN",
    }.to_string()
}
