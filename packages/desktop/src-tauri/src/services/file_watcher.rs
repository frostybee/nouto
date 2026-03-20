// File watcher service for project directory changes
// Watches .nouto/ directory for external changes (e.g. git pull) and triggers collection reload.

use notify_debouncer_mini::{new_debouncer, DebouncedEventKind};
use std::path::PathBuf;
use std::sync::Arc;
use std::time::Duration;
use tauri::{AppHandle, Emitter};
use tokio::sync::Mutex;

/// Handle to a running file watcher (used to stop it)
pub struct FileWatcherHandle {
    _stop_tx: std::sync::mpsc::Sender<()>,
}

/// Managed state for the file watcher
pub type FileWatcherState = Arc<Mutex<Option<FileWatcherHandle>>>;

pub fn init_file_watcher_state() -> FileWatcherState {
    Arc::new(Mutex::new(None))
}

/// Start watching a project directory for changes to .nouto/ files.
/// Emits `collectionsLoaded` when collection files change and `projectFileChanged`
/// as a general notification.
pub async fn start_watching(
    project_dir: PathBuf,
    app: AppHandle,
    watcher_state: FileWatcherState,
) -> Result<(), String> {
    // Stop any existing watcher first
    stop_watching(watcher_state.clone()).await;

    let nouto_dir = project_dir.join(".nouto");
    if !nouto_dir.exists() {
        // Nothing to watch yet
        return Ok(());
    }

    let (stop_tx, stop_rx) = std::sync::mpsc::channel::<()>();
    let app_clone = app.clone();
    let nouto_dir_clone = nouto_dir.clone();

    // Spawn a blocking thread for the file watcher (notify uses sync APIs)
    std::thread::spawn(move || {
        let (tx, rx) = std::sync::mpsc::channel();

        let mut debouncer = match new_debouncer(Duration::from_millis(500), tx) {
            Ok(d) => d,
            Err(e) => {
                eprintln!("[Nouto] Failed to create file watcher: {}", e);
                return;
            }
        };

        if let Err(e) = debouncer.watcher().watch(
            &nouto_dir_clone,
            notify::RecursiveMode::Recursive,
        ) {
            eprintln!("[Nouto] Failed to watch directory: {}", e);
            return;
        }

        println!("[Nouto] File watcher started on {:?}", nouto_dir_clone);

        loop {
            // Check for stop signal (non-blocking)
            if stop_rx.try_recv().is_ok() {
                println!("[Nouto] File watcher stopped");
                break;
            }

            // Wait for events with a timeout so we can check stop_rx periodically
            match rx.recv_timeout(Duration::from_millis(500)) {
                Ok(Ok(events)) => {
                    let has_collection_change = events.iter().any(|e| {
                        matches!(e.kind, DebouncedEventKind::Any)
                            && e.path.to_string_lossy().contains("collections")
                    });

                    if has_collection_change {
                        println!("[Nouto] Detected external collection file change");
                        let _ = app_clone.emit(
                            "projectFileChanged",
                            serde_json::json!({
                                "data": {
                                    "type": "collections",
                                    "message": "Collection files changed externally. Reload to see changes."
                                }
                            }),
                        );
                    }
                }
                Ok(Err(errors)) => {
                    eprintln!("[Nouto] File watcher errors: {:?}", errors);
                }
                Err(std::sync::mpsc::RecvTimeoutError::Timeout) => {
                    // Normal timeout, continue loop
                }
                Err(std::sync::mpsc::RecvTimeoutError::Disconnected) => {
                    println!("[Nouto] File watcher channel disconnected");
                    break;
                }
            }
        }
    });

    // Store the handle
    let mut state = watcher_state.lock().await;
    *state = Some(FileWatcherHandle { _stop_tx: stop_tx });

    Ok(())
}

/// Stop the current file watcher if one is running.
pub async fn stop_watching(watcher_state: FileWatcherState) {
    let mut state = watcher_state.lock().await;
    if state.is_some() {
        // Dropping the handle will send the stop signal (channel closes)
        *state = None;
        println!("[Nouto] File watcher stopped");
    }
}

// --- Environment file (.env) watcher ---

/// Managed state for the .env file watcher (newtype to distinguish from FileWatcherState in Tauri's type-keyed state)
#[derive(Clone)]
pub struct EnvFileWatcherState(pub Arc<Mutex<Option<FileWatcherHandle>>>);

pub fn init_env_file_watcher_state() -> EnvFileWatcherState {
    EnvFileWatcherState(Arc::new(Mutex::new(None)))
}

/// Start watching a .env file for changes. When it changes, re-parse and emit envFileVariablesUpdated.
pub async fn start_env_file_watching(
    env_file_path: PathBuf,
    app: AppHandle,
    watcher_state: EnvFileWatcherState,
) -> Result<(), String> {
    // Stop any existing env file watcher first
    stop_env_file_watching(watcher_state.clone()).await;

    if !env_file_path.exists() {
        return Err("Env file does not exist".to_string());
    }

    let (stop_tx, stop_rx) = std::sync::mpsc::channel::<()>();
    let app_clone = app.clone();
    let env_path_clone = env_file_path.clone();
    let env_path_str = env_file_path.to_string_lossy().to_string();

    // Watch the parent directory (watching a single file directly is unreliable on some platforms)
    let watch_dir = env_file_path.parent()
        .ok_or("Cannot determine parent directory of .env file")?
        .to_path_buf();
    let env_file_name = env_file_path.file_name()
        .ok_or("Cannot determine .env file name")?
        .to_string_lossy()
        .to_string();

    std::thread::spawn(move || {
        let (tx, rx) = std::sync::mpsc::channel();

        let mut debouncer = match new_debouncer(Duration::from_millis(500), tx) {
            Ok(d) => d,
            Err(e) => {
                eprintln!("[Nouto] Failed to create env file watcher: {}", e);
                return;
            }
        };

        if let Err(e) = debouncer.watcher().watch(
            &watch_dir,
            notify::RecursiveMode::NonRecursive,
        ) {
            eprintln!("[Nouto] Failed to watch env file directory: {}", e);
            return;
        }

        println!("[Nouto] Env file watcher started on {:?}", env_path_clone);

        loop {
            if stop_rx.try_recv().is_ok() {
                println!("[Nouto] Env file watcher stopped");
                break;
            }

            match rx.recv_timeout(Duration::from_millis(500)) {
                Ok(Ok(events)) => {
                    let env_changed = events.iter().any(|e| {
                        matches!(e.kind, DebouncedEventKind::Any)
                            && e.path.file_name()
                                .map(|n| n.to_string_lossy().to_string())
                                .as_deref() == Some(&env_file_name)
                    });

                    if env_changed {
                        println!("[Nouto] Detected .env file change");
                        // Re-parse synchronously (blocking read)
                        if let Ok(content) = std::fs::read_to_string(&env_path_clone) {
                            if let Ok(variables) = crate::commands::parse_env_content(&content) {
                                let _ = app_clone.emit(
                                    "envFileVariablesUpdated",
                                    serde_json::json!({
                                        "data": {
                                            "variables": variables,
                                            "filePath": env_path_str
                                        }
                                    }),
                                );
                            }
                        }
                    }
                }
                Ok(Err(errors)) => {
                    eprintln!("[Nouto] Env file watcher errors: {:?}", errors);
                }
                Err(std::sync::mpsc::RecvTimeoutError::Timeout) => {}
                Err(std::sync::mpsc::RecvTimeoutError::Disconnected) => {
                    println!("[Nouto] Env file watcher channel disconnected");
                    break;
                }
            }
        }
    });

    let mut state = watcher_state.0.lock().await;
    *state = Some(FileWatcherHandle { _stop_tx: stop_tx });

    Ok(())
}

/// Stop the env file watcher if one is running.
pub async fn stop_env_file_watching(watcher_state: EnvFileWatcherState) {
    let mut state = watcher_state.0.lock().await;
    if state.is_some() {
        *state = None;
        println!("[Nouto] Env file watcher stopped");
    }
}
