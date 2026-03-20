// WsSessionStorage - saves/loads WebSocket session recordings
// Stores sessions as individual JSON files in <app_data_dir>/nouto/ws-sessions/

use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use tokio::fs;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WsSessionMessage {
    pub id: String,
    pub direction: String,
    #[serde(rename = "type")]
    pub msg_type: String,
    pub data: String,
    pub size: usize,
    pub timestamp: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WsSession {
    pub id: String,
    pub name: String,
    pub url: String,
    pub protocols: Vec<String>,
    pub messages: Vec<WsSessionMessage>,
    pub created_at: String,
    pub duration: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WsSessionMeta {
    pub id: String,
    pub name: String,
    pub url: String,
    pub message_count: usize,
    pub created_at: String,
    pub duration: f64,
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

    /// Load a session by ID
    pub async fn load_session(&self, id: &str) -> Result<WsSession, String> {
        let file_path = self.dir.join(format!("{}.json", id));
        if !file_path.exists() {
            return Err(format!("Session '{}' not found", id));
        }
        let content = fs::read_to_string(&file_path)
            .await
            .map_err(|e| format!("Failed to read session file: {}", e))?;
        serde_json::from_str(&content)
            .map_err(|e| format!("Failed to parse session file: {}", e))
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
                    if let Ok(session) = serde_json::from_str::<WsSession>(&content) {
                        entries.push(WsSessionMeta {
                            id: session.id,
                            name: session.name,
                            url: session.url,
                            message_count: session.messages.len(),
                            created_at: session.created_at,
                            duration: session.duration,
                        });
                    }
                }
            }
        }

        // Sort by created_at descending (most recent first)
        entries.sort_by(|a, b| b.created_at.cmp(&a.created_at));

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
