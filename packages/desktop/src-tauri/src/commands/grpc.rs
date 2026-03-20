// gRPC command handlers for Tauri
// Exposes gRPC client to the frontend via Tauri commands

use crate::services::grpc_client::GrpcClient;
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
}

pub enum GrpcStreamCommand {
    SendMessage(String), // JSON-encoded message body
    EndStream,
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
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GrpcLoadProtoData {
    pub proto_paths: Vec<String>,
    pub import_dirs: Vec<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GrpcInvokeData {
    pub address: String,
    pub service_name: String,
    pub method_name: String,
    pub metadata: Option<std::collections::HashMap<String, String>>,
    pub body: String,
    pub use_reflection: bool,
    pub proto_paths: Option<Vec<String>>,
    pub import_dirs: Option<Vec<String>>,
    pub tls: Option<bool>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GrpcSendMessageData {
    pub connection_id: String,
    pub message: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GrpcEndStreamData {
    pub connection_id: String,
}

#[tauri::command]
pub async fn grpc_reflect(app: AppHandle, data: GrpcReflectData) -> Result<(), String> {
    let client = GrpcClient::new();
    match client.reflect(&data.address, data.metadata, data.tls).await {
        Ok(descriptor) => {
            let _ = app.emit("grpcProtoLoaded", &descriptor);
            Ok(())
        }
        Err(e) => {
            let _ = app.emit(
                "grpcProtoError",
                serde_json::json!({ "message": e }),
            );
            Ok(())
        }
    }
}

#[tauri::command]
pub async fn grpc_load_proto(app: AppHandle, data: GrpcLoadProtoData) -> Result<(), String> {
    let client = GrpcClient::new();
    match client
        .load_proto(&data.proto_paths, &data.import_dirs)
        .await
    {
        Ok(descriptor) => {
            let _ = app.emit("grpcProtoLoaded", &descriptor);
            Ok(())
        }
        Err(e) => {
            let _ = app.emit(
                "grpcProtoError",
                serde_json::json!({ "message": e }),
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
) -> Result<(), String> {
    let client = GrpcClient::new();

    // Check if this is a streaming method by inspecting proto descriptors
    let proto_paths = data.proto_paths.clone();
    let import_dirs = data.import_dirs.clone();
    let paths = proto_paths.as_deref().unwrap_or(&[]);
    let dirs = import_dirs.as_deref().unwrap_or(&[]);

    if !paths.is_empty() {
        if let Some(method_info) = client.get_method_info(paths, dirs, &data.service_name, &data.method_name) {
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
                        data.metadata,
                        &data.body,
                        data.proto_paths,
                        data.import_dirs,
                        data.tls,
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
                            serde_json::json!({ "message": e }),
                        );
                        return Ok(());
                    }
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
            data.metadata,
            &data.body,
            data.use_reflection,
            data.proto_paths,
            data.import_dirs,
            data.tls,
        )
        .await
    {
        Ok((connection, events)) => {
            let _ = app.emit("grpcConnectionStart", &connection);
            for event in &events {
                let _ = app.emit("grpcEvent", event);
            }
            let _ = app.emit("grpcConnectionEnd", &connection);
            Ok(())
        }
        Err(e) => {
            let _ = app.emit(
                "grpcProtoError",
                serde_json::json!({ "message": e }),
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
        handle
            .sender
            .send(GrpcStreamCommand::SendMessage(data.message))
            .await
            .map_err(|_| "Stream connection is closed".to_string())?;
        Ok(())
    } else {
        let _ = app.emit(
            "grpcProtoError",
            serde_json::json!({ "message": format!("No active stream for connection {}", data.connection_id) }),
        );
        Err(format!(
            "No active stream for connection {}",
            data.connection_id
        ))
    }
}

/// Close the client-side of an active streaming connection
#[tauri::command]
pub async fn grpc_end_stream(
    app: AppHandle,
    data: GrpcEndStreamData,
    registry: tauri::State<'_, GrpcStreamRegistry>,
) -> Result<(), String> {
    let mut reg = registry.lock().await;
    if let Some(handle) = reg.remove(&data.connection_id) {
        // Sending EndStream signals the sender to close; dropping also works
        let _ = handle.sender.send(GrpcStreamCommand::EndStream).await;
        Ok(())
    } else {
        let _ = app.emit(
            "grpcProtoError",
            serde_json::json!({ "message": format!("No active stream for connection {}", data.connection_id) }),
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
            serde_json::json!({ "paths": path_strings }),
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
            serde_json::json!({ "paths": path_strings }),
        );
    }
    Ok(())
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScanProtoDirData {
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
            serde_json::json!({ "message": format!("Not a directory: {}", data.dir_path) }),
        );
        return Ok(());
    }
    let mut proto_files = Vec::new();
    collect_proto_files(dir, &mut proto_files);
    let _ = app.emit(
        "protoFilesPicked",
        serde_json::json!({ "paths": proto_files }),
    );
    Ok(())
}
