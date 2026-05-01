use crate::models::types::{AuthState, HttpMethod, KeyValue, ProxyConfig, SslConfig};
use crate::services::script_engine::VariableToSet;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::Mutex;
use tokio::task::JoinHandle;

/// Request registry to track and cancel in-flight requests
pub type RequestRegistry = Arc<Mutex<HashMap<String, JoinHandle<()>>>>;

/// Initialize request registry (call this in lib.rs setup)
pub fn init_request_registry() -> RequestRegistry {
    Arc::new(Mutex::new(HashMap::new()))
}

/// Body state from frontend (matches @nouto/core BodyState)
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BodyState {
    #[serde(rename = "type")]
    pub body_type: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub content: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub graphql_variables: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub graphql_operation_name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub file_mime_type: Option<String>,
}

/// Full request data from frontend (matches what UI sends via sendRequest message)
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SendRequestData {
    pub method: HttpMethod,
    pub url: String,
    #[serde(default)]
    pub headers: Vec<KeyValue>,
    #[serde(default)]
    pub params: Vec<KeyValue>,
    pub body: BodyState,
    pub auth: AuthState,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub ssl: Option<SslConfig>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub proxy: Option<ProxyConfig>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub timeout: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub follow_redirects: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub max_redirects: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub request_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub request_name: Option<String>,
    #[serde(default)]
    pub assertions: Option<Vec<Value>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub script_chain: Option<crate::models::types::ScriptChainData>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub env_data: Option<crate::models::types::EnvDataPayload>,
    #[serde(default)]
    pub cookies: Vec<Value>,
}

pub struct AssertionEvalResult {
    pub results: Vec<Value>,
    pub variables_to_set: Vec<VariableToSet>,
}
