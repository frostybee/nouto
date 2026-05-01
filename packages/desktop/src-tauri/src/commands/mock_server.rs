// Mock Server command handlers for Tauri
// Runs a local HTTP server that matches requests against configured mock routes

use crate::error::AppError;
use crate::models::types::{MockRequestLog, MockRoute, MockServerConfig};
use hyper::body::Incoming;
use hyper::service::service_fn;
use hyper::{Request, Response};
use hyper_util::rt::TokioIo;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Arc;
use tauri::{AppHandle, Emitter};
use tokio::net::TcpListener;
use tokio::sync::{watch, Mutex};

/// Shared state for the mock server
pub struct MockServerState {
    /// Sender to signal shutdown
    shutdown_tx: Mutex<Option<watch::Sender<bool>>>,
    /// Current routes (mutable, can be updated while running)
    routes: Arc<Mutex<Vec<MockRoute>>>,
}

impl MockServerState {
    pub fn new() -> Self {
        Self {
            shutdown_tx: Mutex::new(None),
            routes: Arc::new(Mutex::new(Vec::new())),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StartMockServerData {
    pub config: MockServerConfig,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateMockRoutesData {
    pub config: MockServerConfig,
}

/// Start the mock server
#[tauri::command]
pub async fn start_mock_server(
    data: StartMockServerData,
    app: AppHandle,
    state: tauri::State<'_, MockServerState>,
) -> Result<(), AppError> {
    // Check if already running
    {
        let tx = state.shutdown_tx.lock().await;
        if tx.is_some() {
            return Err(AppError::Other("Mock server is already running".to_string()));
        }
    }

    let port = data.config.port;
    let routes = data.config.routes.clone();

    // Update shared routes
    {
        let mut r = state.routes.lock().await;
        *r = routes;
    }

    // Create shutdown channel
    let (shutdown_tx, shutdown_rx) = watch::channel(false);
    {
        let mut tx = state.shutdown_tx.lock().await;
        *tx = Some(shutdown_tx);
    }

    // Emit starting status
    let _ = app.emit("mockStatusChanged", serde_json::json!({
        "data": { "status": "starting" }
    }));

    let shared_routes = state.routes.clone();
    let app_clone = app.clone();

    tokio::spawn(async move {
        let addr = format!("127.0.0.1:{}", port);
        let listener = match TcpListener::bind(&addr).await {
            Ok(l) => l,
            Err(e) => {
                let _ = app_clone.emit("mockStatusChanged", serde_json::json!({
                    "data": { "status": "error", "error": format!("Failed to bind port {}: {}", port, e) }
                }));
                return;
            }
        };

        // Emit running status
        let _ = app_clone.emit("mockStatusChanged", serde_json::json!({
            "data": { "status": "running" }
        }));

        println!("[Nouto Mock] Server listening on {}", addr);

        let mut shutdown_rx = shutdown_rx;

        loop {
            tokio::select! {
                result = listener.accept() => {
                    match result {
                        Ok((stream, _addr)) => {
                            let routes = shared_routes.clone();
                            let app = app_clone.clone();
                            let io = TokioIo::new(stream);

                            tokio::spawn(async move {
                                let service = service_fn(move |req: Request<Incoming>| {
                                    let routes = routes.clone();
                                    let app = app.clone();
                                    async move {
                                        handle_mock_request(req, routes, app).await
                                    }
                                });

                                if let Err(err) = hyper::server::conn::http1::Builder::new()
                                    .serve_connection(io, service)
                                    .await
                                {
                                    eprintln!("[Nouto Mock] Connection error: {}", err);
                                }
                            });
                        }
                        Err(e) => {
                            eprintln!("[Nouto Mock] Accept error: {}", e);
                        }
                    }
                }
                _ = shutdown_rx.changed() => {
                    if *shutdown_rx.borrow() {
                        println!("[Nouto Mock] Server shutting down");
                        break;
                    }
                }
            }
        }

        // Emit stopped status
        let _ = app_clone.emit("mockStatusChanged", serde_json::json!({
            "data": { "status": "stopped" }
        }));
    });

    Ok(())
}

/// Stop the mock server
#[tauri::command]
pub async fn stop_mock_server(
    app: AppHandle,
    state: tauri::State<'_, MockServerState>,
) -> Result<(), AppError> {
    let mut tx = state.shutdown_tx.lock().await;
    if let Some(sender) = tx.take() {
        let _ = app.emit("mockStatusChanged", serde_json::json!({
            "data": { "status": "stopping" }
        }));
        let _ = sender.send(true);
        Ok(())
    } else {
        Err(AppError::Other("Mock server is not running".to_string()))
    }
}

/// Update mock routes while server is running
#[tauri::command]
pub async fn update_mock_routes(
    data: UpdateMockRoutesData,
    state: tauri::State<'_, MockServerState>,
) -> Result<(), AppError> {
    let mut routes = state.routes.lock().await;
    *routes = data.config.routes;
    Ok(())
}

/// Clear mock server logs (client-side only, but keep command for completeness)
#[tauri::command]
pub async fn clear_mock_logs() -> Result<(), AppError> {
    // Logs are stored client-side in the Svelte store
    Ok(())
}

/// Handle an incoming mock request
async fn handle_mock_request(
    req: Request<Incoming>,
    routes: Arc<Mutex<Vec<MockRoute>>>,
    app: AppHandle,
) -> Result<Response<http_body_util::Full<bytes::Bytes>>, std::convert::Infallible> {
    use http_body_util::Full;

    let start = std::time::Instant::now();
    let method = req.method().to_string();
    let path = req.uri().path().to_string();

    let routes = routes.lock().await;

    // Find matching route
    let matched = routes.iter().find(|route| {
        if !route.enabled {
            return false;
        }
        // Match method
        if route.method.as_str() != "*" && route.method.as_str().to_uppercase() != method.to_uppercase() {
            return false;
        }
        // Match path (support :param style patterns)
        match_path(&route.path, &path)
    });

    let (status_code, body, headers, matched_route_id) = if let Some(route) = matched {
        // Apply latency simulation
        if route.latency_min > 0 || route.latency_max > 0 {
            let delay = if route.latency_min == route.latency_max {
                route.latency_min as u64
            } else {
                let min = route.latency_min.min(route.latency_max) as u64;
                let max = route.latency_min.max(route.latency_max) as u64;
                min + (rand::random::<u64>() % (max - min + 1))
            };
            tokio::time::sleep(tokio::time::Duration::from_millis(delay)).await;
        }

        // Extract path params for substitution
        let params = extract_path_params(&route.path, &path);
        let body = substitute_params(&route.response_body, &params);

        (
            route.status_code as u16,
            body,
            route.response_headers.clone(),
            Some(route.id.clone()),
        )
    } else {
        (
            404,
            format!("{{\"error\": \"No mock route matched\", \"method\": \"{}\", \"path\": \"{}\"}}", method, path),
            vec![],
            None,
        )
    };

    let duration = start.elapsed().as_millis() as i64;

    // Build response
    let mut response = Response::builder()
        .status(status_code)
        .header("Access-Control-Allow-Origin", "*")
        .header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, PATCH, OPTIONS, HEAD")
        .header("Access-Control-Allow-Headers", "*");

    // Add custom headers from the route
    for h in &headers {
        if h.enabled && !h.key.is_empty() {
            response = response.header(&h.key, &h.value);
        }
    }

    // Ensure Content-Type is set
    let has_content_type = headers.iter().any(|h| h.enabled && h.key.to_lowercase() == "content-type");
    if !has_content_type {
        response = response.header("Content-Type", "application/json");
    }

    // Emit log entry
    let log = MockRequestLog {
        id: uuid::Uuid::new_v4().to_string(),
        timestamp: chrono::Utc::now().timestamp_millis(),
        method: method.clone(),
        path: path.clone(),
        matched_route_id,
        status_code: status_code as i32,
        duration,
    };
    let _ = app.emit("mockLogAdded", serde_json::json!({ "data": &log }));

    // Handle OPTIONS preflight
    if method == "OPTIONS" {
        return Ok(response
            .body(Full::new(bytes::Bytes::new()))
            .unwrap());
    }

    Ok(response
        .body(Full::new(bytes::Bytes::from(body)))
        .unwrap())
}

/// Match a route path pattern against a request path
/// Supports :param style parameters (e.g., /users/:id matches /users/123)
fn match_path(pattern: &str, path: &str) -> bool {
    let pattern_parts: Vec<&str> = pattern.split('/').filter(|s| !s.is_empty()).collect();
    let path_parts: Vec<&str> = path.split('/').filter(|s| !s.is_empty()).collect();

    if pattern_parts.len() != path_parts.len() {
        return false;
    }

    for (p, r) in pattern_parts.iter().zip(path_parts.iter()) {
        if p.starts_with(':') {
            continue; // Wildcard param, matches anything
        }
        if *p != *r {
            return false;
        }
    }

    true
}

/// Extract path parameter values from a matched route
fn extract_path_params(pattern: &str, path: &str) -> HashMap<String, String> {
    let mut params = HashMap::new();
    let pattern_parts: Vec<&str> = pattern.split('/').filter(|s| !s.is_empty()).collect();
    let path_parts: Vec<&str> = path.split('/').filter(|s| !s.is_empty()).collect();

    for (p, r) in pattern_parts.iter().zip(path_parts.iter()) {
        if p.starts_with(':') {
            let name = &p[1..];
            params.insert(name.to_string(), r.to_string());
        }
    }

    params
}

/// Substitute {{paramName}} placeholders in a response body
fn substitute_params(body: &str, params: &HashMap<String, String>) -> String {
    let mut result = body.to_string();
    for (key, value) in params {
        let placeholder = format!("{{{{{}}}}}", key);
        result = result.replace(&placeholder, value);
    }
    result
}
