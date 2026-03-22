// Secret extraction service - extracts credentials from collections/environments
// and stores them in the OS keychain via SecretRef pattern.
//
// On save: credential values are replaced with keyring references (*Ref fields).
// On load: references are resolved back to values from the keychain.
// The JSON files on disk never contain actual credential values.

use crate::models::types::{AuthState, CollectionItem, Collection, Environment};
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

// ---------- Extract auth secrets ----------

/// Extract credential values from auth state, replacing them with keyring references.
/// Returns a list of (keyring_key, secret_value) pairs to store in the keychain.
fn extract_auth(auth: &mut AuthState, owner_id: &str) -> Vec<(String, String)> {
    let mut secrets = Vec::new();

    for field in AUTH_SECRET_FIELDS {
        let value = (field.value_getter)(auth);
        if let Some(val) = value {
            if !val.is_empty() {
                let key = format!("auth.{}.{}", owner_id, field.field_name);
                secrets.push((key.clone(), val.clone()));
                (field.ref_setter)(auth, Some(key));
                (field.value_setter)(auth, Some(String::new()));
            }
        } else {
            // If value is None but a ref exists, the credential was removed: clean up
            if (field.ref_getter)(auth).is_some() {
                (field.ref_setter)(auth, None);
            }
        }
    }

    secrets
}

/// Recursively extract auth secrets from a collection item tree.
fn extract_items_auth(items: &mut Vec<CollectionItem>) -> Vec<(String, String)> {
    let mut secrets = Vec::new();

    for item in items.iter_mut() {
        match item {
            CollectionItem::Request(req) => {
                secrets.extend(extract_auth(&mut req.auth, &req.id));
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
pub fn extract_auth_secrets(collections: &mut Vec<Collection>) -> Vec<(String, String)> {
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
pub fn extract_env_secrets(environments: &mut Vec<Environment>) -> Vec<(String, String)> {
    let mut secrets = Vec::new();

    for env in environments.iter_mut() {
        for var in env.variables.iter_mut() {
            if var.is_secret == Some(true) && !var.value.is_empty() {
                let key = format!("env.{}.{}", env.id, var.key);
                secrets.push((key.clone(), var.value.clone()));
                var.secret_ref = Some(key);
                var.value = String::new();
            } else if var.is_secret != Some(true) && var.secret_ref.is_some() {
                // Variable is no longer marked as secret: clear the ref
                var.secret_ref = None;
            }
        }
    }

    secrets
}

// ---------- Resolve auth secrets ----------

/// Resolve a single auth state's ref fields back to values from the keychain.
fn resolve_auth(auth: &mut AuthState) {
    for field in AUTH_SECRET_FIELDS {
        if let Some(ref ref_key) = (field.ref_getter)(auth) {
            match keyring::Entry::new(SERVICE_NAME, ref_key) {
                Ok(entry) => match entry.get_password() {
                    Ok(value) => {
                        (field.value_setter)(auth, Some(value));
                    }
                    Err(keyring::Error::NoEntry) => {
                        // Secret was deleted from keychain; leave value empty
                    }
                    Err(e) => {
                        eprintln!("[Nouto] Warning: failed to resolve secret '{}': {}", ref_key, e);
                    }
                },
                Err(e) => {
                    eprintln!("[Nouto] Warning: failed to create keyring entry for '{}': {}", ref_key, e);
                }
            }
        }
    }
}

/// Recursively resolve auth secrets in a collection item tree.
fn resolve_items_auth(items: &mut Vec<CollectionItem>) {
    for item in items.iter_mut() {
        match item {
            CollectionItem::Request(req) => {
                resolve_auth(&mut req.auth);
            }
            CollectionItem::Folder(folder) => {
                if let Some(ref mut auth) = folder.auth {
                    resolve_auth(auth);
                }
                resolve_items_auth(&mut folder.children);
            }
        }
    }
}

/// Resolve all auth secrets in collections from the OS keychain.
pub fn resolve_auth_secrets(collections: &mut Vec<Collection>) {
    for collection in collections.iter_mut() {
        if let Some(ref mut auth) = collection.auth {
            resolve_auth(auth);
        }
        resolve_items_auth(&mut collection.items);
    }
}

// ---------- Resolve environment secrets ----------

/// Resolve secret variable refs from the OS keychain.
pub fn resolve_env_secrets(environments: &mut Vec<Environment>) {
    for env in environments.iter_mut() {
        for var in env.variables.iter_mut() {
            if let Some(ref ref_key) = var.secret_ref {
                match keyring::Entry::new(SERVICE_NAME, ref_key) {
                    Ok(entry) => match entry.get_password() {
                        Ok(value) => {
                            var.value = value;
                        }
                        Err(keyring::Error::NoEntry) => {
                            // Secret was deleted from keychain; leave value empty
                        }
                        Err(e) => {
                            eprintln!("[Nouto] Warning: failed to resolve env secret '{}': {}", ref_key, e);
                        }
                    },
                    Err(e) => {
                        eprintln!("[Nouto] Warning: failed to create keyring entry for '{}': {}", ref_key, e);
                    }
                }
            }
        }
    }
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
                    eprintln!("[Nouto] Warning: failed to create collections backup: {}", e);
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
                                        errors.push(format!("Failed to write migrated collections: {}", e));
                                    }
                                }
                                Err(e) => {
                                    errors.push(format!("Failed to serialize migrated collections: {}", e));
                                }
                            }
                        }
                    }
                    Err(e) => {
                        eprintln!("[Nouto] Warning: failed to parse collections for migration: {}", e);
                        errors.push(format!("Failed to parse collections: {}", e));
                    }
                }
            }
            Err(e) => {
                eprintln!("[Nouto] Warning: failed to read collections for migration: {}", e);
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
                    eprintln!("[Nouto] Warning: failed to create environments backup: {}", e);
                }

                // Environments file wraps in EnvironmentsData
                match serde_json::from_str::<serde_json::Value>(&content) {
                    Ok(mut env_data) => {
                        if let Some(envs_arr) = env_data.get("environments") {
                            if let Ok(mut environments) = serde_json::from_value::<Vec<Environment>>(envs_arr.clone()) {
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
                                            if let Err(e) = tokio::fs::write(environments_path, json).await {
                                                errors.push(format!("Failed to write migrated environments: {}", e));
                                            }
                                        }
                                        Err(e) => {
                                            errors.push(format!("Failed to serialize migrated environments: {}", e));
                                        }
                                    }
                                }
                            }
                        }
                    }
                    Err(e) => {
                        eprintln!("[Nouto] Warning: failed to parse environments for migration: {}", e);
                        errors.push(format!("Failed to parse environments: {}", e));
                    }
                }
            }
            Err(e) => {
                eprintln!("[Nouto] Warning: failed to read environments for migration: {}", e);
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

    println!(
        "[Nouto] Secret migration complete: {} migrated, {} skipped, {} errors",
        migrated_count, skipped_count, errors.len()
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
