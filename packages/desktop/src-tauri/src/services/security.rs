use tauri::{AppHandle, Emitter};

pub fn check_plaintext_credentials(app: &AppHandle, url: &str, headers: &[serde_json::Value]) {
    let is_plaintext = url.starts_with("http://") || url.starts_with("ws://");
    let is_local = url.contains("localhost") || url.contains("127.0.0.1") || url.contains("[::1]");

    if !is_plaintext || is_local {
        return;
    }

    let has_auth = headers.iter().any(|h| {
        h["enabled"].as_bool().unwrap_or(false)
            && h["key"]
                .as_str()
                .unwrap_or("")
                .eq_ignore_ascii_case("authorization")
    });

    if has_auth {
        let _ = app.emit(
            "securityWarning",
            serde_json::json!({
                "data": { "message": "Sending credentials over unencrypted connection" }
            }),
        );
    }
}
