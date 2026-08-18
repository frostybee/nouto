//! One OS-wide hotkey: bring the main window to the front.
//!
//! The frontend owns the saved value (`settings.globalShortcut`) and calls
//! `register_global_shortcut` on startup and whenever it changes. Rust only
//! tracks what is currently registered so it can swap and release it.

use std::str::FromStr;
use std::sync::{LazyLock, Mutex};

use tauri::{AppHandle, Manager};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutEvent, ShortcutState};

/// The accelerator currently registered with the OS, in normalized form.
static CURRENT: LazyLock<Mutex<Option<String>>> = LazyLock::new(Default::default);

/// Turn Nouto's shortcut display format (`Ctrl+Shift+N`, `Meta+K`) into a
/// string the `global-hotkey` parser accepts. The parser knows `Ctrl`, `Alt`,
/// `Shift`, `Cmd`/`Command`/`Super`, but not `Meta`.
fn normalize_accelerator(accelerator: &str) -> String {
    accelerator
        .split('+')
        .map(|part| {
            let trimmed = part.trim();
            if trimmed.eq_ignore_ascii_case("meta") {
                "Super"
            } else {
                trimmed
            }
        })
        .collect::<Vec<_>>()
        .join("+")
}

fn parse_accelerator(accelerator: &str) -> Result<(String, Shortcut), String> {
    if accelerator.trim().is_empty() {
        return Err("Shortcut must not be empty".to_string());
    }
    let normalized = normalize_accelerator(accelerator);
    let shortcut = Shortcut::from_str(&normalized)
        .map_err(|e| format!("'{accelerator}' is not a valid shortcut: {e}"))?;
    Ok((normalized, shortcut))
}

fn focus_main_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    }
}

/// Installed once via `Builder::with_handler` in `lib.rs`.
pub fn handle_shortcut_event(app: &AppHandle, _shortcut: &Shortcut, event: ShortcutEvent) {
    if matches!(event.state, ShortcutState::Pressed) {
        focus_main_window(app);
    }
}

/// Registers `accelerator`, replacing whatever was registered before. A no-op
/// when it is already the current one. On failure the previous registration is
/// left in place.
#[tauri::command]
pub fn register_global_shortcut(app: AppHandle, accelerator: String) -> Result<(), String> {
    let (normalized, shortcut) = parse_accelerator(&accelerator)?;
    let mut current = CURRENT
        .lock()
        .map_err(|e| format!("Shortcut state poisoned: {e}"))?;

    if current.as_deref() == Some(normalized.as_str()) {
        return Ok(());
    }
    app.global_shortcut()
        .register(shortcut)
        .map_err(|e| format!("Could not register '{accelerator}': {e}"))?;
    if let Some(previous) = current.take() {
        let _ = app.global_shortcut().unregister(previous.as_str());
    }
    *current = Some(normalized);
    log::info!("Global shortcut registered: {accelerator}");
    Ok(())
}

/// Releases the current global shortcut, if any.
#[tauri::command]
pub fn unregister_global_shortcut(app: AppHandle) -> Result<(), String> {
    let mut current = CURRENT
        .lock()
        .map_err(|e| format!("Shortcut state poisoned: {e}"))?;
    if let Some(previous) = current.take() {
        app.global_shortcut()
            .unregister(previous.as_str())
            .map_err(|e| format!("Could not unregister '{previous}': {e}"))?;
        log::info!("Global shortcut unregistered");
    }
    Ok(())
}

/// Called during `RunEvent::Exit` so nothing stays registered after teardown.
pub fn unregister_all(app: &AppHandle) {
    if let Ok(mut current) = CURRENT.lock() {
        if let Some(previous) = current.take() {
            if let Err(e) = app.global_shortcut().unregister(previous.as_str()) {
                log::warn!("Could not unregister global shortcut on exit: {e}");
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn empty_and_whitespace_are_rejected() {
        assert!(parse_accelerator("").is_err());
        assert!(parse_accelerator("   ").is_err());
    }

    #[test]
    fn meta_becomes_super() {
        assert_eq!(normalize_accelerator("Meta+Shift+N"), "Super+Shift+N");
        assert_eq!(normalize_accelerator("Ctrl+Shift+N"), "Ctrl+Shift+N");
    }

    #[test]
    fn display_format_combos_parse() {
        for combo in [
            "Ctrl+Shift+N",
            "Meta+Shift+N",
            "Super+Shift+N",
            "Ctrl+,",
            "Alt+F5",
            "Ctrl+Space",
        ] {
            assert!(parse_accelerator(combo).is_ok(), "{combo} should parse");
        }
    }

    #[test]
    fn garbage_is_rejected() {
        assert!(parse_accelerator("Ctrl+NotAKey").is_err());
    }
}
