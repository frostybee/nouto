use crate::error::AppError;
use base64::Engine;
use jsonschema::error::ValidationErrorKind;
use jsonschema::{Draft, JSONSchema, ValidationError};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::{HashMap, HashSet};
use std::sync::{Arc, OnceLock};
use std::time::Duration;
use tokio::sync::RwLock;

/// One meta-schema violation, pointer-addressed so the webview can range it
/// via its pointer map. Mirrors core's OpenApiDiagnostic 'schema' source.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SchemaDiagnostic {
    /// RFC 6901 JSON Pointer into the validated document.
    pub pointer: String,
    pub message: String,
    /// Set for `required` failures so the webview can anchor the marker on
    /// the owning key (core's `data.missingProperty` convention).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub missing_property: Option<String>,
}

/// Compiled-schema cache keyed by OpenAPI minor version ("3.0"/"3.1"/"3.2"),
/// so keystroke-driven validation only re-validates, never recompiles.
pub type SchemaValidatorCache = Arc<RwLock<HashMap<String, Arc<JSONSchema>>>>;

pub fn init_schema_validator_cache() -> SchemaValidatorCache {
    Arc::new(RwLock::new(HashMap::new()))
}

// Single source of truth: the vendored schemas in packages/core. 3.0 is
// draft-04 and uses the upstream schema as-is. 3.1/3.2 use the editor
// variants ($dynamicRef rewritten to static $ref) because this crate ignores
// $dynamicRef entirely — the upstream schemas would silently skip Schema
// Object interiors. See packages/core/src/services/openapi/schemas/PROVENANCE.md.
const SCHEMA_3_0: &str =
    include_str!("../../../../core/vendor/openapi-schemas/openapi-3.0-schema.raw.json");
const SCHEMA_3_1_EDITOR: &str =
    include_str!("../../../../core/vendor/openapi-schemas/openapi-3.1-schema-editor.raw.json");
const SCHEMA_3_2_EDITOR: &str =
    include_str!("../../../../core/vendor/openapi-schemas/openapi-3.2-schema-editor.raw.json");

fn compile_for_version(version: &str) -> Result<JSONSchema, AppError> {
    let (raw, draft) = match version {
        "3.0" => (SCHEMA_3_0, Draft::Draft4),
        "3.1" => (SCHEMA_3_1_EDITOR, Draft::Draft202012),
        "3.2" => (SCHEMA_3_2_EDITOR, Draft::Draft202012),
        other => {
            return Err(AppError::Other(format!(
                "Unsupported OpenAPI version: {other}"
            )))
        }
    };
    let schema: Value = serde_json::from_str(raw)
        .map_err(|e| AppError::Other(format!("Invalid vendored {version} meta-schema: {e}")))?;
    JSONSchema::options()
        .with_draft(draft)
        .compile(&schema)
        .map_err(|e| AppError::Other(format!("Failed to compile {version} meta-schema: {e}")))
}

/// `required` failures render as "Missing property 'x'" (parity with core's
/// Ajv wording) plus a structured `missing_property`. Everything else keeps
/// this crate's own Display wording — unlike Ajv there is no oneOf/anyOf
/// per-branch fan-out to collapse (OneOf/AnyOf report one top-level error).
fn diagnostic_parts(err: &ValidationError) -> (String, Option<String>) {
    if let ValidationErrorKind::Required { property } = &err.kind {
        let name = property.as_str().map(str::to_string).unwrap_or_else(|| property.to_string());
        return (format!("Missing property '{name}'"), Some(name));
    }
    (err.to_string(), None)
}

/// Pathological-input safety net, not an expected ceiling.
const MAX_DIAGNOSTICS: usize = 300;

fn collect_diagnostics(compiled: &JSONSchema, spec: &Value) -> Vec<SchemaDiagnostic> {
    let mut seen = HashSet::new();
    let mut out = Vec::new();
    if let Err(errors) = compiled.validate(spec) {
        for err in errors {
            if out.len() >= MAX_DIAGNOSTICS {
                break;
            }
            let pointer = err.instance_path.to_string();
            let (message, missing_property) = diagnostic_parts(&err);
            if !seen.insert((pointer.clone(), message.clone())) {
                continue;
            }
            out.push(SchemaDiagnostic {
                pointer,
                message,
                missing_property,
            });
        }
    }
    out
}

/// Core logic, decoupled from tauri::State so it is unit-testable with a
/// bare cache. The #[tauri::command] below is a thin wrapper.
pub async fn validate_openapi_schema_with(
    cache: &SchemaValidatorCache,
    spec: &Value,
    version: &str,
) -> Result<Vec<SchemaDiagnostic>, AppError> {
    if let Some(compiled) = cache.read().await.get(version) {
        return Ok(collect_diagnostics(compiled, spec));
    }
    let compiled = Arc::new(compile_for_version(version)?);
    cache
        .write()
        .await
        .insert(version.to_string(), Arc::clone(&compiled));
    Ok(collect_diagnostics(&compiled, spec))
}

#[tauri::command]
pub async fn validate_openapi_schema(
    spec: serde_json::Value,
    version: String,
    cache: tauri::State<'_, SchemaValidatorCache>,
) -> Result<Vec<SchemaDiagnostic>, AppError> {
    validate_openapi_schema_with(cache.inner(), &spec, &version).await
}

// ---------------------------------------------------------------------------
// OpenAPI preview "Try it out" proxy.
//
// The preview's sandboxed renderer frame has `connect-src 'none'`, so its
// fetch shim forwards every request to the shell, which invokes this command.
// Deliberately NOT built on services/http_client.rs: the preview speaks the
// transport ProxyHttpRequest/ProxyHttpResponse shapes (flat header map, text
// body) and needs none of the cookie/redirect-chain/timeline machinery.
// Unlike send_request this returns the response directly — routing through
// the global `requestResponse` event would corrupt the main response view.
// ---------------------------------------------------------------------------

/// Transport `ProxyHttpRequest` (packages/transport/src/messages.ts).
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProxyFetchRequest {
    pub method: String,
    pub url: String,
    #[serde(default)]
    pub headers: HashMap<String, String>,
    pub body: Option<String>,
    /// "utf8" (default) | "base64".
    pub body_encoding: Option<String>,
}

/// Transport `ProxyHttpResponse`.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProxyFetchResponse {
    pub status: u16,
    pub status_text: String,
    pub headers: HashMap<String, String>,
    pub body: String,
    pub body_encoding: String,
    /// Final URL after redirects.
    pub url: String,
}

const PROXY_TIMEOUT_SECS: u64 = 30;
const PROXY_MAX_REDIRECTS: usize = 10;

/// Hop-by-hop/derived headers the client must not forward (mirrors the
/// VS Code host's sanitizeProxyHeaders).
const PROXY_DROP_HEADERS: &[&str] = &["host", "content-length", "connection"];

fn sanitize_proxy_headers(headers: &HashMap<String, String>) -> Vec<(String, String)> {
    headers
        .iter()
        .filter(|(name, _)| {
            let lower = name.to_ascii_lowercase();
            !PROXY_DROP_HEADERS.contains(&lower.as_str())
        })
        .map(|(name, value)| (name.clone(), value.clone()))
        .collect()
}

fn decode_proxy_body(body: String, encoding: Option<&str>) -> Result<Vec<u8>, AppError> {
    match encoding {
        Some("base64") => base64::engine::general_purpose::STANDARD
            .decode(body)
            .map_err(|e| AppError::Other(format!("Invalid base64 request body: {e}"))),
        _ => Ok(body.into_bytes()),
    }
}

/// Response bodies stay utf8 when possible; binary payloads (images, …) are
/// base64-encoded so they survive the JSON invoke boundary.
fn encode_proxy_body(bytes: &[u8]) -> (String, String) {
    match std::str::from_utf8(bytes) {
        Ok(text) => (text.to_string(), "utf8".to_string()),
        Err(_) => (
            base64::engine::general_purpose::STANDARD.encode(bytes),
            "base64".to_string(),
        ),
    }
}

fn proxy_client() -> Result<&'static reqwest::Client, AppError> {
    static CLIENT: OnceLock<reqwest::Client> = OnceLock::new();
    if let Some(client) = CLIENT.get() {
        return Ok(client);
    }
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(PROXY_TIMEOUT_SECS))
        .redirect(reqwest::redirect::Policy::limited(PROXY_MAX_REDIRECTS))
        .build()?;
    Ok(CLIENT.get_or_init(|| client))
}

#[tauri::command]
pub async fn openapi_proxy_fetch(
    request: ProxyFetchRequest,
) -> Result<ProxyFetchResponse, AppError> {
    let method = reqwest::Method::from_bytes(request.method.to_uppercase().as_bytes())
        .map_err(|_| AppError::Other(format!("Invalid HTTP method: {}", request.method)))?;

    let mut builder = proxy_client()?.request(method, &request.url);
    for (name, value) in sanitize_proxy_headers(&request.headers) {
        builder = builder.header(name, value);
    }
    if let Some(body) = request.body {
        builder = builder.body(decode_proxy_body(body, request.body_encoding.as_deref())?);
    }

    let response = builder.send().await?;
    let status = response.status();
    let url = response.url().to_string();
    let mut headers: HashMap<String, String> = HashMap::new();
    for (name, value) in response.headers() {
        let value = String::from_utf8_lossy(value.as_bytes()).into_owned();
        headers
            .entry(name.to_string())
            .and_modify(|existing| {
                existing.push_str(", ");
                existing.push_str(&value);
            })
            .or_insert(value);
    }
    let bytes = response.bytes().await?;
    let (body, body_encoding) = encode_proxy_body(&bytes);

    Ok(ProxyFetchResponse {
        status: status.as_u16(),
        status_text: status.canonical_reason().unwrap_or_default().to_string(),
        headers,
        body,
        body_encoding,
        url,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn valid_doc_31() -> Value {
        json!({
            "openapi": "3.1.0",
            "info": { "title": "Test API", "version": "1.0.0" },
            "paths": {
                "/users": { "get": { "responses": { "200": { "description": "OK" } } } }
            }
        })
    }

    /// Transcribed from core's schemas/index.test.ts $dynamicRef regression
    /// coverage: Schema Objects in parameters, request bodies, and components
    /// must validate cleanly (the editor-variant schema's static $ref rewrite
    /// is what reaches these interiors in this crate).
    fn schema_object_doc(openapi_field: &str) -> Value {
        json!({
            "openapi": openapi_field,
            "info": { "title": "T", "version": "1" },
            "paths": {
                "/pets": {
                    "put": {
                        "parameters": [
                            { "name": "verbose", "in": "query", "schema": { "type": "boolean" } }
                        ],
                        "requestBody": {
                            "content": {
                                "application/json": {
                                    "schema": { "$ref": "#/components/schemas/Pet" }
                                }
                            },
                            "required": true
                        },
                        "responses": {
                            "200": {
                                "description": "OK",
                                "content": {
                                    "application/json": {
                                        "schema": { "$ref": "#/components/schemas/Pet" }
                                    }
                                }
                            }
                        }
                    }
                }
            },
            "components": {
                "schemas": {
                    "Pet": {
                        "type": "object",
                        "properties": { "name": { "type": "string" } }
                    }
                }
            }
        })
    }

    #[tokio::test]
    async fn valid_3_1_document_has_no_diagnostics() {
        let cache = init_schema_validator_cache();
        let result = validate_openapi_schema_with(&cache, &valid_doc_31(), "3.1")
            .await
            .unwrap();
        assert!(result.is_empty(), "{result:?}");
    }

    #[tokio::test]
    async fn valid_3_0_document_has_no_diagnostics() {
        let cache = init_schema_validator_cache();
        let doc = json!({
            "openapi": "3.0.3",
            "info": { "title": "Test API", "version": "1.0.0" },
            "paths": {}
        });
        let result = validate_openapi_schema_with(&cache, &doc, "3.0")
            .await
            .unwrap();
        assert!(result.is_empty(), "{result:?}");
    }

    #[tokio::test]
    async fn dynamic_ref_regression_3_1_accepts_nested_schema_objects() {
        let cache = init_schema_validator_cache();
        let result =
            validate_openapi_schema_with(&cache, &schema_object_doc("3.1.0"), "3.1")
                .await
                .unwrap();
        assert!(result.is_empty(), "{result:?}");
    }

    #[tokio::test]
    async fn dynamic_ref_regression_3_2_accepts_nested_schema_objects() {
        let cache = init_schema_validator_cache();
        let result =
            validate_openapi_schema_with(&cache, &schema_object_doc("3.2.0"), "3.2")
                .await
                .unwrap();
        assert!(result.is_empty(), "{result:?}");
    }

    /// Documents the meta-schema validation boundary (parity with VS Code's
    /// Ajv path over the same vendored schemas):
    /// - 3.0's draft-04 meta-schema defines Schema Objects inline, so a bad
    ///   `type` value IS caught.
    /// - The official 3.1/3.2 base meta-schemas constrain Schema Objects to
    ///   `type: [object, boolean]` only — deep keyword validation lives in
    ///   the separate 2020-12 dialect schema, which is not part of the
    ///   vendored document. `type: strings` therefore passes, exactly as it
    ///   does host-side in VS Code.
    #[tokio::test]
    async fn schema_object_interior_validation_matches_meta_schema_scope() {
        let cache = init_schema_validator_cache();

        let doc_30 = json!({
            "openapi": "3.0.3",
            "info": { "title": "T", "version": "1" },
            "paths": {},
            "components": {
                "schemas": { "Pet": { "type": "strings" } }
            }
        });
        let result_30 = validate_openapi_schema_with(&cache, &doc_30, "3.0")
            .await
            .unwrap();
        assert!(
            result_30.iter().any(|d| d.pointer.starts_with("/components/schemas/Pet")),
            "{result_30:?}"
        );

        let mut doc_31 = schema_object_doc("3.1.0");
        doc_31["components"]["schemas"]["Pet"]["type"] = json!("strings");
        let result_31 = validate_openapi_schema_with(&cache, &doc_31, "3.1")
            .await
            .unwrap();
        assert!(result_31.is_empty(), "{result_31:?}");
    }

    #[tokio::test]
    async fn missing_required_property_reports_missing_property_field() {
        let cache = init_schema_validator_cache();
        let result = validate_openapi_schema_with(&cache, &json!({ "openapi": "3.1.0" }), "3.1")
            .await
            .unwrap();
        assert!(!result.is_empty());
        let missing: Vec<_> = result
            .iter()
            .filter_map(|d| d.missing_property.as_deref())
            .collect();
        assert!(missing.contains(&"info"), "{result:?}");
    }

    #[tokio::test]
    async fn unsupported_version_is_rejected() {
        let cache = init_schema_validator_cache();
        assert!(validate_openapi_schema_with(&cache, &json!({}), "9.9")
            .await
            .is_err());
    }

    #[tokio::test]
    async fn second_call_reuses_the_cached_compiled_schema() {
        let cache = init_schema_validator_cache();
        validate_openapi_schema_with(&cache, &valid_doc_31(), "3.1")
            .await
            .unwrap();
        validate_openapi_schema_with(&cache, &valid_doc_31(), "3.1")
            .await
            .unwrap();
        assert_eq!(cache.read().await.len(), 1);
    }

    // --- openapi_proxy_fetch helpers ---

    #[test]
    fn sanitize_drops_hop_by_hop_headers_case_insensitively() {
        let headers: HashMap<String, String> = [
            ("Host", "evil.example"),
            ("Content-Length", "12"),
            ("CONNECTION", "keep-alive"),
            ("Content-Type", "application/json"),
            ("X-Api-Key", "abc"),
        ]
        .into_iter()
        .map(|(k, v)| (k.to_string(), v.to_string()))
        .collect();

        let mut kept: Vec<String> = sanitize_proxy_headers(&headers)
            .into_iter()
            .map(|(name, _)| name)
            .collect();
        kept.sort();
        assert_eq!(kept, vec!["Content-Type", "X-Api-Key"]);
    }

    #[test]
    fn decode_proxy_body_defaults_to_utf8() {
        assert_eq!(
            decode_proxy_body("hello".to_string(), None).unwrap(),
            b"hello"
        );
        assert_eq!(
            decode_proxy_body("hello".to_string(), Some("utf8")).unwrap(),
            b"hello"
        );
    }

    #[test]
    fn decode_proxy_body_handles_base64() {
        assert_eq!(
            decode_proxy_body("aGVsbG8=".to_string(), Some("base64")).unwrap(),
            b"hello"
        );
        assert!(decode_proxy_body("not base64!!".to_string(), Some("base64")).is_err());
    }

    #[test]
    fn encode_proxy_body_keeps_utf8_and_base64s_binary() {
        let (body, encoding) = encode_proxy_body("{\"ok\":true}".as_bytes());
        assert_eq!((body.as_str(), encoding.as_str()), ("{\"ok\":true}", "utf8"));

        let binary = [0xFFu8, 0xFE, 0x00, 0x89];
        let (body, encoding) = encode_proxy_body(&binary);
        assert_eq!(encoding, "base64");
        assert_eq!(
            base64::engine::general_purpose::STANDARD
                .decode(body)
                .unwrap(),
            binary
        );
    }

    #[tokio::test]
    async fn proxy_fetch_rejects_invalid_method_without_network() {
        let result = openapi_proxy_fetch(ProxyFetchRequest {
            method: "NOT A METHOD".to_string(),
            url: "http://localhost/".to_string(),
            headers: HashMap::new(),
            body: None,
            body_encoding: None,
        })
        .await;
        assert!(matches!(result, Err(AppError::Other(_))));
    }
}
