// StorageService - persistent file storage for collections, environments, and settings
// Stores data as JSON files in <app_data_dir>/nouto/

use serde::de::DeserializeOwned;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashSet;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};
use tokio::fs;

/// Suffix marker used when a corrupt JSON file is set aside. `clean_orphans`
/// leaves such files alone so a backup survives the next save.
pub const CORRUPT_MARKER: &str = ".corrupt-";

/// Read and parse `path` as JSON.
///
/// A missing file yields `default()`. A file that cannot be parsed is renamed to
/// `<name>.corrupt-<unix_ts>` so nothing is lost, a warning is logged, and
/// `default()` is returned along with the backup path so callers can tell the
/// user. Read errors other than "not found" still propagate.
async fn read_json_or_recover<T: DeserializeOwned>(
    path: &Path,
    default: impl FnOnce() -> T,
) -> Result<(T, Option<PathBuf>), String> {
    let raw = match fs::read_to_string(path).await {
        Ok(raw) => raw,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok((default(), None)),
        Err(e) => return Err(format!("Failed to read {}: {}", path.display(), e)),
    };
    match serde_json::from_str::<T>(&raw) {
        Ok(value) => Ok((value, None)),
        Err(e) => {
            let ts = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .map(|d| d.as_secs())
                .unwrap_or(0);
            let file_name = path
                .file_name()
                .and_then(|n| n.to_str())
                .unwrap_or("unknown");
            let backup = path.with_file_name(format!("{file_name}{CORRUPT_MARKER}{ts}"));
            match fs::rename(path, &backup).await {
                Ok(()) => log::warn!(
                    "{} could not be parsed ({}); moved it to {} and loaded defaults",
                    path.display(),
                    e,
                    backup.display()
                ),
                Err(rename_err) => log::warn!(
                    "{} could not be parsed ({}) and could not be moved aside ({}); loaded defaults",
                    path.display(),
                    e,
                    rename_err
                ),
            }
            Ok((default(), Some(backup)))
        }
    }
}

pub struct StorageService {
    base_dir: PathBuf,
    recovered: Mutex<Vec<PathBuf>>,
}

impl StorageService {
    /// Create a new StorageService that stores data in `<base_dir>/nouto/`
    pub fn new(app_data_dir: PathBuf) -> Self {
        let base_dir = app_data_dir.join("nouto");
        Self {
            base_dir,
            recovered: Mutex::new(Vec::new()),
        }
    }

    /// Backup paths created by `read_json_or_recover` since the last call.
    pub fn take_recovered(&self) -> Vec<PathBuf> {
        std::mem::take(&mut *self.recovered.lock().unwrap_or_else(|e| e.into_inner()))
    }

    async fn load_or_recover(
        &self,
        path: &Path,
        default: impl FnOnce() -> Value,
    ) -> Result<Value, String> {
        let (value, backup) = read_json_or_recover(path, default).await?;
        if let Some(backup) = backup {
            self.recovered
                .lock()
                .unwrap_or_else(|e| e.into_inner())
                .push(backup);
        }
        Ok(value)
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

    fn trash_path(&self) -> PathBuf {
        self.base_dir.join("trash.json")
    }

    pub fn base_dir(&self) -> &PathBuf {
        &self.base_dir
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
        self.load_or_recover(&self.collections_path(), || Value::Array(vec![]))
            .await
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
        self.load_or_recover(
            &self.environments_path(),
            || serde_json::json!({ "environments": [], "activeId": null }),
        )
        .await
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
        self.load_or_recover(&self.settings_path(), || serde_json::json!({}))
            .await
    }

    /// Save settings to disk (atomic write via temp file + rename).
    pub async fn save_settings(&self, settings: &Value) -> Result<(), String> {
        self.ensure_dir().await?;
        let data = serde_json::to_string_pretty(settings)
            .map_err(|e| format!("Failed to serialize settings: {}", e))?;
        self.atomic_write(&self.settings_path(), &data).await
    }

    /// Load trash from disk. Returns an empty array if the file doesn't exist.
    pub async fn load_trash(&self) -> Result<Value, String> {
        self.load_or_recover(&self.trash_path(), || Value::Array(vec![]))
            .await
    }

    /// Save trash to disk (atomic write).
    pub async fn save_trash(&self, trash: &Value) -> Result<(), String> {
        self.ensure_dir().await?;
        let data = serde_json::to_string_pretty(trash)
            .map_err(|e| format!("Failed to serialize trash: {}", e))?;
        self.atomic_write(&self.trash_path(), &data).await
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
pub async fn load_recent_projects(base_dir: &Path) -> Vec<RecentProject> {
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
async fn save_recent_projects(base_dir: &Path, projects: &[RecentProject]) -> Result<(), String> {
    let dir = base_dir.join("nouto");
    fs::create_dir_all(&dir)
        .await
        .map_err(|e| format!("Failed to create storage dir: {}", e))?;
    let data = serde_json::to_string_pretty(projects)
        .map_err(|e| format!("Failed to serialize recent projects: {}", e))?;
    fs::write(dir.join("recent-projects.json"), data)
        .await
        .map_err(|e| format!("Failed to write recent projects: {}", e))
}

/// Add or update a recent project entry. Caps at MAX_RECENT_PROJECTS.
pub async fn add_recent_project(
    base_dir: &Path,
    path: &str,
    name: &str,
) -> Result<Vec<RecentProject>, String> {
    let mut projects = load_recent_projects(base_dir).await;

    // Remove existing entry with same path (will re-add at front)
    projects.retain(|p| p.path != path);

    let now = chrono::Utc::now().to_rfc3339();
    projects.insert(
        0,
        RecentProject {
            path: path.to_string(),
            name: name.to_string(),
            last_opened: now,
        },
    );

    // Cap at max
    projects.truncate(MAX_RECENT_PROJECTS);

    save_recent_projects(base_dir, &projects).await?;
    Ok(projects)
}

/// Remove a recent project by path
pub async fn remove_recent_project(
    base_dir: &Path,
    path: &str,
) -> Result<Vec<RecentProject>, String> {
    let mut projects = load_recent_projects(base_dir).await;
    projects.retain(|p| p.path != path);
    save_recent_projects(base_dir, &projects).await?;
    Ok(projects)
}

/// Clear all recent projects
pub async fn clear_recent_projects(base_dir: &Path) -> Result<(), String> {
    save_recent_projects(base_dir, &[]).await
}

/// Get the last opened project path (first entry in recent projects)
pub async fn get_last_project_path(base_dir: &Path) -> Option<String> {
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
    recovered: Mutex<Vec<PathBuf>>,
}

impl ProjectStorageService {
    pub fn new(project_dir: PathBuf) -> Self {
        let storage_dir = project_dir.join(".nouto");
        Self {
            storage_dir,
            recovered: Mutex::new(Vec::new()),
        }
    }

    /// Backup paths created by `read_json_or_recover` since the last call.
    pub fn take_recovered(&self) -> Vec<PathBuf> {
        std::mem::take(&mut *self.recovered.lock().unwrap_or_else(|e| e.into_inner()))
    }

    async fn load_or_recover<T: DeserializeOwned>(
        &self,
        path: &Path,
        default: impl FnOnce() -> T,
    ) -> Result<T, String> {
        let (value, backup) = read_json_or_recover(path, default).await?;
        if let Some(backup) = backup {
            self.recovered
                .lock()
                .unwrap_or_else(|e| e.into_inner())
                .push(backup);
        }
        Ok(value)
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

    pub fn workspace_meta_path(&self) -> PathBuf {
        self.storage_dir.join("workspace.json")
    }

    pub fn environments_path_public(&self) -> PathBuf {
        self.environments_path()
    }

    async fn ensure_dir(&self) -> Result<(), String> {
        fs::create_dir_all(self.collections_dir())
            .await
            .map_err(|e| format!("Failed to create project storage directory: {}", e))
    }

    /// Load `<dir>/.nouto/workspace.json` if present.
    pub async fn load_workspace_meta(
        &self,
    ) -> Result<Option<crate::models::types::WorkspaceMeta>, String> {
        self.load_or_recover::<Option<crate::models::types::WorkspaceMeta>>(
            &self.workspace_meta_path(),
            || None,
        )
        .await
    }

    /// Atomically write `<dir>/.nouto/workspace.json`.
    pub async fn save_workspace_meta(
        &self,
        meta: &crate::models::types::WorkspaceMeta,
    ) -> Result<(), String> {
        self.ensure_dir().await?;
        let data = serde_json::to_string_pretty(meta)
            .map_err(|e| format!("Failed to serialize workspace meta: {}", e))?;
        let target = self.workspace_meta_path();
        let tmp = target.with_extension("tmp");
        fs::write(&tmp, data)
            .await
            .map_err(|e| format!("Failed to write workspace.json (tmp): {}", e))?;
        fs::rename(&tmp, &target)
            .await
            .map_err(|e| format!("Failed to rename workspace.json: {}", e))
    }

    /// Delete `<dir>/.nouto/workspace.json` if present (idempotent).
    pub async fn delete_workspace_meta(&self) -> Result<(), String> {
        let path = self.workspace_meta_path();
        if path.exists() {
            fs::remove_file(&path)
                .await
                .map_err(|e| format!("Failed to delete workspace.json: {}", e))?;
        }
        Ok(())
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
            if !ft.is_dir() {
                continue;
            }

            match self.load_collection_from_dir(&entry.path()).await {
                Ok(Some(c)) => collections.push(c),
                Ok(None) => {}
                Err(e) => log::warn!("Failed to load collection {:?}: {}", entry.file_name(), e),
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

    async fn load_collection_from_dir(
        &self,
        dir_path: &std::path::Path,
    ) -> Result<Option<Value>, String> {
        let meta_path = dir_path.join(COLLECTION_META);
        if !meta_path.exists() {
            return Ok(None);
        }

        // A corrupt collection.json is set aside; without a name/id the
        // collection cannot be represented, so it is skipped for this session.
        let mut meta: Value = match self.load_or_recover(&meta_path, || Value::Null).await? {
            Value::Null => return Ok(None),
            meta => meta,
        };

        let order = self.load_order(dir_path).await;
        let items = self.load_items_from_dir(dir_path, &order).await?;

        if let Value::Object(ref mut obj) = meta {
            obj.insert("items".to_string(), Value::Array(items));
        }

        Ok(Some(meta))
    }

    async fn load_order(&self, dir_path: &std::path::Path) -> Vec<String> {
        let order_path = dir_path.join(ORDER_FILE);
        self.load_or_recover(&order_path, Vec::new)
            .await
            .unwrap_or_default()
    }

    async fn load_items_from_dir(
        &self,
        dir_path: &std::path::Path,
        order: &[String],
    ) -> Result<Vec<Value>, String> {
        let meta_files: HashSet<&str> = [COLLECTION_META, FOLDER_META, ORDER_FILE]
            .into_iter()
            .collect();
        let mut item_map: std::collections::HashMap<String, Value> =
            std::collections::HashMap::new();

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
            match self.load_or_recover(path, || Value::Null).await {
                Ok(Value::Null) => {}
                Ok(mut request) => {
                    if let Value::Object(ref mut obj) = request {
                        obj.insert("type".to_string(), Value::String("request".to_string()));
                    }
                    item_map.insert(slug.to_string(), request);
                }
                Err(e) => log::warn!("Failed to load request {:?}: {}", name, e),
            }
        }

        // Load folder subdirectories
        for (name, path) in &dir_entries {
            let folder_meta_path = path.join(FOLDER_META);
            if !folder_meta_path.exists() {
                continue;
            }

            match self
                .load_or_recover(&folder_meta_path, || Value::Null)
                .await
            {
                Ok(Value::Null) => {}
                Ok(mut folder_meta) => {
                    let folder_order = self.load_order(path).await;
                    let children = Box::pin(self.load_items_from_dir(path, &folder_order)).await?;

                    if let Value::Object(ref mut obj) = folder_meta {
                        obj.insert("type".to_string(), Value::String("folder".to_string()));
                        obj.insert("children".to_string(), Value::Array(children));
                    }
                    item_map.insert(name.clone(), folder_meta);
                }
                Err(e) => log::warn!("Failed to load folder {:?}: {}", name, e),
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

        let collections_arr = collections
            .as_array()
            .ok_or_else(|| "Collections must be an array".to_string())?;

        let collections_dir = self.collections_dir();
        let mut saved_dir_names = HashSet::new();

        for collection in collections_arr {
            let name = collection
                .get("name")
                .and_then(|v| v.as_str())
                .unwrap_or("untitled");
            let safe_name = sanitize_filename(name);
            let dir_name = resolve_collision(&safe_name, &saved_dir_names);
            saved_dir_names.insert(dir_name.clone());

            let dir_path = collections_dir.join(&dir_name);
            self.save_collection_to_dir(collection, &dir_path).await?;
        }

        // Delete orphaned collection directories
        let mut entries = fs::read_dir(&collections_dir)
            .await
            .map_err(|e| format!("Failed to read collections dir for cleanup: {}", e))?;
        while let Some(entry) = entries
            .next_entry()
            .await
            .map_err(|e| format!("Failed to read collection cleanup entry: {}", e))?
        {
            let ft = entry
                .file_type()
                .await
                .map_err(|e| format!("Failed to inspect collection cleanup entry: {}", e))?;
            if ft.is_dir() {
                let name = entry.file_name().to_string_lossy().to_string();
                if !saved_dir_names.contains(&name) {
                    fs::remove_dir_all(entry.path()).await.map_err(|e| {
                        format!("Failed to remove orphaned collection '{}': {}", name, e)
                    })?;
                }
            }
        }

        Ok(())
    }

    async fn save_collection_to_dir(
        &self,
        collection: &Value,
        dir_path: &std::path::Path,
    ) -> Result<(), String> {
        fs::create_dir_all(dir_path)
            .await
            .map_err(|e| format!("Failed to create collection dir: {}", e))?;

        let items = collection
            .get("items")
            .and_then(|v| v.as_array())
            .cloned()
            .unwrap_or_default();

        let mut used_names = HashSet::new();
        let mut order_refs = Vec::new();
        let mut written_entries: HashSet<String> =
            [COLLECTION_META.to_string(), ORDER_FILE.to_string()]
                .into_iter()
                .collect();

        for item in &items {
            let item_type = item.get("type").and_then(|v| v.as_str()).unwrap_or("");

            if item_type == "folder" {
                let name = item
                    .get("name")
                    .and_then(|v| v.as_str())
                    .unwrap_or("untitled");
                let safe_name = sanitize_filename(name);
                let dir_name = resolve_collision(&safe_name, &used_names);
                used_names.insert(dir_name.clone());
                order_refs.push(dir_name.clone());
                written_entries.insert(dir_name.clone());

                let folder_path = dir_path.join(&dir_name);
                self.save_folder_to_dir(item, &folder_path).await?;
            } else {
                let name = item
                    .get("name")
                    .and_then(|v| v.as_str())
                    .unwrap_or("untitled");
                let safe_name = sanitize_filename(name);
                let file_name = resolve_collision(&safe_name, &used_names);
                used_names.insert(file_name.clone());
                order_refs.push(file_name.clone());

                let full_filename = format!("{}.json", file_name);
                written_entries.insert(full_filename.clone());
                self.save_request_file(item, &dir_path.join(&full_filename))
                    .await?;
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

        // Cleanup orphans after all intended entries have been written.
        self.clean_orphans(dir_path, &written_entries).await?;

        Ok(())
    }

    async fn save_folder_to_dir(
        &self,
        folder: &Value,
        dir_path: &std::path::Path,
    ) -> Result<(), String> {
        fs::create_dir_all(dir_path)
            .await
            .map_err(|e| format!("Failed to create folder dir: {}", e))?;

        let children = folder
            .get("children")
            .and_then(|v| v.as_array())
            .cloned()
            .unwrap_or_default();

        let mut used_names = HashSet::new();
        let mut order_refs = Vec::new();
        let mut written_entries: HashSet<String> =
            [FOLDER_META.to_string(), ORDER_FILE.to_string()]
                .into_iter()
                .collect();

        for item in &children {
            let item_type = item.get("type").and_then(|v| v.as_str()).unwrap_or("");

            if item_type == "folder" {
                let name = item
                    .get("name")
                    .and_then(|v| v.as_str())
                    .unwrap_or("untitled");
                let safe_name = sanitize_filename(name);
                let dir_name = resolve_collision(&safe_name, &used_names);
                used_names.insert(dir_name.clone());
                order_refs.push(dir_name.clone());
                written_entries.insert(dir_name.clone());

                let sub_path = dir_path.join(&dir_name);
                // Recursive call via Box::pin to handle the recursive async
                Box::pin(self.save_folder_to_dir(item, &sub_path)).await?;
            } else {
                let name = item
                    .get("name")
                    .and_then(|v| v.as_str())
                    .unwrap_or("untitled");
                let safe_name = sanitize_filename(name);
                let file_name = resolve_collision(&safe_name, &used_names);
                used_names.insert(file_name.clone());
                order_refs.push(file_name.clone());

                let full_filename = format!("{}.json", file_name);
                written_entries.insert(full_filename.clone());
                self.save_request_file(item, &dir_path.join(&full_filename))
                    .await?;
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

        // Cleanup orphans after all intended entries have been written.
        self.clean_orphans(dir_path, &written_entries).await?;

        Ok(())
    }

    async fn save_request_file(
        &self,
        request: &Value,
        file_path: &std::path::Path,
    ) -> Result<(), String> {
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

    async fn clean_orphans(
        &self,
        dir_path: &std::path::Path,
        kept: &HashSet<String>,
    ) -> Result<(), String> {
        let mut entries = fs::read_dir(dir_path)
            .await
            .map_err(|e| format!("Failed to read directory for cleanup: {}", e))?;
        while let Some(entry) = entries
            .next_entry()
            .await
            .map_err(|e| format!("Failed to read cleanup entry: {}", e))?
        {
            let name = entry.file_name().to_string_lossy().to_string();
            // Backups made by read_json_or_recover are not part of the model
            // and must survive a save so the user can still recover them.
            if name.contains(CORRUPT_MARKER) {
                continue;
            }
            if !kept.contains(&name) {
                let ft = entry
                    .file_type()
                    .await
                    .map_err(|e| format!("Failed to inspect cleanup entry '{}': {}", name, e))?;
                if ft.is_dir() {
                    fs::remove_dir_all(entry.path()).await.map_err(|e| {
                        format!("Failed to remove orphaned directory '{}': {}", name, e)
                    })?;
                } else {
                    fs::remove_file(entry.path())
                        .await
                        .map_err(|e| format!("Failed to remove orphaned file '{}': {}", name, e))?;
                }
            }
        }
        Ok(())
    }

    pub async fn load_environments(&self) -> Result<Value, String> {
        self.load_or_recover(
            &self.environments_path(),
            || serde_json::json!({ "environments": [], "activeId": null }),
        )
        .await
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
        .map(|c| if "/\\:*?\"<>|".contains(c) { '_' } else { c })
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
        "CON", "PRN", "AUX", "NUL", "COM1", "COM2", "COM3", "COM4", "COM5", "COM6", "COM7", "COM8",
        "COM9", "LPT1", "LPT2", "LPT3", "LPT4", "LPT5", "LPT6", "LPT7", "LPT8", "LPT9",
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
    async fn test_corrupt_collections_are_backed_up_and_default_loaded() {
        let tmp = TempDir::new().unwrap();
        let svc = StorageService::new(tmp.path().to_path_buf());
        std::fs::create_dir_all(svc.base_dir()).unwrap();
        let path = svc.base_dir().join("collections.json");
        std::fs::write(&path, "{ not json").unwrap();

        let loaded = svc.load_collections().await.unwrap();
        assert_eq!(loaded, Value::Array(vec![]));
        assert!(!path.exists(), "corrupt file should be renamed away");

        let backups: Vec<_> = std::fs::read_dir(svc.base_dir())
            .unwrap()
            .filter_map(|e| e.ok())
            .filter(|e| e.file_name().to_string_lossy().contains(CORRUPT_MARKER))
            .collect();
        assert_eq!(backups.len(), 1);
        assert_eq!(
            std::fs::read_to_string(backups[0].path()).unwrap(),
            "{ not json"
        );

        let recovered = svc.take_recovered();
        assert_eq!(recovered.len(), 1);
        assert_eq!(recovered[0], backups[0].path());
        assert!(svc.take_recovered().is_empty(), "take_recovered drains");
    }

    #[tokio::test]
    async fn test_corrupt_settings_and_environments_return_defaults() {
        let tmp = TempDir::new().unwrap();
        let svc = StorageService::new(tmp.path().to_path_buf());
        std::fs::create_dir_all(svc.base_dir()).unwrap();
        std::fs::write(svc.base_dir().join("settings.json"), "[").unwrap();
        std::fs::write(svc.base_dir().join("environments.json"), "nope").unwrap();

        assert_eq!(svc.load_settings().await.unwrap(), serde_json::json!({}));
        assert_eq!(
            svc.load_environments().await.unwrap(),
            serde_json::json!({ "environments": [], "activeId": null })
        );
        assert_eq!(svc.take_recovered().len(), 2);
    }

    #[tokio::test]
    async fn test_project_storage_corrupt_request_survives_save() {
        let tmp = TempDir::new().unwrap();
        let svc = ProjectStorageService::new(tmp.path().to_path_buf());
        let collections = serde_json::json!([
            { "id": "c1", "name": "Alpha", "items": [
                { "id": "r1", "type": "request", "name": "Get", "method": "GET", "url": "https://a" }
            ] }
        ]);
        svc.save_collections(&collections).await.unwrap();

        // Corrupt the request file on disk.
        let dir = tmp.path().join(".nouto").join("collections");
        let coll_dir = std::fs::read_dir(&dir)
            .unwrap()
            .next()
            .unwrap()
            .unwrap()
            .path();
        let req_file = std::fs::read_dir(&coll_dir)
            .unwrap()
            .filter_map(|e| e.ok())
            .map(|e| e.path())
            .find(|p| {
                p.file_name().unwrap() != COLLECTION_META && p.file_name().unwrap() != ORDER_FILE
            })
            .unwrap();
        std::fs::write(&req_file, "{ broken").unwrap();

        let loaded = svc.load_collections().await.unwrap();
        let items = loaded[0]["items"].as_array().unwrap();
        assert!(items.is_empty(), "corrupt request is skipped");
        assert!(!req_file.exists());
        assert_eq!(svc.take_recovered().len(), 1);

        // Saving the (now empty) collection must keep the backup file.
        svc.save_collections(&loaded).await.unwrap();
        let backups: Vec<_> = std::fs::read_dir(&coll_dir)
            .unwrap()
            .filter_map(|e| e.ok())
            .filter(|e| e.file_name().to_string_lossy().contains(CORRUPT_MARKER))
            .collect();
        assert_eq!(backups.len(), 1);
    }

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
        assert_eq!(
            sanitize_filename("file/with:bad*chars"),
            "file_with_bad_chars"
        );
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

    #[tokio::test]
    async fn test_project_storage_removes_orphaned_entries_after_save() {
        let tmp = TempDir::new().unwrap();
        let svc = ProjectStorageService::new(tmp.path().to_path_buf());

        let initial = serde_json::json!([
            {
                "id": "c1",
                "name": "My API",
                "items": [
                    { "type": "request", "id": "r1", "name": "Keep", "method": "GET", "url": "https://api.example.com/keep" },
                    { "type": "request", "id": "r2", "name": "Remove", "method": "GET", "url": "https://api.example.com/remove" }
                ]
            }
        ]);
        svc.save_collections(&initial).await.unwrap();

        let coll_dir = tmp.path().join(".nouto").join("collections").join("My API");
        assert!(coll_dir.join("Remove.json").exists());

        let updated = serde_json::json!([
            {
                "id": "c1",
                "name": "My API",
                "items": [
                    { "type": "request", "id": "r1", "name": "Keep", "method": "GET", "url": "https://api.example.com/keep" }
                ]
            }
        ]);
        svc.save_collections(&updated).await.unwrap();

        assert!(coll_dir.join("Keep.json").exists());
        assert!(!coll_dir.join("Remove.json").exists());
    }
}
