// HistoryStorage - append-only JSONL file for request history
// Stores entries in <app_data_dir>/nouto/history.jsonl (one JSON object per line)
// Caps at 2,000 entries, trimming the oldest when exceeded.

use serde_json::Value;
use std::path::PathBuf;
use tokio::fs;

const MAX_ENTRIES: usize = 2_000;

pub struct HistoryStorage {
    path: PathBuf,
}

impl HistoryStorage {
    pub fn new(app_data_dir: PathBuf) -> Self {
        let path = app_data_dir.join("nouto").join("history.jsonl");
        Self { path }
    }

    /// Ensure the parent directory exists
    async fn ensure_dir(&self) -> Result<(), String> {
        if let Some(parent) = self.path.parent() {
            fs::create_dir_all(parent)
                .await
                .map_err(|e| format!("Failed to create history directory: {}", e))?;
        }
        Ok(())
    }

    /// Load all history entries from disk, compacting if over the cap
    pub async fn load_all(&self) -> Result<Vec<Value>, String> {
        if !self.path.exists() {
            return Ok(vec![]);
        }
        let content = fs::read_to_string(&self.path)
            .await
            .map_err(|e| format!("Failed to read history: {}", e))?;

        let mut entries: Vec<Value> = content
            .lines()
            .filter(|line| !line.trim().is_empty())
            .filter_map(|line| serde_json::from_str(line).ok())
            .collect();

        // Compact oversized files (e.g. written before the cap was enforced)
        if entries.len() > MAX_ENTRIES {
            entries = entries.split_off(entries.len() - MAX_ENTRIES);
            let _ = self.write_all(&entries).await;
        }

        Ok(entries)
    }

    /// Append a history entry, trimming oldest if over the cap
    pub async fn append(&self, entry: &Value) -> Result<(), String> {
        self.ensure_dir().await?;

        let mut entries = self.load_all().await?;
        entries.push(entry.clone());

        // Trim oldest entries if over cap
        if entries.len() > MAX_ENTRIES {
            entries = entries.split_off(entries.len() - MAX_ENTRIES);
        }

        self.write_all(&entries).await
    }

    /// Delete a single entry by ID
    pub async fn delete_entry(&self, id: &str) -> Result<(), String> {
        let mut entries = self.load_all().await?;
        entries.retain(|e| e["id"].as_str() != Some(id));
        self.write_all(&entries).await
    }

    /// Clear all history
    pub async fn clear(&self) -> Result<(), String> {
        self.write_all(&[]).await
    }

    /// Write all entries back to disk
    pub async fn write_all(&self, entries: &[Value]) -> Result<(), String> {
        self.ensure_dir().await?;
        let content: String = entries
            .iter()
            .map(|e| serde_json::to_string(e).unwrap_or_default())
            .collect::<Vec<_>>()
            .join("\n");

        let final_content = if content.is_empty() {
            String::new()
        } else {
            format!("{}\n", content)
        };

        fs::write(&self.path, final_content)
            .await
            .map_err(|e| format!("Failed to write history: {}", e))
    }
}
