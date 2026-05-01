// SSE (Server-Sent Events) command handlers for Tauri
// Uses reqwest streaming to consume SSE event streams

use crate::error::AppError;
use serde_json::json;
use std::collections::HashMap;
use std::sync::Arc;
use tauri::{AppHandle, Emitter};
use tokio::sync::Mutex;

/// Registry of active SSE connections (keyed by connection ID)
pub type SseRegistry = Arc<Mutex<HashMap<String, tokio::sync::oneshot::Sender<()>>>>;

/// Initialize an empty SSE connection registry
pub fn init_sse_registry() -> SseRegistry {
    Arc::new(Mutex::new(HashMap::new()))
}

/// Connect to an SSE endpoint
#[tauri::command]
pub async fn sse_connect(
    data: serde_json::Value,
    app: AppHandle,
    registry: tauri::State<'_, SseRegistry>,
) -> Result<(), AppError> {
    let url = data["url"].as_str().unwrap_or("").to_string();
    if url.is_empty() {
        app.emit("sseStatus", json!({ "data": { "status": "error", "error": "URL is required" } }))
            .map_err(|e| AppError::Other(e.to_string()))?;
        return Ok(());
    }

    let connection_id = data["connectionId"].as_str().unwrap_or("default").to_string();
    let auto_reconnect = data["autoReconnect"].as_bool().unwrap_or(false);
    let reconnect_interval_ms = data["reconnectIntervalMs"].as_u64().unwrap_or(3000);
    let headers_json = data["headers"].clone();

    // Disconnect existing connection if any
    {
        let mut reg = registry.lock().await;
        if let Some(cancel) = reg.remove(&connection_id) {
            let _ = cancel.send(());
        }
    }

    let app_clone = app.clone();
    let registry_clone = registry.inner().clone();
    let connection_id_clone = connection_id.clone();

    // Spawn task to consume the SSE stream
    tokio::spawn(async move {
        let app = app_clone;
        let max_reconnect_attempts: u32 = 10;
        let mut reconnect_attempts: u32 = 0;

        'reconnect: loop {
            // Emit connecting status
            let _ = app.emit("sseStatus", json!({ "data": { "status": "connecting" } }));

            // Build headers
            let mut header_map = reqwest::header::HeaderMap::new();
            header_map.insert(
                reqwest::header::ACCEPT,
                reqwest::header::HeaderValue::from_static("text/event-stream"),
            );
            header_map.insert(
                reqwest::header::CACHE_CONTROL,
                reqwest::header::HeaderValue::from_static("no-cache"),
            );
            header_map.insert(
                reqwest::header::USER_AGENT,
                reqwest::header::HeaderValue::from_static("Nouto"),
            );

            if let Some(headers) = headers_json.as_array() {
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

            let client = match reqwest::Client::builder().build() {
                Ok(c) => c,
                Err(e) => {
                    let _ = app.emit("sseStatus", json!({ "data": { "status": "error", "error": format!("Failed to create client: {}", e) } }));
                    break 'reconnect;
                }
            };

            let response = match client.get(&url).headers(header_map).send().await {
                Ok(resp) => resp,
                Err(e) => {
                    let _ = app.emit("sseStatus", json!({ "data": { "status": "error", "error": format!("Connection failed: {}", e) } }));
                    if !auto_reconnect || reconnect_attempts >= max_reconnect_attempts {
                        break 'reconnect;
                    }
                    reconnect_attempts += 1;
                    let delay = reconnect_interval_ms.min(30_000);
                    let _ = app.emit("sseStatus", json!({ "data": { "status": "reconnecting" } }));
                    tokio::time::sleep(tokio::time::Duration::from_millis(delay)).await;
                    continue 'reconnect;
                }
            };

            if !response.status().is_success() {
                let status = response.status().as_u16();
                let body = response.text().await.unwrap_or_default();
                let _ = app.emit("sseStatus", json!({ "data": { "status": "error", "error": format!("HTTP {}: {}", status, body) } }));
                if !auto_reconnect || reconnect_attempts >= max_reconnect_attempts {
                    break 'reconnect;
                }
                reconnect_attempts += 1;
                let delay = reconnect_interval_ms.min(30_000);
                let _ = app.emit("sseStatus", json!({ "data": { "status": "reconnecting" } }));
                tokio::time::sleep(tokio::time::Duration::from_millis(delay)).await;
                continue 'reconnect;
            }

            // Connected successfully
            let _ = app.emit("sseStatus", json!({ "data": { "status": "connected" } }));
            reconnect_attempts = 0;

            // Create a cancellation channel for this connection attempt
            let (cancel_tx, mut cancel_rx) = tokio::sync::oneshot::channel::<()>();
            {
                let mut reg = registry_clone.lock().await;
                println!("[Nouto] SSE registering connection: '{}'", connection_id_clone);
                reg.insert(connection_id_clone.clone(), cancel_tx);
                let keys: Vec<String> = reg.keys().cloned().collect();
                println!("[Nouto] SSE registry after insert: {:?}", keys);
            }

            // Read the stream, parsing SSE format
            let mut stream = response.bytes_stream();
            let mut buffer = String::new();
            let mut event_type = String::new();
            let mut event_data = String::new();
            let mut event_id = String::new();
            let mut explicit_cancel = false;

            use futures::StreamExt;
            loop {
                tokio::select! {
                    chunk = stream.next() => {
                        match chunk {
                            Some(Ok(bytes)) => {
                                let text = String::from_utf8_lossy(&bytes);
                                buffer.push_str(&text);

                                while let Some(newline_pos) = buffer.find('\n') {
                                    let line = buffer[..newline_pos].trim_end_matches('\r').to_string();
                                    buffer = buffer[newline_pos + 1..].to_string();

                                    if line.is_empty() {
                                        if !event_data.is_empty() {
                                            if event_data.ends_with('\n') {
                                                event_data.pop();
                                            }

                                            let now = chrono::Utc::now().timestamp_millis();
                                            let mut event_json = json!({
                                                "data": {
                                                    "data": event_data,
                                                    "timestamp": now
                                                }
                                            });

                                            if !event_type.is_empty() {
                                                event_json["data"]["type"] = json!(event_type);
                                            }
                                            if !event_id.is_empty() {
                                                event_json["data"]["id"] = json!(event_id);
                                            }

                                            let _ = app.emit("sseEvent", event_json);
                                        }

                                        event_type.clear();
                                        event_data.clear();
                                        event_id.clear();
                                    } else if let Some(rest) = line.strip_prefix("data:") {
                                        let value = rest.strip_prefix(' ').unwrap_or(rest);
                                        if !event_data.is_empty() {
                                            event_data.push('\n');
                                        }
                                        event_data.push_str(value);
                                    } else if let Some(rest) = line.strip_prefix("event:") {
                                        event_type = rest.strip_prefix(' ').unwrap_or(rest).to_string();
                                    } else if let Some(rest) = line.strip_prefix("id:") {
                                        event_id = rest.strip_prefix(' ').unwrap_or(rest).to_string();
                                    } else if line.starts_with(':') {
                                        // Comment, ignore
                                    }
                                }
                            }
                            Some(Err(e)) => {
                                let _ = app.emit("sseStatus", json!({ "data": { "status": "error", "error": format!("Stream error: {}", e) } }));
                                break;
                            }
                            None => { break; }
                        }
                    }
                    _ = &mut cancel_rx => {
                        explicit_cancel = true;
                        break;
                    }
                }
            }

            // Remove from registry after inner loop ends
            {
                let mut reg = registry_clone.lock().await;
                reg.remove(&connection_id_clone);
            }

            // Decide: reconnect or stop
            if explicit_cancel || !auto_reconnect || reconnect_attempts >= max_reconnect_attempts {
                break 'reconnect;
            }

            reconnect_attempts += 1;
            let delay = reconnect_interval_ms.min(30_000);
            let _ = app.emit("sseStatus", json!({ "data": { "status": "reconnecting" } }));
            tokio::time::sleep(tokio::time::Duration::from_millis(delay)).await;
        }

        // Final cleanup
        {
            let mut reg = registry_clone.lock().await;
            reg.remove(&connection_id_clone);
        }
        let _ = app.emit("sseStatus", json!({ "data": { "status": "disconnected" } }));
    });

    Ok(())
}

/// Disconnect an active SSE connection
#[tauri::command]
pub async fn sse_disconnect(
    data: serde_json::Value,
    registry: tauri::State<'_, SseRegistry>,
) -> Result<(), AppError> {
    let connection_id = data["connectionId"].as_str().unwrap_or("default").to_string();
    println!("[Nouto] SSE disconnect requested for connection: '{}', data: {}", connection_id, data);

    let mut reg = registry.lock().await;
    let keys: Vec<String> = reg.keys().cloned().collect();
    println!("[Nouto] SSE registry keys: {:?}", keys);

    if let Some(cancel) = reg.remove(&connection_id) {
        println!("[Nouto] SSE cancel signal sent for '{}'", connection_id);
        let _ = cancel.send(());
    } else {
        println!("[Nouto] SSE no connection found for '{}'", connection_id);
    }

    Ok(())
}
