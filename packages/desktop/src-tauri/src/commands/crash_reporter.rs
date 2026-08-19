use std::backtrace::Backtrace;
use std::fs;
use std::path::PathBuf;
use std::sync::OnceLock;
use std::time::{SystemTime, UNIX_EPOCH};

use serde::Serialize;
use tauri::{AppHandle, Manager};

use crate::error::AppError;

static CRASH_DIR: OnceLock<PathBuf> = OnceLock::new();

pub fn set_app_crash_dir(app: &AppHandle) {
    if let Ok(dir) = app.path().app_data_dir() {
        let _ = CRASH_DIR.set(dir.join("crash-reports"));
    }
}

fn crash_dir() -> PathBuf {
    CRASH_DIR.get().cloned().unwrap_or_else(|| {
        let home = std::env::var(if cfg!(windows) { "USERPROFILE" } else { "HOME" })
            .unwrap_or_else(|_| ".".to_string());
        PathBuf::from(home)
            .join(".app-crash-reports")
            .join("crash-reports")
    })
}

pub fn install_panic_hook() {
    let prev = std::panic::take_hook();
    std::panic::set_hook(Box::new(move |info| {
        let message = if let Some(s) = info.payload().downcast_ref::<&str>() {
            (*s).to_string()
        } else if let Some(s) = info.payload().downcast_ref::<String>() {
            s.clone()
        } else {
            "Unknown panic".to_string()
        };

        let location = info
            .location()
            .map(|l| format!("{}:{}:{}", l.file(), l.line(), l.column()))
            .unwrap_or_else(|| "<unknown>".to_string());

        let backtrace = Backtrace::force_capture();
        let ts = iso8601_now();

        let report = format!(
            "=== Crash Report ===\n\
             Timestamp: {ts}\n\
             Message: {message}\n\
             Location: {location}\n\
             OS: {} {}\n\
             Version: {}\n\n\
             --- Backtrace ---\n\
             {backtrace}",
            std::env::consts::OS,
            std::env::consts::ARCH,
            env!("CARGO_PKG_VERSION"),
        );

        let dir = crash_dir();
        let _ = fs::create_dir_all(&dir);
        let path = dir.join(format!("crash-{ts}.log"));
        if let Err(e) = fs::write(&path, &report) {
            eprintln!("[crash-reporter] Failed to write crash report: {e}");
        } else {
            eprintln!("[crash-reporter] Crash report saved to {}", path.display());
        }

        prev(info);
    }));
}

fn now_epoch_secs() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
}

fn iso8601_now() -> String {
    let secs = now_epoch_secs();

    let days = (secs / 86400) as i64;
    let time_of_day = secs % 86400;

    // Hinnant civil-date algorithm
    let z = days + 719468;
    let era = if z >= 0 { z } else { z - 146096 } / 146097;
    let doe = (z - era * 146097) as u64;
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365;
    let y = yoe as i64 + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    let y = if m <= 2 { y + 1 } else { y };

    let h = time_of_day / 3600;
    let min = (time_of_day % 3600) / 60;
    let s = time_of_day % 60;

    format!("{y:04}-{m:02}-{d:02}T{h:02}-{min:02}-{s:02}Z")
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CrashReportSummary {
    pub filename: String,
    pub timestamp_secs: u32,
    pub seconds_ago: u32,
}

#[tauri::command]
pub async fn log_frontend_error(
    app: AppHandle,
    message: String,
    stack: Option<String>,
    component_stack: Option<String>,
) -> Result<(), AppError> {
    let dir = crash_dir();
    fs::create_dir_all(&dir)?;

    let ts = iso8601_now();
    let mut report = format!("=== Frontend Error Report ===\nTimestamp: {ts}\nMessage: {message}\n");
    if let Some(s) = &stack {
        report.push_str(&format!("\n--- Stack ---\n{s}\n"));
    }
    if let Some(cs) = &component_stack {
        report.push_str(&format!("\n--- Component Stack ---\n{cs}\n"));
    }

    let path = dir.join(format!("frontend-error-{ts}.log"));
    fs::write(&path, &report)?;
    log::info!("Frontend error report saved to {}", path.display());

    let _ = app;
    Ok(())
}

#[tauri::command]
pub async fn has_recent_crash(app: AppHandle) -> Result<Option<CrashReportSummary>, AppError> {
    let dir = crash_dir();
    let entries = match fs::read_dir(&dir) {
        Ok(e) => e,
        Err(_) => return Ok(None),
    };

    let now = now_epoch_secs();
    let mut most_recent: Option<(String, u64)> = None;

    for entry in entries.flatten() {
        let name = entry.file_name().to_string_lossy().to_string();
        if !name.ends_with(".log") {
            continue;
        }
        let mtime = entry
            .metadata()
            .ok()
            .and_then(|m| m.modified().ok())
            .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
            .map(|d| d.as_secs())
            .unwrap_or(0);
        if let Some((_, best)) = &most_recent {
            if mtime > *best {
                most_recent = Some((name, mtime));
            }
        } else {
            most_recent = Some((name, mtime));
        }
    }

    let _ = app;
    match most_recent {
        Some((filename, mtime)) => {
            let age = now.saturating_sub(mtime);
            if age > 300 {
                Ok(None)
            } else {
                Ok(Some(CrashReportSummary {
                    filename,
                    timestamp_secs: mtime as u32,
                    seconds_ago: age as u32,
                }))
            }
        }
        None => Ok(None),
    }
}

#[tauri::command]
pub async fn list_crash_reports(app: AppHandle) -> Result<Vec<String>, AppError> {
    let dir = crash_dir();
    let entries = match fs::read_dir(&dir) {
        Ok(e) => e,
        Err(_) => return Ok(Vec::new()),
    };

    let mut reports: Vec<(String, u64)> = Vec::new();
    for entry in entries.flatten() {
        let name = entry.file_name().to_string_lossy().to_string();
        if !name.ends_with(".log") {
            continue;
        }
        let mtime = entry
            .metadata()
            .ok()
            .and_then(|m| m.modified().ok())
            .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
            .map(|d| d.as_secs())
            .unwrap_or(0);
        reports.push((name, mtime));
    }
    reports.sort_by(|a, b| b.1.cmp(&a.1));

    let _ = app;
    Ok(reports.into_iter().map(|(name, _)| name).collect())
}

#[tauri::command]
pub async fn get_crash_report(app: AppHandle, name: String) -> Result<String, AppError> {
    use super::recovery::validate_filename;
    validate_filename(&name)?;

    let dir = crash_dir();
    let path = dir.join(&name);
    let canonical = path
        .canonicalize()
        .map_err(|e| AppError::Other(format!("Invalid crash report path: {e}")))?;
    let canonical_dir = dir
        .canonicalize()
        .map_err(|e| AppError::Other(format!("Invalid crash dir: {e}")))?;
    if !canonical.starts_with(&canonical_dir) {
        return Err(AppError::Other("Path traversal detected".to_string()));
    }

    let content = fs::read_to_string(&canonical)?;
    let _ = app;
    Ok(content)
}

#[tauri::command]
pub async fn clear_crash_reports(app: AppHandle) -> Result<u32, AppError> {
    let dir = crash_dir();
    let entries = match fs::read_dir(&dir) {
        Ok(e) => e,
        Err(_) => return Ok(0),
    };

    let mut cleared = 0u32;
    for entry in entries.flatten() {
        let name = entry.file_name().to_string_lossy().to_string();
        if name.ends_with(".log") && fs::remove_file(entry.path()).is_ok() {
            cleared += 1;
        }
    }

    if cleared > 0 {
        log::info!("Cleared {cleared} crash report(s)");
    }

    let _ = app;
    Ok(cleared)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn iso8601_format_is_valid() {
        let ts = iso8601_now();
        assert!(ts.ends_with('Z'), "Timestamp should end with Z: {ts}");
        assert_eq!(ts.len(), 20, "Expected YYYY-MM-DDTHH-MM-SSZ: {ts}");
        assert_eq!(&ts[4..5], "-");
        assert_eq!(&ts[7..8], "-");
        assert_eq!(&ts[10..11], "T");
        assert_eq!(&ts[13..14], "-");
        assert_eq!(&ts[16..17], "-");
    }

    #[test]
    fn crash_report_round_trip() {
        let tmp = tempfile::TempDir::new().unwrap();
        let dir = tmp.path().join("crash-reports");
        fs::create_dir_all(&dir).unwrap();

        let report = "=== Crash Report ===\nMessage: test panic\n";
        let path = dir.join("crash-test.log");
        fs::write(&path, report).unwrap();

        let content = fs::read_to_string(&path).unwrap();
        assert!(content.contains("test panic"));
    }

    #[test]
    fn list_and_clear_round_trip() {
        let tmp = tempfile::TempDir::new().unwrap();
        let dir = tmp.path().join("crash-reports");
        fs::create_dir_all(&dir).unwrap();

        fs::write(dir.join("crash-a.log"), "a").unwrap();
        fs::write(dir.join("crash-b.log"), "b").unwrap();
        fs::write(dir.join("not-a-log.txt"), "c").unwrap();

        let logs: Vec<_> = fs::read_dir(&dir)
            .unwrap()
            .flatten()
            .filter(|e| {
                e.file_name()
                    .to_string_lossy()
                    .ends_with(".log")
            })
            .collect();
        assert_eq!(logs.len(), 2);

        let mut cleared = 0u32;
        for entry in fs::read_dir(&dir).unwrap().flatten() {
            let name = entry.file_name().to_string_lossy().to_string();
            if name.ends_with(".log") && fs::remove_file(entry.path()).is_ok() {
                cleared += 1;
            }
        }
        assert_eq!(cleared, 2);

        let remaining: Vec<_> = fs::read_dir(&dir)
            .unwrap()
            .flatten()
            .collect();
        assert_eq!(remaining.len(), 1);
    }

    #[test]
    fn path_traversal_is_rejected() {
        use super::super::recovery::validate_filename;
        assert!(validate_filename("../etc/passwd").is_err());
        assert!(validate_filename("foo/bar.log").is_err());
        assert!(validate_filename("foo\\bar.log").is_err());
    }

    #[test]
    fn frontend_error_report_format() {
        let tmp = tempfile::TempDir::new().unwrap();
        let dir = tmp.path().join("crash-reports");
        fs::create_dir_all(&dir).unwrap();

        let ts = iso8601_now();
        let msg = "TypeError: Cannot read property 'x' of undefined";
        let stack = "at Foo.bar (app.js:42:10)\n  at main (app.js:1:1)";
        let report = format!(
            "=== Frontend Error Report ===\nTimestamp: {ts}\nMessage: {msg}\n\n--- Stack ---\n{stack}\n"
        );
        let path = dir.join(format!("frontend-error-{ts}.log"));
        fs::write(&path, &report).unwrap();

        let content = fs::read_to_string(&path).unwrap();
        assert!(content.contains("Frontend Error Report"));
        assert!(content.contains(msg));
        assert!(content.contains("at Foo.bar"));
    }
}
