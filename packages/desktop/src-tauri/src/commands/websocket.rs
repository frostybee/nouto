// WebSocket command handlers for Tauri
// Manages WebSocket connections with per-connection registry

use futures::{SinkExt, StreamExt};
use serde_json::json;
use std::collections::HashMap;
use std::sync::Arc;
use tauri::{AppHandle, Emitter};
use tokio::sync::Mutex;
use tokio_tungstenite::tungstenite::Message;

/// Registry of active WebSocket connections (keyed by panel/connection ID)
pub type WsRegistry = Arc<Mutex<HashMap<String, WsConnection>>>;

pub struct WsConnection {
    pub sender: tokio::sync::mpsc::Sender<WsCommand>,
}

pub enum WsCommand {
    Send(String, String), // (content, message_type: "text" | "binary")
    Disconnect,
}

/// Initialize an empty WebSocket connection registry
pub fn init_ws_registry() -> WsRegistry {
    Arc::new(Mutex::new(HashMap::new()))
}

/// Connect to a WebSocket server
#[tauri::command]
pub async fn ws_connect(
    data: serde_json::Value,
    app: AppHandle,
    registry: tauri::State<'_, WsRegistry>,
) -> Result<(), String> {
    let url = data["url"].as_str().unwrap_or("").to_string();
    if url.is_empty() {
        app.emit("wsStatus", json!({ "data": { "status": "error", "error": "URL is required" } }))
            .map_err(|e| e.to_string())?;
        return Ok(());
    }

    let connection_id = data["connectionId"].as_str().unwrap_or("default").to_string();

    // Disconnect existing connection if any
    {
        let mut reg = registry.lock().await;
        if let Some(conn) = reg.remove(&connection_id) {
            let _ = conn.sender.send(WsCommand::Disconnect).await;
        }
    }

    // Emit connecting status
    app.emit("wsStatus", json!({ "data": { "status": "connecting" } }))
        .map_err(|e| e.to_string())?;

    // Build custom headers for the WebSocket handshake
    let mut request = match url.parse::<http::Uri>() {
        Ok(uri) => {
            let authority = uri.authority().map(|a| a.to_string()).unwrap_or_default();
            let host = authority.as_str();
            http::Request::builder()
                .uri(&url)
                .header("Host", host)
        }
        Err(e) => {
            app.emit("wsStatus", json!({ "data": { "status": "error", "error": format!("Invalid URL: {}", e) } }))
                .map_err(|err| err.to_string())?;
            return Ok(());
        }
    };

    // Add user-provided headers
    if let Some(headers) = data["headers"].as_array() {
        for h in headers {
            let enabled = h["enabled"].as_bool().unwrap_or(true);
            if !enabled { continue; }
            let key = h["key"].as_str().unwrap_or("");
            let value = h["value"].as_str().unwrap_or("");
            if key.is_empty() { continue; }
            request = request.header(key, value);
        }
    }

    // Add subprotocols if provided
    if let Some(protocols) = data["protocols"].as_array() {
        let protos: Vec<&str> = protocols.iter().filter_map(|p| p.as_str()).collect();
        if !protos.is_empty() {
            request = request.header("Sec-WebSocket-Protocol", protos.join(", "));
        }
    }

    let ws_request = request
        .body(())
        .map_err(|e| format!("Failed to build WebSocket request: {}", e))?;

    // Connect
    let ws_stream = match tokio_tungstenite::connect_async(ws_request).await {
        Ok((stream, _response)) => stream,
        Err(e) => {
            app.emit("wsStatus", json!({ "data": { "status": "error", "error": format!("Connection failed: {}", e) } }))
                .map_err(|err| err.to_string())?;
            return Ok(());
        }
    };

    // Split the stream
    let (mut write, mut read) = ws_stream.split();

    // Create a command channel for sending messages and disconnecting
    let (cmd_tx, mut cmd_rx) = tokio::sync::mpsc::channel::<WsCommand>(32);

    // Register the connection
    {
        let mut reg = registry.lock().await;
        reg.insert(connection_id.clone(), WsConnection { sender: cmd_tx });
    }

    // Emit connected status
    app.emit("wsStatus", json!({ "data": { "status": "connected" } }))
        .map_err(|e| e.to_string())?;

    let app_for_read = app.clone();
    let app_for_cleanup = app.clone();
    let registry_for_cleanup = registry.inner().clone();
    let connection_id_for_cleanup = connection_id.clone();

    // Spawn task to handle incoming messages and outgoing commands
    tokio::spawn(async move {
        loop {
            tokio::select! {
                // Handle incoming WebSocket messages
                msg = read.next() => {
                    match msg {
                        Some(Ok(message)) => {
                            let (content, is_close) = match &message {
                                Message::Text(text) => (text.to_string(), false),
                                Message::Binary(data) => {
                                    use base64::Engine;
                                    (base64::engine::general_purpose::STANDARD.encode(data), false)
                                }
                                Message::Ping(_) | Message::Pong(_) => continue,
                                Message::Close(_) => (String::new(), true),
                                Message::Frame(_) => continue,
                            };

                            if is_close {
                                break;
                            }

                            let now = chrono::Utc::now().timestamp_millis();
                            let _ = app_for_read.emit("wsMessage", json!({
                                "data": {
                                    "direction": "received",
                                    "content": content,
                                    "timestamp": now
                                }
                            }));
                        }
                        Some(Err(e)) => {
                            let _ = app_for_read.emit("wsStatus", json!({
                                "data": { "status": "error", "error": format!("WebSocket error: {}", e) }
                            }));
                            break;
                        }
                        None => {
                            // Stream ended
                            break;
                        }
                    }
                }

                // Handle outgoing commands
                cmd = cmd_rx.recv() => {
                    match cmd {
                        Some(WsCommand::Send(content, msg_type)) => {
                            let message = if msg_type == "binary" {
                                use base64::Engine;
                                match base64::engine::general_purpose::STANDARD.decode(&content) {
                                    Ok(bytes) => Message::Binary(bytes.into()),
                                    Err(_) => Message::Text(content.clone().into()),
                                }
                            } else {
                                Message::Text(content.clone().into())
                            };

                            if let Err(e) = write.send(message).await {
                                let _ = app_for_read.emit("wsStatus", json!({
                                    "data": { "status": "error", "error": format!("Send failed: {}", e) }
                                }));
                                break;
                            }

                            let now = chrono::Utc::now().timestamp_millis();
                            let _ = app_for_read.emit("wsMessage", json!({
                                "data": {
                                    "direction": "sent",
                                    "content": content,
                                    "timestamp": now
                                }
                            }));
                        }
                        Some(WsCommand::Disconnect) => {
                            let _ = write.send(Message::Close(None)).await;
                            break;
                        }
                        None => {
                            // Command channel closed
                            break;
                        }
                    }
                }
            }
        }

        // Cleanup
        {
            let mut reg = registry_for_cleanup.lock().await;
            reg.remove(&connection_id_for_cleanup);
        }

        let _ = app_for_cleanup.emit("wsStatus", json!({ "data": { "status": "disconnected" } }));
    });

    Ok(())
}

/// Send a message through an active WebSocket connection
#[tauri::command]
pub async fn ws_send(
    data: serde_json::Value,
    registry: tauri::State<'_, WsRegistry>,
) -> Result<(), String> {
    let connection_id = data["connectionId"].as_str().unwrap_or("default").to_string();
    let content = data["message"].as_str().unwrap_or("").to_string();
    let msg_type = data["type"].as_str().unwrap_or("text").to_string();

    let reg = registry.lock().await;
    if let Some(conn) = reg.get(&connection_id) {
        conn.sender
            .send(WsCommand::Send(content, msg_type))
            .await
            .map_err(|e| format!("Failed to send: {}", e))?;
    } else {
        return Err("No active WebSocket connection".to_string());
    }

    Ok(())
}

/// Disconnect an active WebSocket connection
#[tauri::command]
pub async fn ws_disconnect(
    data: serde_json::Value,
    registry: tauri::State<'_, WsRegistry>,
) -> Result<(), String> {
    let connection_id = data["connectionId"].as_str().unwrap_or("default").to_string();

    let mut reg = registry.lock().await;
    if let Some(conn) = reg.remove(&connection_id) {
        let _ = conn.sender.send(WsCommand::Disconnect).await;
    }

    Ok(())
}

// --- WebSocket Session Management Commands ---

use crate::services::ws_session_storage::{WsSession, WsSessionStorage};

/// Save a WebSocket session recording
#[tauri::command]
pub async fn ws_save_session(
    data: serde_json::Value,
    app: AppHandle,
    storage: tauri::State<'_, WsSessionStorage>,
) -> Result<(), String> {
    let session: WsSession = serde_json::from_value(data)
        .map_err(|e| format!("Invalid session data: {}", e))?;

    let id = storage.save_session(&session).await?;

    let _ = app.emit("wsSessionSaved", json!({ "data": { "id": id } }));
    Ok(())
}

/// Load a single WebSocket session by ID
#[tauri::command]
pub async fn ws_load_session_by_id(
    data: serde_json::Value,
    app: AppHandle,
    storage: tauri::State<'_, WsSessionStorage>,
) -> Result<(), String> {
    let id = data["id"].as_str().unwrap_or("").to_string();
    if id.is_empty() {
        return Err("Session ID is required".to_string());
    }

    let session = storage.load_session(&id).await?;
    let _ = app.emit("wsSessionLoaded", json!({ "data": session }));
    Ok(())
}

/// List all saved WebSocket sessions (metadata only)
#[tauri::command]
pub async fn ws_list_sessions(
    app: AppHandle,
    storage: tauri::State<'_, WsSessionStorage>,
) -> Result<(), String> {
    let sessions = storage.list_sessions().await?;
    let _ = app.emit("wsSessionsList", json!({ "data": sessions }));
    Ok(())
}

/// Delete a WebSocket session by ID and emit updated list
#[tauri::command]
pub async fn ws_delete_session(
    data: serde_json::Value,
    app: AppHandle,
    storage: tauri::State<'_, WsSessionStorage>,
) -> Result<(), String> {
    let id = data["id"].as_str().unwrap_or("").to_string();
    if id.is_empty() {
        return Err("Session ID is required".to_string());
    }

    storage.delete_session(&id).await?;

    // Emit the updated list
    let sessions = storage.list_sessions().await?;
    let _ = app.emit("wsSessionsList", json!({ "data": sessions }));
    Ok(())
}
