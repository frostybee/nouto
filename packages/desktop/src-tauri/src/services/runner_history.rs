// RunnerHistory - stores collection runner results in a JSONL file
// Located at <app_data_dir>/nouto/runner-history.jsonl

use serde_json::Value;
use std::path::PathBuf;
use tokio::fs;

#[allow(dead_code)]
pub struct RunnerHistory {
    path: PathBuf,
}

#[allow(dead_code)]
impl RunnerHistory {
    pub fn new(app_data_dir: PathBuf) -> Self {
        let path = app_data_dir.join("nouto").join("runner-history.jsonl");
        Self { path }
    }

    async fn ensure_dir(&self) -> Result<(), String> {
        if let Some(parent) = self.path.parent() {
            fs::create_dir_all(parent)
                .await
                .map_err(|e| format!("Failed to create runner-history directory: {}", e))?;
        }
        Ok(())
    }

    /// Save a runner result
    pub async fn save_run(&self, entry: &Value) -> Result<(), String> {
        self.ensure_dir().await?;
        let line = serde_json::to_string(entry)
            .map_err(|e| format!("Failed to serialize run entry: {}", e))?;
        let mut content = if self.path.exists() {
            fs::read_to_string(&self.path).await.unwrap_or_default()
        } else {
            String::new()
        };
        if !content.is_empty() && !content.ends_with('\n') {
            content.push('\n');
        }
        content.push_str(&line);
        content.push('\n');
        fs::write(&self.path, content)
            .await
            .map_err(|e| format!("Failed to write runner-history: {}", e))
    }

    /// List all runs (metadata only: id, collectionId, collectionName, startedAt, completedAt, totalRequests, passed, failed, skipped, duration)
    pub async fn list_runs(&self) -> Result<Vec<Value>, String> {
        let entries = self.load_all().await?;
        // Return entries without the full results array for efficiency
        let summaries: Vec<Value> = entries.iter().map(|e| {
            let mut summary = e.clone();
            if let Some(obj) = summary.as_object_mut() {
                obj.remove("results");
            }
            summary
        }).collect();
        Ok(summaries)
    }

    /// Get a single run by ID (with full results)
    pub async fn get_run(&self, id: &str) -> Result<Option<Value>, String> {
        let entries = self.load_all().await?;
        Ok(entries.into_iter().find(|e| e["id"].as_str() == Some(id)))
    }

    /// Delete a single run by ID
    pub async fn delete_run(&self, id: &str) -> Result<(), String> {
        let mut entries = self.load_all().await?;
        entries.retain(|e| e["id"].as_str() != Some(id));
        self.write_all(&entries).await
    }

    /// Clear all runner history
    pub async fn clear_all(&self) -> Result<(), String> {
        self.write_all(&[]).await
    }

    async fn load_all(&self) -> Result<Vec<Value>, String> {
        if !self.path.exists() {
            return Ok(vec![]);
        }
        let content = fs::read_to_string(&self.path)
            .await
            .map_err(|e| format!("Failed to read runner-history: {}", e))?;

        let entries: Vec<Value> = content
            .lines()
            .filter(|line| !line.trim().is_empty())
            .filter_map(|line| serde_json::from_str(line).ok())
            .collect();

        Ok(entries)
    }

    async fn write_all(&self, entries: &[Value]) -> Result<(), String> {
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
            .map_err(|e| format!("Failed to write runner-history: {}", e))
    }
}
