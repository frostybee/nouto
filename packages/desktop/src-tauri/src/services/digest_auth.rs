// Digest Authentication (RFC 7616)
// Challenge-response flow: parse WWW-Authenticate, compute hash, build Authorization header

use md5::Md5;
use sha2::Sha256;
use digest::Digest;
use rand::Rng;

pub struct DigestChallenge {
    pub realm: String,
    pub nonce: String,
    pub qop: Option<String>,
    pub opaque: Option<String>,
    pub algorithm: Option<String>,
}

/// Parse a `WWW-Authenticate: Digest ...` header value into challenge parameters.
pub fn parse_digest_challenge(www_authenticate: &str) -> Option<DigestChallenge> {
    let header = www_authenticate.trim();
    if !header.to_lowercase().starts_with("digest ") {
        return None;
    }

    let param_str = &header[7..]; // skip "Digest "
    let mut params = std::collections::HashMap::new();

    // Parse key="value" and key=value pairs
    let re_pattern = r#"(\w+)=(?:"([^"]*)"|(\S+))"#;
    let re = regex::Regex::new(re_pattern).ok()?;
    for cap in re.captures_iter(param_str) {
        let key = cap[1].to_lowercase();
        let value = cap.get(2).or(cap.get(3)).map(|m| m.as_str().to_string()).unwrap_or_default();
        params.insert(key, value);
    }

    let realm = params.get("realm")?.clone();
    let nonce = params.get("nonce")?.clone();

    Some(DigestChallenge {
        realm,
        nonce,
        qop: params.get("qop").cloned(),
        opaque: params.get("opaque").cloned(),
        algorithm: params.get("algorithm").cloned(),
    })
}

/// Compute the Digest Authorization header value.
pub fn compute_digest_auth(
    username: &str,
    password: &str,
    method: &str,
    uri: &str,
    challenge: &DigestChallenge,
) -> String {
    let algorithm = challenge.algorithm.as_deref().unwrap_or("MD5");
    let use_sha256 = algorithm.to_lowercase().replace("-sess", "") == "sha-256";

    let hash = |data: &str| -> String {
        if use_sha256 {
            let mut hasher = Sha256::new();
            Digest::update(&mut hasher, data.as_bytes());
            format!("{:x}", hasher.finalize())
        } else {
            let mut hasher = Md5::new();
            Digest::update(&mut hasher, data.as_bytes());
            format!("{:x}", hasher.finalize())
        }
    };

    let cnonce = generate_cnonce();
    let nc = "00000001";

    // HA1
    let mut ha1 = hash(&format!("{}:{}:{}", username, challenge.realm, password));
    if algorithm.to_lowercase().ends_with("-sess") {
        ha1 = hash(&format!("{}:{}:{}", ha1, challenge.nonce, cnonce));
    }

    // HA2
    let ha2 = hash(&format!("{}:{}", method, uri));

    // Check if qop includes "auth"
    let has_qop_auth = challenge.qop.as_ref()
        .map(|q| q.split(',').any(|s| s.trim() == "auth"))
        .unwrap_or(false);

    let response;
    let mut parts = vec![
        format!("username=\"{}\"", username),
        format!("realm=\"{}\"", challenge.realm),
        format!("nonce=\"{}\"", challenge.nonce),
        format!("uri=\"{}\"", uri),
        format!("algorithm={}", algorithm),
    ];

    if has_qop_auth {
        response = hash(&format!("{}:{}:{}:{}:auth:{}", ha1, challenge.nonce, nc, cnonce, ha2));
        parts.push("qop=auth".to_string());
        parts.push(format!("nc={}", nc));
        parts.push(format!("cnonce=\"{}\"", cnonce));
    } else {
        response = hash(&format!("{}:{}:{}", ha1, challenge.nonce, ha2));
    }

    parts.push(format!("response=\"{}\"", response));

    if let Some(opaque) = &challenge.opaque {
        parts.push(format!("opaque=\"{}\"", opaque));
    }

    format!("Digest {}", parts.join(", "))
}

fn generate_cnonce() -> String {
    let bytes: [u8; 8] = rand::rng().random();
    hex::encode(bytes)
}
