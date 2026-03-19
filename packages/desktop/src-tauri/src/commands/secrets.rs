// Secret storage commands - OS keychain integration
// Uses the `keyring` crate for Windows Credential Manager, macOS Keychain, libsecret on Linux

use serde::Deserialize;
use tauri::{AppHandle, Emitter};

const SERVICE_NAME: &str = "nouto-desktop";

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StoreSecretData {
    pub key: String,
    pub value: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SecretKeyData {
    pub key: String,
}

/// Store a secret in the OS keychain
#[tauri::command]
pub async fn store_secret(data: StoreSecretData, app: AppHandle) -> Result<(), String> {
    let entry = keyring::Entry::new(SERVICE_NAME, &data.key)
        .map_err(|e| format!("Failed to create keyring entry: {}", e))?;

    entry
        .set_password(&data.value)
        .map_err(|e| format!("Failed to store secret: {}", e))?;

    let _ = app.emit(
        "secretStored",
        serde_json::json!({ "data": { "key": data.key, "success": true } }),
    );

    Ok(())
}

/// Retrieve a secret from the OS keychain
#[tauri::command]
pub async fn get_secret(data: SecretKeyData, app: AppHandle) -> Result<(), String> {
    let entry = keyring::Entry::new(SERVICE_NAME, &data.key)
        .map_err(|e| format!("Failed to create keyring entry: {}", e))?;

    match entry.get_password() {
        Ok(value) => {
            let _ = app.emit(
                "secretValue",
                serde_json::json!({ "data": { "key": data.key, "value": value } }),
            );
        }
        Err(keyring::Error::NoEntry) => {
            let _ = app.emit(
                "secretValue",
                serde_json::json!({ "data": { "key": data.key, "value": null } }),
            );
        }
        Err(e) => {
            return Err(format!("Failed to retrieve secret: {}", e));
        }
    }

    Ok(())
}

/// Delete a secret from the OS keychain
#[tauri::command]
pub async fn delete_secret(data: SecretKeyData, app: AppHandle) -> Result<(), String> {
    let entry = keyring::Entry::new(SERVICE_NAME, &data.key)
        .map_err(|e| format!("Failed to create keyring entry: {}", e))?;

    match entry.delete_credential() {
        Ok(()) => {
            let _ = app.emit(
                "secretDeleted",
                serde_json::json!({ "data": { "key": data.key, "success": true } }),
            );
        }
        Err(keyring::Error::NoEntry) => {
            // Already deleted, not an error
            let _ = app.emit(
                "secretDeleted",
                serde_json::json!({ "data": { "key": data.key, "success": true } }),
            );
        }
        Err(e) => {
            return Err(format!("Failed to delete secret: {}", e));
        }
    }

    Ok(())
}
