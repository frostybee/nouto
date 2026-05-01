use crate::models::types::{AuthState, AuthType, HttpMethod, KeyValue, ResponseData};
use crate::services::assertions::evaluate_assertions;
use crate::services::http_client::{HttpClient, HttpRequestConfig};
use crate::services::oauth_refresh::refresh_oauth_token;
use chrono::Utc;
use serde_json::Value;
use std::collections::HashMap;
use std::sync::Arc;
use tauri::{AppHandle, Emitter};
use tokio::sync::Mutex;
use tokio::task::JoinHandle;

pub struct HistoryMeta {
    pub method: String,
    pub url: String,
    pub headers: Vec<Value>,
    pub params: Vec<Value>,
    pub body: Option<Value>,
    pub auth: Option<Value>,
    pub request_id: Option<String>,
    pub request_name: Option<String>,
}

pub struct RequestExecutionContext {
    pub config: HttpRequestConfig,
    pub auth_data: AuthState,
    pub assertions: Vec<Value>,
    pub script_chain: Option<crate::models::types::ScriptChainData>,
    pub env_data: Option<crate::models::types::EnvDataPayload>,
    pub history: HistoryMeta,
    pub context_request_id: Option<String>,
    pub context_request_name: Option<String>,
    pub digest_auth: Option<(String, String)>,
    pub ntlm_auth: Option<(String, String, String, String)>,
    pub aws_auth: Option<crate::services::aws_auth::AwsSigningParams>,
    pub cookies: Vec<Value>,
}

pub fn spawn_request_execution(
    ctx: RequestExecutionContext,
    app: AppHandle,
    registry: Arc<Mutex<HashMap<String, JoinHandle<()>>>>,
    panel_id: String,
) -> JoinHandle<()> {
    let app_for_refresh = app.clone();
    let app_for_history = app.clone();
    let app_for_scripts = app.clone();
    let registry_for_cleanup = registry;
    let panel_id_for_cleanup = panel_id;

    tokio::spawn(async move {
        let assertions_for_eval = ctx.assertions;
        let history = ctx.history;
        let req_id_for_context = ctx.context_request_id;
        let req_name_for_context = ctx.context_request_name;
        let digest_auth = ctx.digest_auth;
        let ntlm_auth = ctx.ntlm_auth;
        let aws_auth = ctx.aws_auth;
        let script_chain = ctx.script_chain;
        let env_data = ctx.env_data;
        let cookies = ctx.cookies;

        let build_response_json = |response: &ResponseData| -> Value {
            let mut resp_json = serde_json::json!({ "data": response });
            if !assertions_for_eval.is_empty() {
                let eval = evaluate_assertions(&assertions_for_eval, response);
                if let Some(data_obj) = resp_json.get_mut("data").and_then(|d| d.as_object_mut()) {
                    data_obj.insert("assertionResults".to_string(), Value::Array(eval.results));
                }
                if !eval.variables_to_set.is_empty() {
                    let _ = app.emit("setVariables", serde_json::json!({ "data": eval.variables_to_set }));
                }
            }
            resp_json
        };

        let record_history = |app: &AppHandle, response: &ResponseData| {
            let entry = serde_json::json!({
                "id": uuid::Uuid::new_v4().to_string(),
                "timestamp": Utc::now().to_rfc3339(),
                "method": history.method,
                "url": history.url,
                "headers": history.headers,
                "params": history.params,
                "body": history.body,
                "auth": history.auth,
                "responseStatus": response.status,
                "responseDuration": response.duration,
                "responseSize": response.size,
                "requestId": history.request_id,
                "requestName": history.request_name,
            });

            let app_clone = app.clone();
            tokio::spawn(async move {
                crate::commands::history::append_history_entry(&app_clone, &entry).await;
            });
        };

        let emit_response_context = |app: &AppHandle, response: &ResponseData| {
            if let Some(ref rid) = req_id_for_context {
                let _ = app.emit("storeResponseContext", serde_json::json!({
                    "data": {
                        "requestId": rid,
                        "response": response,
                        "requestName": req_name_for_context
                    }
                }));
            }
        };

        let mut config = ctx.config;

        // OAuth2 auto-refresh
        if ctx.auth_data.auth_type == AuthType::OAuth2 {
            if let Some(token_data) = &ctx.auth_data.oauth_token_data {
                if let (Some(expires_at), Some(refresh_token)) =
                    (&token_data.expires_at, &token_data.refresh_token)
                {
                    let now = Utc::now().timestamp_millis();
                    if expires_at - now < 30_000 {
                        if let Some(oauth2_cfg) = &ctx.auth_data.oauth2 {
                            if let Some(token_url) = &oauth2_cfg.token_url {
                                match refresh_oauth_token(
                                    token_url,
                                    &oauth2_cfg.client_id,
                                    oauth2_cfg.client_secret.as_deref(),
                                    refresh_token,
                                )
                                .await
                                {
                                    Ok(new_token) => {
                                        let new_access_token = new_token.access_token.clone();
                                        let _ = app_for_refresh.emit(
                                            "oauthTokenRefreshed",
                                            serde_json::json!({ "data": new_token }),
                                        );
                                        config.bearer_token = Some(new_access_token);
                                    }
                                    Err(e) => {
                                        eprintln!("[Nouto] OAuth2 token refresh failed: {}", e);
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }

        // Pre-request scripts
        if let Some(ref chain) = script_chain {
            let mut current_env = env_data.as_ref()
                .and_then(|e| e.active_environment.clone())
                .unwrap_or(serde_json::json!({}));
            let mut current_globals = env_data.as_ref()
                .and_then(|e| e.global_variables.clone())
                .unwrap_or_default();

            for entry in &chain.entries {
                if entry.pre_request.trim().is_empty() { continue; }

                let request_json = serde_json::json!({
                    "method": config.method.as_str().to_uppercase(),
                    "url": config.url,
                    "headers": config.headers.iter()
                        .filter(|h| h.enabled)
                        .map(|h| (h.key.clone(), h.value.clone()))
                        .collect::<HashMap<String, String>>(),
                });

                let script_context = crate::services::script_engine::ScriptContext {
                    request: request_json,
                    response: None,
                    environment: current_env.clone(),
                    global_variables: Value::Array(current_globals.clone()),
                    info: Some(serde_json::json!({
                        "requestName": history.request_name,
                        "currentIteration": 0,
                        "totalIterations": 1,
                    })),
                    cookies: cookies.iter()
                        .filter_map(|v| serde_json::from_value::<crate::services::script_engine::ScriptCookie>(v.clone()).ok())
                        .collect(),
                };

                // result.next_request is intentionally ignored here — it only applies in collection runner context
                let result = crate::services::script_engine::ScriptEngine::execute_pre_request(
                    &entry.pre_request, &script_context
                ).await;

                if !result.cookie_mutations.is_empty() {
                    let _ = app_for_scripts.emit("cookieMutations",
                        serde_json::json!({ "data": result.cookie_mutations }));
                }

                let _ = app_for_scripts.emit("scriptOutput", serde_json::json!({
                    "data": {
                        "phase": "preRequest",
                        "result": {
                            "success": result.error.is_none(),
                            "logs": result.logs,
                            "testResults": result.test_results,
                            "variablesToSet": result.variables_to_set,
                            "error": result.error,
                        }
                    }
                }));

                if !result.variables_to_set.is_empty() {
                    let _ = app_for_scripts.emit("setVariables", serde_json::json!({
                        "data": result.variables_to_set
                    }));
                    for var in &result.variables_to_set {
                        if var.scope == "global" {
                            current_globals.push(serde_json::json!({
                                "key": var.key, "value": var.value, "enabled": true
                            }));
                        } else if let Some(vars) = current_env.get_mut("variables").and_then(|v| v.as_array_mut()) {
                            let mut found = false;
                            for v in vars.iter_mut() {
                                if v["key"].as_str() == Some(&var.key) {
                                    v["value"] = Value::String(var.value.clone());
                                    found = true;
                                    break;
                                }
                            }
                            if !found {
                                vars.push(serde_json::json!({
                                    "key": var.key, "value": var.value, "enabled": true
                                }));
                            }
                        }
                    }
                }

                if let Some(ref modified) = result.modified_request {
                    if let Some(url) = modified["url"].as_str() {
                        config.url = url.to_string();
                    }
                    if let Some(method) = modified["method"].as_str() {
                        config.method = HttpMethod(method.to_string());
                    }
                    if let Some(headers) = modified["headers"].as_object() {
                        for (key, val) in headers {
                            if let Some(val_str) = val.as_str() {
                                let mut found = false;
                                for h in config.headers.iter_mut() {
                                    if h.key.eq_ignore_ascii_case(key) {
                                        h.value = val_str.to_string();
                                        found = true;
                                        break;
                                    }
                                }
                                if !found {
                                    config.headers.push(KeyValue {
                                        id: String::new(),
                                        key: key.clone(),
                                        value: val_str.to_string(),
                                        enabled: true,
                                        ..Default::default()
                                    });
                                }
                            }
                        }
                    }
                }

                if result.error.is_some() { break; }
            }
        }

        // AWS Signature v4
        if let Some(ref aws_params) = aws_auth {
            let existing_headers: Vec<(String, String)> = config.headers.iter()
                .filter(|h| h.enabled && !h.key.is_empty())
                .map(|h| (h.key.clone(), h.value.clone()))
                .collect();
            let body_bytes = config.body.as_ref().map(|b| b.as_bytes());

            let sign_url = if config.params.iter().any(|p| p.enabled && !p.key.is_empty()) {
                let mut url = reqwest::Url::parse(&config.url).unwrap_or_else(|_| reqwest::Url::parse("http://localhost").unwrap());
                for p in &config.params {
                    if p.enabled && !p.key.is_empty() {
                        url.query_pairs_mut().append_pair(&p.key, &p.value);
                    }
                }
                url.to_string()
            } else {
                config.url.clone()
            };

            match crate::services::aws_auth::sign_request(
                config.method.as_str(),
                &sign_url,
                &existing_headers,
                body_bytes,
                aws_params,
            ) {
                Ok(signed) => {
                    config.headers.push(KeyValue {
                        id: String::new(),
                        key: "Authorization".to_string(),
                        value: signed.authorization,
                        enabled: true,
                        ..Default::default()
                    });
                    config.headers.push(KeyValue {
                        id: String::new(),
                        key: "x-amz-date".to_string(),
                        value: signed.x_amz_date,
                        enabled: true,
                        ..Default::default()
                    });
                    config.headers.push(KeyValue {
                        id: String::new(),
                        key: "x-amz-content-sha256".to_string(),
                        value: signed.x_amz_content_sha256,
                        enabled: true,
                        ..Default::default()
                    });
                    if let Some(token) = signed.x_amz_security_token {
                        config.headers.push(KeyValue {
                            id: String::new(),
                            key: "x-amz-security-token".to_string(),
                            value: token,
                            enabled: true,
                            ..Default::default()
                        });
                    }
                }
                Err(e) => {
                    eprintln!("[Nouto] AWS SigV4 signing failed: {}", e);
                    let _ = app.emit(
                        "requestResponse",
                        serde_json::json!({ "data": create_error_response(format!("AWS signing failed: {}", e)) }),
                    );
                    let mut registry_lock = registry_for_cleanup.lock().await;
                    registry_lock.remove(&panel_id_for_cleanup);
                    return;
                }
            }
        }

        // NTLM Type 1
        if ntlm_auth.is_some() {
            let type1_msg = crate::services::ntlm_auth::create_type1_message();
            config.headers.push(KeyValue {
                id: String::new(),
                key: "Authorization".to_string(),
                value: crate::services::ntlm_auth::encode_authorization(&type1_msg),
                enabled: true,
                ..Default::default()
            });
        }

        // Create HTTP client
        let client = match HttpClient::new() {
            Ok(c) => c,
            Err(e) => {
                let _ = app.emit(
                    "requestResponse",
                    serde_json::json!({ "data": create_error_response(format!("Failed to create HTTP client: {}", e)) }),
                );
                let mut registry_lock = registry_for_cleanup.lock().await;
                registry_lock.remove(&panel_id_for_cleanup);
                return;
            }
        };

        // Execute request with download progress
        let app_for_progress = app.clone();
        let on_progress = move |loaded: usize, total: Option<u64>| {
            let _ = app_for_progress.emit("downloadProgress", serde_json::json!({
                "data": { "loaded": loaded, "total": total }
            }));
        };

        let mut script_response_json: Option<Value> = None;
        let build_script_response = |resp: &ResponseData| -> Value {
            serde_json::json!({
                "status": resp.status,
                "statusText": resp.status_text,
                "headers": resp.headers,
                "body": resp.data,
                "duration": resp.duration,
                "size": resp.size,
            })
        };

        match client.execute(config.clone(), Some(on_progress)).await {
            Ok(response) => {
                if response.status == 401 && digest_auth.is_some() {
                    if let Some(www_auth) = response.headers.get("www-authenticate") {
                        if let Some(challenge) = crate::services::digest_auth::parse_digest_challenge(www_auth) {
                            let (ref username, ref password) = *digest_auth.as_ref().unwrap();
                            let uri = reqwest::Url::parse(&config.url)
                                .map(|u| {
                                    let path = u.path().to_string();
                                    match u.query() {
                                        Some(q) => format!("{}?{}", path, q),
                                        None => path,
                                    }
                                })
                                .unwrap_or_else(|_| config.url.clone());
                            let auth_header = crate::services::digest_auth::compute_digest_auth(
                                username, password, config.method.as_str(), &uri, &challenge,
                            );
                            let mut retry_config = config.clone();
                            retry_config.headers.push(KeyValue {
                                id: String::new(),
                                key: "Authorization".to_string(),
                                value: auth_header,
                                enabled: true,
                                ..Default::default()
                            });
                            let no_progress = |_loaded: usize, _total: Option<u64>| {};
                            match client.execute(retry_config, Some(no_progress)).await {
                                Ok(mut retry_response) => {
                                    if let Some(ref mut tl) = retry_response.timeline {
                                        tl.insert(0, crate::models::types::TimelineEvent {
                                            category: crate::models::types::TimelineEventCategory::Info,
                                            text: "Received digest challenge, resending with credentials".to_string(),
                                            timestamp: chrono::Utc::now().timestamp_millis(),
                                        });
                                    }
                                    println!("[Nouto] Digest auth retry successful, status: {}", retry_response.status);
                                    emit_response_context(&app, &retry_response);
                                    script_response_json = Some(build_script_response(&retry_response));
                                    record_history(&app_for_history, &retry_response);
                                    if let Err(e) = app.emit("requestResponse", build_response_json(&retry_response)) {
                                        eprintln!("[Nouto] Failed to emit response: {}", e);
                                    }
                                }
                                Err(e) => {
                                    eprintln!("[Nouto] Digest auth retry failed: {}", e);
                                    if let Err(err) = app.emit("requestResponse", serde_json::json!({ "data": create_error_response(e) })) {
                                        eprintln!("[Nouto] Failed to emit error response: {}", err);
                                    }
                                }
                            }
                        } else {
                            emit_response_context(&app, &response);
                            script_response_json = Some(build_script_response(&response));
                            record_history(&app_for_history, &response);
                            if let Err(e) = app.emit("requestResponse", build_response_json(&response)) {
                                eprintln!("[Nouto] Failed to emit response: {}", e);
                            }
                        }
                    } else {
                        emit_response_context(&app, &response);
                        script_response_json = Some(build_script_response(&response));
                        record_history(&app_for_history, &response);
                        if let Err(e) = app.emit("requestResponse", build_response_json(&response)) {
                            eprintln!("[Nouto] Failed to emit response: {}", e);
                        }
                    }
                } else if response.status == 401 && ntlm_auth.is_some() {
                    let www_auth = response.headers.get("www-authenticate");
                    let type2_data = www_auth.and_then(|v| crate::services::ntlm_auth::extract_type2_from_header(v));
                    if let Some(type2_bytes) = type2_data {
                        match crate::services::ntlm_auth::parse_type2_message(&type2_bytes) {
                            Ok(challenge) => {
                                let (ref username, ref password, ref domain, ref workstation) =
                                    *ntlm_auth.as_ref().unwrap();
                                let type3_msg = crate::services::ntlm_auth::create_type3_message(
                                    username, password, domain, workstation, &challenge,
                                );
                                let auth_header = crate::services::ntlm_auth::encode_authorization(&type3_msg);
                                let mut retry_config = config.clone();
                                retry_config.headers.retain(|h| {
                                    !(h.key.eq_ignore_ascii_case("authorization")
                                        && h.value.to_lowercase().starts_with("ntlm "))
                                });
                                retry_config.headers.push(KeyValue {
                                    id: String::new(),
                                    key: "Authorization".to_string(),
                                    value: auth_header,
                                    enabled: true,
                                    ..Default::default()
                                });
                                let no_progress = |_loaded: usize, _total: Option<u64>| {};
                                match client.execute(retry_config, Some(no_progress)).await {
                                    Ok(mut retry_response) => {
                                        if let Some(ref mut tl) = retry_response.timeline {
                                            tl.insert(0, crate::models::types::TimelineEvent {
                                                category: crate::models::types::TimelineEventCategory::Info,
                                                text: "NTLM Type 1 sent, received Type 2 challenge, sending Type 3".to_string(),
                                                timestamp: chrono::Utc::now().timestamp_millis(),
                                            });
                                        }
                                        println!("[Nouto] NTLM auth successful, status: {}", retry_response.status);
                                        emit_response_context(&app, &retry_response);
                                        script_response_json = Some(build_script_response(&retry_response));
                                        record_history(&app_for_history, &retry_response);
                                        if let Err(e) = app.emit("requestResponse", build_response_json(&retry_response)) {
                                            eprintln!("[Nouto] Failed to emit response: {}", e);
                                        }
                                    }
                                    Err(e) => {
                                        eprintln!("[Nouto] NTLM auth retry failed: {}", e);
                                        if let Err(err) = app.emit("requestResponse", serde_json::json!({ "data": create_error_response(e) })) {
                                            eprintln!("[Nouto] Failed to emit error response: {}", err);
                                        }
                                    }
                                }
                            }
                            Err(e) => {
                                eprintln!("[Nouto] Failed to parse NTLM Type 2 challenge: {}", e);
                                emit_response_context(&app, &response);
                                script_response_json = Some(build_script_response(&response));
                                record_history(&app_for_history, &response);
                                if let Err(err) = app.emit("requestResponse", build_response_json(&response)) {
                                    eprintln!("[Nouto] Failed to emit response: {}", err);
                                }
                            }
                        }
                    } else {
                        emit_response_context(&app, &response);
                        script_response_json = Some(build_script_response(&response));
                        record_history(&app_for_history, &response);
                        if let Err(e) = app.emit("requestResponse", build_response_json(&response)) {
                            eprintln!("[Nouto] Failed to emit response: {}", e);
                        }
                    }
                } else {
                    println!("[Nouto] Request successful, status: {}", response.status);
                    emit_response_context(&app, &response);
                    script_response_json = Some(build_script_response(&response));
                    record_history(&app_for_history, &response);
                    if let Err(e) = app.emit("requestResponse", build_response_json(&response)) {
                        eprintln!("[Nouto] Failed to emit response: {}", e);
                    }
                }
            }
            Err(e) => {
                eprintln!("[Nouto] Request failed: {}", e);
                if let Err(err) = app.emit("requestResponse", serde_json::json!({ "data": create_error_response(e) })) {
                    eprintln!("[Nouto] Failed to emit error response: {}", err);
                }
            }
        }

        // Post-response scripts
        if let Some(ref chain) = script_chain {
            if let Some(ref resp_json) = script_response_json {
                let mut current_env = env_data.as_ref()
                    .and_then(|e| e.active_environment.clone())
                    .unwrap_or(serde_json::json!({}));
                let mut current_globals = env_data.as_ref()
                    .and_then(|e| e.global_variables.clone())
                    .unwrap_or_default();

                let request_json = serde_json::json!({
                    "method": history.method,
                    "url": history.url,
                });

                for entry in &chain.entries {
                    if entry.post_response.trim().is_empty() { continue; }

                    let script_context = crate::services::script_engine::ScriptContext {
                        request: request_json.clone(),
                        response: Some(resp_json.clone()),
                        environment: current_env.clone(),
                        global_variables: Value::Array(current_globals.clone()),
                        info: Some(serde_json::json!({
                            "requestName": history.request_name,
                            "currentIteration": 0,
                            "totalIterations": 1,
                        })),
                        cookies: cookies.iter()
                            .filter_map(|v| serde_json::from_value::<crate::services::script_engine::ScriptCookie>(v.clone()).ok())
                            .collect(),
                    };

                    let result = crate::services::script_engine::ScriptEngine::execute_post_response(
                        &entry.post_response, &script_context
                    ).await;

                    if !result.cookie_mutations.is_empty() {
                        let _ = app_for_scripts.emit("cookieMutations",
                            serde_json::json!({ "data": result.cookie_mutations }));
                    }

                    let _ = app_for_scripts.emit("scriptOutput", serde_json::json!({
                        "data": {
                            "phase": "postResponse",
                            "result": {
                                "success": result.error.is_none(),
                                "logs": result.logs,
                                "testResults": result.test_results,
                                "variablesToSet": result.variables_to_set,
                                "error": result.error,
                            }
                        }
                    }));

                    if !result.variables_to_set.is_empty() {
                        let _ = app_for_scripts.emit("setVariables", serde_json::json!({
                            "data": result.variables_to_set
                        }));
                        for var in &result.variables_to_set {
                            if var.scope == "global" {
                                current_globals.push(serde_json::json!({
                                    "key": var.key, "value": var.value, "enabled": true
                                }));
                            } else if let Some(vars) = current_env.get_mut("variables").and_then(|v| v.as_array_mut()) {
                                let mut found = false;
                                for v in vars.iter_mut() {
                                    if v["key"].as_str() == Some(&var.key) {
                                        v["value"] = Value::String(var.value.clone());
                                        found = true;
                                        break;
                                    }
                                }
                                if !found {
                                    vars.push(serde_json::json!({
                                        "key": var.key, "value": var.value, "enabled": true
                                    }));
                                }
                            }
                        }
                    }

                    if result.error.is_some() { break; }
                }
            }
        }

        // Cleanup registry
        let mut registry_lock = registry_for_cleanup.lock().await;
        registry_lock.remove(&panel_id_for_cleanup);
    })
}

pub fn create_error_response(message: String) -> ResponseData {
    ResponseData {
        status: 0,
        status_text: "Error".to_string(),
        headers: HashMap::new(),
        data: serde_json::json!({ "error": message }),
        duration: 0,
        size: 0,
        error: Some(true),
        timing: None,
        content_category: None,
        request_headers: None,
        request_url: None,
        remote_address: None,
        redirect_chain: None,
        timeline: None,
    }
}
