// StorageService - persistent file storage for collections, environments, and settings
// Stores data as JSON files in <app_data_dir>/nouto/

use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashSet;
use std::path::PathBuf;
use tokio::fs;

pub struct StorageService {
    base_dir: PathBuf,
}

impl StorageService {
    /// Create a new StorageService that stores data in `<base_dir>/nouto/`
    pub fn new(app_data_dir: PathBuf) -> Self {
        let base_dir = app_data_dir.join("nouto");
        Self { base_dir }
    }

    /// Ensure the storage directory exists
    async fn ensure_dir(&self) -> Result<(), String> {
        fs::create_dir_all(&self.base_dir)
            .await
            .map_err(|e| format!("Failed to create storage directory: {}", e))
    }

    fn collections_path(&self) -> PathBuf {
        self.base_dir.join("collections.json")
    }

    fn environments_path(&self) -> PathBuf {
        self.base_dir.join("environments.json")
    }

    fn settings_path(&self) -> PathBuf {
        self.base_dir.join("settings.json")
    }

    pub fn meta_path(&self) -> PathBuf {
        self.base_dir.join("meta.json")
    }

    pub fn collections_path_public(&self) -> PathBuf {
        self.collections_path()
    }

    pub fn environments_path_public(&self) -> PathBuf {
        self.environments_path()
    }

    /// Load collections from disk. Returns an empty array if the file doesn't exist.
    pub async fn load_collections(&self) -> Result<Value, String> {
        let path = self.collections_path();
        if !path.exists() {
            return Ok(Value::Array(vec![]));
        }
        let data = fs::read_to_string(&path)
            .await
            .map_err(|e| format!("Failed to read collections: {}", e))?;
        serde_json::from_str(&data)
            .map_err(|e| format!("Failed to parse collections: {}", e))
    }

    /// Save collections to disk (atomic write via temp file + rename).
    pub async fn save_collections(&self, collections: &Value) -> Result<(), String> {
        self.ensure_dir().await?;
        let data = serde_json::to_string_pretty(collections)
            .map_err(|e| format!("Failed to serialize collections: {}", e))?;
        self.atomic_write(&self.collections_path(), &data).await
    }

    /// Load environments from disk. Returns default structure if the file doesn't exist.
    pub async fn load_environments(&self) -> Result<Value, String> {
        let path = self.environments_path();
        if !path.exists() {
            return Ok(serde_json::json!({ "environments": [], "activeId": null }));
        }
        let data = fs::read_to_string(&path)
            .await
            .map_err(|e| format!("Failed to read environments: {}", e))?;
        serde_json::from_str(&data)
            .map_err(|e| format!("Failed to parse environments: {}", e))
    }

    /// Save environments to disk (atomic write via temp file + rename).
    pub async fn save_environments(&self, environments: &Value) -> Result<(), String> {
        self.ensure_dir().await?;
        let data = serde_json::to_string_pretty(environments)
            .map_err(|e| format!("Failed to serialize environments: {}", e))?;
        self.atomic_write(&self.environments_path(), &data).await
    }

    /// Load settings from disk. Returns empty object if the file doesn't exist.
    pub async fn load_settings(&self) -> Result<Value, String> {
        let path = self.settings_path();
        if !path.exists() {
            return Ok(serde_json::json!({}));
        }
        let data = fs::read_to_string(&path)
            .await
            .map_err(|e| format!("Failed to read settings: {}", e))?;
        serde_json::from_str(&data)
            .map_err(|e| format!("Failed to parse settings: {}", e))
    }

    /// Save settings to disk (atomic write via temp file + rename).
    pub async fn save_settings(&self, settings: &Value) -> Result<(), String> {
        self.ensure_dir().await?;
        let data = serde_json::to_string_pretty(settings)
            .map_err(|e| format!("Failed to serialize settings: {}", e))?;
        self.atomic_write(&self.settings_path(), &data).await
    }

    /// Write data atomically: write to a temp file first, then rename into place.
    /// Prevents corruption from concurrent writes or crashes mid-write.
    async fn atomic_write(&self, target: &PathBuf, data: &str) -> Result<(), String> {
        let tmp = target.with_extension("tmp");
        fs::write(&tmp, data)
            .await
            .map_err(|e| format!("Failed to write temp file: {}", e))?;
        fs::rename(&tmp, target)
            .await
            .map_err(|e| format!("Failed to rename temp file: {}", e))
    }
}

// ── Recent Projects ──────────────────────────────────────────────────────

const MAX_RECENT_PROJECTS: usize = 10;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RecentProject {
    pub path: String,
    pub name: String,
    pub last_opened: String,
}

/// Load recent projects from `<base_dir>/nouto/recent-projects.json`
pub async fn load_recent_projects(base_dir: &PathBuf) -> Vec<RecentProject> {
    let path = base_dir.join("nouto").join("recent-projects.json");
    if !path.exists() {
        return Vec::new();
    }
    match fs::read_to_string(&path).await {
        Ok(data) => serde_json::from_str::<Vec<RecentProject>>(&data).unwrap_or_default(),
        Err(_) => Vec::new(),
    }
}

/// Save recent projects list to disk
async fn save_recent_projects(base_dir: &PathBuf, projects: &[RecentProject]) -> Result<(), String> {
    let dir = base_dir.join("nouto");
    fs::create_dir_all(&dir).await
        .map_err(|e| format!("Failed to create storage dir: {}", e))?;
    let data = serde_json::to_string_pretty(projects)
        .map_err(|e| format!("Failed to serialize recent projects: {}", e))?;
    fs::write(dir.join("recent-projects.json"), data).await
        .map_err(|e| format!("Failed to write recent projects: {}", e))
}

/// Add or update a recent project entry. Caps at MAX_RECENT_PROJECTS.
pub async fn add_recent_project(base_dir: &PathBuf, path: &str, name: &str) -> Result<Vec<RecentProject>, String> {
    let mut projects = load_recent_projects(base_dir).await;

    // Remove existing entry with same path (will re-add at front)
    projects.retain(|p| p.path != path);

    let now = chrono::Utc::now().to_rfc3339();
    projects.insert(0, RecentProject {
        path: path.to_string(),
        name: name.to_string(),
        last_opened: now,
    });

    // Cap at max
    projects.truncate(MAX_RECENT_PROJECTS);

    save_recent_projects(base_dir, &projects).await?;
    Ok(projects)
}

/// Remove a recent project by path
pub async fn remove_recent_project(base_dir: &PathBuf, path: &str) -> Result<Vec<RecentProject>, String> {
    let mut projects = load_recent_projects(base_dir).await;
    projects.retain(|p| p.path != path);
    save_recent_projects(base_dir, &projects).await?;
    Ok(projects)
}

/// Clear all recent projects
pub async fn clear_recent_projects(base_dir: &PathBuf) -> Result<(), String> {
    save_recent_projects(base_dir, &[]).await
}

/// Get the last opened project path (first entry in recent projects)
pub async fn get_last_project_path(base_dir: &PathBuf) -> Option<String> {
    let projects = load_recent_projects(base_dir).await;
    projects.first().map(|p| p.path.clone())
}

// ── Per-Request (Git-Friendly) Project Storage ──────────────────────────
//
// File layout compatible with the VS Code extension's PerRequestStorageStrategy:
//   <project_dir>/.nouto/
//     .gitignore
//     environments.json
//     collections/
//       My API/                  <- collection dir (sanitized name)
//         _collection.json       <- collection metadata (no items)
//         _order.json            <- ["Login", "folder:auth"]
//         Login.json             <- request file
//         auth/                  <- folder dir
//           _folder.json
//           _order.json
//           Register.json

const COLLECTION_META: &str = "_collection.json";
const FOLDER_META: &str = "_folder.json";
const ORDER_FILE: &str = "_order.json";

pub struct ProjectStorageService {
    storage_dir: PathBuf,
}

impl ProjectStorageService {
    pub fn new(project_dir: PathBuf) -> Self {
        let storage_dir = project_dir.join(".nouto");
        Self { storage_dir }
    }

    fn collections_dir(&self) -> PathBuf {
        self.storage_dir.join("collections")
    }

    fn environments_path(&self) -> PathBuf {
        self.storage_dir.join("environments.json")
    }

    pub fn meta_path(&self) -> PathBuf {
        self.storage_dir.join("meta.json")
    }

    pub fn environments_path_public(&self) -> PathBuf {
        self.environments_path()
    }

    async fn ensure_dir(&self) -> Result<(), String> {
        fs::create_dir_all(self.collections_dir())
            .await
            .map_err(|e| format!("Failed to create project storage directory: {}", e))
    }

    pub async fn ensure_gitignore(&self) -> Result<(), String> {
        self.ensure_dir().await?;
        let gitignore_path = self.storage_dir.join(".gitignore");
        if !gitignore_path.exists() {
            fs::write(&gitignore_path, "# Auto-generated by Nouto\n")
                .await
                .map_err(|e| format!("Failed to write .gitignore: {}", e))?;
        }
        Ok(())
    }

    // ── Load ──────────────────────────────────────────────────────

    pub async fn load_collections(&self) -> Result<Value, String> {
        let collections_dir = self.collections_dir();
        if !collections_dir.exists() {
            return Ok(Value::Array(vec![]));
        }

        let mut entries = fs::read_dir(&collections_dir)
            .await
            .map_err(|e| format!("Failed to read collections dir: {}", e))?;

        let mut collections = Vec::new();
        while let Some(entry) = entries.next_entry().await.map_err(|e| format!("{}", e))? {
            let ft = entry.file_type().await.map_err(|e| format!("{}", e))?;
            if !ft.is_dir() { continue; }

            match self.load_collection_from_dir(&entry.path()).await {
                Ok(Some(c)) => collections.push(c),
                Ok(None) => {}
                Err(e) => eprintln!("[Nouto] Failed to load collection {:?}: {}", entry.file_name(), e),
            }
        }

        // Sort by name
        if let Value::Array(ref mut arr) = Value::Array(collections.clone()) {
            arr.sort_by(|a, b| {
                let name_a = a.get("name").and_then(|v| v.as_str()).unwrap_or("");
                let name_b = b.get("name").and_then(|v| v.as_str()).unwrap_or("");
                name_a.cmp(name_b)
            });
            return Ok(Value::Array(arr.clone()));
        }

        Ok(Value::Array(collections))
    }

    async fn load_collection_from_dir(&self, dir_path: &std::path::Path) -> Result<Option<Value>, String> {
        let meta_path = dir_path.join(COLLECTION_META);
        if !meta_path.exists() {
            return Ok(None);
        }

        let meta_raw = fs::read_to_string(&meta_path)
            .await
            .map_err(|e| format!("Failed to read {}: {}", COLLECTION_META, e))?;
        let mut meta: Value = serde_json::from_str(&meta_raw)
            .map_err(|e| format!("Failed to parse {}: {}", COLLECTION_META, e))?;

        let order = self.load_order(dir_path).await;
        let items = self.load_items_from_dir(dir_path, &order).await?;

        if let Value::Object(ref mut obj) = meta {
            obj.insert("items".to_string(), Value::Array(items));
        }

        Ok(Some(meta))
    }

    async fn load_order(&self, dir_path: &std::path::Path) -> Vec<String> {
        let order_path = dir_path.join(ORDER_FILE);
        if !order_path.exists() {
            return Vec::new();
        }
        match fs::read_to_string(&order_path).await {
            Ok(raw) => serde_json::from_str::<Vec<String>>(&raw).unwrap_or_default(),
            Err(_) => Vec::new(),
        }
    }

    async fn load_items_from_dir(&self, dir_path: &std::path::Path, order: &[String]) -> Result<Vec<Value>, String> {
        let meta_files: HashSet<&str> = [COLLECTION_META, FOLDER_META, ORDER_FILE].into_iter().collect();
        let mut item_map: std::collections::HashMap<String, Value> = std::collections::HashMap::new();

        let mut entries = fs::read_dir(dir_path)
            .await
            .map_err(|e| format!("Failed to read dir: {}", e))?;

        // Collect entries first
        let mut file_entries = Vec::new();
        let mut dir_entries = Vec::new();

        while let Some(entry) = entries.next_entry().await.map_err(|e| format!("{}", e))? {
            let ft = entry.file_type().await.map_err(|e| format!("{}", e))?;
            let name = entry.file_name().to_string_lossy().to_string();

            if ft.is_file() && name.ends_with(".json") && !meta_files.contains(name.as_str()) {
                file_entries.push((name, entry.path()));
            } else if ft.is_dir() {
                dir_entries.push((name, entry.path()));
            }
        }

        // Load request files
        for (name, path) in &file_entries {
            let slug = name.trim_end_matches(".json");
            match fs::read_to_string(path).await {
                Ok(raw) => {
                    if let Ok(mut request) = serde_json::from_str::<Value>(&raw) {
                        if let Value::Object(ref mut obj) = request {
                            obj.insert("type".to_string(), Value::String("request".to_string()));
                        }
                        item_map.insert(slug.to_string(), request);
                    }
                }
                Err(e) => eprintln!("[Nouto] Failed to load request {:?}: {}", name, e),
            }
        }

        // Load folder subdirectories
        for (name, path) in &dir_entries {
            let folder_meta_path = path.join(FOLDER_META);
            if !folder_meta_path.exists() { continue; }

            match fs::read_to_string(&folder_meta_path).await {
                Ok(raw) => {
                    if let Ok(mut folder_meta) = serde_json::from_str::<Value>(&raw) {
                        let folder_order = self.load_order(path).await;
                        let children = Box::pin(self.load_items_from_dir(path, &folder_order)).await?;

                        if let Value::Object(ref mut obj) = folder_meta {
                            obj.insert("type".to_string(), Value::String("folder".to_string()));
                            obj.insert("children".to_string(), Value::Array(children));
                        }
                        item_map.insert(name.clone(), folder_meta);
                    }
                }
                Err(e) => eprintln!("[Nouto] Failed to load folder {:?}: {}", name, e),
            }
        }

        // Apply ordering
        let mut ordered = Vec::new();
        for ref_name in order {
            if let Some(item) = item_map.remove(ref_name) {
                ordered.push(item);
            }
        }
        // Remaining items not in order
        for item in item_map.into_values() {
            ordered.push(item);
        }

        Ok(ordered)
    }

    // ── Save ──────────────────────────────────────────────────────

    pub async fn save_collections(&self, collections: &Value) -> Result<(), String> {
        self.ensure_dir().await?;
        self.ensure_gitignore().await?;

        let collections_arr = collections.as_array()
            .ok_or_else(|| "Collections must be an array".to_string())?;

        let collections_dir = self.collections_dir();
        let mut saved_dir_names = HashSet::new();

        for collection in collections_arr {
            let name = collection.get("name").and_then(|v| v.as_str()).unwrap_or("untitled");
            let safe_name = sanitize_filename(name);
            let dir_name = resolve_collision(&safe_name, &saved_dir_names);
            saved_dir_names.insert(dir_name.clone());

            let dir_path = collections_dir.join(&dir_name);
            self.save_collection_to_dir(collection, &dir_path).await?;
        }

        // Delete orphaned collection directories
        if let Ok(mut entries) = fs::read_dir(&collections_dir).await {
            while let Ok(Some(entry)) = entries.next_entry().await {
                if let Ok(ft) = entry.file_type().await {
                    if ft.is_dir() {
                        let name = entry.file_name().to_string_lossy().to_string();
                        if !saved_dir_names.contains(&name) {
                            let _ = fs::remove_dir_all(entry.path()).await;
                        }
                    }
                }
            }
        }

        Ok(())
    }

    async fn save_collection_to_dir(&self, collection: &Value, dir_path: &std::path::Path) -> Result<(), String> {
        fs::create_dir_all(dir_path)
            .await
            .map_err(|e| format!("Failed to create collection dir: {}", e))?;

        let items = collection.get("items").and_then(|v| v.as_array()).cloned().unwrap_or_default();

        let mut used_names = HashSet::new();
        let mut order_refs = Vec::new();
        let mut written_entries: HashSet<String> = [COLLECTION_META.to_string(), ORDER_FILE.to_string()].into_iter().collect();

        for item in &items {
            let item_type = item.get("type").and_then(|v| v.as_str()).unwrap_or("");

            if item_type == "folder" {
                let name = item.get("name").and_then(|v| v.as_str()).unwrap_or("untitled");
                let safe_name = sanitize_filename(name);
                let dir_name = resolve_collision(&safe_name, &used_names);
                used_names.insert(dir_name.clone());
                order_refs.push(dir_name.clone());
                written_entries.insert(dir_name.clone());

                let folder_path = dir_path.join(&dir_name);
                self.save_folder_to_dir(item, &folder_path).await?;
            } else {
                let name = item.get("name").and_then(|v| v.as_str()).unwrap_or("untitled");
                let safe_name = sanitize_filename(name);
                let file_name = resolve_collision(&safe_name, &used_names);
                used_names.insert(file_name.clone());
                order_refs.push(file_name.clone());

                let full_filename = format!("{}.json", file_name);
                written_entries.insert(full_filename.clone());
                self.save_request_file(item, &dir_path.join(&full_filename)).await?;
            }
        }

        // Write _collection.json (metadata only, no items)
        let mut meta = collection.clone();
        if let Value::Object(ref mut obj) = meta {
            obj.remove("items");
        }
        let meta_str = serde_json::to_string_pretty(&meta)
            .map_err(|e| format!("Failed to serialize collection meta: {}", e))?;
        fs::write(dir_path.join(COLLECTION_META), meta_str)
            .await
            .map_err(|e| format!("Failed to write {}: {}", COLLECTION_META, e))?;

        // Write _order.json
        let order_str = serde_json::to_string_pretty(&order_refs)
            .map_err(|e| format!("Failed to serialize order: {}", e))?;
        fs::write(dir_path.join(ORDER_FILE), order_str)
            .await
            .map_err(|e| format!("Failed to write {}: {}", ORDER_FILE, e))?;

        // Cleanup orphans
        self.clean_orphans(dir_path, &written_entries).await;

        Ok(())
    }

    async fn save_folder_to_dir(&self, folder: &Value, dir_path: &std::path::Path) -> Result<(), String> {
        fs::create_dir_all(dir_path)
            .await
            .map_err(|e| format!("Failed to create folder dir: {}", e))?;

        let children = folder.get("children").and_then(|v| v.as_array()).cloned().unwrap_or_default();

        let mut used_names = HashSet::new();
        let mut order_refs = Vec::new();
        let mut written_entries: HashSet<String> = [FOLDER_META.to_string(), ORDER_FILE.to_string()].into_iter().collect();

        for item in &children {
            let item_type = item.get("type").and_then(|v| v.as_str()).unwrap_or("");

            if item_type == "folder" {
                let name = item.get("name").and_then(|v| v.as_str()).unwrap_or("untitled");
                let safe_name = sanitize_filename(name);
                let dir_name = resolve_collision(&safe_name, &used_names);
                used_names.insert(dir_name.clone());
                order_refs.push(dir_name.clone());
                written_entries.insert(dir_name.clone());

                let sub_path = dir_path.join(&dir_name);
                // Recursive call via Box::pin to handle the recursive async
                Box::pin(self.save_folder_to_dir(item, &sub_path)).await?;
            } else {
                let name = item.get("name").and_then(|v| v.as_str()).unwrap_or("untitled");
                let safe_name = sanitize_filename(name);
                let file_name = resolve_collision(&safe_name, &used_names);
                used_names.insert(file_name.clone());
                order_refs.push(file_name.clone());

                let full_filename = format!("{}.json", file_name);
                written_entries.insert(full_filename.clone());
                self.save_request_file(item, &dir_path.join(&full_filename)).await?;
            }
        }

        // Write _folder.json (metadata only, no children)
        let mut meta = folder.clone();
        if let Value::Object(ref mut obj) = meta {
            obj.remove("children");
            obj.remove("type");
        }
        let meta_str = serde_json::to_string_pretty(&meta)
            .map_err(|e| format!("Failed to serialize folder meta: {}", e))?;
        fs::write(dir_path.join(FOLDER_META), meta_str)
            .await
            .map_err(|e| format!("Failed to write {}: {}", FOLDER_META, e))?;

        // Write _order.json
        let order_str = serde_json::to_string_pretty(&order_refs)
            .map_err(|e| format!("Failed to serialize order: {}", e))?;
        fs::write(dir_path.join(ORDER_FILE), order_str)
            .await
            .map_err(|e| format!("Failed to write {}: {}", ORDER_FILE, e))?;

        // Cleanup orphans
        self.clean_orphans(dir_path, &written_entries).await;

        Ok(())
    }

    async fn save_request_file(&self, request: &Value, file_path: &std::path::Path) -> Result<(), String> {
        // Strip the transient "type" field
        let mut data = request.clone();
        if let Value::Object(ref mut obj) = data {
            obj.remove("type");
        }
        let content = serde_json::to_string_pretty(&data)
            .map_err(|e| format!("Failed to serialize request: {}", e))?;
        fs::write(file_path, content)
            .await
            .map_err(|e| format!("Failed to write request file: {}", e))
    }

    async fn clean_orphans(&self, dir_path: &std::path::Path, kept: &HashSet<String>) {
        if let Ok(mut entries) = fs::read_dir(dir_path).await {
            while let Ok(Some(entry)) = entries.next_entry().await {
                let name = entry.file_name().to_string_lossy().to_string();
                if !kept.contains(&name) {
                    if let Ok(ft) = entry.file_type().await {
                        if ft.is_dir() {
                            let _ = fs::remove_dir_all(entry.path()).await;
                        } else {
                            let _ = fs::remove_file(entry.path()).await;
                        }
                    }
                }
            }
        }
    }

    pub async fn load_environments(&self) -> Result<Value, String> {
        let path = self.environments_path();
        if !path.exists() {
            return Ok(serde_json::json!({ "environments": [], "activeId": null }));
        }
        let data = fs::read_to_string(&path)
            .await
            .map_err(|e| format!("Failed to read environments: {}", e))?;
        serde_json::from_str(&data)
            .map_err(|e| format!("Failed to parse environments: {}", e))
    }

    pub async fn save_environments(&self, environments: &Value) -> Result<(), String> {
        fs::create_dir_all(&self.storage_dir)
            .await
            .map_err(|e| format!("Failed to create storage dir: {}", e))?;
        let data = serde_json::to_string_pretty(environments)
            .map_err(|e| format!("Failed to serialize environments: {}", e))?;
        fs::write(self.environments_path(), data)
            .await
            .map_err(|e| format!("Failed to write environments: {}", e))
    }
}

// ── Filename utilities (matching VS Code extension's filename-utils.ts) ──

fn sanitize_filename(name: &str) -> String {
    let trimmed = name.trim();
    // Replace invalid chars: / \ : * ? " < > |
    let mut result: String = trimmed
        .chars()
        .map(|c| {
            if "/\\:*?\"<>|".contains(c) { '_' } else { c }
        })
        .collect();

    // Collapse consecutive underscores
    while result.contains("__") {
        result = result.replace("__", "_");
    }

    // Trim leading/trailing underscores
    result = result.trim_matches('_').trim().to_string();

    if result.is_empty() {
        return "untitled".to_string();
    }

    // Handle Windows reserved names
    let upper = result.to_uppercase();
    let reserved = [
        "CON", "PRN", "AUX", "NUL",
        "COM1", "COM2", "COM3", "COM4", "COM5", "COM6", "COM7", "COM8", "COM9",
        "LPT1", "LPT2", "LPT3", "LPT4", "LPT5", "LPT6", "LPT7", "LPT8", "LPT9",
    ];
    if reserved.contains(&upper.as_str()) {
        result.push('_');
    }

    // Truncate to 200 chars
    if result.len() > 200 {
        result.truncate(200);
    }

    result
}

fn resolve_collision(base_name: &str, existing: &HashSet<String>) -> String {
    if !existing.contains(base_name) {
        return base_name.to_string();
    }
    let mut counter = 2;
    loop {
        let candidate = format!("{}_{}", base_name, counter);
        if !existing.contains(&candidate) {
            return candidate;
        }
        counter += 1;
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    #[tokio::test]
    async fn test_load_collections_empty() {
        let tmp = TempDir::new().unwrap();
        let svc = StorageService::new(tmp.path().to_path_buf());
        let result = svc.load_collections().await.unwrap();
        assert_eq!(result, Value::Array(vec![]));
    }

    #[tokio::test]
    async fn test_save_and_load_collections() {
        let tmp = TempDir::new().unwrap();
        let svc = StorageService::new(tmp.path().to_path_buf());
        let data = serde_json::json!([{"id": "c1", "name": "Test"}]);
        svc.save_collections(&data).await.unwrap();
        let loaded = svc.load_collections().await.unwrap();
        assert_eq!(loaded, data);
    }

    #[test]
    fn test_sanitize_filename() {
        assert_eq!(sanitize_filename("My API"), "My API");
        assert_eq!(sanitize_filename("file/with:bad*chars"), "file_with_bad_chars");
        assert_eq!(sanitize_filename(""), "untitled");
        assert_eq!(sanitize_filename("CON"), "CON_");
        assert_eq!(sanitize_filename("  spaces  "), "spaces");
    }

    #[test]
    fn test_resolve_collision() {
        let mut existing = HashSet::new();
        assert_eq!(resolve_collision("Login", &existing), "Login");
        existing.insert("Login".to_string());
        assert_eq!(resolve_collision("Login", &existing), "Login_2");
        existing.insert("Login_2".to_string());
        assert_eq!(resolve_collision("Login", &existing), "Login_3");
    }

    #[tokio::test]
    async fn test_project_storage_roundtrip() {
        let tmp = TempDir::new().unwrap();
        let svc = ProjectStorageService::new(tmp.path().to_path_buf());

        let collections = serde_json::json!([
            {
                "id": "c1",
                "name": "My API",
                "expanded": true,
                "createdAt": "2024-01-01",
                "updatedAt": "2024-01-01",
                "items": [
                    {
                        "type": "request",
                        "id": "r1",
                        "name": "Login",
                        "method": "POST",
                        "url": "https://api.example.com/login"
                    },
                    {
                        "type": "folder",
                        "id": "f1",
                        "name": "Auth",
                        "expanded": true,
                        "createdAt": "2024-01-01",
                        "updatedAt": "2024-01-01",
                        "children": [
                            {
                                "type": "request",
                                "id": "r2",
                                "name": "Register",
                                "method": "POST",
                                "url": "https://api.example.com/register"
                            }
                        ]
                    }
                ]
            }
        ]);

        svc.save_collections(&collections).await.unwrap();

        // Verify file structure
        let coll_dir = tmp.path().join(".nouto").join("collections").join("My API");
        assert!(coll_dir.join("_collection.json").exists());
        assert!(coll_dir.join("_order.json").exists());
        assert!(coll_dir.join("Login.json").exists());
        assert!(coll_dir.join("Auth").join("_folder.json").exists());
        assert!(coll_dir.join("Auth").join("Register.json").exists());

        // Load back and verify
        let loaded = svc.load_collections().await.unwrap();
        let loaded_arr = loaded.as_array().unwrap();
        assert_eq!(loaded_arr.len(), 1);
        assert_eq!(loaded_arr[0]["name"], "My API");
        let items = loaded_arr[0]["items"].as_array().unwrap();
        assert_eq!(items.len(), 2);
    }
}
