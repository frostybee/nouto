use chrono::Utc;

/// Refresh an OAuth2 access token using the refresh_token grant
pub async fn refresh_oauth_token(
    token_url: &str,
    client_id: &str,
    client_secret: Option<&str>,
    refresh_token: &str,
) -> Result<crate::models::types::OAuthToken, String> {
    let http = reqwest::Client::new();
    let mut params = vec![
        ("grant_type", "refresh_token"),
        ("refresh_token", refresh_token),
        ("client_id", client_id),
    ];
    let secret_owned;
    if let Some(s) = client_secret {
        secret_owned = s.to_string();
        params.push(("client_secret", &secret_owned));
    }

    let resp = http
        .post(token_url)
        .form(&params)
        .send()
        .await
        .map_err(|e| format!("Token refresh request failed: {}", e))?;

    let json: serde_json::Value = resp
        .json()
        .await
        .map_err(|e| format!("Failed to parse token refresh response: {}", e))?;

    let access_token = json["access_token"]
        .as_str()
        .ok_or("Missing access_token in refresh response")?
        .to_string();

    let expires_at = json["expires_in"].as_i64().map(|expires_in| {
        Utc::now().timestamp_millis() + expires_in * 1000
    });

    Ok(crate::models::types::OAuthToken {
        access_token,
        access_token_ref: None,
        refresh_token: json["refresh_token"].as_str().map(|s| s.to_string())
            .or_else(|| Some(refresh_token.to_string())),
        refresh_token_ref: None,
        token_type: json["token_type"].as_str().unwrap_or("Bearer").to_string(),
        expires_at,
        scope: json["scope"].as_str().map(|s| s.to_string()),
    })
}
