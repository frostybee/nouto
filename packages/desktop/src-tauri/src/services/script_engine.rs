// Script Engine - QuickJS-based JavaScript execution for pre-request and post-response scripts
// Uses rquickjs for sandboxed JS execution with a limited API surface.

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
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScriptLogEntry {
    pub level: String,  // "log", "warn", "error"
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

/// Script execution context data
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScriptContext {
    pub request: Value,
    pub response: Option<Value>,
    pub environment: Value,
    pub global_variables: Value,
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

        let rt = match Runtime::new() {
            Ok(r) => r,
            Err(e) => return ScriptResult {
                error: Some(format!("Failed to create JS runtime: {}", e)),
                ..Default::default()
            },
        };

        // Set memory limit (32MB) and interrupt handler (5s timeout)
        rt.set_memory_limit(32 * 1024 * 1024);
        let start_time = Instant::now();
        rt.set_interrupt_handler(Some(Box::new(move || {
            start_time.elapsed() > Duration::from_secs(5)
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

            // Inject console
            let console_obj = Object::new(ctx.clone()).map_err(|e| e.to_string())?;
            {
                let logs_ref = logs.clone();
                let log_fn = Function::new(ctx.clone(), move |args: Rest<String>| {
                    let msg = args.0.join(" ");
                    if let Ok(mut l) = logs_ref.lock() {
                        l.push(ScriptLogEntry {
                            level: "log".into(),
                            message: msg,
                            timestamp: chrono::Utc::now().to_rfc3339(),
                        });
                    }
                }).map_err(|e| e.to_string())?;
                console_obj.set("log", log_fn).map_err(|e| e.to_string())?;
            }
            {
                let logs_ref = logs.clone();
                let warn_fn = Function::new(ctx.clone(), move |args: Rest<String>| {
                    let msg = args.0.join(" ");
                    if let Ok(mut l) = logs_ref.lock() {
                        l.push(ScriptLogEntry {
                            level: "warn".into(),
                            message: msg,
                            timestamp: chrono::Utc::now().to_rfc3339(),
                        });
                    }
                }).map_err(|e| e.to_string())?;
                console_obj.set("warn", warn_fn).map_err(|e| e.to_string())?;
            }
            {
                let logs_ref = logs.clone();
                let error_fn = Function::new(ctx.clone(), move |args: Rest<String>| {
                    let msg = args.0.join(" ");
                    if let Ok(mut l) = logs_ref.lock() {
                        l.push(ScriptLogEntry {
                            level: "error".into(),
                            message: msg,
                            timestamp: chrono::Utc::now().to_rfc3339(),
                        });
                    }
                }).map_err(|e| e.to_string())?;
                console_obj.set("error", error_fn).map_err(|e| e.to_string())?;
            }
            globals.set("console", console_obj).map_err(|e| e.to_string())?;

            // Inject hf object
            let hf_obj = Object::new(ctx.clone()).map_err(|e| e.to_string())?;

            // hf.request - mutable object with request data
            let req_json = serde_json::to_string(&context.request).unwrap_or("{}".into());
            let _: () = ctx.eval(format!(
                "var __hf_request = {};",
                req_json
            )).map_err(|e| e.to_string())?;
            let req_val: JsValue = ctx.eval("__hf_request").map_err(|e| e.to_string())?;
            hf_obj.set("request", req_val).map_err(|e| e.to_string())?;

            // hf.response - response data (only for post-response scripts)
            if is_post_response {
                if let Some(ref resp) = context.response {
                    let resp_json = serde_json::to_string(resp).unwrap_or("{}".into());
                    let _: () = ctx.eval(format!(
                        "var __hf_response = {};",
                        resp_json
                    )).map_err(|e| e.to_string())?;
                    let resp_val: JsValue = ctx.eval("__hf_response").map_err(|e| e.to_string())?;
                    hf_obj.set("response", resp_val).map_err(|e| e.to_string())?;
                }
            }

            // hf.getVar(key) -> string
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
                hf_obj.set("getVar", get_var_fn).map_err(|e| e.to_string())?;
            }

            // hf.setVar(key, value, scope?)
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
                hf_obj.set("setVar", set_var_fn).map_err(|e| e.to_string())?;
            }

            // hf.test(name, fn)
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
                hf_obj.set("test", test_fn).map_err(|e| e.to_string())?;
            }

            // hf.uuid()
            {
                let uuid_fn = Function::new(ctx.clone(), move || -> String {
                    uuid::Uuid::new_v4().to_string()
                }).map_err(|e| e.to_string())?;
                hf_obj.set("uuid", uuid_fn).map_err(|e| e.to_string())?;
            }

            // hf.base64 object
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
                hf_obj.set("base64", b64_obj).map_err(|e| e.to_string())?;
            }

            // hf.hash object (md5 + sha256)
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
                hf_obj.set("hash", hash_obj).map_err(|e| e.to_string())?;
            }

            // hf.sendRequest(config) - synchronous HTTP request from within scripts
            {
                let send_fn = Function::new(ctx.clone(), move |config_str: String| -> String {
                    // Parse the config JSON
                    let config: Value = match serde_json::from_str(&config_str) {
                        Ok(v) => v,
                        Err(e) => return serde_json::json!({ "error": e.to_string() }).to_string(),
                    };

                    let method = config["method"].as_str().unwrap_or("GET").to_uppercase();
                    let url = config["url"].as_str().unwrap_or("");
                    if url.is_empty() {
                        return serde_json::json!({ "error": "URL is required" }).to_string();
                    }

                    // Build blocking request
                    let client = match reqwest::blocking::Client::builder()
                        .timeout(std::time::Duration::from_secs(30))
                        .build()
                    {
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
                        _ => client.get(url),
                    };

                    // Add headers
                    if let Some(headers) = config["headers"].as_object() {
                        for (k, v) in headers {
                            if let Some(val) = v.as_str() {
                                builder = builder.header(k.as_str(), val);
                            }
                        }
                    }

                    // Add body
                    if let Some(body) = config["body"].as_str() {
                        builder = builder.body(body.to_string());
                    }

                    // Execute
                    match builder.send() {
                        Ok(resp) => {
                            let status = resp.status().as_u16();
                            let headers: std::collections::HashMap<String, String> = resp.headers()
                                .iter()
                                .map(|(k, v)| (k.to_string(), v.to_str().unwrap_or("").to_string()))
                                .collect();
                            let body = resp.text().unwrap_or_default();

                            serde_json::json!({
                                "status": status,
                                "headers": headers,
                                "body": body,
                            }).to_string()
                        }
                        Err(e) => serde_json::json!({ "error": e.to_string() }).to_string(),
                    }
                }).map_err(|e| e.to_string())?;
                hf_obj.set("sendRequest", send_fn).map_err(|e| e.to_string())?;

                // Also inject a JS wrapper that parses the JSON result
                let _: () = ctx.eval(r#"
                    var __hf_sendRequest_raw = hf.sendRequest;
                    hf.sendRequest = function(config) {
                        var result = __hf_sendRequest_raw(JSON.stringify(config));
                        return JSON.parse(result);
                    };
                "#).map_err(|e| e.to_string())?;
            }

            // hf.setNextRequest(nameOrId)
            {
                let next_ref = next_request.clone();
                let set_next_fn = Function::new(ctx.clone(), move |name: String| {
                    if let Ok(mut n) = next_ref.lock() {
                        *n = Some(name);
                    }
                }).map_err(|e| e.to_string())?;
                hf_obj.set("setNextRequest", set_next_fn).map_err(|e| e.to_string())?;
            }

            globals.set("hf", hf_obj).map_err(|e| e.to_string())?;

            // Inject chai-like expect shim
            let _: () = ctx.eval(EXPECT_SHIM).map_err(|e| format!("expect shim error: {}", e))?;

            // Execute the user script
            let _: () = ctx.eval(script).map_err(|e| format!("Script error: {}", e))?;

            // If pre-request, capture modified request
            if !is_post_response {
                let modified: JsValue = ctx.eval("JSON.stringify(__hf_request)").map_err(|e| e.to_string())?;
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
            var pass = val === exp;
            if (_not) pass = !pass;
            if (!pass) throw new Error('Expected ' + JSON.stringify(val) + (_not ? ' not' : '') + ' to equal ' + JSON.stringify(exp));
            return obj;
        },
        equals: function(exp) { return obj.equal(exp); },
        eql: function(exp) {
            var pass = JSON.stringify(val) === JSON.stringify(exp);
            if (_not) pass = !pass;
            if (!pass) throw new Error('Expected deep equality');
            return obj;
        },
        include: function(item) {
            var pass;
            if (typeof val === 'string') pass = val.indexOf(item) >= 0;
            else if (Array.isArray(val)) pass = val.indexOf(item) >= 0;
            else pass = false;
            if (_not) pass = !pass;
            if (!pass) throw new Error('Expected ' + JSON.stringify(val) + (_not ? ' not' : '') + ' to include ' + JSON.stringify(item));
            return obj;
        },
        contains: function(item) { return obj.include(item); },
        above: function(n) {
            var pass = val > n;
            if (_not) pass = !pass;
            if (!pass) throw new Error('Expected ' + val + (_not ? ' not' : '') + ' to be above ' + n);
            return obj;
        },
        below: function(n) {
            var pass = val < n;
            if (_not) pass = !pass;
            if (!pass) throw new Error('Expected ' + val + (_not ? ' not' : '') + ' to be below ' + n);
            return obj;
        },
        least: function(n) {
            var pass = val >= n;
            if (_not) pass = !pass;
            if (!pass) throw new Error('Expected ' + val + ' to be at least ' + n);
            return obj;
        },
        most: function(n) {
            var pass = val <= n;
            if (_not) pass = !pass;
            if (!pass) throw new Error('Expected ' + val + ' to be at most ' + n);
            return obj;
        },
        lengthOf: function(n) {
            var len = val && val.length !== undefined ? val.length : -1;
            var pass = len === n;
            if (_not) pass = !pass;
            if (!pass) throw new Error('Expected length ' + len + (_not ? ' not' : '') + ' to equal ' + n);
            return obj;
        },
        length: function(n) { return obj.lengthOf(n); },
        property: function(prop) {
            var pass = val != null && val.hasOwnProperty(prop);
            if (_not) pass = !pass;
            if (!pass) throw new Error('Expected object to ' + (_not ? 'not ' : '') + 'have property "' + prop + '"');
            return obj;
        },
        empty: (function() {
            var pass;
            if (typeof val === 'string' || Array.isArray(val)) pass = val.length === 0;
            else if (typeof val === 'object' && val !== null) pass = Object.keys(val).length === 0;
            else pass = !val;
            return function() {
                if (_not ? pass : !pass) throw new Error('Expected value to ' + (_not ? 'not ' : '') + 'be empty');
                return obj;
            };
        })(),
        ok: (function() {
            var pass = !!val;
            if (_not) pass = !pass;
            if (!pass) throw new Error('Expected value to be truthy');
            return obj;
        }),
        true: (function() {
            var pass = val === true;
            if (_not) pass = !pass;
            if (!pass) throw new Error('Expected true');
            return obj;
        }),
        false: (function() {
            var pass = val === false;
            if (_not) pass = !pass;
            if (!pass) throw new Error('Expected false');
            return obj;
        }),
        null: (function() {
            var pass = val === null;
            if (_not) pass = !pass;
            if (!pass) throw new Error('Expected null');
            return obj;
        }),
        undefined: (function() {
            var pass = val === undefined;
            if (_not) pass = !pass;
            if (!pass) throw new Error('Expected undefined');
            return obj;
        }),
        string: (function() {
            var pass = typeof val === 'string';
            if (_not) pass = !pass;
            if (!pass) throw new Error('Expected string');
            return obj;
        }),
        number: (function() {
            var pass = typeof val === 'number';
            if (_not) pass = !pass;
            if (!pass) throw new Error('Expected number');
            return obj;
        }),
        object: (function() {
            var pass = typeof val === 'object' && val !== null && !Array.isArray(val);
            if (_not) pass = !pass;
            if (!pass) throw new Error('Expected object');
            return obj;
        }),
        array: (function() {
            var pass = Array.isArray(val);
            if (_not) pass = !pass;
            if (!pass) throw new Error('Expected array');
            return obj;
        }),
        match: function(re) {
            var pass = re.test(val);
            if (_not) pass = !pass;
            if (!pass) throw new Error('Expected match');
            return obj;
        },
        oneOf: function(list) {
            var pass = list.indexOf(val) >= 0;
            if (_not) pass = !pass;
            if (!pass) throw new Error('Expected one of ' + JSON.stringify(list));
            return obj;
        },
        status: function(code) { return obj.equal(code); },
    };
    return obj;
}
"#;
