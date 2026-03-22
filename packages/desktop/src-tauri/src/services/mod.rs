// Services - Rust equivalents of @nouto/core services

pub mod http_client;      // Phase 2 ✅
pub mod digest_auth;      // Digest authentication (RFC 7616)
pub mod ntlm_auth;        // NTLM authentication (NTLMv2)
pub mod aws_auth;         // AWS Signature v4
pub mod grpc_client;      // gRPC client (tonic + prost-reflect)
pub mod storage;          // Phase 3 ✅
pub mod history_storage;  // Phase 3 ✅

pub mod script_engine;    // Phase 4 ✅
pub mod file_watcher;     // Phase 11 ✅
pub mod ws_session_storage; // Phase 13 ✅
pub mod runner_history;     // Phase 14 ✅
pub mod secret_extraction;  // Secure credential storage via OS keychain

// Remaining services to be implemented:
// pub mod websocket;        // Phase 5
// pub mod sse;              // Phase 5
// pub mod oauth;            // Phase 5
// pub mod mock_server;      // Phase 5
// pub mod assertion_engine; // Phase 5
// pub mod collection_runner; // Phase 6
// pub mod benchmark;        // Phase 6
// pub mod graphql_schema;   // Phase 6
