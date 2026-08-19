use std::sync::OnceLock;
use std::time::Instant;

use serde::Serialize;
use tauri::{AppHandle, Manager};

use crate::error::AppError;
use crate::services::storage::StorageService;

static START_TIME: OnceLock<Instant> = OnceLock::new();

pub fn mark_startup() {
    let _ = START_TIME.set(Instant::now());
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DiagnosticsReport {
    pub app_name: String,
    pub app_version: String,
    pub os_name: String,
    pub os_arch: String,
    pub os_version: String,
    pub tauri_version: String,
    pub settings: serde_json::Value,
    pub recent_crash_reports: Vec<String>,
    pub memory_usage_bytes: Option<u32>,
    pub uptime_secs: Option<u32>,
}

const SAFE_SETTINGS_KEYS: &[&str] = &[
    "minimap",
    "saveResponseBody",
    "sslRejectUnauthorized",
    "storageMode",
    "openApiLintEnabled",
    "openApiOutlineSortAlphabetically",
    "openApiIntelliSenseEnabled",
    "openApiExternalRefsEnabled",
    "closeToTray",
    "osNotifications",
    "autoCorrectUrls",
    "defaultTimeout",
    "defaultFollowRedirects",
    "defaultMaxRedirects",
];

fn sanitize_settings(settings: &serde_json::Value) -> serde_json::Value {
    let mut safe = serde_json::Map::new();
    if let Some(obj) = settings.as_object() {
        for &key in SAFE_SETTINGS_KEYS {
            if let Some(val) = obj.get(key) {
                safe.insert(key.to_string(), val.clone());
            }
        }
    }
    serde_json::Value::Object(safe)
}

fn os_version() -> String {
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("cmd")
            .args(["/C", "ver"])
            .output()
            .ok()
            .and_then(|o| String::from_utf8(o.stdout).ok())
            .map(|s| s.trim().to_string())
            .unwrap_or_else(|| "Windows (unknown version)".to_string())
    }
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("sw_vers")
            .arg("-productVersion")
            .output()
            .ok()
            .and_then(|o| String::from_utf8(o.stdout).ok())
            .map(|s| format!("macOS {}", s.trim()))
            .unwrap_or_else(|| "macOS (unknown version)".to_string())
    }
    #[cfg(target_os = "linux")]
    {
        std::fs::read_to_string("/etc/os-release")
            .ok()
            .and_then(|content| {
                content
                    .lines()
                    .find(|l| l.starts_with("PRETTY_NAME="))
                    .map(|l| l.trim_start_matches("PRETTY_NAME=").trim_matches('"').to_string())
            })
            .unwrap_or_else(|| "Linux (unknown distro)".to_string())
    }
}

fn memory_usage_bytes() -> Option<u32> {
    #[cfg(target_os = "windows")]
    {
        use windows_sys::Win32::System::ProcessStatus::*;
        use windows_sys::Win32::System::Threading::GetCurrentProcess;

        let mut counters: PROCESS_MEMORY_COUNTERS = unsafe { std::mem::zeroed() };
        counters.cb = std::mem::size_of::<PROCESS_MEMORY_COUNTERS>() as u32;
        let ok =
            unsafe { GetProcessMemoryInfo(GetCurrentProcess(), &mut counters, counters.cb) };
        if ok != 0 {
            Some(counters.WorkingSetSize as u32)
        } else {
            None
        }
    }
    #[cfg(target_os = "linux")]
    {
        std::fs::read_to_string("/proc/self/status")
            .ok()
            .and_then(|content| {
                content
                    .lines()
                    .find(|l| l.starts_with("VmRSS:"))
                    .and_then(|l| {
                        l.split_whitespace()
                            .nth(1)
                            .and_then(|kb| kb.parse::<u64>().ok())
                            .map(|kb| (kb * 1024) as u32)
                    })
            })
    }
    #[cfg(target_os = "macos")]
    {
        let pid = std::process::id();
        std::process::Command::new("ps")
            .args(["-o", "rss=", "-p", &pid.to_string()])
            .output()
            .ok()
            .and_then(|o| String::from_utf8(o.stdout).ok())
            .and_then(|s| s.trim().parse::<u64>().ok())
            .map(|kb| (kb * 1024) as u32)
    }
}

#[tauri::command]
pub async fn collect_diagnostics(
    app: AppHandle,
    tauri_version: String,
) -> Result<DiagnosticsReport, AppError> {
    let storage = app.state::<StorageService>();
    let settings_raw = storage.load_settings().await.map_err(AppError::Storage)?;
    let settings = sanitize_settings(&settings_raw);

    let recent_crash_reports = super::crash_reporter::list_crash_reports(app.clone())
        .await
        .unwrap_or_default()
        .into_iter()
        .take(10)
        .collect();

    let uptime_secs = START_TIME.get().map(|t| t.elapsed().as_secs() as u32);

    Ok(DiagnosticsReport {
        app_name: env!("CARGO_PKG_NAME").to_string(),
        app_version: env!("CARGO_PKG_VERSION").to_string(),
        os_name: std::env::consts::OS.to_string(),
        os_arch: std::env::consts::ARCH.to_string(),
        os_version: os_version(),
        tauri_version,
        settings,
        recent_crash_reports,
        memory_usage_bytes: memory_usage_bytes(),
        uptime_secs,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sanitize_includes_safe_keys() {
        let settings = serde_json::json!({
            "minimap": true,
            "closeToTray": false,
            "defaultTimeout": 30000,
        });
        let safe = sanitize_settings(&settings);
        let obj = safe.as_object().unwrap();
        assert_eq!(obj.get("minimap"), Some(&serde_json::json!(true)));
        assert_eq!(obj.get("closeToTray"), Some(&serde_json::json!(false)));
        assert_eq!(obj.get("defaultTimeout"), Some(&serde_json::json!(30000)));
    }

    #[test]
    fn sanitize_excludes_sensitive_keys() {
        let settings = serde_json::json!({
            "minimap": true,
            "globalProxy": { "host": "proxy.example.com", "username": "user", "password": "secret" },
            "globalClientCert": { "path": "/certs/client.pem" },
            "shortcuts": { "send": "Ctrl+Enter" },
            "globalShortcut": "Ctrl+Shift+N",
        });
        let safe = sanitize_settings(&settings);
        let obj = safe.as_object().unwrap();
        assert!(obj.get("globalProxy").is_none());
        assert!(obj.get("globalClientCert").is_none());
        assert!(obj.get("shortcuts").is_none());
        assert!(obj.get("globalShortcut").is_none());
        assert_eq!(obj.get("minimap"), Some(&serde_json::json!(true)));
    }

    #[test]
    fn os_version_does_not_panic() {
        let _ = os_version();
    }

    #[test]
    fn memory_usage_returns_some_on_supported() {
        let mem = memory_usage_bytes();
        if cfg!(any(target_os = "windows", target_os = "linux", target_os = "macos")) {
            assert!(mem.is_some(), "Expected Some on this platform");
        }
    }

    #[test]
    fn mark_startup_does_not_panic_twice() {
        mark_startup();
        mark_startup();
    }
}
