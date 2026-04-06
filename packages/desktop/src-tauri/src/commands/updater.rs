// Tauri commands for update support detection

/// Returns the install type for the current platform.
/// Used by the frontend to decide whether to show the update banner.
///
/// Returns:
/// - `"appimage"` on Linux when running as an AppImage
/// - `"unsupported"` on Linux when NOT running as an AppImage (deb/rpm installs cannot auto-update)
/// - `"app"` on macOS
/// - `"windows"` on Windows
#[tauri::command]
pub fn get_install_type() -> String {
    #[cfg(target_os = "linux")]
    {
        if std::env::var("APPIMAGE").is_ok() {
            "appimage".to_string()
        } else {
            "unsupported".to_string()
        }
    }
    #[cfg(target_os = "macos")]
    {
        "app".to_string()
    }
    #[cfg(target_os = "windows")]
    {
        "windows".to_string()
    }
    #[cfg(not(any(target_os = "linux", target_os = "macos", target_os = "windows")))]
    {
        "unsupported".to_string()
    }
}

/// Returns whether auto-update is supported on the current install.
/// On Linux, only AppImage installs support auto-update.
/// On macOS and Windows, always returns true.
#[tauri::command]
pub fn is_update_supported() -> bool {
    #[cfg(target_os = "linux")]
    {
        std::env::var("APPIMAGE").is_ok()
    }
    #[cfg(not(target_os = "linux"))]
    {
        true
    }
}
