use std::error::Error as StdError;
use std::io;

/// A message for a failed reqwest call that names the cause.
///
/// reqwest's own message stops at "error sending request for url (...)"; the
/// cause, such as the OS connect error, is in the source chain. Windows words a
/// refused connect as "actively refused it", so the `io::ErrorKind` adds a
/// "connection refused" hint that the UI's error categorizer can match.
pub fn describe_reqwest_error(error: &reqwest::Error) -> String {
    let mut parts = vec![error.to_string()];
    let mut hint = if error.is_timeout() {
        Some("timed out")
    } else {
        None
    };

    let mut source = error.source();
    while let Some(err) = source {
        let text = err.to_string();
        if !text.is_empty() && !parts.iter().any(|part| part.contains(&text)) {
            parts.push(text);
        }
        if hint.is_none() {
            if let Some(io_error) = err.downcast_ref::<io::Error>() {
                hint = match io_error.kind() {
                    io::ErrorKind::ConnectionRefused => Some("connection refused"),
                    io::ErrorKind::ConnectionReset | io::ErrorKind::ConnectionAborted => {
                        Some("connection reset")
                    }
                    io::ErrorKind::TimedOut => Some("timed out"),
                    _ => None,
                };
            }
        }
        source = err.source();
    }

    let mut message = parts.join(": ");
    if let Some(hint) = hint {
        if !message.to_lowercase().contains(hint) {
            message.push_str(&format!(" ({})", hint));
        }
    }
    message
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn names_a_refused_connection() {
        // Bind a port, then free it, so nothing listens there
        let port = std::net::TcpListener::bind("127.0.0.1:0")
            .unwrap()
            .local_addr()
            .unwrap()
            .port();
        let error = reqwest::Client::new()
            .get(format!("http://127.0.0.1:{}/", port))
            .send()
            .await
            .expect_err("nothing listens on the port");

        let message = describe_reqwest_error(&error);
        assert!(message.starts_with("error sending request"), "{}", message);
        assert!(
            message.to_lowercase().contains("connection refused"),
            "{}",
            message
        );
    }
}
