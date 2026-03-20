// gRPC Client Service
// Implements gRPC reflection, proto loading, and method invocation
// using tonic, prost-reflect, and protox

use crate::models::types::{
    GrpcConnection, GrpcEvent, GrpcMethodDescriptor, GrpcProtoDescriptor, GrpcServiceDescriptor,
};
use prost::Message;
use prost_reflect::{DescriptorPool, DynamicMessage, FieldDescriptor, Kind, MessageDescriptor, MethodDescriptor};
use prost_reflect::prost_types::FileDescriptorSet;
use std::collections::HashMap;
use std::time::Instant;
use tonic::codec::{Codec, DecodeBuf, Decoder, EncodeBuf, Encoder};
use tauri::Emitter;
use tonic::transport::{Certificate, Channel, ClientTlsConfig, Identity};
use uuid::Uuid;

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

pub struct GrpcClient;

impl GrpcClient {
    pub fn new() -> Self {
        GrpcClient
    }

    /// Check if a method is client/server streaming. Returns (client_streaming, server_streaming).
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

    pub async fn reflect(
        &self,
        address: &str,
        _metadata: Option<HashMap<String, String>>,
        tls: Option<bool>,
    ) -> Result<GrpcProtoDescriptor, String> {
        // Try v1 first, fall back to v1alpha if UNIMPLEMENTED
        match self.reflect_with_version(address, tls, false).await {
            Ok(desc) => Ok(desc),
            Err(e) => {
                if e.contains("UNIMPLEMENTED") || e.contains("unimplemented") {
                    self.reflect_with_version(address, tls, true).await
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
        use_v1alpha: bool,
    ) -> Result<GrpcProtoDescriptor, String> {
        let channel = self.build_channel(address, tls, None, None, None).await?;

        // Create the reflection client based on version
        let service_names = if use_v1alpha {
            self.reflection_list_services_v1alpha(channel.clone()).await?
        } else {
            self.reflection_list_services_v1(channel.clone()).await?
        };

        // Get file descriptors for each service
        let mut all_fd_bytes: Vec<Vec<u8>> = Vec::new();
        let mut seen: std::collections::HashSet<Vec<u8>> = std::collections::HashSet::new();

        for svc_name in &service_names {
            let fds = if use_v1alpha {
                self.reflection_file_by_symbol_v1alpha(channel.clone(), svc_name).await?
            } else {
                self.reflection_file_by_symbol_v1(channel.clone(), svc_name).await?
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
            let fd_proto = prost_reflect::prost_types::FileDescriptorProto::decode(fd_bytes.as_slice())
                .map_err(|e| format!("Failed to decode file descriptor: {}", e))?;
            file_descriptor_protos.push(fd_proto);
        }

        let fds = FileDescriptorSet {
            file: file_descriptor_protos,
        };

        let pool = DescriptorPool::from_file_descriptor_set(fds)
            .map_err(|e| format!("Failed to create descriptor pool from reflection: {}", e))?;

        let services = self.extract_services_from_pool(&pool);

        Ok(GrpcProtoDescriptor {
            services,
            source: "reflection".to_string(),
        })
    }

    async fn reflection_list_services_v1(
        &self,
        channel: Channel,
    ) -> Result<Vec<String>, String> {
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
        let pool = self.load_proto_to_pool(proto_paths, import_dirs)?;
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
        _use_reflection: bool,
        proto_paths: Option<Vec<String>>,
        import_dirs: Option<Vec<String>>,
        tls: Option<bool>,
    ) -> Result<(GrpcConnection, Vec<GrpcEvent>), String> {
        let connection_id = Uuid::new_v4().to_string();
        let now = chrono::Utc::now().to_rfc3339();
        let start_time = Instant::now();
        let mut events: Vec<GrpcEvent> = Vec::new();

        // Build the descriptor pool from proto files
        let paths = proto_paths.as_deref().unwrap_or(&[]);
        let dirs = import_dirs.as_deref().unwrap_or(&[]);
        if paths.is_empty() {
            return Err("No proto files provided for invoke. Load proto files first.".into());
        }
        let pool = self.load_proto_to_pool(paths, dirs)?;

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
        let request_body = if body.is_empty() { "{}" } else { body };
        let mut deserializer = serde_json::Deserializer::from_str(request_body);
        let request_message =
            DynamicMessage::deserialize(method_desc.input(), &mut deserializer)
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
        let channel = self.build_channel(address, tls, None, None, None).await?;

        // Encode the dynamic message to bytes
        let encoded = request_message.encode_to_vec();

        // Build tonic request
        let mut request = tonic::Request::new(encoded);
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

        let result = grpc_client
            .unary(request, path_obj, RawBytesCodec)
            .await;

        let elapsed = start_time.elapsed().as_millis() as f64;

        match result {
            Ok(response) => {
                let initial_metadata = Self::metadata_to_map(response.metadata());
                let response_bytes = response.into_inner();

                // Decode response bytes to DynamicMessage
                let response_message =
                    DynamicMessage::decode(method_desc.output(), response_bytes.as_slice())
                        .map_err(|e| format!("Failed to decode response: {}", e))?;

                let response_json = serde_json::to_string_pretty(&response_message)
                    .unwrap_or_else(|_| "{}".to_string());
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

                let mut trailers = HashMap::new();
                trailers.insert("grpc-status".to_string(), "0".to_string());
                trailers.insert("grpc-message".to_string(), "OK".to_string());

                let connection = GrpcConnection {
                    id: connection_id,
                    request_id: String::new(),
                    url: address.to_string(),
                    service: service_name.to_string(),
                    method: method_name.to_string(),
                    status: 0,
                    status_message: None,
                    state: "closed".to_string(),
                    trailers,
                    initial_metadata: Some(initial_metadata),
                    elapsed,
                    error: None,
                    created_at: now,
                };

                Ok((connection, events))
            }
            Err(status) => {
                let code = status.code() as i32;
                let message = status.message().to_string();

                events.push(GrpcEvent {
                    id: Uuid::new_v4().to_string(),
                    connection_id: connection_id.clone(),
                    event_type: "error".to_string(),
                    content: String::new(),
                    metadata: None,
                    status: Some(code),
                    error: Some(message.clone()),
                    size: None,
                    created_at: chrono::Utc::now().to_rfc3339(),
                });

                let mut trailers = Self::metadata_to_map(status.metadata());
                trailers.entry("grpc-status".to_string()).or_insert_with(|| code.to_string());
                trailers.entry("grpc-message".to_string()).or_insert_with(|| message.clone());

                let connection = GrpcConnection {
                    id: connection_id,
                    request_id: String::new(),
                    url: address.to_string(),
                    service: service_name.to_string(),
                    method: method_name.to_string(),
                    status: code,
                    status_message: Some(message.clone()),
                    state: "closed".to_string(),
                    trailers,
                    initial_metadata: None,
                    elapsed,
                    error: Some(message),
                    created_at: now,
                };

                Ok((connection, events))
            }
        }
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
        is_client_streaming: bool,
        is_server_streaming: bool,
        app: tauri::AppHandle,
        registry: crate::commands::grpc::GrpcStreamRegistry,
    ) -> Result<(), String> {
        use crate::commands::grpc::{GrpcStreamCommand, GrpcStreamHandle};
        use crate::models::types::{GrpcConnection, GrpcEvent};
        use tokio_stream::StreamExt;

        let connection_id = Uuid::new_v4().to_string();
        let now = chrono::Utc::now().to_rfc3339();
        let start_time = Instant::now();

        // Build the descriptor pool from proto files
        let paths = proto_paths.as_deref().unwrap_or(&[]);
        let dirs = import_dirs.as_deref().unwrap_or(&[]);
        if paths.is_empty() {
            return Err("No proto files provided for invoke. Load proto files first.".into());
        }
        let pool = self.load_proto_to_pool(paths, dirs)?;

        let method_desc = self
            .find_method(&pool, service_name, method_name)
            .ok_or_else(|| {
                format!(
                    "Method {}/{} not found in proto definitions",
                    service_name, method_name
                )
            })?;

        // Build channel
        let channel = self.build_channel(address, tls, None, None, None).await?;

        // Build the gRPC path
        let path = format!("/{}/{}", service_name, method_name);
        let path_obj = http::uri::PathAndQuery::from_maybe_shared(path)
            .map_err(|e| format!("Invalid path: {}", e))?;

        // Encode the initial message body
        let request_body = if body.is_empty() { "{}" } else { body };
        let input_desc = method_desc.input();
        let output_desc = method_desc.output();

        // Parse initial request message
        let mut deserializer = serde_json::Deserializer::from_str(request_body);
        let initial_message = DynamicMessage::deserialize(input_desc.clone(), &mut deserializer)
            .map_err(|e| format!("Failed to parse request body: {}", e))?;
        let initial_encoded = initial_message.encode_to_vec();

        // Emit connection start
        let connection = GrpcConnection {
            id: connection_id.clone(),
            request_id: String::new(),
            url: address.to_string(),
            service: service_name.to_string(),
            method: method_name.to_string(),
            status: 0,
            status_message: None,
            state: "open".to_string(),
            trailers: HashMap::new(),
            initial_metadata: None,
            elapsed: 0.0,
            error: None,
            created_at: now.clone(),
        };
        let _ = app.emit("grpcConnectionStart", &connection);

        // Emit initial client message event
        let _ = app.emit("grpcEvent", &GrpcEvent {
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

        // Create a channel for sending additional messages from the UI
        let (tx, mut rx) = tokio::sync::mpsc::channel::<GrpcStreamCommand>(32);

        // For client-streaming or bidirectional: register the sender in the registry
        if is_client_streaming {
            let mut reg = registry.lock().await;
            reg.insert(
                connection_id.clone(),
                GrpcStreamHandle { sender: tx },
            );
        }

        // Clone values needed in the spawned task
        let conn_id = connection_id.clone();
        let address_owned = address.to_string();
        let service_owned = service_name.to_string();
        let method_owned = method_name.to_string();

        // Spawn the streaming task in the background
        tokio::spawn(async move {
            let outer_app = app.clone();
            let outer_conn_id = conn_id.clone();
            let result: Result<(), String> = async {
                let mut grpc_client = tonic::client::Grpc::new(channel);
                grpc_client
                    .ready()
                    .await
                    .map_err(|e| format!("Channel not ready: {}", e))?;

                if is_client_streaming && is_server_streaming {
                    // Bidirectional streaming
                    let stream_app = app.clone();
                    let stream_conn_id = conn_id.clone();
                    let request_stream = async_stream::stream! {
                        // Send the initial message
                        yield initial_encoded;

                        // Wait for additional messages from the UI
                        loop {
                            match rx.recv().await {
                                Some(GrpcStreamCommand::SendMessage(json_body)) => {
                                    match serde_json::Deserializer::from_str(&json_body)
                                        .into_iter::<serde_json::Value>()
                                        .next()
                                    {
                                        Some(Ok(_)) => {
                                            let mut deser = serde_json::Deserializer::from_str(&json_body);
                                            match DynamicMessage::deserialize(input_desc.clone(), &mut deser) {
                                                Ok(msg) => {
                                                    let _ = stream_app.emit("grpcEvent", &GrpcEvent {
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
                                                    let _ = stream_app.emit("grpcEvent", &GrpcEvent {
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
                                            let _ = stream_app.emit("grpcEvent", &GrpcEvent {
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
                                Some(GrpcStreamCommand::EndStream) | None => break,
                            }
                        }
                    };

                    let mut tonic_request = tonic::Request::new(request_stream);
                    if let Some(ref md) = metadata {
                        Self::apply_metadata(tonic_request.metadata_mut(), md);
                    }

                    let response = grpc_client
                        .streaming(tonic_request, path_obj, RawBytesCodec)
                        .await
                        .map_err(|e| format!("Streaming call failed: {} ({})", e.message(), e.code()))?;

                    let initial_md = Self::metadata_to_map(response.metadata());
                    let _ = app.emit("grpcEvent", &GrpcEvent {
                        id: Uuid::new_v4().to_string(),
                        connection_id: conn_id.clone(),
                        event_type: "metadata".to_string(),
                        content: serde_json::to_string(&initial_md).unwrap_or_default(),
                        metadata: Some(initial_md),
                        status: None,
                        error: None,
                        size: None,
                        created_at: chrono::Utc::now().to_rfc3339(),
                    });

                    let mut response_stream = response.into_inner();
                    while let Some(result) = response_stream.next().await {
                        match result {
                            Ok(response_bytes) => {
                                match DynamicMessage::decode(output_desc.clone(), response_bytes.as_slice()) {
                                    Ok(response_message) => {
                                        let json = serde_json::to_string_pretty(&response_message)
                                            .unwrap_or_else(|_| "{}".to_string());
                                        let size = json.len();
                                        let _ = app.emit("grpcEvent", &GrpcEvent {
                                            id: Uuid::new_v4().to_string(),
                                            connection_id: conn_id.clone(),
                                            event_type: "server_message".to_string(),
                                            content: json,
                                            metadata: None,
                                            status: None,
                                            error: None,
                                            size: Some(size),
                                            created_at: chrono::Utc::now().to_rfc3339(),
                                        });
                                    }
                                    Err(e) => {
                                        let _ = app.emit("grpcEvent", &GrpcEvent {
                                            id: Uuid::new_v4().to_string(),
                                            connection_id: conn_id.clone(),
                                            event_type: "error".to_string(),
                                            content: String::new(),
                                            metadata: None,
                                            status: None,
                                            error: Some(format!("Decode error: {}", e)),
                                            size: None,
                                            created_at: chrono::Utc::now().to_rfc3339(),
                                        });
                                    }
                                }
                            }
                            Err(status) => {
                                let _ = app.emit("grpcEvent", &GrpcEvent {
                                    id: Uuid::new_v4().to_string(),
                                    connection_id: conn_id.clone(),
                                    event_type: "error".to_string(),
                                    content: String::new(),
                                    metadata: None,
                                    status: Some(status.code() as i32),
                                    error: Some(status.message().to_string()),
                                    size: None,
                                    created_at: chrono::Utc::now().to_rfc3339(),
                                });
                                break;
                            }
                        }
                    }

                    Ok(())
                } else if is_client_streaming {
                    // Client streaming only
                    let cs_app = app.clone();
                    let cs_conn_id = conn_id.clone();
                    let request_stream = async_stream::stream! {
                        yield initial_encoded;

                        loop {
                            match rx.recv().await {
                                Some(GrpcStreamCommand::SendMessage(json_body)) => {
                                    let mut deser = serde_json::Deserializer::from_str(&json_body);
                                    match DynamicMessage::deserialize(input_desc.clone(), &mut deser) {
                                        Ok(msg) => {
                                            let _ = cs_app.emit("grpcEvent", &GrpcEvent {
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
                                            let _ = cs_app.emit("grpcEvent", &GrpcEvent {
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
                                Some(GrpcStreamCommand::EndStream) | None => break,
                            }
                        }
                    };

                    let mut tonic_request = tonic::Request::new(request_stream);
                    if let Some(ref md) = metadata {
                        Self::apply_metadata(tonic_request.metadata_mut(), md);
                    }

                    let response = grpc_client
                        .client_streaming(tonic_request, path_obj, RawBytesCodec)
                        .await
                        .map_err(|e| format!("Client streaming call failed: {} ({})", e.message(), e.code()))?;

                    let response_bytes = response.into_inner();
                    match DynamicMessage::decode(output_desc.clone(), response_bytes.as_slice()) {
                        Ok(response_message) => {
                            let json = serde_json::to_string_pretty(&response_message)
                                .unwrap_or_else(|_| "{}".to_string());
                            let size = json.len();
                            let _ = app.emit("grpcEvent", &GrpcEvent {
                                id: Uuid::new_v4().to_string(),
                                connection_id: conn_id.clone(),
                                event_type: "server_message".to_string(),
                                content: json,
                                metadata: None,
                                status: None,
                                error: None,
                                size: Some(size),
                                created_at: chrono::Utc::now().to_rfc3339(),
                            });
                        }
                        Err(e) => {
                            let _ = app.emit("grpcEvent", &GrpcEvent {
                                id: Uuid::new_v4().to_string(),
                                connection_id: conn_id.clone(),
                                event_type: "error".to_string(),
                                content: String::new(),
                                metadata: None,
                                status: None,
                                error: Some(format!("Decode error: {}", e)),
                                size: None,
                                created_at: chrono::Utc::now().to_rfc3339(),
                            });
                        }
                    }

                    Ok(())
                } else {
                    // Server streaming only
                    let encoded = initial_encoded;
                    let mut tonic_request = tonic::Request::new(encoded);
                    if let Some(ref md) = metadata {
                        Self::apply_metadata(tonic_request.metadata_mut(), md);
                    }

                    let response = grpc_client
                        .server_streaming(tonic_request, path_obj, RawBytesCodec)
                        .await
                        .map_err(|e| format!("Server streaming call failed: {} ({})", e.message(), e.code()))?;

                    let initial_md = Self::metadata_to_map(response.metadata());
                    let _ = app.emit("grpcEvent", &GrpcEvent {
                        id: Uuid::new_v4().to_string(),
                        connection_id: conn_id.clone(),
                        event_type: "metadata".to_string(),
                        content: serde_json::to_string(&initial_md).unwrap_or_default(),
                        metadata: Some(initial_md),
                        status: None,
                        error: None,
                        size: None,
                        created_at: chrono::Utc::now().to_rfc3339(),
                    });

                    let mut response_stream = response.into_inner();
                    while let Some(result) = response_stream.next().await {
                        match result {
                            Ok(response_bytes) => {
                                match DynamicMessage::decode(output_desc.clone(), response_bytes.as_slice()) {
                                    Ok(response_message) => {
                                        let json = serde_json::to_string_pretty(&response_message)
                                            .unwrap_or_else(|_| "{}".to_string());
                                        let size = json.len();
                                        let _ = app.emit("grpcEvent", &GrpcEvent {
                                            id: Uuid::new_v4().to_string(),
                                            connection_id: conn_id.clone(),
                                            event_type: "server_message".to_string(),
                                            content: json,
                                            metadata: None,
                                            status: None,
                                            error: None,
                                            size: Some(size),
                                            created_at: chrono::Utc::now().to_rfc3339(),
                                        });
                                    }
                                    Err(e) => {
                                        let _ = app.emit("grpcEvent", &GrpcEvent {
                                            id: Uuid::new_v4().to_string(),
                                            connection_id: conn_id.clone(),
                                            event_type: "error".to_string(),
                                            content: String::new(),
                                            metadata: None,
                                            status: None,
                                            error: Some(format!("Decode error: {}", e)),
                                            size: None,
                                            created_at: chrono::Utc::now().to_rfc3339(),
                                        });
                                    }
                                }
                            }
                            Err(status) => {
                                let _ = app.emit("grpcEvent", &GrpcEvent {
                                    id: Uuid::new_v4().to_string(),
                                    connection_id: conn_id.clone(),
                                    event_type: "error".to_string(),
                                    content: String::new(),
                                    metadata: None,
                                    status: Some(status.code() as i32),
                                    error: Some(status.message().to_string()),
                                    size: None,
                                    created_at: chrono::Utc::now().to_rfc3339(),
                                });
                                break;
                            }
                        }
                    }

                    Ok(())
                }
            }.await;

            let elapsed = start_time.elapsed().as_millis() as f64;

            // Remove from registry if it was a client-streaming connection
            if is_client_streaming {
                let mut reg = registry.lock().await;
                reg.remove(&outer_conn_id);
            }

            // Emit connection end
            let mut trailers = HashMap::new();
            if let Err(ref e) = result {
                trailers.insert("grpc-message".to_string(), e.clone());
            } else {
                trailers.insert("grpc-status".to_string(), "0".to_string());
                trailers.insert("grpc-message".to_string(), "OK".to_string());
            }

            let end_connection = GrpcConnection {
                id: outer_conn_id,
                request_id: String::new(),
                url: address_owned,
                service: service_owned,
                method: method_owned,
                status: if result.is_err() { 2 } else { 0 },
                status_message: result.err(),
                state: "closed".to_string(),
                trailers,
                initial_metadata: None,
                elapsed,
                error: None,
                created_at: now,
            };
            let _ = outer_app.emit("grpcConnectionEnd", &end_connection);
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
        let mut map = HashMap::new();
        for key_and_value in metadata.iter() {
            if let tonic::metadata::KeyAndValueRef::Ascii(key, value) = key_and_value {
                if let Ok(v) = value.to_str() {
                    map.insert(key.as_str().to_string(), v.to_string());
                }
            }
        }
        map
    }

    async fn build_channel(
        &self,
        address: &str,
        tls: Option<bool>,
        cert_path: Option<&str>,
        key_path: Option<&str>,
        ca_cert_path: Option<&str>,
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
                let key = tokio::fs::read(key_p)
                    .await
                    .map_err(|e| format!("Failed to read key '{}': {}", key_p, e))?;
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
            Kind::Int32 | Kind::Sint32 | Kind::Sfixed32
            | Kind::Uint32 | Kind::Fixed32 => serde_json::json!({ "type": "integer" }),
            Kind::Int64 | Kind::Sint64 | Kind::Sfixed64
            | Kind::Uint64 | Kind::Fixed64 => serde_json::json!({ "type": "string" }),
            Kind::Bool => serde_json::json!({ "type": "boolean" }),
            Kind::String => serde_json::json!({ "type": "string" }),
            Kind::Bytes => serde_json::json!({ "type": "string", "format": "byte" }),
            Kind::Enum(enum_desc) => {
                let values: Vec<String> = enum_desc
                    .values()
                    .map(|v| v.name().to_string())
                    .collect();
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
            import_dirs.iter().map(|d| PathBuf::from(d)).collect()
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
