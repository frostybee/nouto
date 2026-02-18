// Tauri command handlers - bridge between UI and Rust services

pub mod http;

// Re-export HTTP commands
pub use http::{send_request, cancel_request, pick_ssl_file, init_request_registry};

use serde_json::json;
use tauri::Emitter;

/// Ready command - frontend signals it's ready to receive data
#[tauri::command]
pub fn ready() -> Result<(), String> {
    println!("[HiveFetch] Frontend ready");
    Ok(())
}

/// Load initial data (collections, environments, history)
#[tauri::command]
pub async fn load_data(app: tauri::AppHandle) -> Result<(), String> {
    // TODO: Phase 3 - implement actual storage loading
    // For now, emit mock data for UI visualization
    let initial_data = json!({
        "collections": [
            {
                "id": "col-1",
                "name": "API Testing",
                "description": "Sample API collection",
                "items": [
                    {
                        "type": "folder",
                        "id": "folder-1",
                        "name": "Users",
                        "items": [
                            {
                                "type": "request",
                                "id": "req-1",
                                "name": "Get User",
                                "method": "GET",
                                "url": "https://jsonplaceholder.typicode.com/users/1",
                                "params": [],
                                "headers": [],
                                "auth": { "type": "none" },
                                "body": { "type": "none", "content": "" }
                            },
                            {
                                "type": "request",
                                "id": "req-2",
                                "name": "Create User",
                                "method": "POST",
                                "url": "https://jsonplaceholder.typicode.com/users",
                                "params": [],
                                "headers": [
                                    { "key": "Content-Type", "value": "application/json", "enabled": true }
                                ],
                                "auth": { "type": "none" },
                                "body": {
                                    "type": "json",
                                    "content": "{\n  \"name\": \"John Doe\",\n  \"email\": \"john@example.com\"\n}"
                                }
                            }
                        ]
                    },
                    {
                        "type": "folder",
                        "id": "folder-2",
                        "name": "Posts",
                        "items": [
                            {
                                "type": "request",
                                "id": "req-3",
                                "name": "Get Posts",
                                "method": "GET",
                                "url": "https://jsonplaceholder.typicode.com/posts",
                                "params": [],
                                "headers": [],
                                "auth": { "type": "none" },
                                "body": { "type": "none", "content": "" }
                            }
                        ]
                    },
                    {
                        "type": "request",
                        "id": "req-4",
                        "name": "GitHub API - Get User",
                        "method": "GET",
                        "url": "https://api.github.com/users/octocat",
                        "params": [],
                        "headers": [
                            { "key": "Accept", "value": "application/vnd.github.v3+json", "enabled": true }
                        ],
                        "auth": { "type": "none" },
                        "body": { "type": "none", "content": "" }
                    }
                ]
            },
            {
                "id": "col-2",
                "name": "GraphQL Examples",
                "description": "GraphQL queries",
                "items": [
                    {
                        "type": "request",
                        "id": "req-5",
                        "name": "Countries Query",
                        "method": "POST",
                        "url": "https://countries.trevorblades.com/",
                        "params": [],
                        "headers": [
                            { "key": "Content-Type", "value": "application/json", "enabled": true }
                        ],
                        "auth": { "type": "none" },
                        "body": {
                            "type": "graphql",
                            "content": "query {\n  countries {\n    code\n    name\n    emoji\n  }\n}",
                            "graphqlVariables": ""
                        }
                    }
                ]
            }
        ],
        "environments": [
            {
                "id": "env-1",
                "name": "Development",
                "variables": [
                    { "key": "baseUrl", "value": "http://localhost:3000", "enabled": true },
                    { "key": "apiKey", "value": "dev-key-12345", "enabled": true }
                ]
            },
            {
                "id": "env-2",
                "name": "Production",
                "variables": [
                    { "key": "baseUrl", "value": "https://api.production.com", "enabled": true },
                    { "key": "apiKey", "value": "prod-key-xxxxx", "enabled": true }
                ]
            }
        ],
        "history": []
    });

    app.emit("initialData", initial_data)
        .map_err(|e| format!("Failed to emit initialData: {}", e))?;

    Ok(())
}

/// Save collections to disk
#[tauri::command]
pub async fn save_collections(data: String) -> Result<(), String> {
    // TODO: Phase 3 - implement actual storage saving
    println!("[HiveFetch] Save collections called with {} bytes", data.len());
    Ok(())
}

/// Stub command for testing
#[tauri::command]
pub fn greet(name: &str) -> String {
    format!("Hello, {}! Welcome to HiveFetch Desktop.", name)
}
