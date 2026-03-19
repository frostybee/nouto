// OAuth2 command handlers for Tauri
// Supports authorization_code (with optional PKCE), implicit, client_credentials, and password grant flows

use crate::models::types::{OAuth2Config, OAuth2GrantType, OAuthToken};
use chrono::Utc;
use serde_json::json;
use tauri::{AppHandle, Emitter};

/// Start an OAuth2 flow based on the grant type
#[tauri::command]
pub async fn start_oauth_flow(data: serde_json::Value, app: AppHandle) -> Result<(), String> {
    let config: OAuth2Config = serde_json::from_value(data)
        .map_err(|e| format!("Invalid OAuth2 config: {}", e))?;

    match config.grant_type {
        OAuth2GrantType::AuthorizationCode => {
            handle_authorization_code_flow(config, app).await
        }
        OAuth2GrantType::Implicit => {
            handle_implicit_flow(config, app).await
        }
        OAuth2GrantType::ClientCredentials => {
            handle_client_credentials_flow(config, app).await
        }
        OAuth2GrantType::Password => {
            handle_password_flow(config, app).await
        }
    }
}

/// Authorization Code flow:
/// 1. Start a local HTTP listener on a random port to capture the callback
/// 2. Open the authorization URL in the browser
/// 3. Wait for the callback with the authorization code
/// 4. Exchange the code for tokens
async fn handle_authorization_code_flow(config: OAuth2Config, app: AppHandle) -> Result<(), String> {
    let auth_url = config.auth_url.clone().unwrap_or_default();
    let token_url = config.token_url.clone().unwrap_or_default();

    if auth_url.is_empty() || token_url.is_empty() {
        emit_error(&app, "Authorization URL and Token URL are required for authorization code flow")?;
        return Ok(());
    }

    // Generate PKCE challenge if enabled
    let (code_verifier, code_challenge) = if config.use_pkce.unwrap_or(false) {
        let verifier = generate_code_verifier();
        let challenge = generate_code_challenge(&verifier);
        (Some(verifier), Some(challenge))
    } else {
        (None, None)
    };

    // Start a local TCP listener on a random port
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0")
        .await
        .map_err(|e| format!("Failed to start local callback server: {}", e))?;

    let local_addr = listener.local_addr()
        .map_err(|e| format!("Failed to get local address: {}", e))?;

    let callback_url = config.callback_url.clone()
        .unwrap_or_else(|| format!("http://127.0.0.1:{}", local_addr.port()));

    // Build the authorization URL
    let state = config.state.clone()
        .unwrap_or_else(|| uuid::Uuid::new_v4().to_string());

    let mut auth_params = vec![
        ("response_type", "code".to_string()),
        ("client_id", config.client_id.clone()),
        ("redirect_uri", callback_url.clone()),
        ("state", state.clone()),
    ];

    if let Some(ref scope) = config.scope {
        if !scope.is_empty() {
            auth_params.push(("scope", scope.clone()));
        }
    }

    if let Some(ref challenge) = code_challenge {
        auth_params.push(("code_challenge", challenge.clone()));
        auth_params.push(("code_challenge_method", "S256".to_string()));
    }

    let auth_url_with_params = format!("{}?{}", auth_url,
        auth_params.iter()
            .map(|(k, v)| format!("{}={}", k, urlencoding::encode(v)))
            .collect::<Vec<_>>()
            .join("&")
    );

    // Open the browser
    {
        use tauri_plugin_opener::OpenerExt;
        app.opener().open_url(&auth_url_with_params, None::<&str>)
            .map_err(|e| format!("Failed to open browser: {}", e))?;
    }

    // Wait for the callback (with a 2-minute timeout)
    let app_for_exchange = app.clone();
    let config_for_exchange = config.clone();

    tokio::spawn(async move {
        let result = tokio::time::timeout(
            std::time::Duration::from_secs(120),
            wait_for_callback(listener, &state),
        ).await;

        match result {
            Ok(Ok(code)) => {
                // Exchange code for tokens
                match exchange_code_for_token(
                    &token_url,
                    &config_for_exchange.client_id,
                    config_for_exchange.client_secret.as_deref(),
                    &code,
                    &callback_url,
                    code_verifier.as_deref(),
                ).await {
                    Ok(token) => {
                        let _ = app_for_exchange.emit("oauthTokenReceived", json!({ "data": token }));
                    }
                    Err(e) => {
                        let _ = app_for_exchange.emit("oauthFlowError", json!({ "data": { "message": e } }));
                    }
                }
            }
            Ok(Err(e)) => {
                let _ = app_for_exchange.emit("oauthFlowError", json!({ "data": { "message": e } }));
            }
            Err(_) => {
                let _ = app_for_exchange.emit("oauthFlowError", json!({ "data": { "message": "OAuth flow timed out after 2 minutes" } }));
            }
        }
    });

    Ok(())
}

/// Wait for the OAuth callback on the local listener
async fn wait_for_callback(
    listener: tokio::net::TcpListener,
    expected_state: &str,
) -> Result<String, String> {
    use tokio::io::{AsyncReadExt, AsyncWriteExt};

    let (mut stream, _) = listener.accept()
        .await
        .map_err(|e| format!("Failed to accept callback connection: {}", e))?;

    let mut buf = vec![0u8; 4096];
    let n = stream.read(&mut buf)
        .await
        .map_err(|e| format!("Failed to read callback request: {}", e))?;

    let request = String::from_utf8_lossy(&buf[..n]);

    // Send a success HTML response to the browser
    let response_html = r#"<!DOCTYPE html><html><body style="font-family:system-ui;display:flex;justify-content:center;align-items:center;height:100vh;margin:0;background:#1a1a2e;color:#e0e0e0"><div style="text-align:center"><h2>Authorization Successful</h2><p>You can close this tab and return to Nouto.</p></div></body></html>"#;
    let http_response = format!(
        "HTTP/1.1 200 OK\r\nContent-Type: text/html\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
        response_html.len(),
        response_html
    );
    let _ = stream.write_all(http_response.as_bytes()).await;
    let _ = stream.shutdown().await;

    // Parse the request to extract code and state from the query string
    let first_line = request.lines().next().unwrap_or("");
    let path = first_line.split_whitespace().nth(1).unwrap_or("");

    // Parse query params from the path
    let query = path.split('?').nth(1).unwrap_or("");
    let params: std::collections::HashMap<String, String> = query
        .split('&')
        .filter_map(|pair| {
            let mut parts = pair.splitn(2, '=');
            let key = parts.next()?.to_string();
            let value = urlencoding::decode(parts.next().unwrap_or(""))
                .unwrap_or_default()
                .to_string();
            Some((key, value))
        })
        .collect();

    // Check for error
    if let Some(error) = params.get("error") {
        let desc = params.get("error_description").cloned().unwrap_or_default();
        return Err(format!("OAuth error: {} - {}", error, desc));
    }

    // Verify state
    if let Some(received_state) = params.get("state") {
        if received_state != expected_state {
            return Err("State mismatch in OAuth callback".to_string());
        }
    }

    // Extract code
    params.get("code")
        .cloned()
        .ok_or_else(|| "No authorization code in callback".to_string())
}

/// Exchange authorization code for tokens
async fn exchange_code_for_token(
    token_url: &str,
    client_id: &str,
    client_secret: Option<&str>,
    code: &str,
    redirect_uri: &str,
    code_verifier: Option<&str>,
) -> Result<OAuthToken, String> {
    let client = reqwest::Client::new();
    let mut params = vec![
        ("grant_type", "authorization_code"),
        ("code", code),
        ("redirect_uri", redirect_uri),
        ("client_id", client_id),
    ];

    let secret_owned;
    if let Some(s) = client_secret {
        secret_owned = s.to_string();
        params.push(("client_secret", &secret_owned));
    }

    let verifier_owned;
    if let Some(v) = code_verifier {
        verifier_owned = v.to_string();
        params.push(("code_verifier", &verifier_owned));
    }

    let resp = client
        .post(token_url)
        .form(&params)
        .send()
        .await
        .map_err(|e| format!("Token exchange failed: {}", e))?;

    let json: serde_json::Value = resp
        .json()
        .await
        .map_err(|e| format!("Failed to parse token response: {}", e))?;

    if let Some(error) = json.get("error") {
        let desc = json["error_description"].as_str().unwrap_or("");
        return Err(format!("Token error: {} - {}", error, desc));
    }

    parse_token_response(&json)
}

/// Implicit flow:
/// 1. Open the authorization URL with response_type=token
/// 2. Start a local listener to capture the redirect with the token in the fragment
async fn handle_implicit_flow(config: OAuth2Config, app: AppHandle) -> Result<(), String> {
    let auth_url = config.auth_url.as_deref().unwrap_or("");
    if auth_url.is_empty() {
        emit_error(&app, "Authorization URL is required for implicit flow")?;
        return Ok(());
    }

    // Start a local listener
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0")
        .await
        .map_err(|e| format!("Failed to start local callback server: {}", e))?;

    let local_addr = listener.local_addr()
        .map_err(|e| format!("Failed to get local address: {}", e))?;

    let callback_url = config.callback_url.clone()
        .unwrap_or_else(|| format!("http://127.0.0.1:{}", local_addr.port()));

    let state = config.state.clone()
        .unwrap_or_else(|| uuid::Uuid::new_v4().to_string());

    let mut auth_params = vec![
        ("response_type", "token".to_string()),
        ("client_id", config.client_id.clone()),
        ("redirect_uri", callback_url.clone()),
        ("state", state.clone()),
    ];

    if let Some(ref scope) = config.scope {
        if !scope.is_empty() {
            auth_params.push(("scope", scope.clone()));
        }
    }

    let auth_url_with_params = format!("{}?{}", auth_url,
        auth_params.iter()
            .map(|(k, v)| format!("{}={}", k, urlencoding::encode(v)))
            .collect::<Vec<_>>()
            .join("&")
    );

    // Open the browser
    {
        use tauri_plugin_opener::OpenerExt;
        app.opener().open_url(&auth_url_with_params, None::<&str>)
            .map_err(|e| format!("Failed to open browser: {}", e))?;
    }

    // Wait for the callback
    let app_for_callback = app.clone();

    tokio::spawn(async move {
        let result = tokio::time::timeout(
            std::time::Duration::from_secs(120),
            wait_for_implicit_callback(listener),
        ).await;

        match result {
            Ok(Ok(token)) => {
                let _ = app_for_callback.emit("oauthTokenReceived", json!({ "data": token }));
            }
            Ok(Err(e)) => {
                let _ = app_for_callback.emit("oauthFlowError", json!({ "data": { "message": e } }));
            }
            Err(_) => {
                let _ = app_for_callback.emit("oauthFlowError", json!({ "data": { "message": "OAuth implicit flow timed out after 2 minutes" } }));
            }
        }
    });

    Ok(())
}

/// Wait for the implicit flow callback. The token is in the URL fragment,
/// which isn't sent to the server. So we serve a page with JS that extracts
/// the fragment and posts it back to us.
async fn wait_for_implicit_callback(
    listener: tokio::net::TcpListener,
) -> Result<OAuthToken, String> {
    use tokio::io::{AsyncReadExt, AsyncWriteExt};

    // First request: the redirect from the auth server (fragment not sent to us)
    // Serve a page that reads the fragment and POSTs it back
    let (mut stream, _) = listener.accept()
        .await
        .map_err(|e| format!("Failed to accept callback: {}", e))?;

    let mut buf = vec![0u8; 4096];
    let _ = stream.read(&mut buf).await;

    let extractor_html = r#"<!DOCTYPE html><html><body><script>
var h=window.location.hash.substring(1);
var x=new XMLHttpRequest();
x.open('POST',window.location.origin+'/token',true);
x.setRequestHeader('Content-Type','application/x-www-form-urlencoded');
x.onload=function(){document.body.innerHTML='<div style="font-family:system-ui;display:flex;justify-content:center;align-items:center;height:100vh;margin:0;background:#1a1a2e;color:#e0e0e0"><div style="text-align:center"><h2>Authorization Successful</h2><p>You can close this tab and return to Nouto.</p></div></div>';};
x.send(h);
</script></body></html>"#;

    let response = format!(
        "HTTP/1.1 200 OK\r\nContent-Type: text/html\r\nContent-Length: {}\r\n\r\n{}",
        extractor_html.len(),
        extractor_html
    );
    let _ = stream.write_all(response.as_bytes()).await;
    let _ = stream.shutdown().await;

    // Second request: the JS posts the fragment data back to /token
    let (mut stream2, _) = listener.accept()
        .await
        .map_err(|e| format!("Failed to accept token callback: {}", e))?;

    let mut buf2 = vec![0u8; 8192];
    let n = stream2.read(&mut buf2).await
        .map_err(|e| format!("Failed to read token data: {}", e))?;

    let request = String::from_utf8_lossy(&buf2[..n]);

    // Send success response
    let ok_response = "HTTP/1.1 200 OK\r\nContent-Length: 2\r\n\r\nOK";
    let _ = stream2.write_all(ok_response.as_bytes()).await;
    let _ = stream2.shutdown().await;

    // Parse the body (fragment params as form-urlencoded)
    let body = request.split("\r\n\r\n").nth(1).unwrap_or("");
    let params: std::collections::HashMap<String, String> = body
        .split('&')
        .filter_map(|pair| {
            let mut parts = pair.splitn(2, '=');
            let key = parts.next()?.to_string();
            let value = urlencoding::decode(parts.next().unwrap_or(""))
                .unwrap_or_default()
                .to_string();
            Some((key, value))
        })
        .collect();

    if let Some(error) = params.get("error") {
        let desc = params.get("error_description").cloned().unwrap_or_default();
        return Err(format!("OAuth error: {} - {}", error, desc));
    }

    let access_token = params.get("access_token")
        .cloned()
        .ok_or_else(|| "No access_token in implicit callback".to_string())?;

    let expires_at = params.get("expires_in")
        .and_then(|s| s.parse::<i64>().ok())
        .map(|expires_in| Utc::now().timestamp_millis() + expires_in * 1000);

    Ok(OAuthToken {
        access_token,
        refresh_token: None,
        token_type: params.get("token_type").cloned().unwrap_or_else(|| "Bearer".to_string()),
        expires_at,
        scope: params.get("scope").cloned(),
    })
}

/// Client Credentials flow: directly exchange client_id + client_secret for a token
async fn handle_client_credentials_flow(config: OAuth2Config, app: AppHandle) -> Result<(), String> {
    let token_url = config.token_url.as_deref().unwrap_or("");
    if token_url.is_empty() {
        emit_error(&app, "Token URL is required for client credentials flow")?;
        return Ok(());
    }

    let client = reqwest::Client::new();
    let mut params = vec![
        ("grant_type", "client_credentials"),
        ("client_id", &config.client_id),
    ];

    let secret_ref;
    if let Some(ref s) = config.client_secret {
        secret_ref = s.clone();
        params.push(("client_secret", &secret_ref));
    }

    let scope_ref;
    if let Some(ref s) = config.scope {
        if !s.is_empty() {
            scope_ref = s.clone();
            params.push(("scope", &scope_ref));
        }
    }

    let resp = client
        .post(token_url)
        .form(&params)
        .send()
        .await
        .map_err(|e| format!("Client credentials request failed: {}", e))?;

    let json: serde_json::Value = resp
        .json()
        .await
        .map_err(|e| format!("Failed to parse token response: {}", e))?;

    if let Some(error) = json.get("error") {
        let desc = json["error_description"].as_str().unwrap_or("");
        emit_error(&app, &format!("Token error: {} - {}", error, desc))?;
        return Ok(());
    }

    match parse_token_response(&json) {
        Ok(token) => {
            app.emit("oauthTokenReceived", json!({ "data": token }))
                .map_err(|e| e.to_string())?;
        }
        Err(e) => {
            emit_error(&app, &e)?;
        }
    }

    Ok(())
}

/// Password (Resource Owner) flow: exchange username + password for a token
async fn handle_password_flow(config: OAuth2Config, app: AppHandle) -> Result<(), String> {
    let token_url = config.token_url.as_deref().unwrap_or("");
    if token_url.is_empty() {
        emit_error(&app, "Token URL is required for password flow")?;
        return Ok(());
    }

    let username = config.username.as_deref().unwrap_or("");
    let password = config.password.as_deref().unwrap_or("");

    let client = reqwest::Client::new();
    let mut params = vec![
        ("grant_type", "password"),
        ("client_id", config.client_id.as_str()),
        ("username", username),
        ("password", password),
    ];

    let secret_ref;
    if let Some(ref s) = config.client_secret {
        secret_ref = s.clone();
        params.push(("client_secret", &secret_ref));
    }

    let scope_ref;
    if let Some(ref s) = config.scope {
        if !s.is_empty() {
            scope_ref = s.clone();
            params.push(("scope", &scope_ref));
        }
    }

    let resp = client
        .post(token_url)
        .form(&params)
        .send()
        .await
        .map_err(|e| format!("Password grant request failed: {}", e))?;

    let json: serde_json::Value = resp
        .json()
        .await
        .map_err(|e| format!("Failed to parse token response: {}", e))?;

    if let Some(error) = json.get("error") {
        let desc = json["error_description"].as_str().unwrap_or("");
        emit_error(&app, &format!("Token error: {} - {}", error, desc))?;
        return Ok(());
    }

    match parse_token_response(&json) {
        Ok(token) => {
            app.emit("oauthTokenReceived", json!({ "data": token }))
                .map_err(|e| e.to_string())?;
        }
        Err(e) => {
            emit_error(&app, &e)?;
        }
    }

    Ok(())
}

/// Refresh an OAuth2 token
#[tauri::command]
pub async fn refresh_oauth_token(data: serde_json::Value, app: AppHandle) -> Result<(), String> {
    let token_url = data["tokenUrl"].as_str().unwrap_or("").to_string();
    let client_id = data["clientId"].as_str().unwrap_or("").to_string();
    let client_secret = data["clientSecret"].as_str().map(|s| s.to_string());
    let refresh_token = data["refreshToken"].as_str().unwrap_or("").to_string();

    if token_url.is_empty() || refresh_token.is_empty() {
        emit_error(&app, "Token URL and refresh token are required")?;
        return Ok(());
    }

    let client = reqwest::Client::new();
    let mut params = vec![
        ("grant_type".to_string(), "refresh_token".to_string()),
        ("refresh_token".to_string(), refresh_token.clone()),
        ("client_id".to_string(), client_id),
    ];

    if let Some(ref secret) = client_secret {
        params.push(("client_secret".to_string(), secret.clone()));
    }

    let resp = client
        .post(&token_url)
        .form(&params)
        .send()
        .await
        .map_err(|e| format!("Token refresh failed: {}", e))?;

    let json: serde_json::Value = resp
        .json()
        .await
        .map_err(|e| format!("Failed to parse refresh response: {}", e))?;

    if let Some(error) = json.get("error") {
        let desc = json["error_description"].as_str().unwrap_or("");
        emit_error(&app, &format!("Refresh error: {} - {}", error, desc))?;
        return Ok(());
    }

    match parse_token_response(&json) {
        Ok(mut token) => {
            // Preserve the original refresh_token if the server didn't return a new one
            if token.refresh_token.is_none() {
                token.refresh_token = Some(refresh_token);
            }
            app.emit("oauthTokenRefreshed", json!({ "data": token }))
                .map_err(|e| e.to_string())?;
        }
        Err(e) => {
            emit_error(&app, &e)?;
        }
    }

    Ok(())
}

/// Clear OAuth token (simple acknowledgement)
#[tauri::command]
pub async fn clear_oauth_token(app: AppHandle) -> Result<(), String> {
    app.emit("oauthTokenCleared", json!({ "data": {} }))
        .map_err(|e| format!("Failed to emit oauthTokenCleared: {}", e))?;
    Ok(())
}

// --- Helpers ---

fn emit_error(app: &AppHandle, message: &str) -> Result<(), String> {
    app.emit("oauthFlowError", json!({ "data": { "message": message } }))
        .map_err(|e| format!("Failed to emit error: {}", e))
}

fn parse_token_response(json: &serde_json::Value) -> Result<OAuthToken, String> {
    let access_token = json["access_token"]
        .as_str()
        .ok_or("Missing access_token in response")?
        .to_string();

    let expires_at = json["expires_in"].as_i64().map(|expires_in| {
        Utc::now().timestamp_millis() + expires_in * 1000
    });

    Ok(OAuthToken {
        access_token,
        refresh_token: json["refresh_token"].as_str().map(|s| s.to_string()),
        token_type: json["token_type"].as_str().unwrap_or("Bearer").to_string(),
        expires_at,
        scope: json["scope"].as_str().map(|s| s.to_string()),
    })
}

/// Generate a PKCE code verifier (43-128 chars, URL-safe)
fn generate_code_verifier() -> String {
    use rand::Rng;
    let mut rng = rand::rng();
    let bytes: Vec<u8> = (0..32).map(|_| rng.random::<u8>()).collect();
    use base64::Engine;
    base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(&bytes)
}

/// Generate a PKCE code challenge from the verifier (SHA256 + base64url)
fn generate_code_challenge(verifier: &str) -> String {
    use sha2::Digest;
    let hash = sha2::Sha256::digest(verifier.as_bytes());
    use base64::Engine;
    base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(hash)
}
