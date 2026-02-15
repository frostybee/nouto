// Type definitions mirroring @hivefetch/core/src/types.ts
// This is the single source of truth for Rust-side type safety

use serde::{Deserialize, Serialize};
use std::collections::HashMap;

// --- HTTP ---

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "UPPERCASE")]
pub enum HttpMethod {
    Get,
    Post,
    Put,
    Patch,
    Delete,
    Head,
    Options,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum ConnectionMode {
    Http,
    Websocket,
    Sse,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum RequestKind {
    Http,
    Graphql,
    Websocket,
    Sse,
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
    pub aws_access_key: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub aws_secret_key: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub aws_region: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub aws_service: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub aws_session_token: Option<String>,
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
}

// --- Storage ---

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum StorageMode {
    Monolithic,
    GitFriendly,
}

// --- Utility Functions ---

pub fn generate_id() -> String {
    format!("{}-{}", chrono::Utc::now().timestamp_millis(), uuid::Uuid::new_v4().to_string()[0..7].to_string())
}
