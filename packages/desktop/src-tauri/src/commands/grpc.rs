// gRPC command handlers for Tauri
// Exposes gRPC client to the frontend via Tauri commands

use crate::services::grpc_client::GrpcClient;
use serde::Deserialize;
use tauri::{AppHandle, Emitter};

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
pub async fn grpc_invoke(app: AppHandle, data: GrpcInvokeData) -> Result<(), String> {
    let client = GrpcClient::new();
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
