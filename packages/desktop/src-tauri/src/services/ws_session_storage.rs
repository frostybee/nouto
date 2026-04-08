// WsSessionStorage - saves/loads WebSocket session recordings
// Stores sessions as individual JSON files in <app_data_dir>/nouto/ws-sessions/

use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use tokio::fs;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WsSessionConfig {
    pub url: String,
    #[serde(default)]
    pub protocols: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WsSessionMessage {
    pub direction: String,
    #[serde(rename = "type")]
    pub msg_type: String,
    pub data: String,
    pub size: usize,
    pub relative_time_ms: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WsSession {
    pub id: String,
    pub name: String,
    pub created_at: f64,
    pub config: WsSessionConfig,
    pub messages: Vec<WsSessionMessage>,
    pub duration_ms: f64,
    pub message_count: usize,
    pub version: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WsSessionMeta {
    pub id: String,
    pub name: String,
    pub url: String,
    pub message_count: usize,
    pub created_at: f64,
    pub duration_ms: f64,
}

pub struct WsSessionStorage {
    dir: PathBuf,
}

impl WsSessionStorage {
    pub fn new(app_data_dir: PathBuf) -> Self {
        let dir = app_data_dir.join("nouto").join("ws-sessions");
        Self { dir }
    }

    /// Ensure the sessions directory exists
    async fn ensure_dir(&self) -> Result<(), String> {
        fs::create_dir_all(&self.dir)
            .await
            .map_err(|e| format!("Failed to create ws-sessions directory: {}", e))
    }

    /// Save a session recording. Returns the session ID.
    pub async fn save_session(&self, session: &WsSession) -> Result<String, String> {
        self.ensure_dir().await?;
        let file_path = self.dir.join(format!("{}.json", session.id));
        let json = serde_json::to_string_pretty(session)
            .map_err(|e| format!("Failed to serialize session: {}", e))?;
        fs::write(&file_path, json)
            .await
            .map_err(|e| format!("Failed to write session file: {}", e))?;
        Ok(session.id.clone())
    }

    /// Load a session by ID, with migration support for legacy format
    pub async fn load_session(&self, id: &str) -> Result<WsSession, String> {
        let file_path = self.dir.join(format!("{}.json", id));
        if !file_path.exists() {
            return Err(format!("Session '{}' not found", id));
        }
        let content = fs::read_to_string(&file_path)
            .await
            .map_err(|e| format!("Failed to read session file: {}", e))?;

        // Try canonical format first
        if let Ok(session) = serde_json::from_str::<WsSession>(&content) {
            return Ok(session);
        }

        // Fallback: migrate legacy format
        let raw: serde_json::Value = serde_json::from_str(&content)
            .map_err(|e| format!("Failed to parse session file: {}", e))?;
        migrate_legacy_session(&raw)
    }

    /// List all session metadata (without full message data)
    pub async fn list_sessions(&self) -> Result<Vec<WsSessionMeta>, String> {
        self.ensure_dir().await?;

        let mut entries = Vec::new();
        let mut dir = fs::read_dir(&self.dir)
            .await
            .map_err(|e| format!("Failed to read ws-sessions directory: {}", e))?;

        while let Some(entry) = dir.next_entry().await.map_err(|e| e.to_string())? {
            let path = entry.path();
            if path.extension().map(|e| e == "json").unwrap_or(false) {
                if let Ok(content) = fs::read_to_string(&path).await {
                    // Try canonical format
                    if let Ok(session) = serde_json::from_str::<WsSession>(&content) {
                        entries.push(WsSessionMeta {
                            id: session.id,
                            name: session.name,
                            url: session.config.url,
                            message_count: session.message_count,
                            created_at: session.created_at,
                            duration_ms: session.duration_ms,
                        });
                    } else if let Ok(raw) = serde_json::from_str::<serde_json::Value>(&content) {
                        // Fallback: extract metadata from legacy format
                        if let Some(meta) = extract_legacy_meta(&raw) {
                            entries.push(meta);
                        }
                    }
                }
            }
        }

        // Sort by created_at descending (most recent first)
        entries.sort_by(|a, b| {
            b.created_at
                .partial_cmp(&a.created_at)
                .unwrap_or(std::cmp::Ordering::Equal)
        });

        Ok(entries)
    }

    /// Delete a session by ID
    pub async fn delete_session(&self, id: &str) -> Result<(), String> {
        let file_path = self.dir.join(format!("{}.json", id));
        if file_path.exists() {
            fs::remove_file(&file_path)
                .await
                .map_err(|e| format!("Failed to delete session file: {}", e))?;
        }
        Ok(())
    }

    /// Export a session as a JSON string
    pub async fn export_session(&self, id: &str) -> Result<String, String> {
        let session = self.load_session(id).await?;
        serde_json::to_string_pretty(&session)
            .map_err(|e| format!("Failed to serialize session for export: {}", e))
    }
}

/// Try canonical deserialization first, then fall back to legacy migration.
/// Useful for commands that receive session data from the frontend.
pub fn normalize_session(data: serde_json::Value) -> Result<WsSession, String> {
    if let Ok(session) = serde_json::from_value::<WsSession>(data.clone()) {
        return Ok(session);
    }
    migrate_legacy_session(&data)
}

/// Migrate a legacy-format session (flat url, absolute timestamps, ISO dates) to canonical format
fn migrate_legacy_session(raw: &serde_json::Value) -> Result<WsSession, String> {
    let id = raw["id"]
        .as_str()
        .unwrap_or("unknown")
        .to_string();
    let name = raw["name"]
        .as_str()
        .unwrap_or("Unknown")
        .to_string();

    // Handle flat url/protocols -> nested config
    let url = raw
        .get("config")
        .and_then(|c| c["url"].as_str())
        .or_else(|| raw["url"].as_str())
        .unwrap_or("")
        .to_string();
    let protocols: Vec<String> = raw
        .get("config")
        .and_then(|c| c["protocols"].as_array())
        .or_else(|| raw["protocols"].as_array())
        .map(|arr| {
            arr.iter()
                .filter_map(|v| v.as_str().map(String::from))
                .collect()
        })
        .unwrap_or_default();

    // Handle createdAt: ISO string -> epoch ms, or already a number
    let created_at = if let Some(s) = raw["createdAt"].as_str() {
        chrono::DateTime::parse_from_rfc3339(s)
            .map(|dt| dt.timestamp_millis() as f64)
            .unwrap_or(0.0)
    } else {
        raw["createdAt"].as_f64().unwrap_or(0.0)
    };

    let duration_ms = raw["durationMs"].as_f64().unwrap_or(0.0);

    // Migrate messages: absolute timestamp -> relativeTimeMs
    let mut messages = Vec::new();
    if let Some(arr) = raw["messages"].as_array() {
        let base_time = arr
            .first()
            .and_then(|m| m["timestamp"].as_i64())
            .unwrap_or(0);

        for msg in arr {
            // Use relativeTimeMs if present, otherwise compute from absolute timestamp
            let relative_time_ms = msg["relativeTimeMs"]
                .as_f64()
                .unwrap_or_else(|| {
                    let ts = msg["timestamp"].as_i64().unwrap_or(0);
                    (ts - base_time) as f64
                });

            messages.push(WsSessionMessage {
                direction: msg["direction"]
                    .as_str()
                    .unwrap_or("received")
                    .to_string(),
                msg_type: msg["type"].as_str().unwrap_or("text").to_string(),
                data: msg["data"].as_str().unwrap_or("").to_string(),
                size: msg["size"].as_u64().unwrap_or(0) as usize,
                relative_time_ms,
            });
        }
    }

    let message_count = raw["messageCount"]
        .as_u64()
        .map(|v| v as usize)
        .unwrap_or(messages.len());

    Ok(WsSession {
        id,
        name,
        created_at,
        config: WsSessionConfig { url, protocols },
        messages,
        duration_ms,
        message_count,
        version: 1,
    })
}

/// Extract metadata from a legacy-format session file
fn extract_legacy_meta(raw: &serde_json::Value) -> Option<WsSessionMeta> {
    let id = raw["id"].as_str()?.to_string();
    let name = raw["name"].as_str().unwrap_or("Unknown").to_string();

    let url = raw
        .get("config")
        .and_then(|c| c["url"].as_str())
        .or_else(|| raw["url"].as_str())
        .unwrap_or("")
        .to_string();

    let created_at = if let Some(s) = raw["createdAt"].as_str() {
        chrono::DateTime::parse_from_rfc3339(s)
            .map(|dt| dt.timestamp_millis() as f64)
            .unwrap_or(0.0)
    } else {
        raw["createdAt"].as_f64().unwrap_or(0.0)
    };

    let message_count = raw["messageCount"]
        .as_u64()
        .map(|v| v as usize)
        .or_else(|| raw["messages"].as_array().map(|a| a.len()))
        .unwrap_or(0);

    let duration_ms = raw["durationMs"].as_f64().unwrap_or(0.0);

    Some(WsSessionMeta {
        id,
        name,
        url,
        message_count,
        created_at,
        duration_ms,
    })
}
