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
