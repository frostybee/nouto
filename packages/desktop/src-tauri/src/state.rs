use std::sync::atomic::AtomicBool;

/// Process-wide flags shared between window event handlers and commands.
#[derive(Default)]
pub struct AppState {
    /// Set by `quit_app` right before exiting so the `CloseRequested` handler
    /// lets the teardown close windows instead of re-running the handshake.
    pub force_close: AtomicBool,
    /// Frontend-driven flag: true when the UI has unsaved changes that should
    /// trigger a confirmation dialog on close.
    pub has_unsaved_changes: AtomicBool,
}
