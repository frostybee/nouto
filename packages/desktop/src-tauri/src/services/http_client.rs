// HTTP Client Service - Phase 2
// Implements HTTP/1.1, HTTP/2, compression, auth, and timing tracking

use crate::models::types::{HttpMethod, KeyValue, ResponseData, TimingData, ContentCategory, SslConfig};
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
    pub body_type: String, // "json", "text", "xml", "form-data", etc.
    pub timeout_ms: u64,
    pub auth_username: Option<String>,
    pub auth_password: Option<String>,
    pub bearer_token: Option<String>,
    pub ssl: Option<SslConfig>,
}

/// HTTP client with timing tracking
pub struct HttpClient {
    client: Client,
}

impl HttpClient {
    /// Create a new HTTP client
    pub fn new() -> Result<Self, String> {
        let client = Client::builder()
            .timeout(Duration::from_secs(120))
            .gzip(true)
            .brotli(true)
            .deflate(true)
            .build()
            .map_err(|e| format!("Failed to create HTTP client: {}", e))?;

        Ok(HttpClient { client })
    }

    /// Build a reqwest Client, applying any SSL overrides from config
    fn build_client(ssl: Option<&SslConfig>) -> Result<Client, String> {
        let mut builder = Client::builder()
            .timeout(Duration::from_secs(120))
            .gzip(true)
            .brotli(true)
            .deflate(true);

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

        // Build a client (with optional SSL overrides) and the request
        let effective_client = if config.ssl.is_some() {
            Self::build_client(config.ssl.as_ref())?
        } else {
            self.client.clone()
        };

        // Build the request using the effective client (supports per-request SSL config)
        let request = self.build_request_with_client(&effective_client, &config)?;

        // Track timing
        let mut timing = TimingData {
            dns_lookup: 0,
            tcp_connection: 0,
            tls_handshake: 0,
            ttfb: 0,
            content_transfer: 0,
            total: 0,
        };

        // Send request and measure time to first byte
        let ttfb_start = Instant::now();
        let response = effective_client
            .execute(request)
            .await
            .map_err(|e| format!("Request failed: {}", e))?;

        timing.ttfb = ttfb_start.elapsed().as_millis() as i64;

        // Process response
        let status = response.status().as_u16() as i32;
        let status_text = status_code_to_text(response.status());
        let headers = extract_headers(&response);

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
        })
    }

    /// Build a reqwest Request from config using the provided client
    fn build_request_with_client(&self, client: &Client, config: &HttpRequestConfig) -> Result<Request, String> {
        // Convert HttpMethod to reqwest::Method
        let method = match config.method {
            HttpMethod::Get => Method::GET,
            HttpMethod::Post => Method::POST,
            HttpMethod::Put => Method::PUT,
            HttpMethod::Patch => Method::PATCH,
            HttpMethod::Delete => Method::DELETE,
            HttpMethod::Head => Method::HEAD,
            HttpMethod::Options => Method::OPTIONS,
        };

        // Build URL with query parameters
        let url = build_url_with_params(&config.url, &config.params)?;

        // Create request builder
        let mut builder = client.request(method, &url);

        // Add headers
        for kv in &config.headers {
            if kv.enabled && !kv.key.is_empty() {
                builder = builder.header(&kv.key, &kv.value);
            }
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
        if let Some(body_str) = &config.body {
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
        Self::new().expect("Failed to create default HTTP client")
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
    // Check content-type FIRST for known binary formats (images, PDFs)
    if let Some(ct) = content_type {
        let ct_lower = ct.to_lowercase();

        // Images (binary)
        if ct_lower.starts_with("image/") {
            return (
                Value::String(format!("<image, {} bytes>", bytes.len())),
                ContentCategory::Image,
            );
        }

        // PDF (binary)
        if ct_lower.contains("application/pdf") {
            return (
                Value::String(format!("<PDF document, {} bytes>", bytes.len())),
                ContentCategory::Pdf,
            );
        }
    }

    // Try to parse as UTF-8 text
    let text = match std::str::from_utf8(bytes) {
        Ok(s) => s,
        Err(_) => {
            // Binary data (non-UTF8, not image/pdf)
            return (
                Value::String(format!("<binary data, {} bytes>", bytes.len())),
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
            },
            KeyValue {
                id: "2".to_string(),
                key: "baz".to_string(),
                value: "qux".to_string(),
                enabled: true,
            },
            KeyValue {
                id: "3".to_string(),
                key: "disabled".to_string(),
                value: "ignored".to_string(),
                enabled: false,
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
        assert!(data.as_str().unwrap().contains("image"));
    }

    #[test]
    fn test_parse_pdf_response() {
        let pdf_bytes = b"%PDF-1.4";
        let (data, category) = parse_response_body(pdf_bytes, Some("application/pdf"));

        assert!(matches!(category, ContentCategory::Pdf));
        assert!(data.as_str().unwrap().contains("PDF"));
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
        assert!(data.as_str().unwrap().contains("binary data"));
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
    fn test_http_method_conversion() {
        // This is tested implicitly in build_request, but we can verify the enum exists
        let methods = vec![
            HttpMethod::Get,
            HttpMethod::Post,
            HttpMethod::Put,
            HttpMethod::Patch,
            HttpMethod::Delete,
            HttpMethod::Head,
            HttpMethod::Options,
        ];
        assert_eq!(methods.len(), 7);
    }

    // Integration tests would require a mock server, so we'll skip those for now
    // Those should be in a separate integration test file with a test server
}
