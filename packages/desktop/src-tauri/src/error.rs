#[derive(Debug, thiserror::Error)]
pub enum AppError {
    #[error("HTTP error: {0}")]
    Http(#[from] reqwest::Error),
    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),
    #[error("Serialization error: {0}")]
    Serde(#[from] serde_json::Error),
    #[error("Script error: {0}")]
    Script(String),
    #[error("OAuth error: {0}")]
    OAuth(String),
    #[error("Storage error: {0}")]
    Storage(String),
    #[error("Dialog error: {0}")]
    Dialog(String),
    #[error("gRPC error: {0}")]
    Grpc(String),
    #[error("{0}")]
    Other(String),
}

impl serde::Serialize for AppError {
    fn serialize<S: serde::Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        serializer.serialize_str(&self.to_string())
    }
}
