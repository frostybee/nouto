// gRPC Client Service
// Implements gRPC reflection, proto loading, and method invocation
// using tonic, prost-reflect, and protox

use crate::models::types::{
    GrpcConnection, GrpcEvent, GrpcMethodDescriptor, GrpcProtoDescriptor, GrpcServiceDescriptor,
};
use prost::Message;
#[cfg(test)]
use prost_reflect::prost_types::FileDescriptorSet;
use prost_reflect::{
    DescriptorPool, DynamicMessage, FieldDescriptor, Kind, MessageDescriptor, MethodDescriptor,
};
use std::collections::{BTreeMap, HashMap};
use std::sync::Arc;
use std::time::Instant;
use tauri::{AppHandle, Emitter};
use tokio::sync::RwLock;
use tonic::codec::{Codec, DecodeBuf, Decoder, EncodeBuf, Encoder};
use tonic::transport::{Certificate, Channel, ClientTlsConfig, Identity};
use uuid::Uuid;

/// Helper to emit gRPC events wrapped in { data: ... } to match IncomingMessage format
fn emit_grpc(app: &AppHandle, event_name: &str, data: &impl serde::Serialize) {
    let _ = app.emit(event_name, serde_json::json!({ "data": data }));
}

/// A simple codec that passes raw bytes through for dynamic gRPC calls.
#[derive(Debug, Clone, Default)]
struct RawBytesCodec;

impl Codec for RawBytesCodec {
    type Encode = Vec<u8>;
    type Decode = Vec<u8>;
    type Encoder = RawBytesEncoder;
    type Decoder = RawBytesDecoder;

    fn encoder(&mut self) -> Self::Encoder {
        RawBytesEncoder
    }
    fn decoder(&mut self) -> Self::Decoder {
        RawBytesDecoder
    }
}

#[derive(Debug, Clone)]
struct RawBytesEncoder;

impl Encoder for RawBytesEncoder {
    type Item = Vec<u8>;
    type Error = tonic::Status;

    fn encode(&mut self, item: Self::Item, dst: &mut EncodeBuf<'_>) -> Result<(), Self::Error> {
        use prost::bytes::BufMut;
        dst.put_slice(&item);
        Ok(())
    }
}

#[derive(Debug, Clone)]
struct RawBytesDecoder;

impl Decoder for RawBytesDecoder {
    type Item = Vec<u8>;
    type Error = tonic::Status;

    fn decode(&mut self, src: &mut DecodeBuf<'_>) -> Result<Option<Self::Item>, Self::Error> {
        use prost::bytes::Buf;
        let remaining = src.remaining();
        if remaining == 0 {
            return Ok(None);
        }
        let mut buf = vec![0u8; remaining];
        src.copy_to_slice(&mut buf);
        Ok(Some(buf))
    }
}

/// Strip `//` single-line and `/* */` multi-line comments from JSON text.
/// Respects string literals (does not strip inside quoted strings).
pub fn strip_json_comments(input: &str) -> String {
    let bytes = input.as_bytes();
    let len = bytes.len();
    let mut out = String::with_capacity(len);
    let mut i = 0;
    let mut in_string = false;

    while i < len {
        let ch = bytes[i];

        if in_string {
            out.push(ch as char);
            if ch == b'\\' && i + 1 < len {
                // Escape sequence: push next char too
                i += 1;
                out.push(bytes[i] as char);
            } else if ch == b'"' {
                in_string = false;
            }
            i += 1;
            continue;
        }

        if ch == b'"' {
            in_string = true;
            out.push(ch as char);
            i += 1;
            continue;
        }

        if ch == b'/' && i + 1 < len {
            let next = bytes[i + 1];
            if next == b'/' {
                // Single-line comment: skip until end of line
                i += 2;
                while i < len && bytes[i] != b'\n' {
                    i += 1;
                }
                continue;
            } else if next == b'*' {
                // Multi-line comment: skip until */
                i += 2;
                while i + 1 < len {
                    if bytes[i] == b'*' && bytes[i + 1] == b'/' {
                        i += 2;
                        break;
                    }
                    i += 1;
                }
                // If we reached end without finding */, just stop
                if i >= len {
                    break;
                }
                continue;
            }
        }

        out.push(ch as char);
        i += 1;
    }

    out
}

/// Decrypt a passphrase-protected PKCS#8 private key PEM ("ENCRYPTED PRIVATE KEY")
/// into an unencrypted PKCS#8 PEM that rustls can load.
///
/// Legacy OpenSSL keys ("RSA PRIVATE KEY" with a DEK-Info header) are not supported;
/// those need to be converted with `openssl pkcs8 -topk8` first.
pub fn decrypt_private_key_pem(key_pem: &[u8], passphrase: &str) -> Result<Vec<u8>, String> {
    use pkcs8::der::pem::decode_vec;
    use pkcs8::{EncryptedPrivateKeyInfo, LineEnding};

    let (label, der) =
        decode_vec(key_pem).map_err(|e| format!("Private key is not valid PEM: {}", e))?;

    if label != "ENCRYPTED PRIVATE KEY" {
        return Err(format!(
            "A passphrase was given but the key is a '{}' PEM, not a PKCS#8 'ENCRYPTED PRIVATE KEY'. \
             Convert it with: openssl pkcs8 -topk8 -in key.pem -out key.pk8.pem",
            label
        ));
    }

    let encrypted = EncryptedPrivateKeyInfo::try_from(der.as_slice())
        .map_err(|e| format!("Failed to parse encrypted private key: {}", e))?;
    let decrypted = encrypted
        .decrypt(passphrase.as_bytes())
        .map_err(|e| format!("Failed to decrypt private key with passphrase: {}", e))?;
    let pem = decrypted
        .to_pem("PRIVATE KEY", LineEnding::LF)
        .map_err(|e| format!("Failed to re-encode decrypted private key: {}", e))?;

    Ok(pem.as_bytes().to_vec())
}

/// Recursively scan a JSON value for `@type` fields (used by google.protobuf.Any).
/// Returns a list of fully-qualified type names extracted from `@type` URLs.
fn collect_any_types(value: &serde_json::Value) -> Vec<String> {
    let mut types = Vec::new();
    collect_any_types_inner(value, &mut types);
    types
}

fn collect_any_types_inner(value: &serde_json::Value, types: &mut Vec<String>) {
    match value {
        serde_json::Value::Object(map) => {
            if let Some(serde_json::Value::String(type_url)) = map.get("@type") {
                // Extract type name after last '/'
                if let Some(pos) = type_url.rfind('/') {
                    let type_name = &type_url[pos + 1..];
                    if !type_name.is_empty() {
                        types.push(type_name.to_string());
                    }
                }
            }
            for v in map.values() {
                collect_any_types_inner(v, types);
            }
        }
        serde_json::Value::Array(arr) => {
            for v in arr {
                collect_any_types_inner(v, types);
            }
        }
        _ => {}
    }
}

/// Shared pool cache type for Tauri managed state
pub type GrpcPoolCache = Arc<RwLock<BTreeMap<String, DescriptorPool>>>;

pub fn init_grpc_pool_cache() -> GrpcPoolCache {
    Arc::new(RwLock::new(BTreeMap::new()))
}

pub struct GrpcClient {
    pools: GrpcPoolCache,
}

/// How a call ended, as reported to the UI in `grpcConnectionEnd`.
struct CallOutcome {
    status: i32,
    message: Option<String>,
    trailers: HashMap<String, String>,
    initial_metadata: Option<HashMap<String, String>>,
}

impl CallOutcome {
    /// The server closed the call with status OK; `trailers` are the ones it sent.
    fn ok(
        trailers: Option<tonic::metadata::MetadataMap>,
        initial_metadata: Option<HashMap<String, String>>,
    ) -> Self {
        let mut trailers = trailers
            .as_ref()
            .map(GrpcClient::metadata_to_map)
            .unwrap_or_default();
        ensure_grpc_status(&mut trailers, 0, "OK");
        Self {
            status: 0,
            message: None,
            trailers,
            initial_metadata,
        }
    }

    /// The server (or tonic) ended the call with a non-OK status. tonic moves the
    /// trailers into the status, minus grpc-status and grpc-message.
    fn from_status(
        status: &tonic::Status,
        initial_metadata: Option<HashMap<String, String>>,
    ) -> Self {
        let code = status.code() as i32;
        let message = status.message().to_string();
        let mut trailers = GrpcClient::metadata_to_map(status.metadata());
        ensure_grpc_status(&mut trailers, code, &message);
        Self {
            status: code,
            message: Some(message),
            trailers,
            initial_metadata,
        }
    }

    /// The call failed before the server answered.
    fn failed(message: String) -> Self {
        let mut trailers = HashMap::new();
        ensure_grpc_status(&mut trailers, 2, &message);
        Self {
            status: 2,
            message: Some(message),
            trailers,
            initial_metadata: None,
        }
    }

    /// The user cancelled the call.
    fn cancelled(initial_metadata: Option<HashMap<String, String>>) -> Self {
        let message = "Cancelled".to_string();
        let mut trailers = HashMap::new();
        ensure_grpc_status(&mut trailers, 1, &message);
        Self {
            status: 1,
            message: Some(message),
            trailers,
            initial_metadata,
        }
    }
}

/// A streaming call that never started.
enum StartFailure {
    Status(tonic::Status),
    Message(String),
}

/// Build a descriptor pool from the files a server's reflection service returned.
///
/// Starts from the global pool, which holds the google well-known types, so a file that
/// imports `google/protobuf/any.proto` (or Timestamp, Empty, and so on) resolves even when
/// the server does not send those descriptors. Duplicates of files already in the pool are
/// skipped by prost-reflect.
fn pool_from_reflected_files(
    files: Vec<prost_reflect::prost_types::FileDescriptorProto>,
) -> Result<DescriptorPool, prost_reflect::DescriptorError> {
    let mut pool = DescriptorPool::global();
    // A server's own copy of a well-known file (sent by grpc-js reflection, for example)
    // rarely matches the bundled one byte for byte, and prost-reflect rejects a second
    // definition of the same symbol. Keep the bundled copy.
    let mut files: Vec<_> = files
        .into_iter()
        .filter(|file| !is_well_known_duplicate(&pool, file))
        .collect();
    repair_dependencies(&pool, &mut files);
    pool.add_file_descriptor_protos(files)?;
    Ok(pool)
}

/// grpc-js reflection (proto-loader descriptors) sends files with an empty dependency
/// list and relative type names such as `google.protobuf.Any`. prost-reflect only resolves
/// a type through a declared dependency, so add one for every file that defines a type the
/// file refers to, whether that file is bundled (well-known types) or reflected alongside.
fn repair_dependencies(
    pool: &DescriptorPool,
    files: &mut [prost_reflect::prost_types::FileDescriptorProto],
) {
    use prost_reflect::prost_types::DescriptorProto;

    fn defined_types(
        prefix: &str,
        messages: &[DescriptorProto],
        enums: &[prost_reflect::prost_types::EnumDescriptorProto],
        out: &mut Vec<String>,
    ) {
        for e in enums {
            out.push(format!("{}{}", prefix, e.name()));
        }
        for m in messages {
            let full = format!("{}{}", prefix, m.name());
            defined_types(&format!("{}.", full), &m.nested_type, &m.enum_type, out);
            out.push(full);
        }
    }

    fn referenced_types(messages: &[DescriptorProto], out: &mut Vec<String>) {
        for m in messages {
            for f in &m.field {
                if let Some(t) = &f.type_name {
                    out.push(t.clone());
                }
            }
            referenced_types(&m.nested_type, out);
        }
    }

    // Full type name -> defining file, over the pool and the incoming files
    let mut owner: HashMap<String, String> = HashMap::new();
    for m in pool.all_messages() {
        owner.insert(
            m.full_name().to_string(),
            m.parent_file().name().to_string(),
        );
    }
    for e in pool.all_enums() {
        owner.insert(
            e.full_name().to_string(),
            e.parent_file().name().to_string(),
        );
    }
    for file in files.iter() {
        let prefix = if file.package().is_empty() {
            String::new()
        } else {
            format!("{}.", file.package())
        };
        let mut defined = Vec::new();
        defined_types(&prefix, &file.message_type, &file.enum_type, &mut defined);
        for name in defined {
            owner.insert(name, file.name().to_string());
        }
    }

    for file in files.iter_mut() {
        let own_name = file.name().to_string();
        let package = file.package().to_string();
        let mut refs = Vec::new();
        referenced_types(&file.message_type, &mut refs);
        for service in &file.service {
            for method in &service.method {
                refs.extend(method.input_type.iter().cloned());
                refs.extend(method.output_type.iter().cloned());
            }
        }
        for reference in refs {
            let bare = reference.trim_start_matches('.').to_string();
            // Relative names resolve from the innermost scope outwards; try the file's
            // package scopes first, then the root
            let mut scope = package.clone();
            let mut candidates = Vec::new();
            loop {
                candidates.push(if scope.is_empty() {
                    bare.clone()
                } else {
                    format!("{}.{}", scope, bare)
                });
                match scope.rfind('.') {
                    Some(idx) => scope.truncate(idx),
                    None if !scope.is_empty() => scope.clear(),
                    None => break,
                }
            }
            if let Some(file_name) = candidates.iter().find_map(|c| owner.get(c)) {
                if *file_name != own_name && !file.dependency.contains(file_name) {
                    file.dependency.push(file_name.clone());
                }
            }
        }
    }
}

fn is_well_known_duplicate(
    pool: &DescriptorPool,
    file: &prost_reflect::prost_types::FileDescriptorProto,
) -> bool {
    if pool.get_file_by_name(file.name()).is_some() {
        return true;
    }
    file.package() == "google.protobuf"
        && file.message_type.iter().all(|m| {
            pool.get_message_by_name(&format!("google.protobuf.{}", m.name()))
                .is_some()
        })
        && file.enum_type.iter().all(|e| {
            pool.get_enum_by_name(&format!("google.protobuf.{}", e.name()))
                .is_some()
        })
}

/// Add grpc-status and grpc-message when the server did not send them, as the Node host does.
fn ensure_grpc_status(trailers: &mut HashMap<String, String>, code: i32, message: &str) {
    trailers
        .entry("grpc-status".to_string())
        .or_insert_with(|| code.to_string());
    trailers
        .entry("grpc-message".to_string())
        .or_insert_with(|| message.to_string());
}

/// Render a decoded message as pretty JSON. When that fails, for example on a
/// `google.protobuf.Any` whose type is not in the schema, fall back to the protobuf
/// text format and return the reason, instead of showing `{}`.
fn render_message(message: &DynamicMessage) -> (String, Option<String>) {
    // Keep fields at their default value, as the Node host does with `defaults: true`
    let options = prost_reflect::SerializeOptions::new().skip_default_fields(false);
    let mut buf = Vec::new();
    let mut serializer = serde_json::Serializer::pretty(&mut buf);
    match message
        .serialize_with_options(&mut serializer, &options)
        .map(|_| String::from_utf8(buf).unwrap_or_default())
    {
        Ok(json) => (json, None),
        Err(e) => (
            message.to_text_format(),
            Some(format!("Response could not be shown as JSON: {}", e)),
        ),
    }
}

fn error_event(connection_id: &str, status: Option<i32>, error: String) -> GrpcEvent {
    GrpcEvent {
        id: Uuid::new_v4().to_string(),
        connection_id: connection_id.to_string(),
        event_type: "error".to_string(),
        content: String::new(),
        metadata: None,
        status,
        error: Some(error),
        size: None,
        created_at: chrono::Utc::now().to_rfc3339(),
    }
}

impl GrpcClient {
    pub fn new(pools: GrpcPoolCache) -> Self {
        GrpcClient { pools }
    }

    /// Generate a cache key from address + proto paths + reflection flag
    fn pool_cache_key(address: &str, proto_paths: &[String], use_reflection: bool) -> String {
        use digest::Digest;
        use md5::Md5;
        let mut hasher = Md5::new();
        hasher.update(address.as_bytes());
        for p in proto_paths {
            hasher.update(p.as_bytes());
        }
        if use_reflection {
            hasher.update(b"reflect");
        } else {
            hasher.update(b"proto");
        }
        format!("{:x}", hasher.finalize())
    }

    /// Get a cached pool if available
    async fn get_cached_pool(&self, key: &str) -> Option<DescriptorPool> {
        let pools = self.pools.read().await;
        pools.get(key).cloned()
    }

    /// Store a pool in the cache
    async fn cache_pool(&self, key: String, pool: DescriptorPool) {
        let mut pools = self.pools.write().await;
        pools.insert(key, pool);
    }

    /// Invalidate all cached pools
    pub async fn invalidate_all_pools(&self) {
        let mut pools = self.pools.write().await;
        pools.clear();
    }

    /// Resolve Any types found in a JSON body via server reflection.
    /// For each @type not already in the pool, reflects the symbol and rebuilds
    /// the pool with merged descriptors.
    async fn resolve_any_types(
        &self,
        channel: &Channel,
        type_names: &[String],
        pool: &DescriptorPool,
        cache_key: &str,
    ) -> Result<DescriptorPool, String> {
        // Collect types not yet in the pool
        let missing: Vec<&String> = type_names
            .iter()
            .filter(|name| {
                // Check if this message type already exists in the pool
                pool.get_message_by_name(name).is_none()
            })
            .collect();

        if missing.is_empty() {
            return Ok(pool.clone());
        }

        // Collect all existing file descriptors from the current pool
        let mut all_fd_protos: Vec<prost_reflect::prost_types::FileDescriptorProto> = Vec::new();
        let mut seen_files: std::collections::HashSet<String> = std::collections::HashSet::new();

        for file in pool.files() {
            let name = file.name().to_string();
            if seen_files.insert(name) {
                all_fd_protos.push(file.file_descriptor_proto().clone());
            }
        }

        // For each missing type, try to reflect via v1, then v1alpha
        for type_name in &missing {
            let fds = match self
                .reflection_file_by_symbol_v1(channel.clone(), type_name)
                .await
            {
                Ok(fds) => fds,
                Err(_) => {
                    // Try v1alpha
                    match self
                        .reflection_file_by_symbol_v1alpha(channel.clone(), type_name)
                        .await
                    {
                        Ok(fds) => fds,
                        Err(_) => continue, // Skip types that can't be resolved
                    }
                }
            };

            for fd_bytes in fds {
                let fd_proto = match prost_reflect::prost_types::FileDescriptorProto::decode(
                    fd_bytes.as_slice(),
                ) {
                    Ok(p) => p,
                    Err(_) => continue,
                };
                let name = fd_proto.name().to_string();
                if seen_files.insert(name) {
                    all_fd_protos.push(fd_proto);
                }
            }
        }

        // Rebuild pool from combined set
        let new_pool = pool_from_reflected_files(all_fd_protos)
            .map_err(|e| format!("Failed to rebuild pool with Any types: {}", e))?;

        // Update cache
        self.cache_pool(cache_key.to_string(), new_pool.clone())
            .await;

        Ok(new_pool)
    }

    /// Check if a method is client/server streaming. Returns (client_streaming, server_streaming).
    #[allow(dead_code)]
    pub fn get_method_info(
        &self,
        proto_paths: &[String],
        import_dirs: &[String],
        service_name: &str,
        method_name: &str,
    ) -> Option<(bool, bool)> {
        let pool = self.load_proto_to_pool(proto_paths, import_dirs).ok()?;
        let method = self.find_method(&pool, service_name, method_name)?;
        Some((method.is_client_streaming(), method.is_server_streaming()))
    }

    /// Check if a method is streaming, using the cache if available.
    /// Works for both proto-file and reflection-loaded schemas.
    pub async fn get_method_info_cached(
        &self,
        address: &str,
        proto_paths: &[String],
        import_dirs: &[String],
        use_reflection: bool,
        service_name: &str,
        method_name: &str,
    ) -> Option<(bool, bool)> {
        let pool = if use_reflection {
            let key = Self::pool_cache_key(address, &[], true);
            self.get_cached_pool(&key).await?
        } else if !proto_paths.is_empty() {
            let key = Self::pool_cache_key("", proto_paths, false);
            if let Some(cached) = self.get_cached_pool(&key).await {
                cached
            } else {
                self.load_proto_to_pool(proto_paths, import_dirs).ok()?
            }
        } else {
            return None;
        };
        let method = self.find_method(&pool, service_name, method_name)?;
        Some((method.is_client_streaming(), method.is_server_streaming()))
    }

    pub async fn reflect(
        &self,
        address: &str,
        _metadata: Option<HashMap<String, String>>,
        tls: Option<bool>,
        cert_path: Option<&str>,
        key_path: Option<&str>,
        ca_cert_path: Option<&str>,
        passphrase: Option<&str>,
    ) -> Result<GrpcProtoDescriptor, String> {
        // Try v1 first, fall back to v1alpha if UNIMPLEMENTED
        match self
            .reflect_with_version(
                address,
                tls,
                cert_path,
                key_path,
                ca_cert_path,
                passphrase,
                false,
            )
            .await
        {
            Ok(desc) => Ok(desc),
            Err(e) => {
                if e.contains("UNIMPLEMENTED") || e.contains("unimplemented") {
                    self.reflect_with_version(
                        address,
                        tls,
                        cert_path,
                        key_path,
                        ca_cert_path,
                        passphrase,
                        true,
                    )
                    .await
                } else {
                    Err(e)
                }
            }
        }
    }

    async fn reflect_with_version(
        &self,
        address: &str,
        tls: Option<bool>,
        cert_path: Option<&str>,
        key_path: Option<&str>,
        ca_cert_path: Option<&str>,
        passphrase: Option<&str>,
        use_v1alpha: bool,
    ) -> Result<GrpcProtoDescriptor, String> {
        // Check cache first
        let cache_key = Self::pool_cache_key(address, &[], true);
        if let Some(pool) = self.get_cached_pool(&cache_key).await {
            let services = self.extract_services_from_pool(&pool);
            return Ok(GrpcProtoDescriptor {
                services,
                source: "reflection".to_string(),
            });
        }

        let channel = self
            .build_channel(address, tls, cert_path, key_path, ca_cert_path, passphrase)
            .await?;

        // Create the reflection client based on version
        let service_names = if use_v1alpha {
            self.reflection_list_services_v1alpha(channel.clone())
                .await?
        } else {
            self.reflection_list_services_v1(channel.clone()).await?
        };

        // Get file descriptors for each service
        let mut all_fd_bytes: Vec<Vec<u8>> = Vec::new();
        let mut seen: std::collections::HashSet<Vec<u8>> = std::collections::HashSet::new();

        for svc_name in &service_names {
            let fds = if use_v1alpha {
                self.reflection_file_by_symbol_v1alpha(channel.clone(), svc_name)
                    .await?
            } else {
                self.reflection_file_by_symbol_v1(channel.clone(), svc_name)
                    .await?
            };
            for fd in fds {
                if seen.insert(fd.clone()) {
                    all_fd_bytes.push(fd);
                }
            }
        }

        // Decode file descriptors and build pool
        let mut file_descriptor_protos = Vec::new();
        for fd_bytes in &all_fd_bytes {
            let fd_proto =
                prost_reflect::prost_types::FileDescriptorProto::decode(fd_bytes.as_slice())
                    .map_err(|e| format!("Failed to decode file descriptor: {}", e))?;
            file_descriptor_protos.push(fd_proto);
        }

        let pool = pool_from_reflected_files(file_descriptor_protos)
            .map_err(|e| format!("Failed to create descriptor pool from reflection: {}", e))?;

        // Cache the pool
        self.cache_pool(cache_key, pool.clone()).await;

        let services = self.extract_services_from_pool(&pool);

        Ok(GrpcProtoDescriptor {
            services,
            source: "reflection".to_string(),
        })
    }

    async fn reflection_list_services_v1(&self, channel: Channel) -> Result<Vec<String>, String> {
        use tonic_reflection::pb::v1::server_reflection_client::ServerReflectionClient;
        use tonic_reflection::pb::v1::server_reflection_request::MessageRequest;
        use tonic_reflection::pb::v1::ServerReflectionRequest;

        let mut client = ServerReflectionClient::new(channel);

        let request = ServerReflectionRequest {
            host: String::new(),
            message_request: Some(MessageRequest::ListServices(String::new())),
        };

        let request_stream = tokio_stream::once(request);
        let mut response_stream = client
            .server_reflection_info(request_stream)
            .await
            .map_err(|e| format!("Reflection v1 error: {} ({})", e.message(), e.code()))?
            .into_inner();

        let mut service_names = Vec::new();
        use tokio_stream::StreamExt;
        while let Some(response) = response_stream.next().await {
            let response = response.map_err(|e| format!("Reflection stream error: {}", e))?;
            if let Some(tonic_reflection::pb::v1::server_reflection_response::MessageResponse::ListServicesResponse(list)) = response.message_response {
                for svc in list.service {
                    // Filter out reflection services
                    if !svc.name.starts_with("grpc.reflection.") {
                        service_names.push(svc.name);
                    }
                }
            }
        }

        Ok(service_names)
    }

    async fn reflection_file_by_symbol_v1(
        &self,
        channel: Channel,
        symbol: &str,
    ) -> Result<Vec<Vec<u8>>, String> {
        use tonic_reflection::pb::v1::server_reflection_client::ServerReflectionClient;
        use tonic_reflection::pb::v1::server_reflection_request::MessageRequest;
        use tonic_reflection::pb::v1::ServerReflectionRequest;

        let mut client = ServerReflectionClient::new(channel);

        let request = ServerReflectionRequest {
            host: String::new(),
            message_request: Some(MessageRequest::FileContainingSymbol(symbol.to_string())),
        };

        let request_stream = tokio_stream::once(request);
        let mut response_stream = client
            .server_reflection_info(request_stream)
            .await
            .map_err(|e| format!("Reflection v1 file lookup error: {}", e))?
            .into_inner();

        let mut descriptors = Vec::new();
        use tokio_stream::StreamExt;
        while let Some(response) = response_stream.next().await {
            let response = response.map_err(|e| format!("Reflection stream error: {}", e))?;
            if let Some(tonic_reflection::pb::v1::server_reflection_response::MessageResponse::FileDescriptorResponse(fdr)) = response.message_response {
                for fd_bytes in fdr.file_descriptor_proto {
                    descriptors.push(fd_bytes);
                }
            }
        }

        Ok(descriptors)
    }

    async fn reflection_list_services_v1alpha(
        &self,
        channel: Channel,
    ) -> Result<Vec<String>, String> {
        use tonic_reflection::pb::v1alpha::server_reflection_client::ServerReflectionClient;
        use tonic_reflection::pb::v1alpha::server_reflection_request::MessageRequest;
        use tonic_reflection::pb::v1alpha::ServerReflectionRequest;

        let mut client = ServerReflectionClient::new(channel);

        let request = ServerReflectionRequest {
            host: String::new(),
            message_request: Some(MessageRequest::ListServices(String::new())),
        };

        let request_stream = tokio_stream::once(request);
        let mut response_stream = client
            .server_reflection_info(request_stream)
            .await
            .map_err(|e| format!("Reflection v1alpha error: {} ({})", e.message(), e.code()))?
            .into_inner();

        let mut service_names = Vec::new();
        use tokio_stream::StreamExt;
        while let Some(response) = response_stream.next().await {
            let response = response.map_err(|e| format!("Reflection stream error: {}", e))?;
            if let Some(tonic_reflection::pb::v1alpha::server_reflection_response::MessageResponse::ListServicesResponse(list)) = response.message_response {
                for svc in list.service {
                    if !svc.name.starts_with("grpc.reflection.") {
                        service_names.push(svc.name);
                    }
                }
            }
        }

        Ok(service_names)
    }

    async fn reflection_file_by_symbol_v1alpha(
        &self,
        channel: Channel,
        symbol: &str,
    ) -> Result<Vec<Vec<u8>>, String> {
        use tonic_reflection::pb::v1alpha::server_reflection_client::ServerReflectionClient;
        use tonic_reflection::pb::v1alpha::server_reflection_request::MessageRequest;
        use tonic_reflection::pb::v1alpha::ServerReflectionRequest;

        let mut client = ServerReflectionClient::new(channel);

        let request = ServerReflectionRequest {
            host: String::new(),
            message_request: Some(MessageRequest::FileContainingSymbol(symbol.to_string())),
        };

        let request_stream = tokio_stream::once(request);
        let mut response_stream = client
            .server_reflection_info(request_stream)
            .await
            .map_err(|e| format!("Reflection v1alpha file lookup error: {}", e))?
            .into_inner();

        let mut descriptors = Vec::new();
        use tokio_stream::StreamExt;
        while let Some(response) = response_stream.next().await {
            let response = response.map_err(|e| format!("Reflection stream error: {}", e))?;
            if let Some(tonic_reflection::pb::v1alpha::server_reflection_response::MessageResponse::FileDescriptorResponse(fdr)) = response.message_response {
                for fd_bytes in fdr.file_descriptor_proto {
                    descriptors.push(fd_bytes);
                }
            }
        }

        Ok(descriptors)
    }

    pub async fn load_proto(
        &self,
        proto_paths: &[String],
        import_dirs: &[String],
    ) -> Result<GrpcProtoDescriptor, String> {
        // Check cache first
        let cache_key = Self::pool_cache_key("", proto_paths, false);
        if let Some(pool) = self.get_cached_pool(&cache_key).await {
            let services = self.extract_services_from_pool(&pool);
            return Ok(GrpcProtoDescriptor {
                services,
                source: "proto-files".to_string(),
            });
        }

        let pool = self.load_proto_to_pool(proto_paths, import_dirs)?;

        // Cache the pool
        self.cache_pool(cache_key, pool.clone()).await;

        let services = self.extract_services_from_pool(&pool);

        Ok(GrpcProtoDescriptor {
            services,
            source: "proto-files".to_string(),
        })
    }

    pub async fn invoke(
        &self,
        address: &str,
        service_name: &str,
        method_name: &str,
        metadata: Option<HashMap<String, String>>,
        body: &str,
        use_reflection: bool,
        proto_paths: Option<Vec<String>>,
        import_dirs: Option<Vec<String>>,
        tls: Option<bool>,
        cert_path: Option<&str>,
        key_path: Option<&str>,
        ca_cert_path: Option<&str>,
        passphrase: Option<&str>,
        timeout: Option<u64>,
        connection_id: Option<String>,
    ) -> Result<(GrpcConnection, Vec<GrpcEvent>), String> {
        let connection_id = connection_id.unwrap_or_else(|| Uuid::new_v4().to_string());
        let now = chrono::Utc::now().to_rfc3339();
        let start_time = Instant::now();
        let mut events: Vec<GrpcEvent> = Vec::new();

        // Build the descriptor pool (try cache first, support both reflection and proto-file sources)
        let paths = proto_paths.as_deref().unwrap_or(&[]);
        let dirs = import_dirs.as_deref().unwrap_or(&[]);

        let (cache_key, mut pool) = if use_reflection {
            // For reflection: try the reflection cache keyed by address
            let key = Self::pool_cache_key(address, &[], true);
            if let Some(cached) = self.get_cached_pool(&key).await {
                (key, cached)
            } else {
                return Err("No reflected schema cached. Load schema via reflection first.".into());
            }
        } else if !paths.is_empty() {
            // For proto files: try proto-file cache or compile
            let key = Self::pool_cache_key("", paths, false);
            let p = if let Some(cached) = self.get_cached_pool(&key).await {
                cached
            } else {
                let compiled = self.load_proto_to_pool(paths, dirs)?;
                self.cache_pool(key.clone(), compiled.clone()).await;
                compiled
            };
            (key, p)
        } else {
            return Err("No proto files provided for invoke. Load proto files first.".into());
        };

        // Strip comments from request body
        let request_body = if body.is_empty() { "{}" } else { body };
        let cleaned_body = strip_json_comments(request_body);

        // Resolve Any types via reflection if needed
        if use_reflection {
            if let Ok(parsed_json) = serde_json::from_str::<serde_json::Value>(&cleaned_body) {
                let any_types = collect_any_types(&parsed_json);
                if !any_types.is_empty() {
                    if let Ok(channel) = self
                        .build_channel(address, tls, cert_path, key_path, ca_cert_path, passphrase)
                        .await
                    {
                        if let Ok(new_pool) = self
                            .resolve_any_types(&channel, &any_types, &pool, &cache_key)
                            .await
                        {
                            pool = new_pool;
                        }
                    }
                }
            }
        }

        // Find the method descriptor
        let method_desc = self
            .find_method(&pool, service_name, method_name)
            .ok_or_else(|| {
                format!(
                    "Method {}/{} not found in proto definitions",
                    service_name, method_name
                )
            })?;

        // Parse request body into DynamicMessage
        let mut deserializer = serde_json::Deserializer::from_str(&cleaned_body);
        let request_message = DynamicMessage::deserialize(method_desc.input(), &mut deserializer)
            .map_err(|e| format!("Failed to parse request body: {}", e))?;

        // Emit client message event
        events.push(GrpcEvent {
            id: Uuid::new_v4().to_string(),
            connection_id: connection_id.clone(),
            event_type: "client_message".to_string(),
            content: request_body.to_string(),
            metadata: None,
            status: None,
            error: None,
            size: None,
            created_at: chrono::Utc::now().to_rfc3339(),
        });

        // Build channel
        let channel = self
            .build_channel(address, tls, cert_path, key_path, ca_cert_path, passphrase)
            .await?;

        // Encode the dynamic message to bytes
        let encoded = request_message.encode_to_vec();

        // Build tonic request with optional timeout
        let mut request = tonic::Request::new(encoded);
        if let Some(timeout_ms) = timeout {
            if timeout_ms > 0 {
                request.set_timeout(std::time::Duration::from_millis(timeout_ms));
            }
        }
        if let Some(ref md) = metadata {
            for (key, value) in md {
                if let (Ok(k), Ok(v)) = (
                    key.parse::<tonic::metadata::MetadataKey<tonic::metadata::Ascii>>(),
                    value.parse::<tonic::metadata::MetadataValue<tonic::metadata::Ascii>>(),
                ) {
                    request.metadata_mut().insert(k, v);
                }
            }
        }

        // Build the path for the gRPC call
        let path = format!("/{}/{}", service_name, method_name);
        let path_obj = http::uri::PathAndQuery::from_maybe_shared(path)
            .map_err(|e| format!("Invalid path: {}", e))?;

        // Make unary call with raw bytes codec
        let mut grpc_client = tonic::client::Grpc::new(channel);
        grpc_client
            .ready()
            .await
            .map_err(|e| format!("Channel not ready: {}", e))?;

        // Call through server_streaming() so the response headers and trailers stay apart;
        // unary() merges the trailers into the response metadata.
        let result = grpc_client
            .server_streaming(request, path_obj, RawBytesCodec)
            .await;

        let outcome = match result {
            Ok(response) => {
                let initial_metadata = Self::metadata_to_map(response.metadata());
                let mut stream = response.into_inner();
                match stream.message().await {
                    Ok(Some(response_bytes)) => {
                        let response_message =
                            DynamicMessage::decode(method_desc.output(), response_bytes.as_slice())
                                .map_err(|e| format!("Failed to decode response: {}", e))?;
                        let (response_json, warning) = render_message(&response_message);
                        let response_size = response_json.len();
                        events.push(GrpcEvent {
                            id: Uuid::new_v4().to_string(),
                            connection_id: connection_id.clone(),
                            event_type: "server_message".to_string(),
                            content: response_json,
                            metadata: None,
                            status: None,
                            error: None,
                            size: Some(response_size),
                            created_at: chrono::Utc::now().to_rfc3339(),
                        });
                        if let Some(warning) = warning {
                            events.push(error_event(&connection_id, None, warning));
                        }
                        match stream.trailers().await {
                            Ok(trailers) => CallOutcome::ok(trailers, Some(initial_metadata)),
                            Err(status) => {
                                events.push(error_event(
                                    &connection_id,
                                    Some(status.code() as i32),
                                    status.message().to_string(),
                                ));
                                CallOutcome::from_status(&status, Some(initial_metadata))
                            }
                        }
                    }
                    Ok(None) => {
                        let message =
                            "The server closed the call without a response message".to_string();
                        events.push(error_event(&connection_id, Some(2), message.clone()));
                        let mut outcome = CallOutcome::failed(message);
                        if let Ok(Some(trailers)) = stream.trailers().await {
                            let mut map = Self::metadata_to_map(&trailers);
                            ensure_grpc_status(
                                &mut map,
                                outcome.status,
                                outcome.message.as_deref().unwrap_or(""),
                            );
                            outcome.trailers = map;
                        }
                        outcome.initial_metadata = Some(initial_metadata);
                        outcome
                    }
                    Err(status) => {
                        events.push(error_event(
                            &connection_id,
                            Some(status.code() as i32),
                            status.message().to_string(),
                        ));
                        CallOutcome::from_status(&status, Some(initial_metadata))
                    }
                }
            }
            Err(status) => {
                events.push(error_event(
                    &connection_id,
                    Some(status.code() as i32),
                    status.message().to_string(),
                ));
                CallOutcome::from_status(&status, None)
            }
        };

        let elapsed = start_time.elapsed().as_millis() as f64;
        let connection = GrpcConnection {
            id: connection_id,
            request_id: String::new(),
            url: address.to_string(),
            service: service_name.to_string(),
            method: method_name.to_string(),
            status: outcome.status,
            status_message: outcome.message.clone(),
            state: "closed".to_string(),
            method_type: Some("unary".to_string()),
            trailers: outcome.trailers,
            initial_metadata: outcome.initial_metadata,
            elapsed,
            error: if outcome.status == 0 {
                None
            } else {
                outcome.message
            },
            created_at: now,
        };

        Ok((connection, events))
    }

    /// Invoke a streaming gRPC method (client-streaming, server-streaming, or bidirectional).
    /// For client-streaming/bidi, registers a sender in the GrpcStreamRegistry so that
    /// grpc_send_message and grpc_end_stream can push messages into the stream.
    pub async fn invoke_streaming(
        &self,
        address: &str,
        service_name: &str,
        method_name: &str,
        metadata: Option<HashMap<String, String>>,
        body: &str,
        proto_paths: Option<Vec<String>>,
        import_dirs: Option<Vec<String>>,
        tls: Option<bool>,
        cert_path: Option<&str>,
        key_path: Option<&str>,
        ca_cert_path: Option<&str>,
        passphrase: Option<&str>,
        timeout: Option<u64>,
        is_client_streaming: bool,
        is_server_streaming: bool,
        app: tauri::AppHandle,
        registry: crate::commands::grpc::GrpcStreamRegistry,
        assertions: Option<Vec<serde_json::Value>>,
    ) -> Result<(), String> {
        use crate::commands::grpc::{GrpcStreamCommand, GrpcStreamHandle};
        use crate::models::types::{GrpcConnection, GrpcEvent};

        let connection_id = Uuid::new_v4().to_string();
        let now = chrono::Utc::now().to_rfc3339();
        let start_time = Instant::now();

        // Build the descriptor pool (try cache first, support both reflection and proto-file sources)
        let paths = proto_paths.as_deref().unwrap_or(&[]);
        let dirs = import_dirs.as_deref().unwrap_or(&[]);

        let mut pool = if !paths.is_empty() {
            let key = Self::pool_cache_key("", paths, false);
            if let Some(cached) = self.get_cached_pool(&key).await {
                cached
            } else {
                let p = self.load_proto_to_pool(paths, dirs)?;
                self.cache_pool(key, p.clone()).await;
                p
            }
        } else {
            // Try reflection cache keyed by address
            let key = Self::pool_cache_key(address, &[], true);
            if let Some(cached) = self.get_cached_pool(&key).await {
                cached
            } else {
                return Err(
                    "No proto files or reflected schema available. Load schema first.".into(),
                );
            }
        };

        // Resolve google.protobuf.Any payload types in the request through reflection,
        // as the unary path does
        if paths.is_empty() {
            let cleaned = strip_json_comments(if body.is_empty() { "{}" } else { body });
            if let Ok(parsed_json) = serde_json::from_str::<serde_json::Value>(&cleaned) {
                let any_types = collect_any_types(&parsed_json);
                if !any_types.is_empty() {
                    let cache_key = Self::pool_cache_key(address, &[], true);
                    if let Ok(channel) = self
                        .build_channel(address, tls, cert_path, key_path, ca_cert_path, passphrase)
                        .await
                    {
                        if let Ok(new_pool) = self
                            .resolve_any_types(&channel, &any_types, &pool, &cache_key)
                            .await
                        {
                            pool = new_pool;
                        }
                    }
                }
            }
        }

        let method_desc = self
            .find_method(&pool, service_name, method_name)
            .ok_or_else(|| {
                format!(
                    "Method {}/{} not found in proto definitions",
                    service_name, method_name
                )
            })?;

        // Build channel
        let channel = self
            .build_channel(address, tls, cert_path, key_path, ca_cert_path, passphrase)
            .await?;

        // Build the gRPC path
        let path = format!("/{}/{}", service_name, method_name);
        let path_obj = http::uri::PathAndQuery::from_maybe_shared(path)
            .map_err(|e| format!("Invalid path: {}", e))?;

        // Encode the initial message body (strip comments first)
        let request_body = if body.is_empty() { "{}" } else { body };
        let cleaned_body = strip_json_comments(request_body);
        let input_desc = method_desc.input();
        let output_desc = method_desc.output();

        // Parse initial request message
        let mut deserializer = serde_json::Deserializer::from_str(&cleaned_body);
        let initial_message = DynamicMessage::deserialize(input_desc.clone(), &mut deserializer)
            .map_err(|e| format!("Failed to parse request body: {}", e))?;
        let initial_encoded = initial_message.encode_to_vec();

        let method_type = if is_client_streaming && is_server_streaming {
            "bidi"
        } else if is_client_streaming {
            "client_streaming"
        } else {
            "server_streaming"
        };

        // Emit connection start, then tell the UI what kind of call this is; it may have
        // no schema of its own
        let mut connection = GrpcConnection {
            id: connection_id.clone(),
            request_id: String::new(),
            url: address.to_string(),
            service: service_name.to_string(),
            method: method_name.to_string(),
            status: -1,
            status_message: None,
            state: "connecting".to_string(),
            method_type: Some(method_type.to_string()),
            trailers: HashMap::new(),
            initial_metadata: None,
            elapsed: 0.0,
            error: None,
            created_at: now.clone(),
        };
        emit_grpc(&app, "grpcConnectionStart", &connection);
        connection.state = "connected".to_string();
        emit_grpc(&app, "grpcConnectionOpen", &connection);

        // Emit initial client message event
        emit_grpc(
            &app,
            "grpcEvent",
            &GrpcEvent {
                id: Uuid::new_v4().to_string(),
                connection_id: connection_id.clone(),
                event_type: "client_message".to_string(),
                content: request_body.to_string(),
                metadata: None,
                status: None,
                error: None,
                size: None,
                created_at: chrono::Utc::now().to_rfc3339(),
            },
        );

        // Create a channel for sending additional messages from the UI
        let (tx, mut rx) = tokio::sync::mpsc::channel::<GrpcStreamCommand>(32);
        // Create a watch channel for cancellation signaling
        let (cancel_tx, cancel_rx) = tokio::sync::watch::channel(false);

        // Register every stream so Send, Commit and Cancel can reach it. Keeping the
        // cancel sender alive here also keeps the task's cancel receiver from firing at once.
        {
            let mut reg = registry.lock().await;
            reg.insert(
                connection_id.clone(),
                GrpcStreamHandle {
                    sender: tx,
                    cancel: cancel_tx,
                },
            );
        }

        // Clone values needed in the spawned task
        let conn_id = connection_id.clone();
        let address_owned = address.to_string();
        let service_owned = service_name.to_string();
        let method_owned = method_name.to_string();
        let method_type_owned = method_type.to_string();

        // Spawn the streaming task in the background
        tokio::spawn(async move {
            let outer_app = app.clone();
            let outer_conn_id = conn_id.clone();
            let collected_server_events: std::sync::Arc<std::sync::Mutex<Vec<GrpcEvent>>> =
                std::sync::Arc::new(std::sync::Mutex::new(Vec::new()));
            let result: Result<CallOutcome, StartFailure> = async {
                let mut grpc_client = tonic::client::Grpc::new(channel);
                grpc_client
                    .ready()
                    .await
                    .map_err(|e| StartFailure::Message(format!("Channel not ready: {}", e)))?;

                if is_client_streaming && is_server_streaming {
                    // Bidirectional streaming
                    let stream_app = app.clone();
                    let stream_conn_id = conn_id.clone();
                    let request_stream = async_stream::stream! {
                        // Send the initial message
                        yield initial_encoded;

                        // Wait for additional messages from the UI
                        while let Some(GrpcStreamCommand::SendMessage(json_body)) = rx.recv().await {
                            let cleaned = strip_json_comments(&json_body);
                            match serde_json::Deserializer::from_str(&cleaned)
                                .into_iter::<serde_json::Value>()
                                .next()
                            {
                                Some(Ok(_)) => {
                                    let mut deser = serde_json::Deserializer::from_str(&cleaned);
                                    match DynamicMessage::deserialize(input_desc.clone(), &mut deser) {
                                        Ok(msg) => {
                                            emit_grpc(&stream_app, "grpcEvent", &GrpcEvent {
                                                id: Uuid::new_v4().to_string(),
                                                connection_id: stream_conn_id.clone(),
                                                event_type: "client_message".to_string(),
                                                content: json_body.clone(),
                                                metadata: None,
                                                status: None,
                                                error: None,
                                                size: None,
                                                created_at: chrono::Utc::now().to_rfc3339(),
                                            });
                                            yield msg.encode_to_vec();
                                        }
                                        Err(e) => {
                                            emit_grpc(&stream_app, "grpcEvent", &GrpcEvent {
                                                id: Uuid::new_v4().to_string(),
                                                connection_id: stream_conn_id.clone(),
                                                event_type: "error".to_string(),
                                                content: String::new(),
                                                metadata: None,
                                                status: None,
                                                error: Some(format!("Failed to encode message: {}", e)),
                                                size: None,
                                                created_at: chrono::Utc::now().to_rfc3339(),
                                            });
                                        }
                                    }
                                }
                                _ => {
                                    emit_grpc(&stream_app, "grpcEvent", &GrpcEvent {
                                        id: Uuid::new_v4().to_string(),
                                        connection_id: stream_conn_id.clone(),
                                        event_type: "error".to_string(),
                                        content: String::new(),
                                        metadata: None,
                                        status: None,
                                        error: Some("Invalid JSON message".to_string()),
                                        size: None,
                                        created_at: chrono::Utc::now().to_rfc3339(),
                                    });
                                }
                            }
                        }
                    };

                    let mut tonic_request = tonic::Request::new(request_stream);
                    if let Some(timeout_ms) = timeout {
                        if timeout_ms > 0 {
                            tonic_request.set_timeout(std::time::Duration::from_millis(timeout_ms));
                        }
                    }
                    if let Some(ref md) = metadata {
                        Self::apply_metadata(tonic_request.metadata_mut(), md);
                    }

                    let response = grpc_client
                        .streaming(tonic_request, path_obj, RawBytesCodec)
                        .await
                        .map_err(StartFailure::Status)?;
                    Ok(Self::read_server_stream(
                        &app,
                        &conn_id,
                        response,
                        cancel_rx.clone(),
                        &output_desc,
                        &collected_server_events,
                    )
                    .await)
                } else if is_client_streaming {
                    // Client streaming only
                    let cs_app = app.clone();
                    let cs_conn_id = conn_id.clone();
                    let request_stream = async_stream::stream! {
                        yield initial_encoded;

                        while let Some(GrpcStreamCommand::SendMessage(json_body)) = rx.recv().await {
                            let cleaned = strip_json_comments(&json_body);
                            let mut deser = serde_json::Deserializer::from_str(&cleaned);
                            match DynamicMessage::deserialize(input_desc.clone(), &mut deser) {
                                Ok(msg) => {
                                    emit_grpc(&cs_app, "grpcEvent", &GrpcEvent {
                                        id: Uuid::new_v4().to_string(),
                                        connection_id: cs_conn_id.clone(),
                                        event_type: "client_message".to_string(),
                                        content: json_body.clone(),
                                        metadata: None,
                                        status: None,
                                        error: None,
                                        size: None,
                                        created_at: chrono::Utc::now().to_rfc3339(),
                                    });
                                    yield msg.encode_to_vec();
                                }
                                Err(e) => {
                                    emit_grpc(&cs_app, "grpcEvent", &GrpcEvent {
                                        id: Uuid::new_v4().to_string(),
                                        connection_id: cs_conn_id.clone(),
                                        event_type: "error".to_string(),
                                        content: String::new(),
                                        metadata: None,
                                        status: None,
                                        error: Some(format!("Failed to encode message: {}", e)),
                                        size: None,
                                        created_at: chrono::Utc::now().to_rfc3339(),
                                    });
                                }
                            }
                        }
                    };

                    let mut tonic_request = tonic::Request::new(request_stream);
                    if let Some(timeout_ms) = timeout {
                        if timeout_ms > 0 {
                            tonic_request.set_timeout(std::time::Duration::from_millis(timeout_ms));
                        }
                    }
                    if let Some(ref md) = metadata {
                        Self::apply_metadata(tonic_request.metadata_mut(), md);
                    }

                    // streaming() rather than client_streaming(): the latter merges the
                    // trailers into the response metadata, and this keeps them apart
                    let response = grpc_client
                        .streaming(tonic_request, path_obj, RawBytesCodec)
                        .await
                        .map_err(StartFailure::Status)?;
                    Ok(Self::read_server_stream(
                        &app,
                        &conn_id,
                        response,
                        cancel_rx.clone(),
                        &output_desc,
                        &collected_server_events,
                    )
                    .await)
                } else {
                    // Server streaming only
                    let encoded = initial_encoded;
                    let mut tonic_request = tonic::Request::new(encoded);
                    if let Some(timeout_ms) = timeout {
                        if timeout_ms > 0 {
                            tonic_request.set_timeout(std::time::Duration::from_millis(timeout_ms));
                        }
                    }
                    if let Some(ref md) = metadata {
                        Self::apply_metadata(tonic_request.metadata_mut(), md);
                    }

                    let response = grpc_client
                        .server_streaming(tonic_request, path_obj, RawBytesCodec)
                        .await
                        .map_err(StartFailure::Status)?;
                    Ok(Self::read_server_stream(
                        &app,
                        &conn_id,
                        response,
                        cancel_rx.clone(),
                        &output_desc,
                        &collected_server_events,
                    )
                    .await)
                }
            }.await;

            let elapsed = start_time.elapsed().as_millis() as f64;

            // Forget the stream handle; Send, Commit and Cancel can no longer reach it
            {
                let mut reg = registry.lock().await;
                reg.remove(&outer_conn_id);
            }

            let outcome = match result {
                Ok(outcome) => outcome,
                Err(StartFailure::Status(status)) => {
                    emit_grpc(
                        &outer_app,
                        "grpcEvent",
                        &error_event(
                            &outer_conn_id,
                            Some(status.code() as i32),
                            status.message().to_string(),
                        ),
                    );
                    CallOutcome::from_status(&status, None)
                }
                Err(StartFailure::Message(message)) => {
                    emit_grpc(
                        &outer_app,
                        "grpcEvent",
                        &error_event(&outer_conn_id, None, message.clone()),
                    );
                    CallOutcome::failed(message)
                }
            };

            let end_connection = GrpcConnection {
                id: outer_conn_id,
                request_id: String::new(),
                url: address_owned,
                service: service_owned,
                method: method_owned,
                status: outcome.status,
                status_message: outcome.message.clone(),
                state: "closed".to_string(),
                method_type: Some(method_type_owned),
                trailers: outcome.trailers,
                initial_metadata: outcome.initial_metadata,
                elapsed,
                error: if outcome.status == 0 {
                    None
                } else {
                    outcome.message
                },
                created_at: now,
            };

            // Evaluate assertions if provided
            let collected = collected_server_events
                .lock()
                .unwrap_or_else(|e| e.into_inner());
            if let Some(ref assertions) = assertions {
                if !assertions.is_empty() {
                    let eval_result = crate::commands::grpc::evaluate_grpc_assertions(
                        assertions,
                        &end_connection,
                        &collected,
                    );
                    let mut end_data = serde_json::json!({ "data": &end_connection });
                    end_data["data"]["assertionResults"] = serde_json::json!(eval_result.results);
                    if !eval_result.variables_to_set.is_empty() {
                        let _ = outer_app.emit("setVariables", serde_json::json!({
                            "data": eval_result.variables_to_set.iter().map(|v| {
                                serde_json::json!({ "key": v.key, "value": v.value, "scope": v.scope })
                            }).collect::<Vec<_>>()
                        }));
                    }
                    let _ = outer_app.emit("grpcConnectionEnd", end_data);
                } else {
                    emit_grpc(&outer_app, "grpcConnectionEnd", &end_connection);
                }
            } else {
                emit_grpc(&outer_app, "grpcConnectionEnd", &end_connection);
            }
        });

        Ok(())
    }

    // --- Private helpers ---

    fn apply_metadata(
        metadata_map: &mut tonic::metadata::MetadataMap,
        md: &HashMap<String, String>,
    ) {
        for (key, value) in md {
            if let (Ok(k), Ok(v)) = (
                key.parse::<tonic::metadata::MetadataKey<tonic::metadata::Ascii>>(),
                value.parse::<tonic::metadata::MetadataValue<tonic::metadata::Ascii>>(),
            ) {
                metadata_map.insert(k, v);
            }
        }
    }

    fn metadata_to_map(metadata: &tonic::metadata::MetadataMap) -> HashMap<String, String> {
        use base64::Engine as _;
        let mut map = HashMap::new();
        for key_and_value in metadata.iter() {
            match key_and_value {
                tonic::metadata::KeyAndValueRef::Ascii(key, value) => {
                    if let Ok(v) = value.to_str() {
                        map.insert(key.as_str().to_string(), v.to_string());
                    }
                }
                // -bin values are bytes on the wire; show them base64-encoded, as grpc-js does
                tonic::metadata::KeyAndValueRef::Binary(key, value) => {
                    if let Ok(bytes) = value.to_bytes() {
                        map.insert(
                            key.as_str().to_string(),
                            base64::engine::general_purpose::STANDARD.encode(bytes),
                        );
                    }
                }
            }
        }
        map
    }

    /// Read a server stream until it ends, is cancelled, or fails, forwarding each
    /// message to the UI. Shared by server-streaming, client-streaming and bidi calls,
    /// so all three report the server's real trailers and status.
    async fn read_server_stream(
        app: &AppHandle,
        conn_id: &str,
        response: tonic::Response<tonic::Streaming<Vec<u8>>>,
        mut cancel_rx: tokio::sync::watch::Receiver<bool>,
        output_desc: &MessageDescriptor,
        collected: &Arc<std::sync::Mutex<Vec<GrpcEvent>>>,
    ) -> CallOutcome {
        use tokio_stream::StreamExt;

        let initial_md = Self::metadata_to_map(response.metadata());
        emit_grpc(
            app,
            "grpcEvent",
            &GrpcEvent {
                id: Uuid::new_v4().to_string(),
                connection_id: conn_id.to_string(),
                event_type: "metadata".to_string(),
                content: serde_json::to_string(&initial_md).unwrap_or_default(),
                metadata: Some(initial_md.clone()),
                status: None,
                error: None,
                size: None,
                created_at: chrono::Utc::now().to_rfc3339(),
            },
        );

        let mut response_stream = response.into_inner();
        loop {
            tokio::select! {
                next = response_stream.next() => {
                    match next {
                        Some(Ok(response_bytes)) => {
                            match DynamicMessage::decode(output_desc.clone(), response_bytes.as_slice()) {
                                Ok(response_message) => {
                                    let (json, warning) = render_message(&response_message);
                                    let size = json.len();
                                    let event = GrpcEvent {
                                        id: Uuid::new_v4().to_string(),
                                        connection_id: conn_id.to_string(),
                                        event_type: "server_message".to_string(),
                                        content: json,
                                        metadata: None,
                                        status: None,
                                        error: None,
                                        size: Some(size),
                                        created_at: chrono::Utc::now().to_rfc3339(),
                                    };
                                    emit_grpc(app, "grpcEvent", &event);
                                    if let Ok(mut v) = collected.lock() {
                                        v.push(event);
                                    }
                                    if let Some(warning) = warning {
                                        emit_grpc(app, "grpcEvent", &error_event(conn_id, None, warning));
                                    }
                                }
                                Err(e) => {
                                    emit_grpc(app, "grpcEvent", &error_event(conn_id, None, format!("Decode error: {}", e)));
                                }
                            }
                        }
                        Some(Err(status)) => {
                            emit_grpc(
                                app,
                                "grpcEvent",
                                &error_event(conn_id, Some(status.code() as i32), status.message().to_string()),
                            );
                            return CallOutcome::from_status(&status, Some(initial_md));
                        }
                        None => {
                            // The body is consumed; the trailers carry the final status
                            return match response_stream.trailers().await {
                                Ok(trailers) => CallOutcome::ok(trailers, Some(initial_md)),
                                Err(status) => {
                                    emit_grpc(
                                        app,
                                        "grpcEvent",
                                        &error_event(conn_id, Some(status.code() as i32), status.message().to_string()),
                                    );
                                    CallOutcome::from_status(&status, Some(initial_md))
                                }
                            };
                        }
                    }
                }
                _ = cancel_rx.changed() => {
                    // Cancel requested (or the handle was dropped): stop reading
                    return CallOutcome::cancelled(Some(initial_md));
                }
            }
        }
    }

    async fn build_channel(
        &self,
        address: &str,
        tls: Option<bool>,
        cert_path: Option<&str>,
        key_path: Option<&str>,
        ca_cert_path: Option<&str>,
        passphrase: Option<&str>,
    ) -> Result<Channel, String> {
        let uri = if address.starts_with("http://") || address.starts_with("https://") {
            address.to_string()
        } else if tls.unwrap_or(false) {
            format!("https://{}", address)
        } else {
            format!("http://{}", address)
        };

        let mut endpoint = Channel::from_shared(uri.clone())
            .map_err(|e| format!("Invalid address '{}': {}", address, e))?;

        if tls.unwrap_or(false) {
            let mut tls_config = ClientTlsConfig::new();

            if let Some(ca_path) = ca_cert_path {
                let ca_cert = tokio::fs::read(ca_path)
                    .await
                    .map_err(|e| format!("Failed to read CA cert '{}': {}", ca_path, e))?;
                tls_config = tls_config.ca_certificate(Certificate::from_pem(ca_cert));
            }

            if let (Some(cert_p), Some(key_p)) = (cert_path, key_path) {
                let cert = tokio::fs::read(cert_p)
                    .await
                    .map_err(|e| format!("Failed to read cert '{}': {}", cert_p, e))?;
                let mut key = tokio::fs::read(key_p)
                    .await
                    .map_err(|e| format!("Failed to read key '{}': {}", key_p, e))?;
                if let Some(pass) = passphrase.filter(|p| !p.is_empty()) {
                    key = decrypt_private_key_pem(&key, pass)?;
                }
                tls_config = tls_config.identity(Identity::from_pem(cert, key));
            }

            endpoint = endpoint
                .tls_config(tls_config)
                .map_err(|e| format!("TLS configuration error: {}", e))?;
        }

        endpoint
            .connect()
            .await
            .map_err(|e| format!("Failed to connect to '{}': {}", address, e))
    }

    fn extract_services_from_pool(&self, pool: &DescriptorPool) -> Vec<GrpcServiceDescriptor> {
        pool.services()
            .map(|service| {
                let methods: Vec<GrpcMethodDescriptor> = service
                    .methods()
                    .map(|method| GrpcMethodDescriptor {
                        name: method.name().to_string(),
                        full_name: method.full_name().to_string(),
                        input_type: method.input().name().to_string(),
                        output_type: method.output().name().to_string(),
                        input_schema: Some(self.message_to_json_schema(&method.input())),
                        client_streaming: method.is_client_streaming(),
                        server_streaming: method.is_server_streaming(),
                    })
                    .collect();

                GrpcServiceDescriptor {
                    name: service.full_name().to_string(),
                    methods,
                }
            })
            .collect()
    }

    /// Generate a JSON Schema string from a protobuf MessageDescriptor.
    fn message_to_json_schema(&self, desc: &MessageDescriptor) -> String {
        let mut defs: serde_json::Map<String, serde_json::Value> = serde_json::Map::new();
        let mut visited = std::collections::HashSet::new();
        let schema = self.message_desc_to_schema(desc, &mut defs, &mut visited);

        let mut root = schema;
        if !defs.is_empty() {
            if let serde_json::Value::Object(ref mut map) = root {
                map.insert("$defs".to_string(), serde_json::Value::Object(defs));
            }
        }

        serde_json::to_string(&root).unwrap_or_else(|_| "{}".to_string())
    }

    fn message_desc_to_schema(
        &self,
        desc: &MessageDescriptor,
        defs: &mut serde_json::Map<String, serde_json::Value>,
        visited: &mut std::collections::HashSet<String>,
    ) -> serde_json::Value {
        let full_name = desc.full_name().to_string();
        if visited.contains(&full_name) {
            return serde_json::json!({ "$ref": format!("#/$defs/{}", desc.name()) });
        }
        visited.insert(full_name.clone());

        let mut properties = serde_json::Map::new();

        for field in desc.fields() {
            let field_schema = self.field_to_json_schema(&field, defs, visited);
            properties.insert(field.name().to_string(), field_schema);
        }

        visited.remove(&full_name);

        serde_json::json!({
            "type": "object",
            "properties": properties
        })
    }

    fn field_to_json_schema(
        &self,
        field: &FieldDescriptor,
        defs: &mut serde_json::Map<String, serde_json::Value>,
        visited: &mut std::collections::HashSet<String>,
    ) -> serde_json::Value {
        // Handle map fields
        if field.is_map() {
            let map_entry = field.kind();
            if let Kind::Message(entry_desc) = map_entry {
                // Map value is the second field of the map entry
                let value_field = entry_desc.fields().find(|f| f.name() == "value");
                let value_schema = if let Some(vf) = value_field {
                    self.scalar_or_message_schema(&vf, defs, visited)
                } else {
                    serde_json::json!({})
                };
                return serde_json::json!({
                    "type": "object",
                    "additionalProperties": value_schema
                });
            }
        }

        let base_schema = self.scalar_or_message_schema(field, defs, visited);

        // Handle repeated (non-map) fields
        if field.is_list() {
            return serde_json::json!({
                "type": "array",
                "items": base_schema
            });
        }

        base_schema
    }

    fn scalar_or_message_schema(
        &self,
        field: &FieldDescriptor,
        defs: &mut serde_json::Map<String, serde_json::Value>,
        visited: &mut std::collections::HashSet<String>,
    ) -> serde_json::Value {
        match field.kind() {
            Kind::Double | Kind::Float => serde_json::json!({ "type": "number" }),
            Kind::Int32 | Kind::Sint32 | Kind::Sfixed32 | Kind::Uint32 | Kind::Fixed32 => {
                serde_json::json!({ "type": "integer" })
            }
            Kind::Int64 | Kind::Sint64 | Kind::Sfixed64 | Kind::Uint64 | Kind::Fixed64 => {
                serde_json::json!({ "type": "string" })
            }
            Kind::Bool => serde_json::json!({ "type": "boolean" }),
            Kind::String => serde_json::json!({ "type": "string" }),
            Kind::Bytes => serde_json::json!({ "type": "string", "format": "byte" }),
            Kind::Enum(enum_desc) => {
                let values: Vec<String> =
                    enum_desc.values().map(|v| v.name().to_string()).collect();
                serde_json::json!({ "type": "string", "enum": values })
            }
            Kind::Message(msg_desc) => {
                let ref_name = msg_desc.name().to_string();
                if !defs.contains_key(&ref_name) {
                    let nested = self.message_desc_to_schema(&msg_desc, defs, visited);
                    defs.insert(ref_name.clone(), nested);
                }
                serde_json::json!({ "$ref": format!("#/$defs/{}", ref_name) })
            }
        }
    }

    fn find_method(
        &self,
        pool: &DescriptorPool,
        service_name: &str,
        method_name: &str,
    ) -> Option<MethodDescriptor> {
        for service in pool.services() {
            if service.full_name() == service_name || service.name() == service_name {
                for method in service.methods() {
                    if method.name() == method_name {
                        return Some(method);
                    }
                }
            }
        }
        None
    }

    fn load_proto_to_pool(
        &self,
        proto_paths: &[String],
        import_dirs: &[String],
    ) -> Result<DescriptorPool, String> {
        use std::path::PathBuf;

        let include_paths: Vec<PathBuf> = if import_dirs.is_empty() {
            // If no import dirs given, use parent directories of proto files
            proto_paths
                .iter()
                .filter_map(|p| PathBuf::from(p).parent().map(|d| d.to_path_buf()))
                .collect::<std::collections::HashSet<_>>()
                .into_iter()
                .collect()
        } else {
            import_dirs.iter().map(PathBuf::from).collect()
        };

        let mut compiler = protox::Compiler::new(include_paths)
            .map_err(|e| format!("Failed to create proto compiler: {}", e))?;

        for proto_path in proto_paths {
            compiler
                .open_file(PathBuf::from(proto_path))
                .map_err(|e| format!("Failed to open proto file '{}': {}", proto_path, e))?;
        }

        let file_descriptor_set = compiler.file_descriptor_set();

        DescriptorPool::from_file_descriptor_set(file_descriptor_set)
            .map_err(|e| format!("Failed to create descriptor pool: {}", e))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    // --- Reflection pools ---

    #[test]
    fn reflected_files_resolve_well_known_types() {
        use prost_reflect::prost_types::{
            field_descriptor_proto, DescriptorProto, FieldDescriptorProto, FileDescriptorProto,
            MethodDescriptorProto, ServiceDescriptorProto,
        };
        let field = |name: &str, type_name: &str| FieldDescriptorProto {
            name: Some(name.to_string()),
            number: Some(if name == "payload" { 1 } else { 2 }),
            r#type: Some(field_descriptor_proto::Type::Message as i32),
            type_name: Some(type_name.to_string()),
            json_name: Some(name.to_string()),
            ..Default::default()
        };
        // What grpc-js reflection sends: no dependency list, relative type names, and a
        // synthesized copy of the well-known file under its own name
        let common = FileDescriptorProto {
            name: Some("common.proto".to_string()),
            package: Some("common".to_string()),
            message_type: vec![DescriptorProto {
                name: Some("Status".to_string()),
                ..Default::default()
            }],
            syntax: Some("proto3".to_string()),
            ..Default::default()
        };
        let api = FileDescriptorProto {
            name: Some("api.proto".to_string()),
            package: Some("api.v1".to_string()),
            message_type: vec![
                DescriptorProto {
                    name: Some("Holder".to_string()),
                    field: vec![
                        field("payload", "google.protobuf.Any"),
                        field("status", "common.Status"),
                    ],
                    ..Default::default()
                },
                DescriptorProto {
                    name: Some("Empty".to_string()),
                    ..Default::default()
                },
            ],
            service: vec![ServiceDescriptorProto {
                name: Some("Api".to_string()),
                method: vec![MethodDescriptorProto {
                    name: Some("Get".to_string()),
                    input_type: Some("api.v1.Empty".to_string()),
                    output_type: Some("Holder".to_string()),
                    ..Default::default()
                }],
                ..Default::default()
            }],
            syntax: Some("proto3".to_string()),
            ..Default::default()
        };
        let servers_any = FileDescriptorProto {
            name: Some("google_protobuf.proto".to_string()),
            package: Some("google.protobuf".to_string()),
            message_type: vec![DescriptorProto {
                name: Some("Any".to_string()),
                field: vec![FieldDescriptorProto {
                    name: Some("type_url".to_string()),
                    number: Some(1),
                    r#type: Some(field_descriptor_proto::Type::String as i32),
                    ..Default::default()
                }],
                ..Default::default()
            }],
            syntax: Some("proto3".to_string()),
            ..Default::default()
        };

        assert!(
            DescriptorPool::from_file_descriptor_set(FileDescriptorSet {
                file: vec![api.clone(), common.clone(), servers_any.clone()]
            })
            .is_err(),
            "without repaired dependencies the files do not load"
        );

        let pool = pool_from_reflected_files(vec![api, common, servers_any])
            .expect("reflected files load");
        let holder = pool
            .get_message_by_name("api.v1.Holder")
            .expect("api.v1.Holder");
        assert_eq!(
            holder
                .get_field_by_name("payload")
                .unwrap()
                .kind()
                .as_message()
                .unwrap()
                .full_name(),
            "google.protobuf.Any"
        );
        assert_eq!(
            holder
                .get_field_by_name("status")
                .unwrap()
                .kind()
                .as_message()
                .unwrap()
                .full_name(),
            "common.Status"
        );
        assert!(pool.get_service_by_name("api.v1.Api").is_some());
        // The bundled any.proto is used, not the server's copy
        assert!(pool.get_file_by_name("google_protobuf.proto").is_none());
    }

    // --- Call outcomes ---

    #[test]
    fn ok_outcome_keeps_server_trailers_and_adds_status() {
        let mut md = tonic::metadata::MetadataMap::new();
        md.insert("x-test-trailer", "yes".parse().unwrap());
        let outcome = CallOutcome::ok(Some(md), None);
        assert_eq!(outcome.status, 0);
        assert_eq!(outcome.trailers.get("x-test-trailer").unwrap(), "yes");
        assert_eq!(outcome.trailers.get("grpc-status").unwrap(), "0");
        assert_eq!(outcome.trailers.get("grpc-message").unwrap(), "OK");
    }

    #[test]
    fn status_outcome_reports_code_message_and_trailers() {
        let mut md = tonic::metadata::MetadataMap::new();
        md.insert("x-reason", "quota".parse().unwrap());
        let status = tonic::Status::with_metadata(tonic::Code::ResourceExhausted, "too many", md);
        let outcome = CallOutcome::from_status(&status, Some(HashMap::new()));
        assert_eq!(outcome.status, 8);
        assert_eq!(outcome.message.as_deref(), Some("too many"));
        assert_eq!(outcome.trailers.get("x-reason").unwrap(), "quota");
        assert_eq!(outcome.trailers.get("grpc-status").unwrap(), "8");
        assert_eq!(outcome.trailers.get("grpc-message").unwrap(), "too many");
        assert!(outcome.initial_metadata.is_some());
    }

    #[test]
    fn cancelled_outcome_is_status_one() {
        let outcome = CallOutcome::cancelled(None);
        assert_eq!(outcome.status, 1);
        assert_eq!(outcome.trailers.get("grpc-status").unwrap(), "1");
        assert_eq!(outcome.trailers.get("grpc-message").unwrap(), "Cancelled");
    }

    #[test]
    fn ensure_grpc_status_does_not_overwrite_server_values() {
        let mut trailers = HashMap::new();
        trailers.insert("grpc-status".to_string(), "0".to_string());
        ensure_grpc_status(&mut trailers, 13, "internal");
        assert_eq!(trailers.get("grpc-status").unwrap(), "0");
        assert_eq!(trailers.get("grpc-message").unwrap(), "internal");
    }

    #[test]
    fn metadata_map_encodes_binary_values_as_base64() {
        let mut md = tonic::metadata::MetadataMap::new();
        md.insert("x-plain", "text".parse().unwrap());
        md.insert_bin(
            "x-data-bin",
            tonic::metadata::MetadataValue::from_bytes(&[1u8, 2, 3]),
        );
        let map = GrpcClient::metadata_to_map(&md);
        assert_eq!(map.get("x-plain").unwrap(), "text");
        assert_eq!(map.get("x-data-bin").unwrap(), "AQID");
    }

    #[test]
    fn error_event_carries_status_and_message() {
        let event = error_event("conn-1", Some(5), "missing".to_string());
        assert_eq!(event.connection_id, "conn-1");
        assert_eq!(event.event_type, "error");
        assert_eq!(event.status, Some(5));
        assert_eq!(event.error.as_deref(), Some("missing"));
    }

    /// prime256v1 key wrapped as PKCS#8 PBES2 (AES-256-CBC, PBKDF2-HMAC-SHA256).
    /// Passphrase: "nouto-test". Test-only key, never used for anything real.
    const ENCRYPTED_KEY_PEM: &str = "-----BEGIN ENCRYPTED PRIVATE KEY-----
MIH0MF8GCSqGSIb3DQEFDTBSMDEGCSqGSIb3DQEFDDAkBBCtL1VMSAg+13kdBrLX
OedbAgIIADAMBggqhkiG9w0CCQUAMB0GCWCGSAFlAwQBKgQQGXccq+lUj8Amki/b
XPXRGASBkJqI3gWUAg8OQr543kg1eLHYggdokRh3v71WqSw8+XYYlTd8pN2FDMJD
54UQ+m0FjwmOIzfeaesoZqYB7HNGp2wPcPTP73wLeiVtnVeTALUIvFbGK6lkXsFj
bRHadM62NJ5q7f77JjOnc5ujYohhpqmy8LIOfH+BA/2qKfNJAG5LQtAbqv1fAj8H
rqd8+ix72g==
-----END ENCRYPTED PRIVATE KEY-----
";

    #[test]
    fn decrypt_private_key_pem_decrypts_pkcs8_pbes2_key() {
        let out = decrypt_private_key_pem(ENCRYPTED_KEY_PEM.as_bytes(), "nouto-test").unwrap();
        let text = String::from_utf8(out).unwrap();
        assert!(text.starts_with("-----BEGIN PRIVATE KEY-----"));
        assert!(text.trim_end().ends_with("-----END PRIVATE KEY-----"));
    }

    #[test]
    fn decrypt_private_key_pem_rejects_wrong_passphrase() {
        let err = decrypt_private_key_pem(ENCRYPTED_KEY_PEM.as_bytes(), "wrong").unwrap_err();
        assert!(err.contains("decrypt"), "unexpected error: {}", err);
    }

    #[test]
    fn decrypt_private_key_pem_rejects_non_pkcs8_pem() {
        let legacy = "-----BEGIN RSA PRIVATE KEY-----\nAAAA\n-----END RSA PRIVATE KEY-----\n";
        let err = decrypt_private_key_pem(legacy.as_bytes(), "x").unwrap_err();
        assert!(
            err.contains("ENCRYPTED PRIVATE KEY"),
            "unexpected error: {}",
            err
        );
        assert!(err.contains("RSA PRIVATE KEY"));
    }

    #[test]
    fn strip_json_comments_removes_comments_but_keeps_strings() {
        let input = "{\n  // line comment\n  \"url\": \"http://x\", /* block */ \"n\": 1\n}";
        let out = strip_json_comments(input);
        let parsed: serde_json::Value = serde_json::from_str(&out).unwrap();
        assert_eq!(parsed["url"], "http://x");
        assert_eq!(parsed["n"], 1);
    }

    #[test]
    fn collect_any_types_finds_nested_and_array_type_urls() {
        let body = serde_json::json!({
            "payload": { "@type": "type.googleapis.com/pkg.Outer", "inner": { "@type": "example.com/types/pkg.Inner" } },
            "list": [{ "@type": "type.googleapis.com/pkg.Item" }],
            "plain": "type.googleapis.com/not.Counted",
            "bare": { "@type": "no-slash-is-not-a-type-url" }
        });
        let types = collect_any_types(&body);
        assert_eq!(types, vec!["pkg.Outer", "pkg.Inner", "pkg.Item"]);
    }

    #[test]
    fn load_proto_to_pool_resolves_methods_and_generates_schema() {
        let dir = tempfile::tempdir().unwrap();
        let proto_path = dir.path().join("demo.proto");
        std::fs::write(
            &proto_path,
            r#"syntax = "proto3";
package demo;
enum Color { RED = 0; BLUE = 1; }
message Req {
  string message = 1;
  int32 count = 2;
  Color color = 3;
  repeated string tags = 4;
  map<string, string> labels = 5;
}
message Resp { string message = 1; }
service Demo {
  rpc Echo(Req) returns (Resp);
  rpc Watch(Req) returns (stream Resp);
}
"#,
        )
        .unwrap();

        let client = GrpcClient::new(init_grpc_pool_cache());
        let pool = client
            .load_proto_to_pool(&[proto_path.to_string_lossy().to_string()], &[])
            .unwrap();

        let echo = client.find_method(&pool, "demo.Demo", "Echo").unwrap();
        assert!(!echo.is_server_streaming());
        let watch = client.find_method(&pool, "demo.Demo", "Watch").unwrap();
        assert!(watch.is_server_streaming());
        assert!(client.find_method(&pool, "demo.Demo", "Missing").is_none());

        let schema: serde_json::Value =
            serde_json::from_str(&client.message_to_json_schema(&echo.input())).unwrap();
        assert_eq!(schema["properties"]["message"]["type"], "string");
        assert_eq!(schema["properties"]["tags"]["type"], "array");
        let schema_text = schema.to_string();
        assert!(
            schema_text.contains("\"RED\""),
            "enum values missing: {}",
            schema_text
        );
    }
}
