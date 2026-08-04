use crate::error::AppError;
use jsonschema::error::ValidationErrorKind;
use jsonschema::{Draft, JSONSchema, ValidationError};
use serde::Serialize;
use serde_json::Value;
use std::collections::{HashMap, HashSet};
use std::sync::Arc;
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
}
