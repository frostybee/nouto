use std::sync::atomic::Ordering;

use serde::Serialize;
use tauri::{AppHandle, State};

use crate::state::AppState;

/// Payload of the `app:close-requested` event.
///
/// Rust intercepts the window-manager close so the frontend can run its
/// unsaved-changes prompt and flush debounced saves. `hide` tells the
/// frontend what the close should mean once that is done.
#[derive(Debug, Clone, Serialize)]
pub struct CloseRequest {
    /// macOS convention: closing the last window leaves the app running in
    /// the dock. Everywhere else, close means quit.
    pub hide: bool,
}

impl CloseRequest {
    pub fn for_current_platform() -> Self {
        Self {
            hide: cfg!(target_os = "macos"),
        }
    }
}

/// Ends the process regardless of the platform's close convention.
///
/// The frontend flushes its stores before calling this.
#[tauri::command]
pub fn quit_app(app: AppHandle, state: State<AppState>) {
    // Set first: teardown closes the windows, and the close handler must not
    // intercept those and re-run the handshake.
    state.force_close.store(true, Ordering::SeqCst);
    app.exit(0);
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn close_request_hides_only_on_macos() {
        assert_eq!(
            CloseRequest::for_current_platform().hide,
            cfg!(target_os = "macos")
        );
    }
}
