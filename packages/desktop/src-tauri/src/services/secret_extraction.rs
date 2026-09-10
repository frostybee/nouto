// Secret extraction service - extracts credentials from collections/environments
// and stores them in the OS keychain via SecretRef pattern.
//
// On save: credential values are replaced with keyring references (*Ref fields).
// On load: references are resolved back to values from the keychain.
// The JSON files on disk never contain actual credential values.

use crate::models::types::{
    AuthState, Collection, CollectionItem, Environment, OAuth2Config, OAuthToken, ProxyConfig,
    SslConfig,
};
use std::path::Path;

const SERVICE_NAME: &str = "nouto-desktop";

#[allow(dead_code)]
pub struct MigrationResult {
    pub migrated_count: usize,
    pub skipped_count: usize,
    pub errors: Vec<String>,
}

// ---------- Auth secret field definitions ----------

struct AuthSecretField {
    value_getter: fn(&AuthState) -> &Option<String>,
    value_setter: fn(&mut AuthState, Option<String>),
    ref_getter: fn(&AuthState) -> &Option<String>,
    ref_setter: fn(&mut AuthState, Option<String>),
    field_name: &'static str,
}

const AUTH_SECRET_FIELDS: &[AuthSecretField] = &[
    AuthSecretField {
        value_getter: |a| &a.password,
        value_setter: |a, v| a.password = v,
        ref_getter: |a| &a.password_ref,
        ref_setter: |a, v| a.password_ref = v,
        field_name: "password",
    },
    AuthSecretField {
        value_getter: |a| &a.token,
        value_setter: |a, v| a.token = v,
        ref_getter: |a| &a.token_ref,
        ref_setter: |a, v| a.token_ref = v,
        field_name: "token",
    },
    AuthSecretField {
        value_getter: |a| &a.api_key_value,
        value_setter: |a, v| a.api_key_value = v,
        ref_getter: |a| &a.api_key_value_ref,
        ref_setter: |a, v| a.api_key_value_ref = v,
        field_name: "apiKeyValue",
    },
    AuthSecretField {
        value_getter: |a| &a.oauth_token,
        value_setter: |a, v| a.oauth_token = v,
        ref_getter: |a| &a.oauth_token_ref,
        ref_setter: |a, v| a.oauth_token_ref = v,
        field_name: "oauthToken",
    },
    AuthSecretField {
        value_getter: |a| &a.aws_access_key,
        value_setter: |a, v| a.aws_access_key = v,
        ref_getter: |a| &a.aws_access_key_ref,
        ref_setter: |a, v| a.aws_access_key_ref = v,
        field_name: "awsAccessKey",
    },
    AuthSecretField {
        value_getter: |a| &a.aws_secret_key,
        value_setter: |a, v| a.aws_secret_key = v,
        ref_getter: |a| &a.aws_secret_key_ref,
        ref_setter: |a, v| a.aws_secret_key_ref = v,
        field_name: "awsSecretKey",
    },
    AuthSecretField {
        value_getter: |a| &a.aws_session_token,
        value_setter: |a, v| a.aws_session_token = v,
        ref_getter: |a| &a.aws_session_token_ref,
        ref_setter: |a, v| a.aws_session_token_ref = v,
        field_name: "awsSessionToken",
    },
];

// ---------- Shared keychain helpers ----------

/// `{{var}}` templates are resolved at send time and must stay readable on disk,
/// so they are never treated as credentials.
fn is_variable_placeholder(value: &str) -> bool {
    match value.find("{{") {
        Some(start) => value[start + 2..].contains("}}"),
        None => false,
    }
}

fn is_extractable_secret(value: &str) -> bool {
    !value.is_empty() && !is_variable_placeholder(value)
}

/// Returns true when a value was read back from the keychain.
fn resolve_optional_ref(field: &mut Option<String>, ref_key: &Option<String>) -> bool {
    if let Some(ref key) = ref_key {
        match keyring::Entry::new(SERVICE_NAME, key) {
            Ok(entry) => match entry.get_password() {
                Ok(value) => {
                    *field = Some(value);
                    return true;
                }
                Err(keyring::Error::NoEntry) => {}
                Err(e) => {
                    log::warn!("Failed to resolve secret '{}': {}", key, e);
                }
            },
            Err(e) => {
                log::warn!("Failed to create keyring entry for '{}': {}", key, e);
            }
        }
    }
    false
}

// ---------- Extract auth secrets ----------

/// Extract credential values from auth state, replacing them with keyring references.
/// Returns a list of (keyring_key, secret_value) pairs to store in the keychain.
fn extract_auth(auth: &mut AuthState, owner_id: &str) -> Vec<(String, String)> {
    let mut secrets = Vec::new();

    for field in AUTH_SECRET_FIELDS {
        let value = (field.value_getter)(auth);
        if let Some(val) = value {
            if is_extractable_secret(val) {
                let key = format!("auth.{}.{}", owner_id, field.field_name);
                secrets.push((key.clone(), val.clone()));
                (field.ref_setter)(auth, Some(key));
                (field.value_setter)(auth, Some(String::new()));
            } else if is_variable_placeholder(val) && (field.ref_getter)(auth).is_some() {
                (field.ref_setter)(auth, None);
            }
        } else {
            // If value is None but a ref exists, the credential was removed: clean up
            if (field.ref_getter)(auth).is_some() {
                (field.ref_setter)(auth, None);
            }
        }
    }

    // OAuth2 nested secrets
    if let Some(ref mut oauth2) = auth.oauth2 {
        secrets.extend(extract_oauth2(oauth2, owner_id));
    }

    // OAuthToken live token data
    if let Some(ref mut token_data) = auth.oauth_token_data {
        secrets.extend(extract_oauth_token(token_data, owner_id));
    }

    secrets
}

fn extract_oauth2(oauth2: &mut OAuth2Config, owner_id: &str) -> Vec<(String, String)> {
    let mut secrets = Vec::new();

    if let Some(ref val) = oauth2.client_secret.clone() {
        if is_extractable_secret(val) {
            let key = format!("auth.{}.oauth2ClientSecret", owner_id);
            secrets.push((key.clone(), val.clone()));
            oauth2.client_secret_ref = Some(key);
            oauth2.client_secret = Some(String::new());
        } else if is_variable_placeholder(val) {
            oauth2.client_secret_ref = None;
        }
    } else if oauth2.client_secret_ref.is_some() {
        oauth2.client_secret_ref = None;
    }

    if let Some(ref val) = oauth2.password.clone() {
        if is_extractable_secret(val) {
            let key = format!("auth.{}.oauth2Password", owner_id);
            secrets.push((key.clone(), val.clone()));
            oauth2.password_ref = Some(key);
            oauth2.password = Some(String::new());
        } else if is_variable_placeholder(val) {
            oauth2.password_ref = None;
        }
    } else if oauth2.password_ref.is_some() {
        oauth2.password_ref = None;
    }

    secrets
}

fn extract_oauth_token(token_data: &mut OAuthToken, owner_id: &str) -> Vec<(String, String)> {
    let mut secrets = Vec::new();

    // access_token is String (not Option) — use empty string as sentinel
    if !token_data.access_token.is_empty() {
        let key = format!("auth.{}.oauthAccessToken", owner_id);
        secrets.push((key.clone(), token_data.access_token.clone()));
        token_data.access_token_ref = Some(key);
        token_data.access_token = String::new();
    }

    if let Some(ref val) = token_data.refresh_token.clone() {
        if !val.is_empty() {
            let key = format!("auth.{}.oauthRefreshToken", owner_id);
            secrets.push((key.clone(), val.clone()));
            token_data.refresh_token_ref = Some(key);
            token_data.refresh_token = Some(String::new());
        }
    } else if token_data.refresh_token_ref.is_some() {
        token_data.refresh_token_ref = None;
    }

    secrets
}

fn resolve_oauth2(oauth2: &mut OAuth2Config) -> usize {
    let mut resolved = 0;
    if resolve_optional_ref(&mut oauth2.client_secret, &oauth2.client_secret_ref.clone()) {
        resolved += 1;
    }
    if resolve_optional_ref(&mut oauth2.password, &oauth2.password_ref.clone()) {
        resolved += 1;
    }
    resolved
}

fn resolve_oauth_token(token_data: &mut OAuthToken) -> usize {
    let mut resolved = 0;
    if let Some(ref ref_key) = token_data.access_token_ref.clone() {
        match keyring::Entry::new(SERVICE_NAME, ref_key) {
            Ok(entry) => match entry.get_password() {
                Ok(value) => {
                    token_data.access_token = value;
                    resolved += 1;
                }
                Err(keyring::Error::NoEntry) => {}
                Err(e) => {
                    log::warn!("Failed to resolve secret '{}': {}", ref_key, e);
                }
            },
            Err(e) => {
                log::warn!("Failed to create keyring entry for '{}': {}", ref_key, e);
            }
        }
    }
    if resolve_optional_ref(
        &mut token_data.refresh_token,
        &token_data.refresh_token_ref.clone(),
    ) {
        resolved += 1;
    }
    resolved
}

fn extract_proxy(proxy: &mut ProxyConfig, owner_id: &str) -> Vec<(String, String)> {
    let mut secrets = Vec::new();

    if let Some(ref val) = proxy.password.clone() {
        if is_extractable_secret(val) {
            let key = format!("req.{}.proxyPassword", owner_id);
            secrets.push((key.clone(), val.clone()));
            proxy.password_ref = Some(key);
            proxy.password = Some(String::new());
        } else if is_variable_placeholder(val) {
            proxy.password_ref = None;
        }
    } else if proxy.password_ref.is_some() {
        proxy.password_ref = None;
    }

    secrets
}

fn extract_ssl(ssl: &mut SslConfig, owner_id: &str) -> Vec<(String, String)> {
    let mut secrets = Vec::new();

    if let Some(ref val) = ssl.passphrase.clone() {
        if is_extractable_secret(val) {
            let key = format!("req.{}.sslPassphrase", owner_id);
            secrets.push((key.clone(), val.clone()));
            ssl.passphrase_ref = Some(key);
            ssl.passphrase = Some(String::new());
        } else if is_variable_placeholder(val) {
            ssl.passphrase_ref = None;
        }
    } else if ssl.passphrase_ref.is_some() {
        ssl.passphrase_ref = None;
    }

    secrets
}

fn resolve_proxy(proxy: &mut ProxyConfig) -> usize {
    usize::from(resolve_optional_ref(
        &mut proxy.password,
        &proxy.password_ref.clone(),
    ))
}

fn resolve_ssl(ssl: &mut SslConfig) -> usize {
    usize::from(resolve_optional_ref(
        &mut ssl.passphrase,
        &ssl.passphrase_ref.clone(),
    ))
}

/// Recursively extract auth secrets from a collection item tree.
fn extract_items_auth(items: &mut [CollectionItem]) -> Vec<(String, String)> {
    let mut secrets = Vec::new();

    for item in items.iter_mut() {
        match item {
            CollectionItem::Request(req) => {
                secrets.extend(extract_auth(&mut req.auth, &req.id));
                if let Some(ref mut proxy) = req.proxy {
                    secrets.extend(extract_proxy(proxy, &req.id));
                }
                if let Some(ref mut ssl) = req.ssl {
                    secrets.extend(extract_ssl(ssl, &req.id));
                }
            }
            CollectionItem::Folder(folder) => {
                if let Some(ref mut auth) = folder.auth {
                    secrets.extend(extract_auth(auth, &folder.id));
                }
                secrets.extend(extract_items_auth(&mut folder.children));
            }
        }
    }

    secrets
}

/// Extract all auth secrets from a list of collections.
/// Returns (keyring_key, secret_value) pairs to store in the OS keychain.
pub fn extract_auth_secrets(collections: &mut [Collection]) -> Vec<(String, String)> {
    let mut secrets = Vec::new();

    for collection in collections.iter_mut() {
        if let Some(ref mut auth) = collection.auth {
            secrets.extend(extract_auth(auth, &collection.id));
        }
        secrets.extend(extract_items_auth(&mut collection.items));
    }

    secrets
}

// ---------- Extract environment secrets ----------

/// Extract secret variables from environments.
/// Returns (keyring_key, secret_value) pairs to store in the OS keychain.
pub fn extract_env_secrets(environments: &mut [Environment]) -> Vec<(String, String)> {
    let mut secrets = Vec::new();

    for env in environments.iter_mut() {
        for var in env.variables.iter_mut() {
            if var.is_secret == Some(true) && is_extractable_secret(&var.value) {
                let key = format!("env.{}.{}", env.id, var.key);
                secrets.push((key.clone(), var.value.clone()));
                var.secret_ref = Some(key);
                var.value = String::new();
            } else if (var.is_secret != Some(true) || is_variable_placeholder(&var.value))
                && var.secret_ref.is_some()
            {
                // No longer a stored secret (unmarked, or now a template): clear the ref
                var.secret_ref = None;
            }
        }
    }

    secrets
}

// ---------- Resolve auth secrets ----------

/// Resolve a single auth state's ref fields back to values from the keychain.
/// Returns the number of refs that were read back.
fn resolve_auth(auth: &mut AuthState) -> usize {
    let mut resolved = 0;
    for field in AUTH_SECRET_FIELDS {
        if let Some(ref ref_key) = (field.ref_getter)(auth) {
            match keyring::Entry::new(SERVICE_NAME, ref_key) {
                Ok(entry) => match entry.get_password() {
                    Ok(value) => {
                        (field.value_setter)(auth, Some(value));
                        resolved += 1;
                    }
                    Err(keyring::Error::NoEntry) => {
                        // Secret was deleted from keychain; leave value empty
                    }
                    Err(e) => {
                        log::warn!("Failed to resolve secret '{}': {}", ref_key, e);
                    }
                },
                Err(e) => {
                    log::warn!("Failed to create keyring entry for '{}': {}", ref_key, e);
                }
            }
        }
    }

    // Resolve OAuth2 nested secrets
    if let Some(ref mut oauth2) = auth.oauth2 {
        resolved += resolve_oauth2(oauth2);
    }

    // Resolve OAuthToken live token data
    if let Some(ref mut token_data) = auth.oauth_token_data {
        resolved += resolve_oauth_token(token_data);
    }
    resolved
}

/// Recursively resolve auth secrets in a collection item tree.
fn resolve_items_auth(items: &mut [CollectionItem]) -> usize {
    let mut resolved = 0;
    for item in items.iter_mut() {
        match item {
            CollectionItem::Request(req) => {
                resolved += resolve_auth(&mut req.auth);
                if let Some(ref mut proxy) = req.proxy {
                    resolved += resolve_proxy(proxy);
                }
                if let Some(ref mut ssl) = req.ssl {
                    resolved += resolve_ssl(ssl);
                }
            }
            CollectionItem::Folder(folder) => {
                if let Some(ref mut auth) = folder.auth {
                    resolved += resolve_auth(auth);
                }
                resolved += resolve_items_auth(&mut folder.children);
            }
        }
    }
    resolved
}

/// Resolve all auth secrets in collections from the OS keychain.
/// Returns the number of refs that were read back.
pub fn resolve_auth_secrets(collections: &mut [Collection]) -> usize {
    let mut resolved = 0;
    for collection in collections.iter_mut() {
        if let Some(ref mut auth) = collection.auth {
            resolved += resolve_auth(auth);
        }
        resolved += resolve_items_auth(&mut collection.items);
    }
    resolved
}

// ---------- Resolve environment secrets ----------

/// Resolve secret variable refs from the OS keychain.
/// Returns the number of refs that were read back.
pub fn resolve_env_secrets(environments: &mut [Environment]) -> usize {
    let mut resolved = 0;
    for env in environments.iter_mut() {
        for var in env.variables.iter_mut() {
            if let Some(ref ref_key) = var.secret_ref {
                match keyring::Entry::new(SERVICE_NAME, ref_key) {
                    Ok(entry) => match entry.get_password() {
                        Ok(value) => {
                            var.value = value;
                            resolved += 1;
                        }
                        Err(keyring::Error::NoEntry) => {
                            // Secret was deleted from keychain; leave value empty
                        }
                        Err(e) => {
                            log::warn!("Failed to resolve env secret '{}': {}", ref_key, e);
                        }
                    },
                    Err(e) => {
                        log::warn!("Failed to create keyring entry for '{}': {}", ref_key, e);
                    }
                }
            }
        }
    }
    resolved
}

// ---------- Store secrets in keychain ----------

/// Store a batch of secrets in the OS keychain. Returns count of successfully stored secrets.
pub fn store_secrets(secrets: &[(String, String)]) -> (usize, Vec<String>) {
    let mut stored = 0;
    let mut errors = Vec::new();

    for (key, value) in secrets {
        match keyring::Entry::new(SERVICE_NAME, key) {
            Ok(entry) => {
                if let Err(e) = entry.set_password(value) {
                    errors.push(format!("Failed to store '{}': {}", key, e));
                } else {
                    stored += 1;
                }
            }
            Err(e) => {
                errors.push(format!("Failed to create entry '{}': {}", key, e));
            }
        }
    }

    (stored, errors)
}

/// Delete a secret from the keychain by key. Silently ignores "not found".
#[allow(dead_code)]
pub fn delete_secret(key: &str) {
    if let Ok(entry) = keyring::Entry::new(SERVICE_NAME, key) {
        let _ = entry.delete_credential();
    }
}

// ---------- Migration ----------

/// Migrate plaintext secrets to the OS keychain.
/// Checks meta.json for storageVersion; if < 2, extracts secrets, stores in keychain,
/// rewrites JSON files with refs, and updates meta.json.
pub async fn migrate_plaintext_secrets(
    collections_path: &Path,
    environments_path: &Path,
    meta_path: &Path,
) -> MigrationResult {
    // Check current storage version
    let version = read_storage_version(meta_path).await;
    if version >= 2 {
        return MigrationResult {
            migrated_count: 0,
            skipped_count: 0,
            errors: vec![],
        };
    }

    let mut migrated_count = 0;
    let mut skipped_count = 0;
    let mut errors = Vec::new();

    // Migrate collections
    if collections_path.exists() {
        match tokio::fs::read_to_string(collections_path).await {
            Ok(content) => {
                // Create backup
                let backup_path = collections_path.with_extension("backup.json");
                if let Err(e) = tokio::fs::write(&backup_path, &content).await {
                    log::warn!("Failed to create collections backup: {}", e);
                }

                match serde_json::from_str::<Vec<Collection>>(&content) {
                    Ok(mut collections) => {
                        let secrets = extract_auth_secrets(&mut collections);
                        if !secrets.is_empty() {
                            let (stored, store_errors) = store_secrets(&secrets);
                            migrated_count += stored;
                            skipped_count += secrets.len() - stored;
                            errors.extend(store_errors);

                            // Rewrite collections file with refs
                            match serde_json::to_string_pretty(&collections) {
                                Ok(json) => {
                                    if let Err(e) = tokio::fs::write(collections_path, json).await {
                                        errors.push(format!(
                                            "Failed to write migrated collections: {}",
                                            e
                                        ));
                                    }
                                }
                                Err(e) => {
                                    errors.push(format!(
                                        "Failed to serialize migrated collections: {}",
                                        e
                                    ));
                                }
                            }
                        }
                    }
                    Err(e) => {
                        log::warn!("Failed to parse collections for migration: {}", e);
                        errors.push(format!("Failed to parse collections: {}", e));
                    }
                }
            }
            Err(e) => {
                log::warn!("Failed to read collections for migration: {}", e);
            }
        }
    }

    // Migrate environments
    if environments_path.exists() {
        match tokio::fs::read_to_string(environments_path).await {
            Ok(content) => {
                // Create backup
                let backup_path = environments_path.with_extension("backup.json");
                if let Err(e) = tokio::fs::write(&backup_path, &content).await {
                    log::warn!("Failed to create environments backup: {}", e);
                }

                // Environments file wraps in EnvironmentsData
                match serde_json::from_str::<serde_json::Value>(&content) {
                    Ok(mut env_data) => {
                        if let Some(envs_arr) = env_data.get("environments") {
                            if let Ok(mut environments) =
                                serde_json::from_value::<Vec<Environment>>(envs_arr.clone())
                            {
                                let secrets = extract_env_secrets(&mut environments);
                                if !secrets.is_empty() {
                                    let (stored, store_errors) = store_secrets(&secrets);
                                    migrated_count += stored;
                                    skipped_count += secrets.len() - stored;
                                    errors.extend(store_errors);

                                    // Update environments array in the wrapper
                                    env_data["environments"] = serde_json::to_value(&environments)
                                        .unwrap_or(serde_json::json!([]));

                                    match serde_json::to_string_pretty(&env_data) {
                                        Ok(json) => {
                                            if let Err(e) =
                                                tokio::fs::write(environments_path, json).await
                                            {
                                                errors.push(format!(
                                                    "Failed to write migrated environments: {}",
                                                    e
                                                ));
                                            }
                                        }
                                        Err(e) => {
                                            errors.push(format!(
                                                "Failed to serialize migrated environments: {}",
                                                e
                                            ));
                                        }
                                    }
                                }
                            }
                        }
                    }
                    Err(e) => {
                        log::warn!("Failed to parse environments for migration: {}", e);
                        errors.push(format!("Failed to parse environments: {}", e));
                    }
                }
            }
            Err(e) => {
                log::warn!("Failed to read environments for migration: {}", e);
            }
        }
    }

    // Update meta.json with new storage version
    let meta = serde_json::json!({
        "storageVersion": 2,
        "migratedAt": chrono::Utc::now().to_rfc3339()
    });
    if let Ok(json) = serde_json::to_string_pretty(&meta) {
        if let Some(parent) = meta_path.parent() {
            let _ = tokio::fs::create_dir_all(parent).await;
        }
        if let Err(e) = tokio::fs::write(meta_path, json).await {
            errors.push(format!("Failed to write meta.json: {}", e));
        }
    }

    log::info!(
        "Secret migration complete: {} migrated, {} skipped, {} errors",
        migrated_count,
        skipped_count,
        errors.len()
    );

    MigrationResult {
        migrated_count,
        skipped_count,
        errors,
    }
}

async fn read_storage_version(meta_path: &Path) -> u32 {
    if let Ok(content) = tokio::fs::read_to_string(meta_path).await {
        if let Ok(meta) = serde_json::from_str::<serde_json::Value>(&content) {
            return meta["storageVersion"].as_u64().unwrap_or(0) as u32;
        }
    }
    0
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::types::AuthType;

    fn request_json(id: &str, auth: serde_json::Value) -> serde_json::Value {
        serde_json::json!({
            "type": "request",
            "id": id,
            "name": "Req",
            "method": "GET",
            "url": "https://api.example.com",
            "params": [],
            "headers": [],
            "auth": auth,
            "body": { "type": "none", "content": "" },
            "createdAt": "2026-01-01T00:00:00Z",
            "updatedAt": "2026-01-01T00:00:00Z",
        })
    }

    fn no_auth() -> serde_json::Value {
        serde_json::json!({ "type": "none" })
    }

    fn bearer_auth(token: &str) -> serde_json::Value {
        serde_json::json!({ "type": "bearer", "token": token })
    }

    #[test]
    fn extract_auth_bearer_token_generates_owner_scoped_key_and_clears_value() {
        let mut auth = AuthState {
            auth_type: AuthType::Bearer,
            token: Some("secret123".to_string()),
            ..Default::default()
        };
        let secrets = extract_auth(&mut auth, "req-1");
        assert_eq!(secrets.len(), 1);
        assert_eq!(
            secrets[0],
            ("auth.req-1.token".to_string(), "secret123".to_string())
        );
        assert_eq!(auth.token.as_deref(), Some(""));
        assert_eq!(auth.token_ref.as_deref(), Some("auth.req-1.token"));
    }

    #[test]
    fn extract_auth_no_value_but_existing_ref_clears_stale_ref() {
        let mut auth = AuthState {
            auth_type: AuthType::Bearer,
            token: None,
            token_ref: Some("stale-key".to_string()),
            ..Default::default()
        };
        let secrets = extract_auth(&mut auth, "req-1");
        assert!(secrets.is_empty());
        assert!(auth.token_ref.is_none());
    }

    #[test]
    fn extract_auth_empty_string_value_is_not_extracted() {
        let mut auth = AuthState {
            auth_type: AuthType::Bearer,
            token: Some(String::new()),
            ..Default::default()
        };
        let secrets = extract_auth(&mut auth, "req-1");
        assert!(secrets.is_empty());
    }

    #[test]
    fn is_variable_placeholder_detects_templates_only() {
        assert!(is_variable_placeholder("{{token}}"));
        assert!(is_variable_placeholder("Bearer {{token}}"));
        assert!(is_variable_placeholder("{{a}}-{{b}}"));
        assert!(!is_variable_placeholder("secret123"));
        assert!(!is_variable_placeholder("{{unterminated"));
        assert!(!is_variable_placeholder("}}{{"));
        assert!(!is_variable_placeholder(""));
    }

    #[test]
    fn extract_auth_variable_placeholder_stays_on_disk() {
        let mut auth = AuthState {
            auth_type: AuthType::Bearer,
            token: Some("{{token}}".to_string()),
            ..Default::default()
        };
        let secrets = extract_auth(&mut auth, "req-1");
        assert!(secrets.is_empty());
        assert_eq!(auth.token.as_deref(), Some("{{token}}"));
        assert!(auth.token_ref.is_none());
    }

    #[test]
    fn extract_auth_mixed_placeholder_is_not_extracted() {
        let mut auth = AuthState {
            auth_type: AuthType::Bearer,
            token: Some("Bearer {{token}}".to_string()),
            ..Default::default()
        };
        let secrets = extract_auth(&mut auth, "req-1");
        assert!(secrets.is_empty());
        assert_eq!(auth.token.as_deref(), Some("Bearer {{token}}"));
    }

    #[test]
    fn extract_auth_placeholder_with_stale_ref_clears_ref() {
        let mut auth = AuthState {
            auth_type: AuthType::Bearer,
            token: Some("{{token}}".to_string()),
            token_ref: Some("auth.req-1.token".to_string()),
            ..Default::default()
        };
        let secrets = extract_auth(&mut auth, "req-1");
        assert!(secrets.is_empty());
        assert_eq!(auth.token.as_deref(), Some("{{token}}"));
        assert!(auth.token_ref.is_none());
    }

    #[test]
    fn extract_env_secrets_skips_placeholder_values() {
        let env_json = serde_json::json!({
            "id": "env-1",
            "name": "Dev",
            "variables": [
                { "key": "apiKey", "value": "{{sharedKey}}", "enabled": true, "isSecret": true, "secretRef": "env.env-1.apiKey" },
            ],
        });
        let mut environments: Vec<Environment> = vec![serde_json::from_value(env_json).unwrap()];
        let secrets = extract_env_secrets(&mut environments);
        assert!(secrets.is_empty());
        assert_eq!(environments[0].variables[0].value, "{{sharedKey}}");
        assert!(environments[0].variables[0].secret_ref.is_none());
    }

    #[test]
    fn extract_auth_secrets_aggregates_across_collections_and_nested_items() {
        let collection_json = serde_json::json!({
            "id": "col-1",
            "name": "Collection",
            "items": [
                request_json("req-1", bearer_auth("token-a")),
                {
                    "type": "folder",
                    "id": "folder-1",
                    "name": "Folder",
                    "children": [request_json("req-2", bearer_auth("token-b"))],
                    "expanded": false,
                    "createdAt": "2026-01-01T00:00:00Z",
                    "updatedAt": "2026-01-01T00:00:00Z",
                },
            ],
            "expanded": false,
            "auth": no_auth(),
            "createdAt": "2026-01-01T00:00:00Z",
            "updatedAt": "2026-01-01T00:00:00Z",
        });
        let mut collections: Vec<Collection> =
            vec![serde_json::from_value(collection_json).unwrap()];
        let secrets = extract_auth_secrets(&mut collections);

        assert_eq!(secrets.len(), 2);
        assert!(secrets.contains(&("auth.req-1.token".to_string(), "token-a".to_string())));
        assert!(secrets.contains(&("auth.req-2.token".to_string(), "token-b".to_string())));
    }

    #[test]
    fn extract_env_secrets_only_extracts_variables_marked_secret() {
        let env_json = serde_json::json!({
            "id": "env-1",
            "name": "Dev",
            "variables": [
                { "key": "plain", "value": "not-secret", "enabled": true },
                { "key": "apiKey", "value": "shh", "enabled": true, "isSecret": true },
            ],
        });
        let mut environments: Vec<Environment> = vec![serde_json::from_value(env_json).unwrap()];
        let secrets = extract_env_secrets(&mut environments);

        assert_eq!(
            secrets,
            vec![("env.env-1.apiKey".to_string(), "shh".to_string())]
        );
        assert_eq!(environments[0].variables[0].value, "not-secret");
        assert_eq!(environments[0].variables[1].value, "");
        assert_eq!(
            environments[0].variables[1].secret_ref.as_deref(),
            Some("env.env-1.apiKey")
        );
    }

    #[test]
    fn extract_env_secrets_clears_ref_when_no_longer_marked_secret() {
        let env_json = serde_json::json!({
            "id": "env-1",
            "name": "Dev",
            "variables": [
                { "key": "wasSecret", "value": "x", "enabled": true, "secretRef": "env.env-1.wasSecret" },
            ],
        });
        let mut environments: Vec<Environment> = vec![serde_json::from_value(env_json).unwrap()];
        let secrets = extract_env_secrets(&mut environments);
        assert!(secrets.is_empty());
        assert!(environments[0].variables[0].secret_ref.is_none());
    }
}
