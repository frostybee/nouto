// Type definitions mirroring @nouto/core/src/types.ts
// This is the single source of truth for Rust-side type safety

use serde::{Deserialize, Serialize};
use std::collections::HashMap;

// --- HTTP ---

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(transparent)]
pub struct HttpMethod(pub String);

impl HttpMethod {
    pub fn as_str(&self) -> &str {
        &self.0
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum ConnectionMode {
    Http,
    Websocket,
    Sse,
    Grpc,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum RequestKind {
    Http,
    Graphql,
    Websocket,
    Sse,
    Grpc,
}

// --- Key-Value ---

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct KeyValue {
    pub id: String,
    pub key: String,
    pub value: String,
    pub enabled: bool,
}

// --- Authentication ---

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum AuthType {
    None,
    Basic,
    Bearer,
    #[serde(rename = "apikey")]
    ApiKey,
    OAuth2,
    Aws,
    Ntlm,
    Digest,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum OAuth2GrantType {
    AuthorizationCode,
    ClientCredentials,
    Implicit,
    Password,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OAuth2Config {
    pub grant_type: OAuth2GrantType,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub auth_url: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub token_url: Option<String>,
    pub client_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub client_secret: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub scope: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub state: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub use_pkce: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub username: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub password: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub callback_url: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OAuthToken {
    pub access_token: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub refresh_token: Option<String>,
    pub token_type: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub expires_at: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub scope: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct SslConfig {
    pub reject_unauthorized: Option<bool>,
    pub cert_path: Option<String>,
    pub key_path: Option<String>,
    pub passphrase: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum ProxyProtocol {
    Http,
    Https,
    Socks5,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProxyConfig {
    pub enabled: bool,
    pub protocol: ProxyProtocol,
    pub host: String,
    pub port: u16,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub username: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub password: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub no_proxy: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AuthState {
    #[serde(rename = "type")]
    pub auth_type: AuthType,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub username: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub password: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub token: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub api_key_name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub api_key_value: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub api_key_in: Option<String>, // "header" | "query"
    #[serde(skip_serializing_if = "Option::is_none")]
    pub oauth2: Option<OAuth2Config>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub oauth_token_data: Option<OAuthToken>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub aws_access_key: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub aws_secret_key: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub aws_region: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub aws_service: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub aws_session_token: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub ntlm_domain: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub ntlm_workstation: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum AuthInheritance {
    Inherit,
    None,
    Own,
}

// --- Request Body ---

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum BodyType {
    None,
    Json,
    Text,
    Xml,
    FormData,
    XWwwFormUrlencoded,
    Binary,
    Graphql,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BodyState {
    #[serde(rename = "type")]
    pub body_type: BodyType,
    pub content: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub file_name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub file_size: Option<usize>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub file_mime_type: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub graphql_variables: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub graphql_operation_name: Option<String>,
}

// --- Assertions ---

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum AssertionTarget {
    Status,
    ResponseTime,
    Body,
    JsonQuery,
    Header,
    ContentType,
    SetVariable,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum AssertionOperator {
    Equals,
    NotEquals,
    Contains,
    NotContains,
    GreaterThan,
    LessThan,
    GreaterThanOrEqual,
    LessThanOrEqual,
    Exists,
    NotExists,
    IsType,
    IsJson,
    Count,
    Matches,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Assertion {
    pub id: String,
    pub enabled: bool,
    pub target: AssertionTarget,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub property: Option<String>,
    pub operator: AssertionOperator,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub expected: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub variable_name: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AssertionResult {
    pub assertion_id: String,
    pub passed: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub actual: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub expected: Option<String>,
    pub message: String,
}

// --- Scripts ---

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScriptConfig {
    pub pre_request: String,
    pub post_response: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScriptLogEntry {
    pub level: String, // "log" | "warn" | "error" | "info"
    pub args: Vec<String>,
    pub timestamp: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScriptTestResult {
    pub name: String,
    pub passed: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScriptResult {
    pub success: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
    pub logs: Vec<ScriptLogEntry>,
    pub test_results: Vec<ScriptTestResult>,
    pub variables_to_set: Vec<ScriptVariable>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub modified_request: Option<HashMap<String, serde_json::Value>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub next_request: Option<String>,
    pub duration: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScriptVariable {
    pub key: String,
    pub value: String,
    pub scope: String, // "environment" | "global"
}

// --- Request & Collection Data Model ---

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SavedRequest {
    #[serde(skip_serializing_if = "Option::is_none")]
    #[serde(rename = "type")]
    pub item_type: Option<String>, // "request"
    pub id: String,
    pub name: String,
    pub method: HttpMethod,
    pub url: String,
    pub params: Vec<KeyValue>,
    pub headers: Vec<KeyValue>,
    pub auth: AuthState,
    pub body: BodyState,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub auth_inheritance: Option<AuthInheritance>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub assertions: Option<Vec<Assertion>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub scripts: Option<ScriptConfig>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub grpc: Option<GrpcConfig>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub connection_mode: Option<ConnectionMode>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub last_response_status: Option<i32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub last_response_duration: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub last_response_size: Option<usize>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub last_response_time: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Folder {
    #[serde(rename = "type")]
    pub item_type: String, // "folder"
    pub id: String,
    pub name: String,
    pub children: Vec<CollectionItem>,
    pub expanded: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub auth: Option<AuthState>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub headers: Option<Vec<KeyValue>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub auth_inheritance: Option<AuthInheritance>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub scripts: Option<ScriptConfig>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub color: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub icon: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(untagged)]
pub enum CollectionItem {
    Folder(Folder),
    Request(SavedRequest),
}

impl CollectionItem {
    pub fn is_folder(&self) -> bool {
        matches!(self, CollectionItem::Folder(_))
    }

    pub fn is_request(&self) -> bool {
        matches!(self, CollectionItem::Request(_))
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Collection {
    pub id: String,
    pub name: String,
    pub items: Vec<CollectionItem>,
    pub expanded: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub builtin: Option<String>, // "recent"
    #[serde(skip_serializing_if = "Option::is_none")]
    pub auth: Option<AuthState>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub headers: Option<Vec<KeyValue>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub scripts: Option<ScriptConfig>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub color: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub icon: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

// --- Environment ---

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EnvironmentVariable {
    pub key: String,
    pub value: String,
    pub enabled: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub is_secret: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub secret_ref: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Environment {
    pub id: String,
    pub name: String,
    pub variables: Vec<EnvironmentVariable>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub oauth_tokens: Option<HashMap<String, OAuthToken>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EnvironmentsData {
    pub environments: Vec<Environment>,
    pub active_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub global_variables: Option<Vec<EnvironmentVariable>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub env_file_path: Option<String>,
}

// --- Collection Runner ---

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CollectionRunConfig {
    pub collection_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub folder_id: Option<String>,
    pub stop_on_failure: bool,
    pub delay_ms: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CollectionRunRequestResult {
    pub request_id: String,
    pub request_name: String,
    pub method: HttpMethod,
    pub url: String,
    pub status: i32,
    pub status_text: String,
    pub duration: i64,
    pub size: usize,
    pub passed: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub assertion_results: Option<Vec<AssertionResult>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub script_test_results: Option<Vec<ScriptTestResult>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub response_data: Option<serde_json::Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub response_headers: Option<HashMap<String, String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub script_logs: Option<Vec<ScriptLogEntry>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CollectionRunResult {
    pub collection_id: String,
    pub collection_name: String,
    pub started_at: String,
    pub completed_at: String,
    pub total_requests: usize,
    pub passed_requests: usize,
    pub failed_requests: usize,
    pub skipped_requests: usize,
    pub total_duration: i64,
    pub results: Vec<CollectionRunRequestResult>,
    pub stopped_early: bool,
}

// --- WebSocket ---

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum WebSocketMessageType {
    Text,
    Binary,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum WebSocketDirection {
    Sent,
    Received,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum WebSocketConnectionStatus {
    Disconnected,
    Connecting,
    Connected,
    Error,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WebSocketMessage {
    pub id: String,
    pub direction: WebSocketDirection,
    #[serde(rename = "type")]
    pub message_type: WebSocketMessageType,
    pub data: String,
    pub size: usize,
    pub timestamp: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WebSocketConfig {
    pub url: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub protocols: Option<Vec<String>>,
    pub headers: Vec<KeyValue>,
    pub auto_reconnect: bool,
    pub reconnect_interval_ms: i64,
}

// --- SSE ---

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum SSEConnectionStatus {
    Disconnected,
    Connecting,
    Connected,
    Error,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SSEEvent {
    pub id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub event_id: Option<String>,
    pub event_type: String,
    pub data: String,
    pub timestamp: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SSEConfig {
    pub url: String,
    pub headers: Vec<KeyValue>,
    pub auto_reconnect: bool,
    pub with_credentials: bool,
}

// --- Mock Server ---

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MockRoute {
    pub id: String,
    pub enabled: bool,
    pub method: HttpMethod,
    pub path: String,
    pub status_code: i32,
    pub response_body: String,
    pub response_headers: Vec<KeyValue>,
    pub latency_min: i64,
    pub latency_max: i64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MockServerConfig {
    pub port: u16,
    pub routes: Vec<MockRoute>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum MockServerStatus {
    Stopped,
    Starting,
    Running,
    Stopping,
    Error,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MockRequestLog {
    pub id: String,
    pub timestamp: i64,
    pub method: String,
    pub path: String,
    pub matched_route_id: Option<String>,
    pub status_code: i32,
    pub duration: i64,
}

// --- Benchmarking ---

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BenchmarkConfig {
    pub iterations: usize,
    pub concurrency: usize,
    pub delay_between_ms: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BenchmarkIteration {
    pub iteration: usize,
    pub status: i32,
    pub status_text: String,
    pub duration: i64,
    pub size: usize,
    pub success: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
    pub timestamp: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BenchmarkStatistics {
    pub total_iterations: usize,
    pub success_count: usize,
    pub fail_count: usize,
    pub min: f64,
    pub max: f64,
    pub mean: f64,
    pub median: f64,
    pub p50: f64,
    pub p75: f64,
    pub p90: f64,
    pub p95: f64,
    pub p99: f64,
    pub total_duration: i64,
    pub requests_per_second: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BenchmarkResult {
    pub request_name: String,
    pub url: String,
    pub method: HttpMethod,
    pub config: BenchmarkConfig,
    pub started_at: String,
    pub completed_at: String,
    pub statistics: BenchmarkStatistics,
    pub iterations: Vec<BenchmarkIteration>,
    pub distribution: Vec<DistributionBucket>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DistributionBucket {
    pub bucket: String,
    pub count: usize,
}

// --- GraphQL Schema Introspection ---

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum GraphQLTypeKind {
    Scalar,
    Object,
    Interface,
    Union,
    Enum,
    InputObject,
    List,
    NonNull,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GraphQLTypeRef {
    pub kind: GraphQLTypeKind,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub of_type: Option<Box<GraphQLTypeRef>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GraphQLInputValue {
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    #[serde(rename = "type")]
    pub value_type: GraphQLTypeRef,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub default_value: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GraphQLEnumValue {
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    pub is_deprecated: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub deprecation_reason: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GraphQLField {
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    #[serde(rename = "type")]
    pub field_type: GraphQLTypeRef,
    pub args: Vec<GraphQLInputValue>,
    pub is_deprecated: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub deprecation_reason: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GraphQLType {
    pub kind: GraphQLTypeKind,
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub fields: Option<Vec<GraphQLField>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub interfaces: Option<Vec<GraphQLTypeRef>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub possible_types: Option<Vec<GraphQLTypeRef>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub enum_values: Option<Vec<GraphQLEnumValue>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub input_fields: Option<Vec<GraphQLInputValue>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GraphQLSchema {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub query_type: Option<GraphQLSchemaRootType>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub mutation_type: Option<GraphQLSchemaRootType>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub subscription_type: Option<GraphQLSchemaRootType>,
    pub types: Vec<GraphQLType>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GraphQLSchemaRootType {
    pub name: String,
}

// --- gRPC ---

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GrpcMethodDescriptor {
    pub name: String,
    pub full_name: String,
    pub input_type: String,
    pub output_type: String,
    pub input_schema: Option<String>,
    pub client_streaming: bool,
    pub server_streaming: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GrpcServiceDescriptor {
    pub name: String,
    pub methods: Vec<GrpcMethodDescriptor>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GrpcProtoDescriptor {
    pub services: Vec<GrpcServiceDescriptor>,
    pub source: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GrpcConfig {
    pub use_reflection: bool,
    pub proto_paths: Vec<String>,
    pub proto_import_dirs: Vec<String>,
    pub service_name: Option<String>,
    pub method_name: Option<String>,
    pub tls: Option<bool>,
    pub tls_cert_path: Option<String>,
    pub tls_key_path: Option<String>,
    pub tls_ca_cert_path: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GrpcConnection {
    pub id: String,
    pub request_id: String,
    pub url: String,
    pub service: String,
    pub method: String,
    pub status: i32,
    pub status_message: Option<String>,
    pub state: String,
    pub trailers: HashMap<String, String>,
    pub initial_metadata: Option<HashMap<String, String>>,
    pub elapsed: f64,
    pub error: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GrpcEvent {
    pub id: String,
    pub connection_id: String,
    pub event_type: String,
    pub content: String,
    pub metadata: Option<HashMap<String, String>>,
    pub status: Option<i32>,
    pub error: Option<String>,
    pub size: Option<usize>,
    pub created_at: String,
}

// --- Response Data ---

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TimingData {
    pub dns_lookup: i64,
    pub tcp_connection: i64,
    pub tls_handshake: i64,
    pub ttfb: i64,
    pub content_transfer: i64,
    pub total: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum TimelineEventCategory {
    Config,
    Request,
    Info,
    Warning,
    Dns,
    Connection,
    Tls,
    Response,
    Data,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TimelineEvent {
    pub category: TimelineEventCategory,
    pub text: String,
    pub timestamp: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum ContentCategory {
    Json,
    Text,
    Image,
    Html,
    Pdf,
    Xml,
    Binary,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ResponseData {
    pub status: i32,
    pub status_text: String,
    pub headers: HashMap<String, String>,
    pub data: serde_json::Value,
    pub duration: i64,
    pub size: usize,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub timing: Option<TimingData>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub content_category: Option<ContentCategory>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub request_headers: Option<HashMap<String, String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub request_url: Option<String>,
}

// --- Storage ---

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum StorageMode {
    Monolithic,
    GitFriendly,
}

// --- Script Chain (Phase 4) ---

/// A single script entry in the chain (collection, folder, or request level)
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScriptChainEntry {
    pub source: String,         // "collection" | "folder" | "request"
    pub source_name: String,
    pub pre_request: String,
    pub post_response: String,
}

/// Script chain data sent alongside a request
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScriptChainData {
    pub entries: Vec<ScriptChainEntry>,
}

/// Environment data payload sent alongside a request for script execution
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EnvDataPayload {
    pub active_environment: Option<serde_json::Value>,
    pub global_variables: Option<Vec<serde_json::Value>>,
}

// --- Utility Functions ---

pub fn generate_id() -> String {
    format!("{}-{}", chrono::Utc::now().timestamp_millis(), uuid::Uuid::new_v4().to_string()[0..7].to_string())
}
