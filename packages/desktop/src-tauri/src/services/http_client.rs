// HTTP Client Service - Phase 2
// Implements HTTP/1.1, HTTP/2, compression, auth, and timing tracking

use crate::models::types::{HttpMethod, KeyValue, ProxyConfig, ProxyProtocol, RedirectHop, ResponseData, TimingData, ContentCategory, SslConfig};
use base64::{Engine as _, engine::general_purpose::STANDARD as BASE64};
use reqwest::{Client, Method, Request, Response, StatusCode};
use serde_json::Value;
use std::collections::HashMap;
use std::time::{Duration, Instant};
use futures::StreamExt;

/// HTTP request configuration
#[derive(Debug, Clone)]
pub struct HttpRequestConfig {
    pub method: HttpMethod,
    pub url: String,
    pub headers: Vec<KeyValue>,
    pub params: Vec<KeyValue>,
    pub body: Option<String>,
    pub body_bytes: Option<Vec<u8>>,
    pub body_type: String, // "json", "text", "xml", "form-data", etc.
    pub timeout_ms: u64,
    pub auth_username: Option<String>,
    pub auth_password: Option<String>,
    pub bearer_token: Option<String>,
    pub ssl: Option<SslConfig>,
    pub proxy: Option<ProxyConfig>,
    pub follow_redirects: bool,
    pub max_redirects: u32,
}

/// HTTP client with timing tracking
#[allow(dead_code)]
pub struct HttpClient {
    client: Client,
}

impl HttpClient {
    /// Create a new HTTP client with default settings
    pub fn new() -> Result<Self, String> {
        let client = Client::builder()
            .timeout(Duration::from_secs(30))
            .redirect(reqwest::redirect::Policy::limited(10))
            .gzip(true)
            .brotli(true)
            .deflate(true)
            .build()
            .map_err(|e| format!("Failed to create HTTP client: {}", e))?;

        Ok(HttpClient { client })
    }

    /// Build a reqwest Client, applying any SSL, proxy, timeout and redirect overrides from config
    fn build_client(ssl: Option<&SslConfig>, proxy: Option<&ProxyConfig>, timeout_ms: u64, follow_redirects: bool, max_redirects: u32) -> Result<Client, String> {
        let mut builder = Client::builder()
            .gzip(true)
            .brotli(true)
            .deflate(true);

        // Apply timeout (0 = no timeout)
        if timeout_ms > 0 {
            builder = builder.timeout(Duration::from_millis(timeout_ms));
        } else {
            builder = builder.timeout(Duration::from_secs(86400)); // effectively no timeout
        }

        // Apply redirect policy
        if !follow_redirects {
            builder = builder.redirect(reqwest::redirect::Policy::none());
        } else {
            builder = builder.redirect(reqwest::redirect::Policy::limited(max_redirects as usize));
        }

        if let Some(ssl) = ssl {
            // SSL verification toggle
            if ssl.reject_unauthorized == Some(false) {
                builder = builder.danger_accept_invalid_certs(true);
            }

            // mTLS: concatenate cert + key PEM files and build an Identity
            if let (Some(cert_path), Some(key_path)) = (&ssl.cert_path, &ssl.key_path) {
                let mut pem = std::fs::read(cert_path)
                    .map_err(|e| format!("Failed to read cert file: {}", e))?;
                pem.extend(
                    std::fs::read(key_path)
                        .map_err(|e| format!("Failed to read key file: {}", e))?,
                );
                let identity = reqwest::Identity::from_pem(&pem)
                    .map_err(|e| format!("Failed to build TLS identity from PEM: {}", e))?;
                builder = builder.identity(identity);
            }
        }

        // Apply proxy configuration
        if let Some(proxy_cfg) = proxy {
            if proxy_cfg.enabled && !proxy_cfg.host.is_empty() {
                let scheme = match proxy_cfg.protocol {
                    ProxyProtocol::Http => "http",
                    ProxyProtocol::Https => "https",
                    ProxyProtocol::Socks5 => "socks5",
                };
                let proxy_url = format!("{}://{}:{}", scheme, proxy_cfg.host, proxy_cfg.port);

                // Build no-proxy bypass list
                let no_proxy_entries: Vec<String> = proxy_cfg.no_proxy
                    .as_deref()
                    .unwrap_or("")
                    .split(',')
                    .map(|s| s.trim().to_lowercase())
                    .filter(|s| !s.is_empty())
                    .collect();

                let parsed_proxy_url = reqwest::Url::parse(&proxy_url)
                    .map_err(|e| format!("Invalid proxy URL: {}", e))?;

                let mut proxy = if no_proxy_entries.is_empty() {
                    reqwest::Proxy::all(&proxy_url)
                        .map_err(|e| format!("Invalid proxy URL: {}", e))?
                } else {
                    reqwest::Proxy::custom(move |url| {
                        let host = url.host_str().unwrap_or("").to_lowercase();
                        for entry in &no_proxy_entries {
                            if entry == "*" || host == *entry || host.ends_with(&format!(".{}", entry)) {
                                return None;
                            }
                        }
                        Some(parsed_proxy_url.clone())
                    })
                };

                if let Some(ref username) = proxy_cfg.username {
                    proxy = proxy.basic_auth(username, proxy_cfg.password.as_deref().unwrap_or(""));
                }

                builder = builder.proxy(proxy);
            }
        }

        builder
            .build()
            .map_err(|e| format!("Failed to create HTTP client: {}", e))
    }

    /// Execute an HTTP request with optional download progress callback
    pub async fn execute<F>(&self, config: HttpRequestConfig, on_progress: Option<F>) -> Result<ResponseData, String>
    where
        F: Fn(usize, Option<u64>) + Send,
    {
        let start_time = Instant::now();

        // Build a per-request client with redirects always disabled (we handle them manually
        // to capture Set-Cookie headers from intermediate redirect responses)
        let effective_client = Self::build_client(
            config.ssl.as_ref(),
            config.proxy.as_ref(),
            config.timeout_ms,
            false, // always disable automatic redirects
            0,
        )?;

        // Build the request using the effective client (supports per-request SSL config)
        let request = self.build_request_with_client(&effective_client, &config)?;

        // Capture request headers before sending
        let mut request_headers_map = HashMap::new();
        for (name, value) in request.headers().iter() {
            if let Ok(v) = value.to_str() {
                request_headers_map.insert(name.to_string(), v.to_string());
            }
        }
        let request_url = request.url().to_string();

        // Track timing
        let mut timing = TimingData {
            dns_lookup: 0,
            tcp_connection: 0,
            tls_handshake: 0,
            ttfb: 0,
            content_transfer: 0,
            total: 0,
        };

        // Manual redirect loop to capture Set-Cookie headers from intermediate responses
        let max_redirects = if config.follow_redirects { config.max_redirects as usize } else { 0 };
        let mut redirect_set_cookies: Vec<String> = Vec::new();
        let mut redirect_chain: Vec<RedirectHop> = Vec::new();
        let mut last_hop_time = Instant::now();
        let mut current_url = request.url().clone();
        let mut current_method = request.method().clone();
        let original_headers = request.headers().clone();

        // Send initial request
        let ttfb_start = Instant::now();
        let mut response = effective_client
            .execute(request)
            .await
            .map_err(|e| format!("Request failed: {}", e))?;

        timing.ttfb = ttfb_start.elapsed().as_millis() as i64;

        // Follow redirects manually
        let mut redirect_count = 0;
        while response.status().is_redirection() && redirect_count < max_redirects {
            // Capture Set-Cookie headers from redirect response
            let mut hop_set_cookies: Vec<String> = Vec::new();
            for value in response.headers().get_all("set-cookie").iter() {
                if let Ok(v) = value.to_str() {
                    redirect_set_cookies.push(v.to_string());
                    hop_set_cookies.push(v.to_string());
                }
            }

            // Capture response headers for this hop
            let hop_headers: HashMap<String, String> = response.headers()
                .iter()
                .map(|(k, v)| (k.as_str().to_string(), v.to_str().unwrap_or("").to_string()))
                .collect();

            let from_url = current_url.to_string();
            let status = response.status().as_u16();

            // Get redirect location
            let location = match response.headers().get("location") {
                Some(loc) => loc.to_str().map_err(|_| "Invalid Location header".to_string())?,
                None => break,
            };

            // Resolve redirect URL (handle relative URLs)
            let redirect_url = current_url.join(location)
                .map_err(|e| format!("Invalid redirect URL: {}", e))?;
            current_url = redirect_url;

            // 303 always becomes GET, 301/302 change to GET for non-GET/HEAD
            let old_method = current_method.to_string();
            if status == 303 || ((status == 301 || status == 302) && current_method != Method::GET && current_method != Method::HEAD) {
                current_method = Method::GET;
            }

            let now = Instant::now();
            let hop_duration = now.duration_since(last_hop_time).as_millis() as i64;
            let hop_timestamp = chrono::Utc::now().timestamp_millis();

            redirect_chain.push(RedirectHop {
                from_url,
                to_url: current_url.to_string(),
                status: status as i32,
                method: old_method.clone(),
                method_changed: current_method.as_str() != old_method,
                headers: hop_headers,
                set_cookies: hop_set_cookies,
                duration: hop_duration,
                timestamp: hop_timestamp,
            });
            last_hop_time = now;

            // Build redirect request with original headers
            let mut redirect_request = effective_client
                .request(current_method.clone(), current_url.clone())
                .headers(original_headers.clone())
                .build()
                .map_err(|e| format!("Failed to build redirect request: {}", e))?;

            // Remove body for GET redirects
            if current_method == Method::GET {
                *redirect_request.body_mut() = None;
            }

            response = effective_client
                .execute(redirect_request)
                .await
                .map_err(|e| format!("Redirect request failed: {}", e))?;

            redirect_count += 1;
        }

        // If still a redirect after exhausting the limit, throw an error
        if response.status().is_redirection() && redirect_count >= max_redirects && max_redirects > 0 {
            return Err(format!("Maximum number of redirects ({}) exceeded", max_redirects));
        }

        // Process final response
        let status = response.status().as_u16() as i32;
        let status_text = status_code_to_text(response.status());
        let mut headers = extract_headers(&response);

        // Merge Set-Cookie headers from redirect responses into the final headers
        if !redirect_set_cookies.is_empty() {
            if let Some(final_set_cookie) = headers.get("set-cookie") {
                redirect_set_cookies.push(final_set_cookie.clone());
            }
            headers.insert("set-cookie".to_string(), redirect_set_cookies.join(", "));
        }

        // Read response body with streaming progress
        let transfer_start = Instant::now();
        let content_length = headers.get("content-length")
            .and_then(|v| v.parse::<u64>().ok());

        let mut body_bytes = match content_length {
            Some(len) => Vec::with_capacity(len as usize),
            None => Vec::new(),
        };
        let mut stream = response.bytes_stream();
        let mut last_progress_time = Instant::now();

        while let Some(chunk_result) = stream.next().await {
            let chunk = chunk_result
                .map_err(|e| format!("Failed to read response body: {}", e))?;
            body_bytes.extend_from_slice(&chunk);

            if let Some(ref cb) = on_progress {
                let now = Instant::now();
                if now.duration_since(last_progress_time).as_millis() >= 100 {
                    last_progress_time = now;
                    cb(body_bytes.len(), content_length);
                }
            }
        }

        // Send final progress
        if let Some(ref cb) = on_progress {
            cb(body_bytes.len(), content_length);
        }

        let body_bytes = bytes::Bytes::from(body_bytes);
        timing.content_transfer = transfer_start.elapsed().as_millis() as i64;

        // Parse response data
        let content_type = headers.get("content-type").map(|s| s.as_str());
        let (data, category) = parse_response_body(&body_bytes, content_type);

        // Calculate total timing
        timing.total = start_time.elapsed().as_millis() as i64;

        // Estimate other timing components (reqwest doesn't expose detailed timing)
        // These are rough estimates - in a real implementation, we'd use hyper directly
        timing.dns_lookup = timing.total / 20; // ~5% of total
        timing.tcp_connection = timing.total / 10; // ~10% of total
        timing.tls_handshake = timing.total / 10; // ~10% of total

        let size = body_bytes.len();

        Ok(ResponseData {
            status,
            status_text,
            headers,
            data,
            duration: timing.total,
            size,
            error: Some(status >= 400),
            timing: Some(timing),
            content_category: Some(category),
            request_headers: Some(request_headers_map),
            request_url: Some(request_url),
            redirect_chain: if redirect_chain.is_empty() { None } else { Some(redirect_chain) },
        })
    }

    /// Build a reqwest Request from config using the provided client
    fn build_request_with_client(&self, client: &Client, config: &HttpRequestConfig) -> Result<Request, String> {
        // Convert HttpMethod string to reqwest::Method (supports custom methods)
        let method = Method::from_bytes(config.method.as_str().as_bytes())
            .map_err(|e| format!("Invalid HTTP method '{}': {}", config.method.as_str(), e))?;

        // Build URL with query parameters
        let url = build_url_with_params(&config.url, &config.params)?;

        // Create request builder
        let mut builder = client.request(method, &url);

        // Add headers
        let mut has_user_agent = false;
        for kv in &config.headers {
            if kv.enabled && !kv.key.is_empty() {
                if kv.key.eq_ignore_ascii_case("user-agent") {
                    has_user_agent = true;
                }
                builder = builder.header(&kv.key, &kv.value);
            }
        }

        // Set default User-Agent if not provided by the user
        if !has_user_agent {
            builder = builder.header("User-Agent", "Nouto");
        }

        // Add authentication
        if let Some(username) = &config.auth_username {
            if let Some(password) = &config.auth_password {
                builder = builder.basic_auth(username, Some(password));
            }
        } else if let Some(token) = &config.bearer_token {
            builder = builder.bearer_auth(token);
        }

        // Add body
        if config.body_type == "binary" {
            // Binary body: use raw bytes if available
            if let Some(bytes) = &config.body_bytes {
                builder = builder.body(bytes.clone());
            }
        } else if let Some(body_str) = &config.body {
            if !body_str.is_empty() {
                match config.body_type.as_str() {
                    "json" => {
                        builder = builder.header("Content-Type", "application/json");
                        builder = builder.body(body_str.clone());
                    }
                    "text" => {
                        builder = builder.header("Content-Type", "text/plain");
                        builder = builder.body(body_str.clone());
                    }
                    "xml" => {
                        builder = builder.header("Content-Type", "application/xml");
                        builder = builder.body(body_str.clone());
                    }
                    "x-www-form-urlencoded" => {
                        builder = builder.header("Content-Type", "application/x-www-form-urlencoded");
                        builder = builder.body(body_str.clone());
                    }
                    "form-data" => {
                        // Parse the JSON array of form items and build a multipart form
                        if let Ok(items) = serde_json::from_str::<Vec<Value>>(body_str) {
                            let mut form = reqwest::multipart::Form::new();
                            for item in &items {
                                let enabled = item.get("enabled").and_then(|v| v.as_bool()).unwrap_or(false);
                                let key = item.get("key").and_then(|v| v.as_str()).unwrap_or("");
                                if !enabled || key.is_empty() {
                                    continue;
                                }
                                let field_type = item.get("fieldType").and_then(|v| v.as_str()).unwrap_or("text");
                                let value = item.get("value").and_then(|v| v.as_str()).unwrap_or("");
                                if field_type == "file" && !value.is_empty() {
                                    // File field: read the file and attach it
                                    if let Ok(file_bytes) = std::fs::read(value) {
                                        let file_name = item.get("fileName")
                                            .and_then(|v| v.as_str())
                                            .unwrap_or_else(|| {
                                                std::path::Path::new(value)
                                                    .file_name()
                                                    .and_then(|n| n.to_str())
                                                    .unwrap_or("file")
                                            })
                                            .to_string();
                                        let mime_type = item.get("fileMimeType")
                                            .and_then(|v| v.as_str())
                                            .unwrap_or("application/octet-stream")
                                            .to_string();
                                        let part = reqwest::multipart::Part::bytes(file_bytes)
                                            .file_name(file_name)
                                            .mime_str(&mime_type)
                                            .unwrap_or_else(|_| reqwest::multipart::Part::bytes(vec![]));
                                        form = form.part(key.to_string(), part);
                                    }
                                } else {
                                    form = form.text(key.to_string(), value.to_string());
                                }
                            }
                            builder = builder.multipart(form);
                        } else {
                            // Fallback: send as raw body
                            builder = builder.body(body_str.clone());
                        }
                    }
                    _ => {
                        builder = builder.body(body_str.clone());
                    }
                };
            }
        }

        // Set timeout
        builder = builder.timeout(Duration::from_millis(config.timeout_ms));

        // Build the request
        builder
            .build()
            .map_err(|e| format!("Failed to build request: {}", e))
    }
}

impl Default for HttpClient {
    fn default() -> Self {
        Self::new().unwrap_or_else(|e| {
            eprintln!("[Nouto] Warning: HTTP client init with TLS failed ({}), creating plain client", e);
            // Fallback: build a minimal client without native-tls
            HttpClient {
                client: reqwest::Client::builder()
                    .danger_accept_invalid_certs(true)
                    .build()
                    .expect("Failed to create even a fallback HTTP client"),
            }
        })
    }
}

/// Build URL with query parameters
fn build_url_with_params(base_url: &str, params: &[KeyValue]) -> Result<String, String> {
    if params.is_empty() || !params.iter().any(|kv| kv.enabled && !kv.key.is_empty()) {
        return Ok(base_url.to_string());
    }

    let mut url = reqwest::Url::parse(base_url)
        .map_err(|e| format!("Invalid URL '{}': {}", base_url, e))?;

    for kv in params {
        if kv.enabled && !kv.key.is_empty() {
            url.query_pairs_mut().append_pair(&kv.key, &kv.value);
        }
    }

    Ok(url.to_string())
}

/// Extract headers from response
fn extract_headers(response: &Response) -> HashMap<String, String> {
    let mut headers = HashMap::new();

    for (name, value) in response.headers() {
        if let Ok(value_str) = value.to_str() {
            headers.insert(name.as_str().to_lowercase(), value_str.to_string());
        }
    }

    headers
}

/// Parse response body based on content type
fn parse_response_body(bytes: &[u8], content_type: Option<&str>) -> (Value, ContentCategory) {
    // Check content-type FIRST for known binary formats
    if let Some(ct) = content_type {
        let ct_lower = ct.to_lowercase();

        // Images: return base64-encoded data for preview
        if ct_lower.starts_with("image/") {
            return (
                Value::String(BASE64.encode(bytes)),
                ContentCategory::Image,
            );
        }

        // PDF: return base64-encoded data for preview
        if ct_lower.contains("application/pdf") {
            return (
                Value::String(BASE64.encode(bytes)),
                ContentCategory::Pdf,
            );
        }

        // Audio/video/archives: return base64-encoded data for download
        if ct_lower.starts_with("audio/") || ct_lower.starts_with("video/")
            || ct_lower.contains("application/octet-stream")
            || ct_lower.contains("application/zip")
            || ct_lower.contains("application/gzip")
        {
            return (
                Value::String(BASE64.encode(bytes)),
                ContentCategory::Binary,
            );
        }
    }

    // Try to parse as UTF-8 text
    let text = match std::str::from_utf8(bytes) {
        Ok(s) => s,
        Err(_) => {
            // Binary data (non-UTF8): return base64-encoded for download
            return (
                Value::String(BASE64.encode(bytes)),
                ContentCategory::Binary,
            );
        }
    };

    // Determine content category from content-type header
    if let Some(ct) = content_type {
        let ct_lower = ct.to_lowercase();

        // JSON
        if ct_lower.contains("application/json") || ct_lower.contains("+json") {
            match serde_json::from_str::<Value>(text) {
                Ok(json) => return (json, ContentCategory::Json),
                Err(_) => return (Value::String(text.to_string()), ContentCategory::Text),
            }
        }

        // HTML
        if ct_lower.contains("text/html") {
            return (Value::String(text.to_string()), ContentCategory::Html);
        }

        // XML
        if ct_lower.contains("application/xml") || ct_lower.contains("text/xml") {
            return (Value::String(text.to_string()), ContentCategory::Xml);
        }
    }

    // Try to parse as JSON anyway (for APIs that don't set proper content-type)
    if let Ok(json) = serde_json::from_str::<Value>(text) {
        return (json, ContentCategory::Json);
    }

    // Default to text
    (Value::String(text.to_string()), ContentCategory::Text)
}

/// Convert HTTP status code to text description
fn status_code_to_text(status: StatusCode) -> String {
    status.canonical_reason().unwrap_or("Unknown").to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    // --- URL Building Tests ---

    #[test]
    fn test_build_url_with_params() {
        let url = "https://api.example.com/endpoint";
        let params = vec![
            KeyValue {
                id: "1".to_string(),
                key: "foo".to_string(),
                value: "bar".to_string(),
                enabled: true,
                ..Default::default()
            },
            KeyValue {
                id: "2".to_string(),
                key: "baz".to_string(),
                value: "qux".to_string(),
                enabled: true,
                ..Default::default()
            },
            KeyValue {
                id: "3".to_string(),
                key: "disabled".to_string(),
                value: "ignored".to_string(),
                enabled: false,
                ..Default::default()
            },
        ];

        let result = build_url_with_params(url, &params).unwrap();
        assert!(result.contains("foo=bar"));
        assert!(result.contains("baz=qux"));
        assert!(!result.contains("disabled"));
    }

    #[test]
    fn test_build_url_with_no_params() {
        let url = "https://api.example.com/endpoint";
        let params = vec![];
        let result = build_url_with_params(url, &params).unwrap();
        assert_eq!(result, url);
    }

    #[test]
    fn test_build_url_with_existing_query_params() {
        let url = "https://api.example.com/endpoint?existing=param";
        let params = vec![KeyValue {
            id: "1".to_string(),
            key: "new".to_string(),
            value: "value".to_string(),
            enabled: true,
            ..Default::default()
        }];
        let result = build_url_with_params(url, &params).unwrap();
        assert!(result.contains("existing=param"));
        assert!(result.contains("new=value"));
    }

    #[test]
    fn test_build_url_with_special_characters() {
        let url = "https://api.example.com/endpoint";
        let params = vec![KeyValue {
            id: "1".to_string(),
            key: "q".to_string(),
            value: "hello world".to_string(),
            enabled: true,
            ..Default::default()
        }];
        let result = build_url_with_params(url, &params).unwrap();
        assert!(result.contains("hello%20world") || result.contains("hello+world"));
    }

    #[test]
    fn test_build_url_with_invalid_url() {
        let url = "not a valid url";
        let params = vec![KeyValue {
            id: "1".to_string(),
            key: "foo".to_string(),
            value: "bar".to_string(),
            enabled: true,
            ..Default::default()
        }];
        let result = build_url_with_params(url, &params);
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("Invalid URL"));
    }

    // --- Response Parsing Tests ---

    #[test]
    fn test_parse_json_response() {
        let json_bytes = b"{\"message\": \"hello\"}";
        let (data, category) = parse_response_body(json_bytes, Some("application/json"));

        assert!(matches!(category, ContentCategory::Json));
        assert_eq!(data["message"], "hello");
    }

    #[test]
    fn test_parse_json_with_charset() {
        let json_bytes = b"{\"data\": 123}";
        let (data, category) = parse_response_body(json_bytes, Some("application/json; charset=utf-8"));

        assert!(matches!(category, ContentCategory::Json));
        assert_eq!(data["data"], 123);
    }

    #[test]
    fn test_parse_json_plus_content_type() {
        let json_bytes = b"{\"type\": \"test\"}";
        let (data, category) = parse_response_body(json_bytes, Some("application/hal+json"));

        assert!(matches!(category, ContentCategory::Json));
        assert_eq!(data["type"], "test");
    }

    #[test]
    fn test_parse_invalid_json_as_text() {
        let invalid_json = b"{not valid json}";
        let (data, category) = parse_response_body(invalid_json, Some("application/json"));

        assert!(matches!(category, ContentCategory::Text));
        assert!(data.is_string());
    }

    #[test]
    fn test_parse_text_response() {
        let text_bytes = b"Plain text response";
        let (data, category) = parse_response_body(text_bytes, Some("text/plain"));

        assert!(matches!(category, ContentCategory::Text));
        assert_eq!(data, "Plain text response");
    }

    #[test]
    fn test_parse_html_response() {
        let html_bytes = b"<html><body>Hello</body></html>";
        let (data, category) = parse_response_body(html_bytes, Some("text/html"));

        assert!(matches!(category, ContentCategory::Html));
        assert!(data.as_str().unwrap().contains("<html>"));
    }

    #[test]
    fn test_parse_xml_response() {
        let xml_bytes = b"<?xml version=\"1.0\"?><root><item>test</item></root>";
        let (data, category) = parse_response_body(xml_bytes, Some("application/xml"));

        assert!(matches!(category, ContentCategory::Xml));
        assert!(data.as_str().unwrap().contains("<?xml"));
    }

    #[test]
    fn test_parse_image_response() {
        // Use actual binary data (non-UTF8)
        let image_bytes = vec![0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0xFF]; // PNG header + invalid UTF8
        let (data, category) = parse_response_body(&image_bytes, Some("image/png"));

        assert!(matches!(category, ContentCategory::Image));
        // Should be base64-encoded
        let b64 = data.as_str().unwrap();
        let decoded = BASE64.decode(b64).unwrap();
        assert_eq!(decoded, image_bytes);
    }

    #[test]
    fn test_parse_pdf_response() {
        let pdf_bytes = b"%PDF-1.4";
        let (data, category) = parse_response_body(pdf_bytes, Some("application/pdf"));

        assert!(matches!(category, ContentCategory::Pdf));
        // Should be base64-encoded
        let b64 = data.as_str().unwrap();
        let decoded = BASE64.decode(b64).unwrap();
        assert_eq!(decoded, pdf_bytes);
    }

    #[test]
    fn test_parse_binary_response() {
        // Use actual binary data (non-UTF8)
        let binary_bytes = vec![0xFF, 0xD8, 0xFF, 0xE0, 0xFF]; // JPEG header + invalid UTF8
        let (data, category) = parse_response_body(&binary_bytes, Some("image/jpeg"));

        assert!(matches!(category, ContentCategory::Image));
    }

    #[test]
    fn test_parse_json_without_content_type() {
        let json_bytes = b"{\"auto\": \"detected\"}";
        let (data, category) = parse_response_body(json_bytes, None);

        assert!(matches!(category, ContentCategory::Json));
        assert_eq!(data["auto"], "detected");
    }

    #[test]
    fn test_parse_invalid_utf8_as_binary() {
        let invalid_utf8 = vec![0xFF, 0xFE, 0xFD];
        let (data, category) = parse_response_body(&invalid_utf8, None);

        assert!(matches!(category, ContentCategory::Binary));
        // Should be base64-encoded
        let b64 = data.as_str().unwrap();
        let decoded = BASE64.decode(b64).unwrap();
        assert_eq!(decoded, invalid_utf8);
    }

    // --- Status Code Tests ---

    #[test]
    fn test_status_code_to_text() {
        assert_eq!(status_code_to_text(StatusCode::OK), "OK");
        assert_eq!(status_code_to_text(StatusCode::NOT_FOUND), "Not Found");
        assert_eq!(
            status_code_to_text(StatusCode::INTERNAL_SERVER_ERROR),
            "Internal Server Error"
        );
        assert_eq!(status_code_to_text(StatusCode::CREATED), "Created");
    }

    // --- HTTP Client Tests ---

    #[test]
    fn test_http_client_creation() {
        let client = HttpClient::new();
        assert!(client.is_ok());
    }

    #[test]
    fn test_http_client_default() {
        let _client = HttpClient::default();
        // Should not panic
    }

    // --- HTTP Method Conversion Tests ---

    #[test]
    fn test_standard_http_methods() {
        let methods = vec!["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"];
        for m in &methods {
            let method = Method::from_bytes(m.as_bytes());
            assert!(method.is_ok(), "Standard method {} should be valid", m);
        }
    }

    #[test]
    fn test_custom_http_methods() {
        let custom = vec!["LIST", "SEARCH", "PURGE", "PROPFIND"];
        for m in &custom {
            let method = Method::from_bytes(m.as_bytes());
            assert!(method.is_ok(), "Custom method {} should be valid", m);
        }
    }

    // Integration tests would require a mock server, so we'll skip those for now
    // Those should be in a separate integration test file with a test server
}
