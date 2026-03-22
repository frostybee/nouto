// Benchmark command handlers for Tauri
// Runs N concurrent requests for a given duration, collecting latency statistics

use crate::models::types::{
    AuthState, AuthType, BenchmarkConfig, BenchmarkIteration, BenchmarkResult,
    BenchmarkStatistics, DistributionBucket, HttpMethod, KeyValue,
};
use crate::services::http_client::{HttpClient, HttpRequestConfig};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use tauri::{AppHandle, Emitter};

/// Registry for cancelling in-flight benchmarks (newtype to avoid Tauri manage collision)
pub struct BenchmarkRegistry(pub Arc<AtomicBool>);

pub fn init_benchmark_registry() -> BenchmarkRegistry {
    BenchmarkRegistry(Arc::new(AtomicBool::new(false)))
}

/// Payload for start_benchmark command
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StartBenchmarkData {
    pub config: BenchmarkConfig,
    pub method: String,
    pub url: String,
    #[serde(default)]
    pub headers: Vec<KeyValue>,
    #[serde(default)]
    pub params: Vec<KeyValue>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub body: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub auth: Option<AuthState>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub request_name: Option<String>,
}

/// Start a benchmark: run N requests with concurrency, emitting progress events
#[tauri::command]
pub async fn start_benchmark(
    data: StartBenchmarkData,
    app: AppHandle,
    registry: tauri::State<'_, BenchmarkRegistry>,
) -> Result<(), String> {
    // Reset cancellation flag
    registry.0.store(false, Ordering::SeqCst);
    let cancelled = registry.0.clone();

    let config = data.config.clone();
    let total_iterations = config.iterations;
    let concurrency = config.concurrency.max(1);
    let delay_ms = config.delay_between_ms;

    let request_name = data.request_name.clone().unwrap_or_default();
    let request_url = data.url.clone();
    let request_method = data.method.clone();

    // Build HTTP config from request data
    let http_config = build_benchmark_config(&data);

    tokio::spawn(async move {
        let http_client = match HttpClient::new() {
            Ok(c) => c,
            Err(e) => {
                let _ = app.emit("benchmarkCancelled", serde_json::json!({
                    "data": {}
                }));
                eprintln!("[Nouto Benchmark] Failed to create HTTP client: {}", e);
                return;
            }
        };

        let started_at = chrono::Utc::now().to_rfc3339();
        let mut iterations: Vec<BenchmarkIteration> = Vec::new();
        let mut completed = 0usize;

        if concurrency <= 1 {
            // Sequential mode
            for i in 0..total_iterations {
                if cancelled.load(Ordering::SeqCst) {
                    break;
                }

                let start = std::time::Instant::now();
                let result = http_client
                    .execute(http_config.clone(), None::<fn(usize, Option<u64>)>)
                    .await;
                let duration = start.elapsed().as_millis() as i64;

                let iteration = match result {
                    Ok(response) => BenchmarkIteration {
                        iteration: i + 1,
                        status: response.status,
                        status_text: response.status_text,
                        duration,
                        size: response.size,
                        success: response.error.is_none() || !response.error.unwrap_or(false),
                        error: None,
                        timestamp: chrono::Utc::now().timestamp_millis(),
                    },
                    Err(e) => BenchmarkIteration {
                        iteration: i + 1,
                        status: 0,
                        status_text: "Error".to_string(),
                        duration,
                        size: 0,
                        success: false,
                        error: Some(e),
                        timestamp: chrono::Utc::now().timestamp_millis(),
                    },
                };

                // Emit iteration result
                let _ = app.emit("benchmarkIterationComplete", serde_json::json!({
                    "data": &iteration
                }));

                iterations.push(iteration);
                completed += 1;

                // Emit progress
                let _ = app.emit("benchmarkProgress", serde_json::json!({
                    "data": { "current": completed, "total": total_iterations }
                }));

                // Delay between iterations
                if delay_ms > 0 && i < total_iterations - 1 {
                    tokio::time::sleep(tokio::time::Duration::from_millis(delay_ms as u64)).await;
                }
            }
        } else {
            // Concurrent mode: process in chunks
            let mut remaining = total_iterations;
            let mut iter_num = 0usize;

            while remaining > 0 && !cancelled.load(Ordering::SeqCst) {
                let chunk_size = remaining.min(concurrency);
                let mut handles = Vec::new();

                for _ in 0..chunk_size {
                    iter_num += 1;
                    let client = match HttpClient::new() {
                        Ok(c) => c,
                        Err(_) => continue,
                    };
                    let cfg = http_config.clone();
                    let num = iter_num;

                    handles.push(tokio::spawn(async move {
                        let start = std::time::Instant::now();
                        let result = client
                            .execute(cfg, None::<fn(usize, Option<u64>)>)
                            .await;
                        let duration = start.elapsed().as_millis() as i64;

                        match result {
                            Ok(response) => BenchmarkIteration {
                                iteration: num,
                                status: response.status,
                                status_text: response.status_text,
                                duration,
                                size: response.size,
                                success: response.error.is_none() || !response.error.unwrap_or(false),
                                error: None,
                                timestamp: chrono::Utc::now().timestamp_millis(),
                            },
                            Err(e) => BenchmarkIteration {
                                iteration: num,
                                status: 0,
                                status_text: "Error".to_string(),
                                duration,
                                size: 0,
                                success: false,
                                error: Some(e),
                                timestamp: chrono::Utc::now().timestamp_millis(),
                            },
                        }
                    }));
                }

                // Collect results
                for handle in handles {
                    if let Ok(iteration) = handle.await {
                        let _ = app.emit("benchmarkIterationComplete", serde_json::json!({
                            "data": &iteration
                        }));
                        iterations.push(iteration);
                        completed += 1;

                        let _ = app.emit("benchmarkProgress", serde_json::json!({
                            "data": { "current": completed, "total": total_iterations }
                        }));
                    }
                }

                remaining -= chunk_size;

                // Delay between chunks
                if delay_ms > 0 && remaining > 0 {
                    tokio::time::sleep(tokio::time::Duration::from_millis(delay_ms as u64)).await;
                }
            }
        }

        // Check if cancelled
        if cancelled.load(Ordering::SeqCst) {
            let _ = app.emit("benchmarkCancelled", serde_json::json!({
                "data": {}
            }));
            return;
        }

        // Calculate statistics
        let statistics = calculate_statistics(&iterations);
        let distribution = calculate_distribution(&iterations);

        let result = BenchmarkResult {
            request_name,
            url: request_url,
            method: HttpMethod(request_method),
            config,
            started_at,
            completed_at: chrono::Utc::now().to_rfc3339(),
            statistics,
            iterations: iterations.clone(),
            distribution,
        };

        let _ = app.emit("benchmarkComplete", serde_json::json!({
            "data": &result
        }));
    });

    Ok(())
}

/// Cancel the current benchmark
#[tauri::command]
pub async fn cancel_benchmark(
    registry: tauri::State<'_, BenchmarkRegistry>,
) -> Result<(), String> {
    registry.0.store(true, Ordering::SeqCst);
    Ok(())
}

/// Build HTTP request config from benchmark data
fn build_benchmark_config(data: &StartBenchmarkData) -> HttpRequestConfig {
    let mut headers_map: HashMap<String, String> = HashMap::new();
    let mut params_map: HashMap<String, String> = HashMap::new();

    for h in &data.headers {
        if h.enabled && !h.key.is_empty() {
            headers_map.insert(h.key.clone(), h.value.clone());
        }
    }

    for p in &data.params {
        if p.enabled && !p.key.is_empty() {
            params_map.insert(p.key.clone(), p.value.clone());
        }
    }

    // Handle auth
    let auth = data.auth.clone().unwrap_or_default();

    let (auth_username, auth_password, bearer_token) = match auth.auth_type {
        AuthType::Basic => (auth.username.clone(), auth.password.clone(), None),
        AuthType::Bearer | AuthType::OAuth2 => (None, None, auth.token.clone()),
        AuthType::ApiKey => {
            if let (Some(name), Some(value)) = (&auth.api_key_name, &auth.api_key_value) {
                if auth.api_key_in.as_deref() == Some("query") {
                    params_map.insert(name.clone(), value.clone());
                } else {
                    headers_map.insert(name.clone(), value.clone());
                }
            }
            (None, None, None)
        }
        _ => (None, None, None),
    };

    // Parse body
    let (body_content, body_type) = if let Some(body) = &data.body {
        let btype = body.get("type").and_then(|v| v.as_str()).unwrap_or("none");
        let content = body.get("content").and_then(|v| v.as_str()).map(|s| s.to_string());

        match btype {
            "json" => {
                if let Some(c) = &content {
                    headers_map.entry("Content-Type".to_string()).or_insert("application/json".to_string());
                    (Some(c.clone()), "json".to_string())
                } else { (None, "none".to_string()) }
            }
            "text" => {
                if let Some(c) = &content {
                    headers_map.entry("Content-Type".to_string()).or_insert("text/plain".to_string());
                    (Some(c.clone()), "text".to_string())
                } else { (None, "none".to_string()) }
            }
            _ => (None, "none".to_string()),
        }
    } else {
        (None, "none".to_string())
    };

    let headers_vec: Vec<KeyValue> = headers_map.into_iter().map(|(key, value)| KeyValue {
        id: uuid::Uuid::new_v4().to_string(), key, value, enabled: true,
    }).collect();

    let params_vec: Vec<KeyValue> = params_map.into_iter().map(|(key, value)| KeyValue {
        id: uuid::Uuid::new_v4().to_string(), key, value, enabled: true,
    }).collect();

    HttpRequestConfig {
        method: HttpMethod(data.method.clone()),
        url: data.url.clone(),
        headers: headers_vec,
        params: params_vec,
        body: body_content,
        body_bytes: None,
        body_type,
        timeout_ms: 30000,
        follow_redirects: true,
        max_redirects: 10,
        auth_username,
        auth_password,
        bearer_token,
        ssl: None,
        proxy: None,
    }
}

/// Calculate statistics from benchmark iterations
fn calculate_statistics(iterations: &[BenchmarkIteration]) -> BenchmarkStatistics {
    if iterations.is_empty() {
        return BenchmarkStatistics {
            total_iterations: 0, success_count: 0, fail_count: 0,
            min: 0.0, max: 0.0, mean: 0.0, median: 0.0,
            p50: 0.0, p75: 0.0, p90: 0.0, p95: 0.0, p99: 0.0,
            total_duration: 0, requests_per_second: 0.0,
        };
    }

    let mut durations: Vec<f64> = iterations.iter().map(|i| i.duration as f64).collect();
    durations.sort_by(|a, b| a.partial_cmp(b).unwrap());

    let total = durations.len();
    let success_count = iterations.iter().filter(|i| i.success).count();
    let fail_count = total - success_count;
    let sum: f64 = durations.iter().sum();
    let total_duration = sum as i64;

    let min = durations.first().copied().unwrap_or(0.0);
    let max = durations.last().copied().unwrap_or(0.0);
    let mean = sum / total as f64;

    let percentile = |p: f64| -> f64 {
        let idx = ((p / 100.0) * (total - 1) as f64).round() as usize;
        durations[idx.min(total - 1)]
    };

    let median = percentile(50.0);
    let rps = if total_duration > 0 {
        (total as f64 / total_duration as f64) * 1000.0
    } else {
        0.0
    };

    BenchmarkStatistics {
        total_iterations: total,
        success_count,
        fail_count,
        min, max, mean, median,
        p50: percentile(50.0),
        p75: percentile(75.0),
        p90: percentile(90.0),
        p95: percentile(95.0),
        p99: percentile(99.0),
        total_duration,
        requests_per_second: rps,
    }
}

/// Calculate distribution buckets from benchmark iterations
fn calculate_distribution(iterations: &[BenchmarkIteration]) -> Vec<DistributionBucket> {
    if iterations.is_empty() {
        return Vec::new();
    }

    let durations: Vec<f64> = iterations.iter().map(|i| i.duration as f64).collect();
    let min = durations.iter().cloned().fold(f64::INFINITY, f64::min);
    let max = durations.iter().cloned().fold(f64::NEG_INFINITY, f64::max);

    if (max - min).abs() < 1.0 {
        return vec![DistributionBucket {
            bucket: format!("{}ms", min as i64),
            count: iterations.len(),
        }];
    }

    let num_buckets = 10;
    let step = (max - min) / num_buckets as f64;
    let mut buckets = Vec::new();

    for i in 0..num_buckets {
        let low = min + step * i as f64;
        let high = low + step;
        let count = durations.iter().filter(|&&d| {
            if i == num_buckets - 1 { d >= low } else { d >= low && d < high }
        }).count();
        buckets.push(DistributionBucket {
            bucket: format!("{}-{}ms", low as i64, high as i64),
            count,
        });
    }

    buckets
}
