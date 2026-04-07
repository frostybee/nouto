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
    let auto_reconnect = data["autoReconnect"].as_bool().unwrap_or(false);
    let reconnect_interval_ms = data["reconnectIntervalMs"].as_u64().unwrap_or(3000);
    let headers_json = data["headers"].clone();
    let protocols_json = data["protocols"].clone();

    // Disconnect existing connection if any
    {
        let mut reg = registry.lock().await;
        if let Some(conn) = reg.remove(&connection_id) {
            let _ = conn.sender.send(WsCommand::Disconnect).await;
        }
    }

    let app_clone = app.clone();
    let registry_clone = registry.inner().clone();
    let connection_id_clone = connection_id.clone();

    tokio::spawn(async move {
        let app = app_clone;
        let max_reconnect_attempts: u32 = 10;
        let mut reconnect_attempts: u32 = 0;

        'reconnect: loop {
            // Emit connecting status
            let _ = app.emit("wsStatus", json!({ "data": { "status": "connecting" } }));

            // Build WebSocket request
            let mut request = match url.parse::<http::Uri>() {
                Ok(uri) => {
                    let authority = uri.authority().map(|a| a.to_string()).unwrap_or_default();
                    http::Request::builder()
                        .uri(&url)
                        .header("Host", authority)
                }
                Err(e) => {
                    let _ = app.emit("wsStatus", json!({ "data": { "status": "error", "error": format!("Invalid URL: {}", e) } }));
                    break 'reconnect;
                }
            };

            // Add user-provided headers
            if let Some(headers) = headers_json.as_array() {
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
            if let Some(protocols) = protocols_json.as_array() {
                let protos: Vec<&str> = protocols.iter().filter_map(|p| p.as_str()).collect();
                if !protos.is_empty() {
                    request = request.header("Sec-WebSocket-Protocol", protos.join(", "));
                }
            }

            let ws_request = match request.body(()) {
                Ok(r) => r,
                Err(e) => {
                    let _ = app.emit("wsStatus", json!({ "data": { "status": "error", "error": format!("Failed to build request: {}", e) } }));
                    break 'reconnect;
                }
            };

            // Connect
            let ws_stream = match tokio_tungstenite::connect_async(ws_request).await {
                Ok((stream, _)) => stream,
                Err(e) => {
                    let _ = app.emit("wsStatus", json!({ "data": { "status": "error", "error": format!("Connection failed: {}", e) } }));
                    if !auto_reconnect || reconnect_attempts >= max_reconnect_attempts {
                        break 'reconnect;
                    }
                    reconnect_attempts += 1;
                    let delay = reconnect_interval_ms.min(30_000);
                    let _ = app.emit("wsStatus", json!({ "data": { "status": "reconnecting" } }));
                    tokio::time::sleep(tokio::time::Duration::from_millis(delay)).await;
                    continue 'reconnect;
                }
            };

            let (mut write, mut read) = ws_stream.split();
            let (cmd_tx, mut cmd_rx) = tokio::sync::mpsc::channel::<WsCommand>(32);

            // Register the connection
            {
                let mut reg = registry_clone.lock().await;
                reg.insert(connection_id_clone.clone(), WsConnection { sender: cmd_tx });
            }

            let _ = app.emit("wsStatus", json!({ "data": { "status": "connected" } }));
            reconnect_attempts = 0;

            let mut explicit_disconnect = false;

            // Inner read/write loop
            loop {
                tokio::select! {
                    msg = read.next() => {
                        match msg {
                            Some(Ok(message)) => {
                                let (content, msg_type_str, is_close) = match &message {
                                    Message::Text(text) => (text.to_string(), "text", false),
                                    Message::Binary(data) => {
                                        use base64::Engine;
                                        (base64::engine::general_purpose::STANDARD.encode(data), "binary", false)
                                    }
                                    Message::Ping(_) | Message::Pong(_) => continue,
                                    Message::Close(_) => (String::new(), "text", true),
                                    Message::Frame(_) => continue,
                                };

                                if is_close { break; }

                                let now = chrono::Utc::now().timestamp_millis();
                                let size = content.len();
                                let _ = app.emit("wsMessage", json!({
                                    "data": {
                                        "id": format!("ws-{}-{}", now, size),
                                        "direction": "received",
                                        "type": msg_type_str,
                                        "data": content,
                                        "size": size,
                                        "timestamp": now
                                    }
                                }));
                            }
                            Some(Err(e)) => {
                                let _ = app.emit("wsStatus", json!({
                                    "data": { "status": "error", "error": format!("WebSocket error: {}", e) }
                                }));
                                break;
                            }
                            None => { break; }
                        }
                    }
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
                                    let _ = app.emit("wsStatus", json!({
                                        "data": { "status": "error", "error": format!("Send failed: {}", e) }
                                    }));
                                    break;
                                }

                                let now = chrono::Utc::now().timestamp_millis();
                                let size = content.len();
                                let sent_type = if msg_type == "binary" { "binary" } else { "text" };
                                let _ = app.emit("wsMessage", json!({
                                    "data": {
                                        "id": format!("ws-{}-{}", now, size),
                                        "direction": "sent",
                                        "type": sent_type,
                                        "data": content,
                                        "size": size,
                                        "timestamp": now
                                    }
                                }));
                            }
                            Some(WsCommand::Disconnect) => {
                                let _ = write.send(Message::Close(None)).await;
                                explicit_disconnect = true;
                                break;
                            }
                            None => { break; }
                        }
                    }
                }
            }

            // Remove from registry after inner loop ends
            {
                let mut reg = registry_clone.lock().await;
                reg.remove(&connection_id_clone);
            }

            // Decide: reconnect or stop
            if explicit_disconnect || !auto_reconnect || reconnect_attempts >= max_reconnect_attempts {
                break 'reconnect;
            }

            reconnect_attempts += 1;
            let delay = reconnect_interval_ms.min(30_000);
            let _ = app.emit("wsStatus", json!({ "data": { "status": "reconnecting" } }));
            tokio::time::sleep(tokio::time::Duration::from_millis(delay)).await;
        }

        // Final cleanup
        {
            let mut reg = registry_clone.lock().await;
            reg.remove(&connection_id_clone);
        }
        let _ = app.emit("wsStatus", json!({ "data": { "status": "disconnected" } }));
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

    // Load the saved session back to send the full object to the UI
    let saved_session = storage.load_session(&id).await.ok();
    let _ = app.emit("wsSessionSaved", json!({ "data": { "session": saved_session } }));
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
    let _ = app.emit("wsSessionLoaded", json!({ "data": { "session": session } }));
    Ok(())
}

/// List all saved WebSocket sessions (metadata only)
#[tauri::command]
pub async fn ws_list_sessions(
    app: AppHandle,
    storage: tauri::State<'_, WsSessionStorage>,
) -> Result<(), String> {
    let sessions = storage.list_sessions().await?;
    let _ = app.emit("wsSessionsList", json!({ "data": { "sessions": sessions } }));
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
    let _ = app.emit("wsSessionsList", json!({ "data": { "sessions": sessions } }));
    Ok(())
}
