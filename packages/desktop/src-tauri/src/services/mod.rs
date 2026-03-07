// Services - Rust equivalents of @hivefetch/core services

pub mod http_client;      // Phase 2 ✅
pub mod digest_auth;      // Digest authentication (RFC 7616)

// Remaining services to be implemented:
// pub mod storage;          // Phase 3
// pub mod websocket;        // Phase 4
// pub mod sse;              // Phase 4
// pub mod oauth;            // Phase 4
// pub mod mock_server;      // Phase 4
// pub mod script_engine;    // Phase 5
// pub mod assertion_engine; // Phase 5
// pub mod collection_runner; // Phase 6
// pub mod benchmark;        // Phase 6
// pub mod graphql_schema;   // Phase 6
