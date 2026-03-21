// gRPC command handlers for Tauri
// Exposes gRPC client to the frontend via Tauri commands

use crate::services::grpc_client::{GrpcClient, GrpcPoolCache};
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
pub async fn grpc_reflect(app: AppHandle, data: GrpcReflectData, pool_cache: tauri::State<'_, GrpcPoolCache>) -> Result<(), String> {
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
pub async fn grpc_load_proto(app: AppHandle, data: GrpcLoadProtoData, pool_cache: tauri::State<'_, GrpcPoolCache>) -> Result<(), String> {
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
) -> Result<(), String> {
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
            let _ = app.emit("grpcConnectionEnd", serde_json::json!({ "data": connection }));
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
) -> Result<(), String> {
    let reg = registry.lock().await;
    if let Some(handle) = reg.get(&data.connection_id) {
        // Accept body from either "body" or "message" field
        let msg = data.body.or(data.message_body).unwrap_or_else(|| "{}".to_string());
        handle
            .sender
            .send(GrpcStreamCommand::SendMessage(msg))
            .await
            .map_err(|_| "Stream connection is closed".to_string())?;
        Ok(())
    } else {
        let _ = app.emit(
            "grpcProtoError",
            serde_json::json!({ "data": { "message": format!("No active stream for connection {}", data.connection_id) } }),
        );
        Err(format!(
            "No active stream for connection {}",
            data.connection_id
        ))
    }
}

/// Close the client-side of an active streaming connection (hard cancel)
#[tauri::command]
pub async fn grpc_end_stream(
    app: AppHandle,
    data: GrpcEndStreamData,
    registry: tauri::State<'_, GrpcStreamRegistry>,
) -> Result<(), String> {
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
        Err(format!(
            "No active stream for connection {}",
            data.connection_id
        ))
    }
}

/// Invalidate all cached gRPC descriptor pools (forces re-parse on next load)
#[tauri::command]
pub async fn grpc_invalidate_pool(pool_cache: tauri::State<'_, GrpcPoolCache>) -> Result<(), String> {
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
) -> Result<(), String> {
    let reg = registry.lock().await;
    if let Some(handle) = reg.get(&data.connection_id) {
        let _ = handle.sender.send(GrpcStreamCommand::Commit).await;
        Ok(())
    } else {
        let _ = app.emit(
            "grpcProtoError",
            serde_json::json!({ "data": { "message": format!("No active stream for connection {}", data.connection_id) } }),
        );
        Err(format!(
            "No active stream for connection {}",
            data.connection_id
        ))
    }
}

#[tauri::command]
pub async fn pick_proto_file(app: AppHandle) -> Result<(), String> {
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
pub async fn pick_proto_import_dir(app: AppHandle) -> Result<(), String> {
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
pub async fn scan_proto_dir(app: AppHandle, data: ScanProtoDirData) -> Result<(), String> {
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
