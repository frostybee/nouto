// GraphQL Subscription command handlers for Tauri
// Manages WebSocket-based GraphQL subscriptions using the graphql-ws protocol

use crate::error::AppError;
use futures::{SinkExt, StreamExt};
use serde_json::json;
use std::collections::HashMap;
use std::sync::Arc;
use tauri::{AppHandle, Emitter};
use tokio::sync::Mutex;
use tokio_tungstenite::tungstenite::Message;

/// Registry of active GraphQL subscription connections (keyed by subscription ID)
pub type GqlSubRegistry = Arc<Mutex<HashMap<String, GqlSubConnection>>>;

pub struct GqlSubConnection {
    pub sender: tokio::sync::mpsc::Sender<GqlSubCommand>,
}

pub enum GqlSubCommand {
    Unsubscribe,
}

/// Initialize an empty GraphQL subscription registry
pub fn init_gql_sub_registry() -> GqlSubRegistry {
    Arc::new(Mutex::new(HashMap::new()))
}

#[tauri::command]
pub async fn gql_sub_subscribe(
    data: serde_json::Value,
    app: AppHandle,
    registry: tauri::State<'_, GqlSubRegistry>,
) -> Result<(), AppError> {
    let url = data["url"].as_str().unwrap_or("").to_string();
    if url.is_empty() {
        app.emit(
            "gqlSubStatus",
            json!({ "data": { "status": "error", "error": "URL is required" } }),
        )
        .map_err(|e| AppError::Other(e.to_string()))?;
        return Ok(());
    }

    let subscription_id = data["subscriptionId"]
        .as_str()
        .unwrap_or("default")
        .to_string();
    let query = data["query"].as_str().unwrap_or("").to_string();
    let variables = data["variables"].clone();
    let headers_arr = data["headers"].as_array().cloned().unwrap_or_default();
    let connection_params = data["connectionParams"].clone();
    let use_legacy = data["useLegacyProtocol"].as_bool().unwrap_or(false);
    let auto_reconnect = data["autoReconnect"].as_bool().unwrap_or(false);
    let reconnect_interval_ms = data["reconnectIntervalMs"].as_u64().unwrap_or(3000);

    crate::services::security::check_plaintext_credentials(&app, &url, &headers_arr);

    // Disconnect existing subscription if any
    {
        let mut reg = registry.lock().await;
        if let Some(conn) = reg.remove(&subscription_id) {
            let _ = conn.sender.send(GqlSubCommand::Unsubscribe).await;
        }
    }

    // Emit connecting status
    app.emit(
        "gqlSubStatus",
        json!({ "data": { "status": "connecting", "subscriptionId": subscription_id } }),
    )
    .map_err(|e| AppError::Other(e.to_string()))?;

    // Convert URL: replace http(s) with ws(s) if needed
    let ws_url = if url.starts_with("http://") {
        url.replacen("http://", "ws://", 1)
    } else if url.starts_with("https://") {
        url.replacen("https://", "wss://", 1)
    } else if url.starts_with("ws://") || url.starts_with("wss://") {
        url.clone()
    } else {
        format!("ws://{}", url)
    };

    let subprotocol = if use_legacy {
        "graphql-ws"
    } else {
        "graphql-transport-ws"
    };

    let registry_clone = registry.inner().clone();
    let sub_id = subscription_id.clone();

    tokio::spawn(async move {
        let max_reconnect_attempts: u32 = 10;
        let mut reconnect_count: u32 = 0;
        let mut explicit_disconnect = false;

        'reconnect: loop {
            // Build WebSocket request
            let ws_key = tokio_tungstenite::tungstenite::handshake::client::generate_key();
            let mut request_builder = match ws_url.parse::<http::Uri>() {
                Ok(uri) => {
                    let authority = uri.authority().map(|a| a.to_string()).unwrap_or_default();
                    http::Request::builder()
                        .uri(&ws_url)
                        .header("Host", authority)
                        .header("Connection", "Upgrade")
                        .header("Upgrade", "websocket")
                        .header("Sec-WebSocket-Version", "13")
                        .header("Sec-WebSocket-Key", &ws_key)
                        .header("Sec-WebSocket-Protocol", subprotocol)
                        .header("User-Agent", "Nouto/1.0")
                }
                Err(e) => {
                    let _ = app.emit(
                        "gqlSubStatus",
                        json!({ "data": { "status": "error", "error": format!("Invalid URL: {}", e), "subscriptionId": sub_id } }),
                    );
                    break 'reconnect;
                }
            };

            for h in &headers_arr {
                let enabled = h["enabled"].as_bool().unwrap_or(true);
                if !enabled {
                    continue;
                }
                let key = h["key"].as_str().unwrap_or("");
                let value = h["value"].as_str().unwrap_or("");
                if key.is_empty() {
                    continue;
                }
                request_builder = request_builder.header(key, value);
            }

            let ws_request = match request_builder.body(()) {
                Ok(req) => req,
                Err(e) => {
                    let _ = app.emit(
                        "gqlSubStatus",
                        json!({ "data": { "status": "error", "error": format!("Failed to build request: {}", e), "subscriptionId": sub_id } }),
                    );
                    break 'reconnect;
                }
            };

            // Connect
            let ws_stream = match tokio_tungstenite::connect_async(ws_request).await {
                Ok((stream, _response)) => stream,
                Err(e) => {
                    let _ = app.emit(
                        "gqlSubStatus",
                        json!({ "data": { "status": "error", "error": format!("Connection failed: {}", e), "subscriptionId": sub_id } }),
                    );
                    if !auto_reconnect {
                        break 'reconnect;
                    }
                    reconnect_count += 1;
                    if reconnect_count >= max_reconnect_attempts {
                        let _ = app.emit("gqlSubStatus", json!({
                            "data": { "status": "error", "error": "Max reconnect attempts reached", "subscriptionId": sub_id }
                        }));
                        break 'reconnect;
                    }
                    let _ = app.emit("gqlSubStatus", json!({
                        "data": { "status": "reconnecting", "attempt": reconnect_count, "subscriptionId": sub_id }
                    }));
                    tokio::time::sleep(tokio::time::Duration::from_millis(
                        reconnect_interval_ms.min(30_000),
                    ))
                    .await;
                    continue 'reconnect;
                }
            };

            let (mut write, mut read) = ws_stream.split();

            // Create command channel and register
            let (cmd_tx, mut cmd_rx) = tokio::sync::mpsc::channel::<GqlSubCommand>(8);
            {
                let mut reg = registry_clone.lock().await;
                reg.insert(sub_id.clone(), GqlSubConnection { sender: cmd_tx });
            }

            // Reset reconnect count on successful connection
            reconnect_count = 0;

            // Send connection_init
            let init_payload = json!({
                "type": "connection_init",
                "payload": if connection_params.is_null() { json!({}) } else { connection_params.clone() }
            });

            if let Err(e) = write.send(Message::Text(init_payload.to_string())).await {
                let _ = app.emit("gqlSubStatus", json!({
                    "data": { "status": "error", "error": format!("Failed to send connection_init: {}", e), "subscriptionId": sub_id }
                }));
                cleanup_registry(&registry_clone, &sub_id).await;
                break 'reconnect;
            }

            // Wait for connection_ack
            let ack_timeout = tokio::time::timeout(tokio::time::Duration::from_secs(10), async {
                while let Some(msg) = read.next().await {
                    match msg {
                        Ok(Message::Text(text)) => {
                            if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(&text) {
                                let msg_type = parsed["type"].as_str().unwrap_or("");
                                if msg_type == "connection_ack" {
                                    return Ok(());
                                } else if msg_type == "connection_error" {
                                    let error_msg = parsed["payload"]
                                        .as_str()
                                        .or_else(|| parsed["payload"]["message"].as_str())
                                        .unwrap_or("Connection rejected by server")
                                        .to_string();
                                    return Err(error_msg);
                                }
                            }
                        }
                        Ok(Message::Close(_)) => {
                            return Err("Connection closed before ack".to_string())
                        }
                        Err(e) => return Err(format!("WebSocket error: {}", e)),
                        _ => continue,
                    }
                }
                Err("Connection closed before ack".to_string())
            })
            .await;

            match ack_timeout {
                Ok(Ok(())) => {}
                Ok(Err(e)) => {
                    let _ = app.emit(
                        "gqlSubStatus",
                        json!({
                            "data": { "status": "error", "error": e, "subscriptionId": sub_id }
                        }),
                    );
                    cleanup_registry(&registry_clone, &sub_id).await;
                    break 'reconnect;
                }
                Err(_) => {
                    let _ = app.emit("gqlSubStatus", json!({
                        "data": { "status": "error", "error": "Connection ack timeout", "subscriptionId": sub_id }
                    }));
                    cleanup_registry(&registry_clone, &sub_id).await;
                    break 'reconnect;
                }
            }

            let _ = app.emit(
                "gqlSubStatus",
                json!({
                    "data": { "status": "connected", "subscriptionId": sub_id }
                }),
            );

            // Send subscribe message
            let operation_id = uuid::Uuid::new_v4().to_string();
            let subscribe_msg = if use_legacy {
                json!({ "id": operation_id, "type": "start", "payload": { "query": query, "variables": if variables.is_null() { json!({}) } else { variables.clone() } } })
            } else {
                json!({ "id": operation_id, "type": "subscribe", "payload": { "query": query, "variables": if variables.is_null() { json!({}) } else { variables.clone() } } })
            };

            if let Err(e) = write.send(Message::Text(subscribe_msg.to_string())).await {
                let _ = app.emit("gqlSubStatus", json!({
                    "data": { "status": "error", "error": format!("Failed to send subscribe: {}", e), "subscriptionId": sub_id }
                }));
                cleanup_registry(&registry_clone, &sub_id).await;
                break 'reconnect;
            }

            // Event loop
            loop {
                tokio::select! {
                    msg = read.next() => {
                        match msg {
                            Some(Ok(Message::Text(text))) => {
                                if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(&text) {
                                    let msg_type = parsed["type"].as_str().unwrap_or("");
                                    match msg_type {
                                        "next" | "data" => {
                                            let _ = app.emit("gqlSubEvent", json!({
                                                "data": { "subscriptionId": sub_id, "payload": parsed["payload"], "timestamp": chrono::Utc::now().timestamp_millis() }
                                            }));
                                        }
                                        "error" => {
                                            let _ = app.emit("gqlSubEvent", json!({
                                                "data": { "subscriptionId": sub_id, "error": parsed["payload"], "timestamp": chrono::Utc::now().timestamp_millis() }
                                            }));
                                        }
                                        "complete" => { break; }
                                        "ka" | "ping" => {
                                            if msg_type == "ping" {
                                                let _ = write.send(Message::Text(json!({ "type": "pong" }).to_string())).await;
                                            }
                                        }
                                        "pong" => {}
                                        "connection_error" => {
                                            let error_msg = parsed["payload"]["message"].as_str().unwrap_or("Connection error").to_string();
                                            let _ = app.emit("gqlSubStatus", json!({
                                                "data": { "status": "error", "error": error_msg, "subscriptionId": sub_id }
                                            }));
                                            break;
                                        }
                                        _ => {}
                                    }
                                }
                            }
                            Some(Ok(Message::Close(_))) => { break; }
                            Some(Ok(Message::Ping(_))) => {
                                let _ = write.send(Message::Pong(vec![])).await;
                            }
                            Some(Err(e)) => {
                                let _ = app.emit("gqlSubStatus", json!({
                                    "data": { "status": "error", "error": format!("WebSocket error: {}", e), "subscriptionId": sub_id }
                                }));
                                break;
                            }
                            None => { break; }
                            _ => continue,
                        }
                    }

                    cmd = cmd_rx.recv() => {
                        match cmd {
                            Some(GqlSubCommand::Unsubscribe) | None => {
                                let stop_msg = if use_legacy {
                                    json!({ "id": operation_id, "type": "stop" })
                                } else {
                                    json!({ "id": operation_id, "type": "complete" })
                                };
                                let _ = write.send(Message::Text(stop_msg.to_string())).await;
                                let _ = write.send(Message::Close(None)).await;
                                explicit_disconnect = true;
                                break;
                            }
                        }
                    }
                }
            }

            // Cleanup this iteration
            cleanup_registry(&registry_clone, &sub_id).await;

            if explicit_disconnect || !auto_reconnect {
                break 'reconnect;
            }

            reconnect_count += 1;
            if reconnect_count >= max_reconnect_attempts {
                let _ = app.emit("gqlSubStatus", json!({
                    "data": { "status": "error", "error": "Max reconnect attempts reached", "subscriptionId": sub_id }
                }));
                break 'reconnect;
            }

            let _ = app.emit("gqlSubStatus", json!({
                "data": { "status": "reconnecting", "attempt": reconnect_count, "subscriptionId": sub_id }
            }));
            tokio::time::sleep(tokio::time::Duration::from_millis(
                reconnect_interval_ms.min(30_000),
            ))
            .await;
        }

        // Final cleanup
        cleanup_registry(&registry_clone, &sub_id).await;
        let _ = app.emit(
            "gqlSubStatus",
            json!({
                "data": { "status": "disconnected", "subscriptionId": sub_id }
            }),
        );
    });

    Ok(())
}

#[tauri::command]
pub async fn gql_sub_unsubscribe(
    data: serde_json::Value,
    registry: tauri::State<'_, GqlSubRegistry>,
) -> Result<(), AppError> {
    let subscription_id = data["subscriptionId"]
        .as_str()
        .unwrap_or("default")
        .to_string();

    let mut reg = registry.lock().await;
    if let Some(conn) = reg.remove(&subscription_id) {
        let _ = conn.sender.send(GqlSubCommand::Unsubscribe).await;
    }

    Ok(())
}

async fn cleanup_registry(registry: &GqlSubRegistry, subscription_id: &str) {
    let mut reg = registry.lock().await;
    reg.remove(subscription_id);
}
