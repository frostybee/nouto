// Script Engine - QuickJS-based JavaScript execution for pre-request and post-response scripts
// Uses rquickjs for sandboxed JS execution with a limited API surface.
// The scripting API is exposed as `nt.*` (e.g. nt.request, nt.response, nt.test).

use rquickjs::{Runtime, Context, Function, Object, Value as JsValue, FromJs, function::{Rest, Opt}};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

/// Result of executing a script
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ScriptResult {
    pub logs: Vec<ScriptLogEntry>,
    pub test_results: Vec<ScriptTestResult>,
    pub variables_to_set: Vec<VariableToSet>,
    pub modified_request: Option<Value>,
    pub next_request: Option<String>,
    pub error: Option<String>,
    pub cookie_mutations: Vec<CookieMutation>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScriptLogEntry {
    pub level: String,  // "log", "warn", "error", "info"
    pub message: String,
    pub timestamp: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScriptTestResult {
    pub name: String,
    pub passed: bool,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VariableToSet {
    pub key: String,
    pub value: String,
    #[serde(default = "default_scope")]
    pub scope: String,
}

fn default_scope() -> String { "environment".to_string() }

/// A cookie passed into a script as a snapshot of the active cookie jar
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScriptCookie {
    pub name: String,
    pub value: String,
    pub domain: String,
    pub path: String,
    pub expires: Option<i64>,
    pub http_only: Option<bool>,
    pub secure: Option<bool>,
    pub same_site: Option<String>,
}

/// A mutation to the cookie jar requested by a script
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum CookieMutation {
    #[serde(rename = "set")]
    Set { cookie: ScriptCookie },
    #[serde(rename = "delete")]
    Delete { domain: String, name: String },
    #[serde(rename = "clear")]
    Clear,
}

/// Script execution context data
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScriptContext {
    pub request: Value,
    pub response: Option<Value>,
    pub environment: Value,
    pub global_variables: Value,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub info: Option<Value>,
    #[serde(default)]
    pub cookies: Vec<ScriptCookie>,
}

pub struct ScriptEngine;

impl ScriptEngine {
    /// Execute a pre-request script
    pub async fn execute_pre_request(
        script: &str,
        context: &ScriptContext,
    ) -> ScriptResult {
        if script.trim().is_empty() {
            return ScriptResult::default();
        }
        Self::execute_script(script, context, false).await
    }

    /// Execute a post-response script
    pub async fn execute_post_response(
        script: &str,
        context: &ScriptContext,
    ) -> ScriptResult {
        if script.trim().is_empty() {
            return ScriptResult::default();
        }
        Self::execute_script(script, context, true).await
    }

    async fn execute_script(
        script: &str,
        context: &ScriptContext,
        is_post_response: bool,
    ) -> ScriptResult {
        let script = script.to_string();
        let context = context.clone();

        // Run in a blocking thread since QuickJS is synchronous
        let result = tokio::task::spawn_blocking(move || {
            Self::run_in_quickjs(&script, &context, is_post_response)
        }).await;

        match result {
            Ok(r) => r,
            Err(e) => ScriptResult {
                error: Some(format!("Script execution panicked: {}", e)),
                ..Default::default()
            },
        }
    }

    fn run_in_quickjs(
        script: &str,
        context: &ScriptContext,
        is_post_response: bool,
    ) -> ScriptResult {
        let logs = Arc::new(Mutex::new(Vec::<ScriptLogEntry>::new()));
        let test_results = Arc::new(Mutex::new(Vec::<ScriptTestResult>::new()));
        let variables = Arc::new(Mutex::new(Vec::<VariableToSet>::new()));
        let next_request = Arc::new(Mutex::new(None::<String>));
        let modified_request = Arc::new(Mutex::new(None::<Value>));
        let cookie_mutations_arc: Arc<Mutex<Vec<CookieMutation>>> = Arc::new(Mutex::new(Vec::new()));

        let rt = match Runtime::new() {
            Ok(r) => r,
            Err(e) => return ScriptResult {
                error: Some(format!("Failed to create JS runtime: {}", e)),
                ..Default::default()
            },
        };

        // Set memory limit (32MB) and interrupt handler (30s timeout)
        rt.set_memory_limit(32 * 1024 * 1024);
        let start_time = Instant::now();
        rt.set_interrupt_handler(Some(Box::new(move || {
            start_time.elapsed() > Duration::from_secs(30)
        })));

        let ctx = match Context::full(&rt) {
            Ok(c) => c,
            Err(e) => return ScriptResult {
                error: Some(format!("Failed to create JS context: {}", e)),
                ..Default::default()
            },
        };

        let exec_result = ctx.with(|ctx| -> Result<(), String> {
            let globals = ctx.globals();

            // Inject console (log, warn, error, info)
            let console_obj = Object::new(ctx.clone()).map_err(|e| e.to_string())?;
            for level in &["log", "warn", "error", "info"] {
                let logs_ref = logs.clone();
                let level_str = level.to_string();
                let fn_impl = Function::new(ctx.clone(), move |args: Rest<String>| {
                    let msg = args.0.join(" ");
                    if let Ok(mut l) = logs_ref.lock() {
                        l.push(ScriptLogEntry {
                            level: level_str.clone(),
                            message: msg,
                            timestamp: chrono::Utc::now().to_rfc3339(),
                        });
                    }
                }).map_err(|e| e.to_string())?;
                console_obj.set(*level, fn_impl).map_err(|e| e.to_string())?;
            }
            globals.set("console", console_obj).map_err(|e| e.to_string())?;

            // Inject nt object
            let nt_obj = Object::new(ctx.clone()).map_err(|e| e.to_string())?;

            // nt.request - mutable object with request data
            let req_json = serde_json::to_string(&context.request).unwrap_or("{}".into());
            let _: () = ctx.eval(format!(
                "var __nt_request = {};",
                req_json
            )).map_err(|e| e.to_string())?;
            // Add setHeader/removeHeader helpers via JS
            let _: () = ctx.eval(r#"
                __nt_request.setHeader = function(name, value) { this.headers[name] = value; };
                __nt_request.removeHeader = function(name) { delete this.headers[name]; };
            "#).map_err(|e| e.to_string())?;
            let req_val: JsValue = ctx.eval("__nt_request").map_err(|e| e.to_string())?;
            nt_obj.set("request", req_val).map_err(|e| e.to_string())?;

            // nt.response - response data (only for post-response scripts)
            if is_post_response {
                if let Some(ref resp) = context.response {
                    let resp_json = serde_json::to_string(resp).unwrap_or("{}".into());
                    let _: () = ctx.eval(format!(
                        "var __nt_response = {};",
                        resp_json
                    )).map_err(|e| e.to_string())?;
                    // Add json(), text(), header() helpers
                    let _: () = ctx.eval(r#"
                        __nt_response.json = function() {
                            if (typeof this.body === 'string') return JSON.parse(this.body);
                            return this.body;
                        };
                        __nt_response.text = function() {
                            if (typeof this.body === 'string') return this.body;
                            return JSON.stringify(this.body);
                        };
                        __nt_response.header = function(name) {
                            var lower = name.toLowerCase();
                            var headers = this.headers || {};
                            for (var key in headers) {
                                if (key.toLowerCase() === lower) return headers[key];
                            }
                            return undefined;
                        };
                    "#).map_err(|e| e.to_string())?;
                    let resp_val: JsValue = ctx.eval("__nt_response").map_err(|e| e.to_string())?;
                    nt_obj.set("response", resp_val).map_err(|e| e.to_string())?;
                }
            }

            // nt.getVar(key) -> string
            {
                let env = context.environment.clone();
                let global_vars = context.global_variables.clone();
                let get_var_fn = Function::new(ctx.clone(), move |key: String| -> Option<String> {
                    // Check environment variables first
                    if let Some(vars) = env.get("variables").and_then(|v| v.as_array()) {
                        for v in vars {
                            if v["key"].as_str() == Some(&key) && v["enabled"].as_bool().unwrap_or(true) {
                                return v["value"].as_str().map(|s| s.to_string());
                            }
                        }
                    }
                    // Then global variables
                    if let Some(vars) = global_vars.as_array() {
                        for v in vars {
                            if v["key"].as_str() == Some(&key) && v["enabled"].as_bool().unwrap_or(true) {
                                return v["value"].as_str().map(|s| s.to_string());
                            }
                        }
                    }
                    None
                }).map_err(|e| e.to_string())?;
                nt_obj.set("getVar", get_var_fn).map_err(|e| e.to_string())?;
            }

            // nt.setVar(key, value, scope?)
            {
                let vars_ref = variables.clone();
                let set_var_fn = Function::new(ctx.clone(), move |key: String, value: String, scope: Opt<String>| {
                    if let Ok(mut v) = vars_ref.lock() {
                        v.push(VariableToSet {
                            key,
                            value,
                            scope: scope.0.unwrap_or_else(|| "environment".into()),
                        });
                    }
                }).map_err(|e| e.to_string())?;
                nt_obj.set("setVar", set_var_fn).map_err(|e| e.to_string())?;
            }

            // nt.test(name, fn)
            {
                let tests_ref = test_results.clone();
                let test_fn = Function::new(ctx.clone(), move |name: String, callback: Function| {
                    let result: Result<(), rquickjs::Error> = callback.call(());
                    if let Ok(mut t) = tests_ref.lock() {
                        match result {
                            Ok(_) => t.push(ScriptTestResult {
                                name,
                                passed: true,
                                error: None,
                            }),
                            Err(e) => t.push(ScriptTestResult {
                                name,
                                passed: false,
                                error: Some(e.to_string()),
                            }),
                        }
                    }
                }).map_err(|e| e.to_string())?;
                nt_obj.set("test", test_fn).map_err(|e| e.to_string())?;
            }

            // nt.uuid()
            {
                let uuid_fn = Function::new(ctx.clone(), move || -> String {
                    uuid::Uuid::new_v4().to_string()
                }).map_err(|e| e.to_string())?;
                nt_obj.set("uuid", uuid_fn).map_err(|e| e.to_string())?;
            }

            // nt.base64 object
            {
                let b64_obj = Object::new(ctx.clone()).map_err(|e| e.to_string())?;
                let encode_fn = Function::new(ctx.clone(), move |input: String| -> String {
                    use base64::Engine;
                    base64::engine::general_purpose::STANDARD.encode(input.as_bytes())
                }).map_err(|e| e.to_string())?;
                let decode_fn = Function::new(ctx.clone(), move |input: String| -> String {
                    use base64::Engine;
                    match base64::engine::general_purpose::STANDARD.decode(input.as_bytes()) {
                        Ok(bytes) => String::from_utf8_lossy(&bytes).to_string(),
                        Err(_) => String::new(),
                    }
                }).map_err(|e| e.to_string())?;
                b64_obj.set("encode", encode_fn).map_err(|e| e.to_string())?;
                b64_obj.set("decode", decode_fn).map_err(|e| e.to_string())?;
                nt_obj.set("base64", b64_obj).map_err(|e| e.to_string())?;
            }

            // nt.hash object (md5 + sha256)
            {
                let hash_obj = Object::new(ctx.clone()).map_err(|e| e.to_string())?;
                let md5_fn = Function::new(ctx.clone(), move |input: String| -> String {
                    use md5::{Md5, Digest};
                    let result = Md5::digest(input.as_bytes());
                    hex::encode(result)
                }).map_err(|e| e.to_string())?;
                let sha256_fn = Function::new(ctx.clone(), move |input: String| -> String {
                    use sha2::{Sha256, Digest};
                    let result = Sha256::digest(input.as_bytes());
                    hex::encode(result)
                }).map_err(|e| e.to_string())?;
                hash_obj.set("md5", md5_fn).map_err(|e| e.to_string())?;
                hash_obj.set("sha256", sha256_fn).map_err(|e| e.to_string())?;
                nt_obj.set("hash", hash_obj).map_err(|e| e.to_string())?;
            }

            // nt.random object (int, float, string, boolean)
            {
                let random_obj = Object::new(ctx.clone()).map_err(|e| e.to_string())?;
                let int_fn = Function::new(ctx.clone(), move |min: i64, max: i64| -> i64 {
                    use rand::Rng;
                    rand::rng().random_range(min..=max)
                }).map_err(|e| e.to_string())?;
                let float_fn = Function::new(ctx.clone(), move |min: f64, max: f64| -> f64 {
                    use rand::Rng;
                    rand::rng().random_range(min..max)
                }).map_err(|e| e.to_string())?;
                let string_fn = Function::new(ctx.clone(), move |length: usize| -> String {
                    use rand::Rng;
                    let chars = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
                    let mut rng = rand::rng();
                    (0..length).map(|_| chars[rng.random_range(0..chars.len())] as char).collect()
                }).map_err(|e| e.to_string())?;
                let bool_fn = Function::new(ctx.clone(), move || -> bool {
                    use rand::Rng;
                    rand::rng().random_bool(0.5)
                }).map_err(|e| e.to_string())?;
                random_obj.set("int", int_fn).map_err(|e| e.to_string())?;
                random_obj.set("float", float_fn).map_err(|e| e.to_string())?;
                random_obj.set("string", string_fn).map_err(|e| e.to_string())?;
                random_obj.set("boolean", bool_fn).map_err(|e| e.to_string())?;
                nt_obj.set("random", random_obj).map_err(|e| e.to_string())?;
            }

            // nt.timestamp object (unix, unixMs, iso)
            {
                let ts_obj = Object::new(ctx.clone()).map_err(|e| e.to_string())?;
                let unix_fn = Function::new(ctx.clone(), move || -> i64 {
                    chrono::Utc::now().timestamp()
                }).map_err(|e| e.to_string())?;
                let unix_ms_fn = Function::new(ctx.clone(), move || -> i64 {
                    chrono::Utc::now().timestamp_millis()
                }).map_err(|e| e.to_string())?;
                let iso_fn = Function::new(ctx.clone(), move || -> String {
                    chrono::Utc::now().to_rfc3339()
                }).map_err(|e| e.to_string())?;
                ts_obj.set("unix", unix_fn).map_err(|e| e.to_string())?;
                ts_obj.set("unixMs", unix_ms_fn).map_err(|e| e.to_string())?;
                ts_obj.set("iso", iso_fn).map_err(|e| e.to_string())?;
                nt_obj.set("timestamp", ts_obj).map_err(|e| e.to_string())?;
            }

            // nt.delay(ms) - synchronous sleep capped at 25s to leave headroom within the 30s script timeout
            {
                let logs_ref = logs.clone();
                let delay_fn = Function::new(ctx.clone(), move |ms: u64| {
                    let capped = ms.min(25_000);
                    if ms > 25_000 {
                        if let Ok(mut l) = logs_ref.lock() {
                            l.push(ScriptLogEntry {
                                level: "warn".to_string(),
                                message: format!(
                                    "nt.delay: {}ms exceeds the 25000ms cap; sleeping 25000ms",
                                    ms
                                ),
                                timestamp: chrono::Utc::now().to_rfc3339(),
                            });
                        }
                    }
                    std::thread::sleep(std::time::Duration::from_millis(capped));
                }).map_err(|e| e.to_string())?;
                nt_obj.set("delay", delay_fn).map_err(|e| e.to_string())?;
            }

            // nt.sendRequest(config) - synchronous HTTP request from within scripts
            // Supports: method, url, headers, body, auth, ssl, proxy, timeout
            {
                let send_fn = Function::new(ctx.clone(), move |config_str: String| -> String {
                    let config: Value = match serde_json::from_str(&config_str) {
                        Ok(v) => v,
                        Err(e) => return serde_json::json!({ "error": e.to_string() }).to_string(),
                    };

                    let method = config["method"].as_str().unwrap_or("GET").to_uppercase();
                    let url = config["url"].as_str().unwrap_or("");
                    if url.is_empty() {
                        return serde_json::json!({ "error": "URL is required" }).to_string();
                    }

                    // Configurable timeout (default 30s)
                    let timeout_ms = config["timeout"].as_u64().unwrap_or(30_000);

                    let mut client_builder = reqwest::blocking::Client::builder()
                        .timeout(std::time::Duration::from_millis(timeout_ms));

                    // SSL: skip certificate verification if requested
                    if let Some(ssl) = config["ssl"].as_object() {
                        if ssl.get("rejectUnauthorized").and_then(|v| v.as_bool()) == Some(false) {
                            client_builder = client_builder.danger_accept_invalid_certs(true);
                        }
                    }

                    // Proxy configuration
                    if let Some(proxy_cfg) = config["proxy"].as_object() {
                        let host = proxy_cfg.get("host").and_then(|v| v.as_str()).unwrap_or("");
                        let port = proxy_cfg.get("port").and_then(|v| v.as_u64()).unwrap_or(8080);
                        let protocol = proxy_cfg.get("protocol").and_then(|v| v.as_str()).unwrap_or("http");
                        if !host.is_empty() {
                            let proxy_url = format!("{}://{}:{}", protocol, host, port);
                            if let Ok(mut proxy) = reqwest::Proxy::all(&proxy_url) {
                                let proxy_user = proxy_cfg.get("username").and_then(|v| v.as_str());
                                let proxy_pass = proxy_cfg.get("password").and_then(|v| v.as_str());
                                if let (Some(u), Some(p)) = (proxy_user, proxy_pass) {
                                    proxy = proxy.basic_auth(u, p);
                                }
                                client_builder = client_builder.proxy(proxy);
                            }
                        }
                    }

                    let client = match client_builder.build() {
                        Ok(c) => c,
                        Err(e) => return serde_json::json!({ "error": e.to_string() }).to_string(),
                    };

                    let mut builder = match method.as_str() {
                        "GET" => client.get(url),
                        "POST" => client.post(url),
                        "PUT" => client.put(url),
                        "PATCH" => client.patch(url),
                        "DELETE" => client.delete(url),
                        "HEAD" => client.head(url),
                        "OPTIONS" => client.request(reqwest::Method::OPTIONS, url),
                        _ => client.get(url),
                    };

                    // Headers
                    if let Some(headers) = config["headers"].as_object() {
                        for (k, v) in headers {
                            if let Some(val) = v.as_str() {
                                builder = builder.header(k.as_str(), val);
                            }
                        }
                    }

                    // Basic Auth
                    if let Some(auth) = config["auth"].as_object() {
                        let username = auth.get("username").and_then(|v| v.as_str()).unwrap_or("");
                        let password = auth.get("password").and_then(|v| v.as_str()).unwrap_or("");
                        if !username.is_empty() {
                            builder = builder.basic_auth(username, Some(password));
                        }
                    }

                    // Body: support both string and JSON object
                    if let Some(body_str) = config["body"].as_str() {
                        builder = builder.body(body_str.to_string());
                    } else if !config["body"].is_null() {
                        builder = builder.body(config["body"].to_string());
                    }

                    // Execute with timing
                    let start = std::time::Instant::now();
                    match builder.send() {
                        Ok(resp) => {
                            let status = resp.status().as_u16();
                            let status_text = resp.status().canonical_reason().unwrap_or("").to_string();
                            let headers: std::collections::HashMap<String, String> = resp.headers()
                                .iter()
                                .map(|(k, v)| (k.to_string(), v.to_str().unwrap_or("").to_string()))
                                .collect();
                            let body = resp.text().unwrap_or_default();
                            let duration = start.elapsed().as_millis() as u64;

                            serde_json::json!({
                                "status": status,
                                "statusText": status_text,
                                "headers": headers,
                                "body": body,
                                "duration": duration,
                            }).to_string()
                        }
                        Err(e) => serde_json::json!({ "error": e.to_string() }).to_string(),
                    }
                }).map_err(|e| e.to_string())?;
                nt_obj.set("sendRequest", send_fn).map_err(|e| e.to_string())?;

                // Inject a JS wrapper that parses the JSON result and adds helper methods
                let _: () = ctx.eval(r#"
                    var __nt_sendRequest_raw = nt.sendRequest;
                    nt.sendRequest = function(config) {
                        var result = __nt_sendRequest_raw(JSON.stringify(config));
                        var parsed = JSON.parse(result);
                        if (!parsed.error) {
                            parsed.json = function() {
                                try { return JSON.parse(this.body); }
                                catch(e) { return null; }
                            };
                            parsed.text = function() { return this.body; };
                        }
                        return parsed;
                    };
                "#).map_err(|e| e.to_string())?;
            }

            // nt.setNextRequest(nameOrId)
            {
                let next_ref = next_request.clone();
                let set_next_fn = Function::new(ctx.clone(), move |name: String| {
                    if let Ok(mut n) = next_ref.lock() {
                        *n = Some(name);
                    }
                }).map_err(|e| e.to_string())?;
                nt_obj.set("setNextRequest", set_next_fn).map_err(|e| e.to_string())?;
            }

            // nt.cookies - snapshot-in / mutations-out cookie API
            // Raw Rust functions are registered globally as __nt_cookies_*, then a JS shim
            // wraps them into nt.cookies with JSON.parse() for array return values.
            {
                let cookie_snapshot: Arc<Mutex<Vec<ScriptCookie>>> =
                    Arc::new(Mutex::new(context.cookies.clone()));

                // __nt_cookies_getAllJson() -> JSON string of all cookies
                {
                    let snap = cookie_snapshot.clone();
                    let f = Function::new(ctx.clone(), move || -> String {
                        let cookies = snap.lock().unwrap_or_else(|e| e.into_inner());
                        serde_json::to_string(&*cookies).unwrap_or_else(|_| "[]".to_string())
                    }).map_err(|e| e.to_string())?;
                    globals.set("__nt_cookies_getAllJson", f).map_err(|e| e.to_string())?;
                }

                // __nt_cookies_getJson(name) -> JSON string of first matching cookie or "null"
                {
                    let snap = cookie_snapshot.clone();
                    let f = Function::new(ctx.clone(), move |name: String| -> String {
                        let cookies = snap.lock().unwrap_or_else(|e| e.into_inner());
                        let found = cookies.iter().find(|c| c.name == name);
                        serde_json::to_string(&found).unwrap_or_else(|_| "null".to_string())
                    }).map_err(|e| e.to_string())?;
                    globals.set("__nt_cookies_getJson", f).map_err(|e| e.to_string())?;
                }

                // __nt_cookies_getByUrlJson(url) -> JSON string of cookies matching domain + path
                {
                    let snap = cookie_snapshot.clone();
                    let f = Function::new(ctx.clone(), move |url: String| -> String {
                        let cookies = snap.lock().unwrap_or_else(|e| e.into_inner());
                        let after_scheme = url.split("://").nth(1).unwrap_or(&url).to_string();
                        let host = after_scheme.split(['/', '?', '#']).next().unwrap_or("").to_lowercase();
                        let path_start = after_scheme.find('/').unwrap_or(after_scheme.len());
                        let path_part = &after_scheme[path_start..];
                        let path_part = if path_part.is_empty() { "/" } else { path_part };
                        let matched: Vec<&ScriptCookie> = cookies.iter().filter(|c| {
                            let domain = c.domain.trim_start_matches('.').to_lowercase();
                            let domain_match = host == domain || host.ends_with(&format!(".{}", domain));
                            let path_match = path_part.starts_with(&c.path);
                            domain_match && path_match
                        }).collect();
                        serde_json::to_string(&matched).unwrap_or_else(|_| "[]".to_string())
                    }).map_err(|e| e.to_string())?;
                    globals.set("__nt_cookies_getByUrlJson", f).map_err(|e| e.to_string())?;
                }

                // __nt_cookies_set(cookieJson) — updates snapshot, pushes Set mutation
                {
                    let snap = cookie_snapshot.clone();
                    let muts = cookie_mutations_arc.clone();
                    let f = Function::new(ctx.clone(), move |cookie_json: String| {
                        if let Ok(cookie) = serde_json::from_str::<ScriptCookie>(&cookie_json) {
                            if let Ok(mut cookies) = snap.lock() {
                                if let Some(existing) = cookies.iter_mut()
                                    .find(|c| c.name == cookie.name && c.domain == cookie.domain)
                                {
                                    *existing = cookie.clone();
                                } else {
                                    cookies.push(cookie.clone());
                                }
                            }
                            if let Ok(mut m) = muts.lock() {
                                m.push(CookieMutation::Set { cookie });
                            }
                        }
                    }).map_err(|e| e.to_string())?;
                    globals.set("__nt_cookies_set", f).map_err(|e| e.to_string())?;
                }

                // __nt_cookies_delete(domain, name) — removes from snapshot, pushes Delete mutation
                {
                    let snap = cookie_snapshot.clone();
                    let muts = cookie_mutations_arc.clone();
                    let f = Function::new(ctx.clone(), move |domain: String, name: String| {
                        if let Ok(mut cookies) = snap.lock() {
                            cookies.retain(|c| !(c.name == name && c.domain == domain));
                        }
                        if let Ok(mut m) = muts.lock() {
                            m.push(CookieMutation::Delete { domain, name });
                        }
                    }).map_err(|e| e.to_string())?;
                    globals.set("__nt_cookies_delete", f).map_err(|e| e.to_string())?;
                }

                // __nt_cookies_clear() — empties snapshot, pushes Clear mutation
                {
                    let snap = cookie_snapshot.clone();
                    let muts = cookie_mutations_arc.clone();
                    let f = Function::new(ctx.clone(), move || {
                        if let Ok(mut cookies) = snap.lock() { cookies.clear(); }
                        if let Ok(mut m) = muts.lock() { m.push(CookieMutation::Clear); }
                    }).map_err(|e| e.to_string())?;
                    globals.set("__nt_cookies_clear", f).map_err(|e| e.to_string())?;
                }

                // JS shim: wrap raw functions into nt.cookies with JSON.parse() for object returns
                let _: () = ctx.eval(r#"
                    globalThis.__nt_cookies = {
                        getAll: function() { return JSON.parse(__nt_cookies_getAllJson()); },
                        get: function(name) { return JSON.parse(__nt_cookies_getJson(name)); },
                        getByUrl: function(url) { return JSON.parse(__nt_cookies_getByUrlJson(url)); },
                        set: function(cookie) { __nt_cookies_set(JSON.stringify(cookie)); },
                        delete: function(domain, name) { __nt_cookies_delete(domain, name); },
                        clear: function() { __nt_cookies_clear(); },
                    };
                "#).map_err(|e| e.to_string())?;

                let cookies_obj: Object = globals.get("__nt_cookies").map_err(|e| e.to_string())?;
                nt_obj.set("cookies", cookies_obj).map_err(|e| e.to_string())?;
            }

            globals.set("nt", nt_obj).map_err(|e| e.to_string())?;

            // Inject nt.env and nt.globals convenience aliases via JS
            let _: () = ctx.eval(r#"
                nt.env = {
                    get: function(key) { return nt.getVar(key); },
                    set: function(key, value) { return nt.setVar(key, value, 'environment'); }
                };
                nt.globals = {
                    get: function(key) { return nt.getVar(key); },
                    set: function(key, value) { return nt.setVar(key, value, 'global'); }
                };
            "#).map_err(|e| e.to_string())?;

            // Inject nt.info if provided
            if let Some(ref info) = context.info {
                let info_json = serde_json::to_string(info).unwrap_or("{}".into());
                let _: () = ctx.eval(format!("nt.info = {};", info_json)).map_err(|e| e.to_string())?;
            }

            // Inject chai-like expect shim
            let _: () = ctx.eval(EXPECT_SHIM).map_err(|e| format!("expect shim error: {}", e))?;
            let _: () = ctx.eval(ASSERT_SHIM).map_err(|e| format!("assert shim error: {}", e))?;

            // Execute the user script
            let _: () = ctx.eval(script).map_err(|e| format!("Script error: {}", e))?;

            // If pre-request, capture modified request
            if !is_post_response {
                let modified: JsValue = ctx.eval("JSON.stringify(__nt_request)").map_err(|e| e.to_string())?;
                if let Ok(json_str) = String::from_js(&ctx, modified) {
                    if let Ok(parsed) = serde_json::from_str::<Value>(&json_str) {
                        if let Ok(mut m) = modified_request.lock() {
                            *m = Some(parsed);
                        }
                    }
                }
            }

            Ok(())
        });

        let error = match exec_result {
            Ok(()) => None,
            Err(e) => Some(e),
        };

        ScriptResult {
            logs: Arc::try_unwrap(logs).unwrap_or_default().into_inner().unwrap_or_default(),
            test_results: Arc::try_unwrap(test_results).unwrap_or_default().into_inner().unwrap_or_default(),
            variables_to_set: Arc::try_unwrap(variables).unwrap_or_default().into_inner().unwrap_or_default(),
            modified_request: Arc::try_unwrap(modified_request).unwrap_or_default().into_inner().unwrap_or_default(),
            next_request: Arc::try_unwrap(next_request).unwrap_or_default().into_inner().unwrap_or_default(),
            cookie_mutations: Arc::try_unwrap(cookie_mutations_arc).unwrap_or_default().into_inner().unwrap_or_default(),
            error,
        }
    }
}

/// Chai-like `expect` shim injected into every script context
const EXPECT_SHIM: &str = r#"
function expect(val) {
    var _not = false;
    var obj = {
        get not() { _not = !_not; return obj; },
        get to() { return obj; },
        get be() { return obj; },
        get a() { return obj; },
        get an() { return obj; },
        get is() { return obj; },
        get has() { return obj; },
        get have() { return obj; },
        get been() { return obj; },
        get that() { return obj; },
        get which() { return obj; },
        get and() { return obj; },

        equal: function(exp) {
            var negated = _not; _not = false;
            var pass = val === exp;
            if (negated) pass = !pass;
            if (!pass) throw new Error('Expected ' + JSON.stringify(val) + (negated ? ' not' : '') + ' to equal ' + JSON.stringify(exp));
            return obj;
        },
        equals: function(exp) { return obj.equal(exp); },
        eql: function(exp) {
            var negated = _not; _not = false;
            var pass = JSON.stringify(val) === JSON.stringify(exp);
            if (negated) pass = !pass;
            if (!pass) throw new Error('Expected deep equality');
            return obj;
        },
        include: function(item) {
            var negated = _not; _not = false;
            var pass;
            if (typeof val === 'string') pass = val.indexOf(item) >= 0;
            else if (Array.isArray(val)) pass = val.indexOf(item) >= 0;
            else pass = false;
            if (negated) pass = !pass;
            if (!pass) throw new Error('Expected ' + JSON.stringify(val) + (negated ? ' not' : '') + ' to include ' + JSON.stringify(item));
            return obj;
        },
        contains: function(item) { return obj.include(item); },
        above: function(n) {
            var negated = _not; _not = false;
            var pass = val > n;
            if (negated) pass = !pass;
            if (!pass) throw new Error('Expected ' + val + (negated ? ' not' : '') + ' to be above ' + n);
            return obj;
        },
        below: function(n) {
            var negated = _not; _not = false;
            var pass = val < n;
            if (negated) pass = !pass;
            if (!pass) throw new Error('Expected ' + val + (negated ? ' not' : '') + ' to be below ' + n);
            return obj;
        },
        least: function(n) {
            var negated = _not; _not = false;
            var pass = val >= n;
            if (negated) pass = !pass;
            if (!pass) throw new Error('Expected ' + val + ' to be at least ' + n);
            return obj;
        },
        most: function(n) {
            var negated = _not; _not = false;
            var pass = val <= n;
            if (negated) pass = !pass;
            if (!pass) throw new Error('Expected ' + val + ' to be at most ' + n);
            return obj;
        },
        lengthOf: function(n) {
            var negated = _not; _not = false;
            var len = val && val.length !== undefined ? val.length : -1;
            var pass = len === n;
            if (negated) pass = !pass;
            if (!pass) throw new Error('Expected length ' + len + (negated ? ' not' : '') + ' to equal ' + n);
            return obj;
        },
        length: function(n) { return obj.lengthOf(n); },
        property: function(prop) {
            var negated = _not; _not = false;
            var pass = val != null && val.hasOwnProperty(prop);
            if (negated) pass = !pass;
            if (!pass) throw new Error('Expected object to ' + (negated ? 'not ' : '') + 'have property "' + prop + '"');
            return obj;
        },
        get empty() {
            var negated = _not; _not = false;
            var pass;
            if (typeof val === 'string' || Array.isArray(val)) pass = val.length === 0;
            else if (typeof val === 'object' && val !== null) pass = Object.keys(val).length === 0;
            else pass = !val;
            if (negated) pass = !pass;
            if (!pass) throw new Error('Expected value to ' + (negated ? 'not ' : '') + 'be empty');
            return obj;
        },
        get ok() {
            var negated = _not; _not = false;
            var pass = !!val;
            if (negated) pass = !pass;
            if (!pass) throw new Error('Expected value to ' + (negated ? 'not ' : '') + 'be truthy');
            return obj;
        },
        get true() {
            var negated = _not; _not = false;
            var pass = val === true;
            if (negated) pass = !pass;
            if (!pass) throw new Error('Expected ' + (negated ? 'not ' : '') + 'true');
            return obj;
        },
        get false() {
            var negated = _not; _not = false;
            var pass = val === false;
            if (negated) pass = !pass;
            if (!pass) throw new Error('Expected ' + (negated ? 'not ' : '') + 'false');
            return obj;
        },
        get null() {
            var negated = _not; _not = false;
            var pass = val === null;
            if (negated) pass = !pass;
            if (!pass) throw new Error('Expected ' + (negated ? 'not ' : '') + 'null');
            return obj;
        },
        get undefined() {
            var negated = _not; _not = false;
            var pass = val === undefined;
            if (negated) pass = !pass;
            if (!pass) throw new Error('Expected ' + (negated ? 'not ' : '') + 'undefined');
            return obj;
        },
        get string() {
            var negated = _not; _not = false;
            var pass = typeof val === 'string';
            if (negated) pass = !pass;
            if (!pass) throw new Error('Expected ' + (negated ? 'not ' : '') + 'string');
            return obj;
        },
        get number() {
            var negated = _not; _not = false;
            var pass = typeof val === 'number';
            if (negated) pass = !pass;
            if (!pass) throw new Error('Expected ' + (negated ? 'not ' : '') + 'number');
            return obj;
        },
        get object() {
            var negated = _not; _not = false;
            var pass = typeof val === 'object' && val !== null && !Array.isArray(val);
            if (negated) pass = !pass;
            if (!pass) throw new Error('Expected ' + (negated ? 'not ' : '') + 'object');
            return obj;
        },
        get array() {
            var negated = _not; _not = false;
            var pass = Array.isArray(val);
            if (negated) pass = !pass;
            if (!pass) throw new Error('Expected ' + (negated ? 'not ' : '') + 'array');
            return obj;
        },
        match: function(re) {
            var negated = _not; _not = false;
            var pass = re.test(val);
            if (negated) pass = !pass;
            if (!pass) throw new Error('Expected ' + (negated ? 'not ' : '') + 'match');
            return obj;
        },
        oneOf: function(list) {
            var negated = _not; _not = false;
            var pass = list.indexOf(val) >= 0;
            if (negated) pass = !pass;
            if (!pass) throw new Error('Expected ' + (negated ? 'not ' : '') + 'one of ' + JSON.stringify(list));
            return obj;
        },
        status: function(code) { return obj.equal(code); },
    };
    return obj;
}
"#;

/// Chai-like `assert` shim injected into every script context
const ASSERT_SHIM: &str = r#"
var assert = {
    ok: function(v, msg) { if (!v) throw new Error(msg || 'expected truthy value'); },
    fail: function(msg) { throw new Error(msg || 'assert.fail()'); },
    equal: function(a, b, msg) { if (a != b) throw new Error(msg || 'Expected ' + JSON.stringify(a) + ' to equal ' + JSON.stringify(b)); },
    notEqual: function(a, b, msg) { if (a == b) throw new Error(msg || 'Expected ' + JSON.stringify(a) + ' not to equal ' + JSON.stringify(b)); },
    strictEqual: function(a, b, msg) { if (a !== b) throw new Error(msg || 'Expected ' + JSON.stringify(a) + ' to strictly equal ' + JSON.stringify(b)); },
    notStrictEqual: function(a, b, msg) { if (a === b) throw new Error(msg || 'Expected values to be strictly unequal'); },
    deepEqual: function(a, b, msg) { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(msg || 'Expected deep equality'); },
    notDeepEqual: function(a, b, msg) { if (JSON.stringify(a) === JSON.stringify(b)) throw new Error(msg || 'Expected not deep equal'); },
    isTrue: function(v, msg) { if (v !== true) throw new Error(msg || 'Expected true'); },
    isFalse: function(v, msg) { if (v !== false) throw new Error(msg || 'Expected false'); },
    isNull: function(v, msg) { if (v !== null) throw new Error(msg || 'Expected null'); },
    isNotNull: function(v, msg) { if (v === null) throw new Error(msg || 'Expected not null'); },
    isUndefined: function(v, msg) { if (v !== undefined) throw new Error(msg || 'Expected undefined'); },
    isDefined: function(v, msg) { if (v === undefined) throw new Error(msg || 'Expected defined value'); },
    isArray: function(v, msg) { if (!Array.isArray(v)) throw new Error(msg || 'Expected array'); },
    isString: function(v, msg) { if (typeof v !== 'string') throw new Error(msg || 'Expected string'); },
    isNumber: function(v, msg) { if (typeof v !== 'number') throw new Error(msg || 'Expected number'); },
    isObject: function(v, msg) { if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new Error(msg || 'Expected object'); },
    isBoolean: function(v, msg) { if (typeof v !== 'boolean') throw new Error(msg || 'Expected boolean'); },
    isAbove: function(a, b, msg) { if (!(a > b)) throw new Error(msg || 'Expected ' + a + ' to be above ' + b); },
    isBelow: function(a, b, msg) { if (!(a < b)) throw new Error(msg || 'Expected ' + a + ' to be below ' + b); },
    isAtLeast: function(a, b, msg) { if (!(a >= b)) throw new Error(msg || 'Expected ' + a + ' to be at least ' + b); },
    isAtMost: function(a, b, msg) { if (!(a <= b)) throw new Error(msg || 'Expected ' + a + ' to be at most ' + b); },
    include: function(h, n, msg) {
        var pass = false;
        if (typeof h === 'string') pass = h.indexOf(n) >= 0;
        else if (Array.isArray(h)) pass = h.indexOf(n) >= 0;
        if (!pass) throw new Error(msg || 'Expected ' + JSON.stringify(h) + ' to include ' + JSON.stringify(n));
    },
    notInclude: function(h, n, msg) {
        var pass = true;
        if (typeof h === 'string') pass = h.indexOf(n) < 0;
        else if (Array.isArray(h)) pass = h.indexOf(n) < 0;
        if (!pass) throw new Error(msg || 'Expected ' + JSON.stringify(h) + ' not to include ' + JSON.stringify(n));
    },
    lengthOf: function(v, n, msg) {
        var len = v && v.length !== undefined ? v.length : -1;
        if (len !== n) throw new Error(msg || 'Expected length ' + n + ' but got ' + len);
    },
    match: function(v, re, msg) { if (!re.test(v)) throw new Error(msg || 'Expected ' + JSON.stringify(v) + ' to match ' + re); },
    property: function(obj, prop, msg) { if (obj == null || !obj.hasOwnProperty(prop)) throw new Error(msg || 'Expected property "' + prop + '"'); },
    typeOf: function(v, type, msg) { if (typeof v !== type) throw new Error(msg || 'Expected typeof ' + type + ' but got ' + typeof v); },
};
"#;
