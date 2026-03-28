// SSE (Server-Sent Events) command handlers for Tauri
// Uses reqwest streaming to consume SSE event streams

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
) -> Result<(), String> {
    let url = data["url"].as_str().unwrap_or("").to_string();
    if url.is_empty() {
        app.emit("sseStatus", json!({ "data": { "status": "error", "error": "URL is required" } }))
            .map_err(|e| e.to_string())?;
        return Ok(());
    }

    let connection_id = data["connectionId"].as_str().unwrap_or("default").to_string();

    // Disconnect existing connection if any
    {
        let mut reg = registry.lock().await;
        if let Some(cancel) = reg.remove(&connection_id) {
            let _ = cancel.send(());
        }
    }

    // Emit connecting status
    app.emit("sseStatus", json!({ "data": { "status": "connecting" } }))
        .map_err(|e| e.to_string())?;

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

    // Create a cancellation channel
    let (cancel_tx, cancel_rx) = tokio::sync::oneshot::channel::<()>();

    // Register the connection
    {
        let mut reg = registry.lock().await;
        reg.insert(connection_id.clone(), cancel_tx);
    }

    let app_for_stream = app.clone();
    let app_for_cleanup = app.clone();
    let registry_for_cleanup = registry.inner().clone();
    let connection_id_for_cleanup = connection_id.clone();

    // Spawn task to consume the SSE stream
    tokio::spawn(async move {
        let client = match reqwest::Client::builder()
            .build()
        {
            Ok(c) => c,
            Err(e) => {
                let _ = app_for_stream.emit("sseStatus", json!({ "data": { "status": "error", "error": format!("Failed to create client: {}", e) } }));
                return;
            }
        };

        let response = match client.get(&url).headers(header_map).send().await {
            Ok(resp) => resp,
            Err(e) => {
                let _ = app_for_stream.emit("sseStatus", json!({ "data": { "status": "error", "error": format!("Connection failed: {}", e) } }));
                // Cleanup registry
                let mut reg = registry_for_cleanup.lock().await;
                reg.remove(&connection_id_for_cleanup);
                return;
            }
        };

        if !response.status().is_success() {
            let status = response.status().as_u16();
            let body = response.text().await.unwrap_or_default();
            let _ = app_for_stream.emit("sseStatus", json!({ "data": { "status": "error", "error": format!("HTTP {}: {}", status, body) } }));
            let mut reg = registry_for_cleanup.lock().await;
            reg.remove(&connection_id_for_cleanup);
            return;
        }

        // Emit connected status
        let _ = app_for_stream.emit("sseStatus", json!({ "data": { "status": "connected" } }));

        // Read the stream line by line, parsing SSE format
        let mut stream = response.bytes_stream();
        let mut buffer = String::new();
        let mut event_type = String::new();
        let mut event_data = String::new();
        let mut event_id = String::new();

        // Wrap cancel_rx in a mutable option so we can take it
        let mut cancel_rx = cancel_rx;

        use futures::StreamExt;
        loop {
            tokio::select! {
                chunk = stream.next() => {
                    match chunk {
                        Some(Ok(bytes)) => {
                            let text = String::from_utf8_lossy(&bytes);
                            buffer.push_str(&text);

                            // Process complete lines from the buffer
                            while let Some(newline_pos) = buffer.find('\n') {
                                let line = buffer[..newline_pos].trim_end_matches('\r').to_string();
                                buffer = buffer[newline_pos + 1..].to_string();

                                if line.is_empty() {
                                    // Empty line = dispatch event
                                    if !event_data.is_empty() {
                                        // Remove trailing newline from data
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

                                        let _ = app_for_stream.emit("sseEvent", event_json);
                                    }

                                    // Reset for next event
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
                                // "retry:" is also valid SSE but we don't need to handle it
                            }
                        }
                        Some(Err(e)) => {
                            let _ = app_for_stream.emit("sseStatus", json!({ "data": { "status": "error", "error": format!("Stream error: {}", e) } }));
                            break;
                        }
                        None => {
                            // Stream ended
                            break;
                        }
                    }
                }
                _ = &mut cancel_rx => {
                    // Cancelled by user
                    break;
                }
            }
        }

        // Cleanup
        {
            let mut reg = registry_for_cleanup.lock().await;
            reg.remove(&connection_id_for_cleanup);
        }

        let _ = app_for_cleanup.emit("sseStatus", json!({ "data": { "status": "disconnected" } }));
    });

    Ok(())
}

/// Disconnect an active SSE connection
#[tauri::command]
pub async fn sse_disconnect(
    data: serde_json::Value,
    registry: tauri::State<'_, SseRegistry>,
) -> Result<(), String> {
    let connection_id = data["connectionId"].as_str().unwrap_or("default").to_string();

    let mut reg = registry.lock().await;
    if let Some(cancel) = reg.remove(&connection_id) {
        let _ = cancel.send(());
    }

    Ok(())
}
