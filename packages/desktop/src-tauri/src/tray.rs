//! System tray: left-click shows/focuses the main window; menu with Show/Quit.
//! Built entirely in Rust, so no capability changes are needed.

use tauri::{
    menu::{MenuBuilder, MenuItem, PredefinedMenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Emitter, Manager,
};

fn show_main_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    }
}

/// Creates the tray icon. Called from `setup()`; the caller treats a failure
/// as non-fatal because the app is fully usable without a tray.
pub fn init_tray(app: &AppHandle) -> Result<(), String> {
    let show = MenuItem::with_id(app, "show", "Show Nouto", true, None::<&str>)
        .map_err(|e| format!("Failed to create the tray Show item: {e}"))?;
    let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)
        .map_err(|e| format!("Failed to create the tray Quit item: {e}"))?;
    let separator = PredefinedMenuItem::separator(app)
        .map_err(|e| format!("Failed to create the tray separator: {e}"))?;
    let menu = MenuBuilder::new(app)
        .items(&[&show, &separator, &quit])
        .build()
        .map_err(|e| format!("Failed to build the tray menu: {e}"))?;

    // The color app icon is used on every platform. A dedicated monochrome
    // asset (for macOS `icon_as_template`) is a follow-up; the current icon is
    // a filled rounded square and would render as a blob when templated.
    let icon = app
        .default_window_icon()
        .cloned()
        .ok_or("No default window icon available for the tray")?;

    TrayIconBuilder::with_id("main-tray")
        .icon(icon)
        .tooltip("Nouto")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                show_main_window(tray.app_handle());
            }
        })
        .on_menu_event(|app, event| match event.id().as_ref() {
            "show" => show_main_window(app),
            // Never app.exit() directly: the frontend flushes its stores and
            // then calls quit_app, the same path the window close button uses.
            "quit" => {
                let _ = app.emit("tray:quit-requested", ());
            }
            _ => {}
        })
        .build(app)
        .map(|_| ())
        .map_err(|e| format!("Failed to create the tray icon: {e}"))
}
