// AWS Signature Version 4 signing
// Implements the standard SigV4 algorithm for authenticating AWS API requests.
// Reference: https://docs.aws.amazon.com/general/latest/gr/sigv4_signing.html

use hmac::{Hmac, Mac};
use sha2::{Sha256, Digest};
use std::collections::BTreeMap;

type HmacSha256 = Hmac<Sha256>;

/// AWS credentials and signing parameters
pub struct AwsSigningParams {
    pub access_key_id: String,
    pub secret_access_key: String,
    pub session_token: Option<String>,
    pub region: String,
    pub service: String,
}

/// Computed AWS SigV4 headers to add to the request
pub struct AwsSignedHeaders {
    pub authorization: String,
    pub x_amz_date: String,
    pub x_amz_security_token: Option<String>,
    pub x_amz_content_sha256: String,
}

/// Sign a request using AWS Signature Version 4.
///
/// Returns the headers that must be added to the request (Authorization, x-amz-date, etc.).
pub fn sign_request(
    method: &str,
    url: &str,
    headers: &[(String, String)],
    body: Option<&[u8]>,
    params: &AwsSigningParams,
) -> Result<AwsSignedHeaders, String> {
    let parsed_url = reqwest::Url::parse(url)
        .map_err(|e| format!("Invalid URL for AWS signing: {}", e))?;

    let now = chrono::Utc::now();
    let date_stamp = now.format("%Y%m%d").to_string();
    let amz_date = now.format("%Y%m%dT%H%M%SZ").to_string();

    // Hash the payload
    let payload_hash = hex_sha256(body.unwrap_or(b""));

    // Build the set of headers to sign (must include host and x-amz-date)
    let host = parsed_url.host_str()
        .ok_or_else(|| "URL has no host".to_string())?;
    let host_header = match parsed_url.port() {
        Some(port) if !is_default_port(&parsed_url) => format!("{}:{}", host, port),
        _ => host.to_string(),
    };

    let mut headers_to_sign: BTreeMap<String, String> = BTreeMap::new();
    headers_to_sign.insert("host".to_string(), host_header);
    headers_to_sign.insert("x-amz-date".to_string(), amz_date.clone());
    headers_to_sign.insert("x-amz-content-sha256".to_string(), payload_hash.clone());

    if let Some(ref token) = params.session_token {
        headers_to_sign.insert("x-amz-security-token".to_string(), token.clone());
    }

    // Include any existing x-amz-* or content-type headers from the request
    for (key, value) in headers {
        let lower = key.to_lowercase();
        if lower.starts_with("x-amz-") || lower == "content-type" {
            headers_to_sign.entry(lower).or_insert_with(|| value.clone());
        }
    }

    // Step 1: Create canonical request
    let canonical_uri = canonical_uri_encode(parsed_url.path());
    let canonical_querystring = canonical_query_string(&parsed_url);

    let signed_header_names: Vec<&str> = headers_to_sign.keys().map(|s| s.as_str()).collect();
    let signed_headers_str = signed_header_names.join(";");

    let canonical_headers: String = headers_to_sign
        .iter()
        .map(|(k, v)| format!("{}:{}\n", k, v.trim()))
        .collect();

    let canonical_request = format!(
        "{}\n{}\n{}\n{}\n{}\n{}",
        method.to_uppercase(),
        canonical_uri,
        canonical_querystring,
        canonical_headers,
        signed_headers_str,
        payload_hash
    );

    // Step 2: Create string to sign
    let credential_scope = format!("{}/{}/{}/aws4_request", date_stamp, params.region, params.service);
    let string_to_sign = format!(
        "AWS4-HMAC-SHA256\n{}\n{}\n{}",
        amz_date,
        credential_scope,
        hex_sha256(canonical_request.as_bytes())
    );

    // Step 3: Calculate the signature
    let signing_key = derive_signing_key(
        &params.secret_access_key,
        &date_stamp,
        &params.region,
        &params.service,
    )?;
    let signature = hex::encode(hmac_sha256(&signing_key, string_to_sign.as_bytes())?);

    // Step 4: Build Authorization header
    let authorization = format!(
        "AWS4-HMAC-SHA256 Credential={}/{}, SignedHeaders={}, Signature={}",
        params.access_key_id,
        credential_scope,
        signed_headers_str,
        signature
    );

    Ok(AwsSignedHeaders {
        authorization,
        x_amz_date: amz_date,
        x_amz_security_token: params.session_token.clone(),
        x_amz_content_sha256: payload_hash,
    })
}

/// Derive the signing key: HMAC chain of date, region, service, "aws4_request"
fn derive_signing_key(
    secret_key: &str,
    date_stamp: &str,
    region: &str,
    service: &str,
) -> Result<Vec<u8>, String> {
    let k_secret = format!("AWS4{}", secret_key);
    let k_date = hmac_sha256(k_secret.as_bytes(), date_stamp.as_bytes())?;
    let k_region = hmac_sha256(&k_date, region.as_bytes())?;
    let k_service = hmac_sha256(&k_region, service.as_bytes())?;
    let k_signing = hmac_sha256(&k_service, b"aws4_request")?;
    Ok(k_signing)
}

/// Compute HMAC-SHA256
fn hmac_sha256(key: &[u8], data: &[u8]) -> Result<Vec<u8>, String> {
    let mut mac = HmacSha256::new_from_slice(key)
        .map_err(|e| format!("HMAC key error: {}", e))?;
    mac.update(data);
    Ok(mac.finalize().into_bytes().to_vec())
}

/// Compute hex-encoded SHA256 hash
fn hex_sha256(data: &[u8]) -> String {
    let mut hasher = Sha256::new();
    hasher.update(data);
    hex::encode(hasher.finalize())
}

/// Check if a port is the default for the scheme
fn is_default_port(url: &reqwest::Url) -> bool {
    match (url.scheme(), url.port()) {
        ("http", Some(80)) | ("https", Some(443)) => true,
        (_, None) => true,
        _ => false,
    }
}

/// URI-encode the path, preserving forward slashes
fn canonical_uri_encode(path: &str) -> String {
    if path.is_empty() {
        return "/".to_string();
    }
    // Encode each path segment individually, preserving /
    path.split('/')
        .map(|segment| uri_encode(segment, false))
        .collect::<Vec<_>>()
        .join("/")
}

/// URI-encode a string per AWS SigV4 rules
fn uri_encode(input: &str, encode_slash: bool) -> String {
    let mut encoded = String::with_capacity(input.len() * 2);
    for byte in input.bytes() {
        match byte {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'_' | b'-' | b'~' | b'.' => {
                encoded.push(byte as char);
            }
            b'/' if !encode_slash => {
                encoded.push('/');
            }
            _ => {
                encoded.push_str(&format!("%{:02X}", byte));
            }
        }
    }
    encoded
}

/// Build the canonical query string (sorted by key, then by value)
fn canonical_query_string(url: &reqwest::Url) -> String {
    let mut pairs: Vec<(String, String)> = url
        .query_pairs()
        .map(|(k, v)| (uri_encode(&k, true), uri_encode(&v, true)))
        .collect();
    pairs.sort();
    pairs
        .iter()
        .map(|(k, v)| format!("{}={}", k, v))
        .collect::<Vec<_>>()
        .join("&")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_hex_sha256_empty() {
        // SHA256 of empty string
        assert_eq!(
            hex_sha256(b""),
            "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
        );
    }

    #[test]
    fn test_uri_encode() {
        assert_eq!(uri_encode("hello world", true), "hello%20world");
        assert_eq!(uri_encode("a/b", true), "a%2Fb");
        assert_eq!(uri_encode("a/b", false), "a/b");
        assert_eq!(uri_encode("test~value", true), "test~value");
    }

    #[test]
    fn test_canonical_uri_encode() {
        assert_eq!(canonical_uri_encode(""), "/");
        assert_eq!(canonical_uri_encode("/"), "/");
        assert_eq!(canonical_uri_encode("/api/test"), "/api/test");
        assert_eq!(canonical_uri_encode("/path with spaces"), "/path%20with%20spaces");
    }

    #[test]
    fn test_sign_request_basic() {
        let params = AwsSigningParams {
            access_key_id: "AKIAIOSFODNN7EXAMPLE".to_string(),
            secret_access_key: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY".to_string(),
            session_token: None,
            region: "us-east-1".to_string(),
            service: "s3".to_string(),
        };

        let result = sign_request(
            "GET",
            "https://s3.amazonaws.com/test-bucket",
            &[],
            None,
            &params,
        );

        assert!(result.is_ok());
        let signed = result.unwrap();
        assert!(signed.authorization.starts_with("AWS4-HMAC-SHA256"));
        assert!(signed.authorization.contains("AKIAIOSFODNN7EXAMPLE"));
        assert!(signed.authorization.contains("us-east-1/s3/aws4_request"));
        assert!(!signed.x_amz_date.is_empty());
        assert!(signed.x_amz_security_token.is_none());
    }

    #[test]
    fn test_sign_request_with_session_token() {
        let params = AwsSigningParams {
            access_key_id: "AKID".to_string(),
            secret_access_key: "SECRET".to_string(),
            session_token: Some("SESSION_TOKEN".to_string()),
            region: "eu-west-1".to_string(),
            service: "execute-api".to_string(),
        };

        let result = sign_request(
            "POST",
            "https://api.example.com/test",
            &[("Content-Type".to_string(), "application/json".to_string())],
            Some(b"{\"key\":\"value\"}"),
            &params,
        );

        assert!(result.is_ok());
        let signed = result.unwrap();
        assert_eq!(signed.x_amz_security_token, Some("SESSION_TOKEN".to_string()));
        assert!(signed.authorization.contains("content-type"));
    }

    #[test]
    fn test_derive_signing_key() {
        let key = derive_signing_key(
            "wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY",
            "20150830",
            "us-east-1",
            "iam",
        );
        assert!(key.is_ok());
        assert_eq!(key.unwrap().len(), 32); // SHA256 output is 32 bytes
    }
}
