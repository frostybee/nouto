// NTLM Authentication Service
// Implements NTLMv2 challenge-response authentication (MS-NLMP specification)
// Flow: Type 1 (Negotiate) -> Type 2 (Challenge) -> Type 3 (Authenticate)

use base64::{engine::general_purpose::STANDARD as BASE64, Engine as _};
use digest::Digest;
use hmac::{Hmac, Mac};
use md4::Md4;
use md5::Md5;
use rand::Rng;

type HmacMd5 = Hmac<Md5>;

/// Parsed NTLM Type 2 (Challenge) message from the server
pub struct NtlmChallenge {
    pub server_challenge: [u8; 8],
    pub flags: u32,
    pub target_info: Vec<u8>,
}

// ---------------------------------------------------------------------------
// NTLM negotiate flags (subset relevant to NTLMv2)
// ---------------------------------------------------------------------------
const NTLMSSP_NEGOTIATE_UNICODE: u32 = 0x0000_0001;
const NTLMSSP_NEGOTIATE_NTLM: u32 = 0x0000_0200;
const NTLMSSP_REQUEST_TARGET: u32 = 0x0000_0004;
const NTLMSSP_NEGOTIATE_ALWAYS_SIGN: u32 = 0x0000_8000;
const NTLMSSP_NEGOTIATE_EXTENDED_SESSIONSECURITY: u32 = 0x0008_0000;
const NTLMSSP_NEGOTIATE_56: u32 = 0x8000_0000;

const TYPE1_FLAGS: u32 = NTLMSSP_NEGOTIATE_UNICODE
    | NTLMSSP_NEGOTIATE_NTLM
    | NTLMSSP_REQUEST_TARGET
    | NTLMSSP_NEGOTIATE_ALWAYS_SIGN
    | NTLMSSP_NEGOTIATE_EXTENDED_SESSIONSECURITY
    | NTLMSSP_NEGOTIATE_56;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/// Create an NTLM Type 1 (Negotiate) message as raw bytes.
pub fn create_type1_message() -> Vec<u8> {
    let mut msg = Vec::with_capacity(40);
    msg.extend_from_slice(b"NTLMSSP\0"); // Signature
    msg.extend_from_slice(&1u32.to_le_bytes()); // Type 1 indicator
    msg.extend_from_slice(&TYPE1_FLAGS.to_le_bytes()); // Negotiate flags
    // Domain name security buffer (empty, not supplied)
    msg.extend_from_slice(&[0u8; 8]);
    // Workstation security buffer (empty, not supplied)
    msg.extend_from_slice(&[0u8; 8]);
    msg
}

/// Parse an NTLM Type 2 (Challenge) message from raw bytes.
pub fn parse_type2_message(data: &[u8]) -> Result<NtlmChallenge, String> {
    if data.len() < 32 {
        return Err("Type 2 message too short".into());
    }
    if &data[0..8] != b"NTLMSSP\0" {
        return Err("Invalid NTLM signature".into());
    }
    let msg_type = u32::from_le_bytes(
        data[8..12]
            .try_into()
            .map_err(|_| "Failed to read message type")?,
    );
    if msg_type != 2 {
        return Err(format!("Expected Type 2, got Type {}", msg_type));
    }

    let flags = u32::from_le_bytes(
        data[20..24]
            .try_into()
            .map_err(|_| "Failed to read flags")?,
    );

    let mut server_challenge = [0u8; 8];
    server_challenge.copy_from_slice(&data[24..32]);

    // Target info security buffer starts at offset 40 in the Type 2 message
    let target_info = if data.len() > 48 {
        let ti_len = u16::from_le_bytes(
            data[40..42]
                .try_into()
                .map_err(|_| "Failed to read target info length")?,
        ) as usize;
        let ti_offset = u32::from_le_bytes(
            data[44..48]
                .try_into()
                .map_err(|_| "Failed to read target info offset")?,
        ) as usize;
        if ti_len > 0 && ti_offset + ti_len <= data.len() {
            data[ti_offset..ti_offset + ti_len].to_vec()
        } else {
            Vec::new()
        }
    } else {
        Vec::new()
    };

    Ok(NtlmChallenge {
        server_challenge,
        flags,
        target_info,
    })
}

/// Create an NTLM Type 3 (Authenticate) message as raw bytes.
///
/// Uses NTLMv2 with HMAC-MD5 for the proof computation.
pub fn create_type3_message(
    username: &str,
    password: &str,
    domain: &str,
    workstation: &str,
    challenge: &NtlmChallenge,
) -> Vec<u8> {
    let nt_hash = compute_nt_hash(password);
    let ntlmv2_hash = compute_ntlmv2_hash(&nt_hash, username, domain);

    let mut rng = rand::rng();
    let client_challenge: [u8; 8] = rng.random();
    let timestamp = filetime_now();

    // Build the NTLMv2 client blob
    let blob = build_client_blob(&client_challenge, &timestamp, &challenge.target_info);

    // NTLMv2 proof: HMAC_MD5(ntlmv2_hash, server_challenge || blob)
    let mut proof_input = Vec::with_capacity(8 + blob.len());
    proof_input.extend_from_slice(&challenge.server_challenge);
    proof_input.extend_from_slice(&blob);
    let nt_proof = hmac_md5(&ntlmv2_hash, &proof_input);

    // Full NT response = nt_proof || blob
    let mut nt_response = Vec::with_capacity(16 + blob.len());
    nt_response.extend_from_slice(&nt_proof);
    nt_response.extend_from_slice(&blob);

    // LMv2 response: HMAC_MD5(ntlmv2_hash, server_challenge || client_challenge) || client_challenge
    let mut lm_input = Vec::with_capacity(16);
    lm_input.extend_from_slice(&challenge.server_challenge);
    lm_input.extend_from_slice(&client_challenge);
    let lm_proof = hmac_md5(&ntlmv2_hash, &lm_input);
    let mut lm_response = Vec::with_capacity(24);
    lm_response.extend_from_slice(&lm_proof);
    lm_response.extend_from_slice(&client_challenge);

    // Encode strings as UTF-16LE for the Type 3 payload
    let domain_bytes = to_utf16le(domain);
    let user_bytes = to_utf16le(username);
    let ws_bytes = to_utf16le(workstation);

    // Type 3 fixed header is 88 bytes (including signature, type, 6 security buffers, flags, and padding)
    let base_offset: u32 = 88;

    // Calculate payload offsets (order: LM, NT, domain, user, workstation)
    let lm_offset = base_offset;
    let nt_offset = lm_offset + lm_response.len() as u32;
    let domain_offset = nt_offset + nt_response.len() as u32;
    let user_offset = domain_offset + domain_bytes.len() as u32;
    let ws_offset = user_offset + user_bytes.len() as u32;
    let session_key_offset = ws_offset + ws_bytes.len() as u32;

    let flags = challenge.flags;

    let mut msg = Vec::with_capacity(session_key_offset as usize);

    // Header
    msg.extend_from_slice(b"NTLMSSP\0"); // Signature (8 bytes)
    msg.extend_from_slice(&3u32.to_le_bytes()); // Type 3 indicator (4 bytes)

    // Security buffers (8 bytes each, 6 total = 48 bytes)
    write_security_buffer(&mut msg, lm_response.len() as u16, lm_offset);
    write_security_buffer(&mut msg, nt_response.len() as u16, nt_offset);
    write_security_buffer(&mut msg, domain_bytes.len() as u16, domain_offset);
    write_security_buffer(&mut msg, user_bytes.len() as u16, user_offset);
    write_security_buffer(&mut msg, ws_bytes.len() as u16, ws_offset);
    write_security_buffer(&mut msg, 0, session_key_offset); // Empty encrypted random session key

    // Negotiate flags (4 bytes)
    msg.extend_from_slice(&flags.to_le_bytes());

    // Pad to base_offset (fills the remaining bytes to reach 88)
    while msg.len() < base_offset as usize {
        msg.push(0);
    }

    // Payload (variable-length data referenced by security buffers)
    msg.extend_from_slice(&lm_response);
    msg.extend_from_slice(&nt_response);
    msg.extend_from_slice(&domain_bytes);
    msg.extend_from_slice(&user_bytes);
    msg.extend_from_slice(&ws_bytes);

    msg
}

/// Extract the NTLM base64 data from a `WWW-Authenticate: NTLM <base64>` header value.
///
/// Returns the decoded bytes of the Type 2 message, or `None` if the header
/// does not contain an NTLM challenge.
pub fn extract_type2_from_header(header_value: &str) -> Option<Vec<u8>> {
    let trimmed = header_value.trim();
    if trimmed.len() > 5 && trimmed[..5].eq_ignore_ascii_case("ntlm ") {
        let b64 = trimmed[5..].trim();
        BASE64.decode(b64).ok()
    } else {
        None
    }
}

/// Encode raw NTLM message bytes into the `NTLM <base64>` format for the
/// `Authorization` header.
pub fn encode_authorization(msg: &[u8]) -> String {
    format!("NTLM {}", BASE64.encode(msg))
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/// Compute the NT hash: MD4(UTF-16LE(password))
fn compute_nt_hash(password: &str) -> [u8; 16] {
    let utf16 = to_utf16le(password);
    let mut hasher = Md4::new();
    hasher.update(&utf16);
    let result = hasher.finalize();
    let mut hash = [0u8; 16];
    hash.copy_from_slice(&result);
    hash
}

/// Compute the NTLMv2 hash: HMAC_MD5(nt_hash, UTF-16LE(UPPER(username) + UPPER(domain)))
fn compute_ntlmv2_hash(nt_hash: &[u8; 16], username: &str, domain: &str) -> [u8; 16] {
    let identity = format!(
        "{}{}",
        username.to_uppercase(),
        domain.to_uppercase()
    );
    let identity_bytes = to_utf16le(&identity);
    hmac_md5(nt_hash, &identity_bytes)
}

/// HMAC-MD5 returning a 16-byte digest.
fn hmac_md5(key: &[u8], data: &[u8]) -> [u8; 16] {
    let mut mac =
        HmacMd5::new_from_slice(key).expect("HMAC-MD5 accepts keys of any length");
    mac.update(data);
    let result = mac.finalize().into_bytes();
    let mut out = [0u8; 16];
    out.copy_from_slice(&result);
    out
}

/// Build the NTLMv2 client blob (a.k.a. "temp" in the MS-NLMP specification).
fn build_client_blob(
    client_challenge: &[u8; 8],
    timestamp: &[u8; 8],
    target_info: &[u8],
) -> Vec<u8> {
    let mut blob = Vec::with_capacity(28 + target_info.len() + 4);
    blob.extend_from_slice(&[0x01, 0x01, 0x00, 0x00]); // Blob signature (RespType + HiRespType)
    blob.extend_from_slice(&[0x00, 0x00, 0x00, 0x00]); // Reserved
    blob.extend_from_slice(timestamp); // TimeStamp (8 bytes, Windows FILETIME)
    blob.extend_from_slice(client_challenge); // Client challenge (8 bytes)
    blob.extend_from_slice(&[0x00, 0x00, 0x00, 0x00]); // Reserved
    blob.extend_from_slice(target_info); // AvPairs from Type 2 target info
    blob.extend_from_slice(&[0x00, 0x00, 0x00, 0x00]); // Terminator (MsvAvEOL)
    blob
}

/// Return the current time as a Windows FILETIME (100-nanosecond intervals since 1601-01-01).
fn filetime_now() -> [u8; 8] {
    // Difference between Windows FILETIME epoch (1601-01-01) and Unix epoch (1970-01-01)
    // in 100-nanosecond intervals
    const EPOCH_DIFF: u64 = 116_444_736_000_000_000;
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap();
    let filetime = now.as_nanos() as u64 / 100 + EPOCH_DIFF;
    filetime.to_le_bytes()
}

/// Encode a string as UTF-16LE bytes.
fn to_utf16le(s: &str) -> Vec<u8> {
    s.encode_utf16().flat_map(|c| c.to_le_bytes()).collect()
}

/// Write an NTLM security buffer (length: u16, max_length: u16, offset: u32) to the message.
fn write_security_buffer(msg: &mut Vec<u8>, len: u16, offset: u32) {
    msg.extend_from_slice(&len.to_le_bytes()); // Length
    msg.extend_from_slice(&len.to_le_bytes()); // MaxLength (same as Length for our purposes)
    msg.extend_from_slice(&offset.to_le_bytes()); // Offset from start of message
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn type1_message_has_correct_signature_and_type() {
        let msg = create_type1_message();
        assert_eq!(&msg[0..8], b"NTLMSSP\0");
        assert_eq!(u32::from_le_bytes(msg[8..12].try_into().unwrap()), 1);
    }

    #[test]
    fn type1_message_length() {
        let msg = create_type1_message();
        // 8 (sig) + 4 (type) + 4 (flags) + 8 (domain buf) + 8 (ws buf) = 32
        assert_eq!(msg.len(), 32);
    }

    #[test]
    fn nt_hash_known_value() {
        // Known test vector: password "Password" should produce a specific MD4 hash
        let hash = compute_nt_hash("Password");
        // MD4(UTF-16LE("Password")) = a4f49c406510bdca b6824ee7c30fd852
        assert_eq!(
            hex::encode(hash),
            "a4f49c406510bdcab6824ee7c30fd852"
        );
    }

    #[test]
    fn parse_type2_rejects_short_message() {
        let result = parse_type2_message(&[0u8; 16]);
        assert!(result.is_err());
    }

    #[test]
    fn parse_type2_rejects_bad_signature() {
        let mut data = vec![0u8; 48];
        data[0..8].copy_from_slice(b"BADSSIG\0");
        data[8..12].copy_from_slice(&2u32.to_le_bytes());
        assert!(parse_type2_message(&data).is_err());
    }

    #[test]
    fn parse_type2_rejects_wrong_type() {
        let mut data = vec![0u8; 48];
        data[0..8].copy_from_slice(b"NTLMSSP\0");
        data[8..12].copy_from_slice(&1u32.to_le_bytes()); // Type 1, not 2
        assert!(parse_type2_message(&data).is_err());
    }

    #[test]
    fn parse_type2_extracts_challenge() {
        let mut data = vec![0u8; 48];
        data[0..8].copy_from_slice(b"NTLMSSP\0");
        data[8..12].copy_from_slice(&2u32.to_le_bytes());
        data[20..24].copy_from_slice(&0x00028233u32.to_le_bytes()); // flags
        data[24..32].copy_from_slice(&[1, 2, 3, 4, 5, 6, 7, 8]); // challenge
        let challenge = parse_type2_message(&data).unwrap();
        assert_eq!(challenge.server_challenge, [1, 2, 3, 4, 5, 6, 7, 8]);
        assert_eq!(challenge.flags, 0x00028233);
    }

    #[test]
    fn extract_type2_from_valid_header() {
        let type1 = create_type1_message();
        let encoded = BASE64.encode(&type1);
        let header = format!("NTLM {}", encoded);
        let decoded = extract_type2_from_header(&header);
        assert!(decoded.is_some());
        assert_eq!(decoded.unwrap(), type1);
    }

    #[test]
    fn extract_type2_from_non_ntlm_header() {
        assert!(extract_type2_from_header("Basic abc123").is_none());
        assert!(extract_type2_from_header("Digest realm=test").is_none());
    }

    #[test]
    fn encode_authorization_format() {
        let msg = vec![1, 2, 3];
        let header = encode_authorization(&msg);
        assert!(header.starts_with("NTLM "));
        let b64_part = &header[5..];
        let decoded = BASE64.decode(b64_part).unwrap();
        assert_eq!(decoded, vec![1, 2, 3]);
    }

    #[test]
    fn type3_message_has_correct_signature_and_type() {
        let challenge = NtlmChallenge {
            server_challenge: [1, 2, 3, 4, 5, 6, 7, 8],
            flags: TYPE1_FLAGS,
            target_info: Vec::new(),
        };
        let msg = create_type3_message("user", "pass", "DOMAIN", "WORKSTATION", &challenge);
        assert_eq!(&msg[0..8], b"NTLMSSP\0");
        assert_eq!(u32::from_le_bytes(msg[8..12].try_into().unwrap()), 3);
    }

    #[test]
    fn roundtrip_utf16le() {
        let original = "Hello";
        let encoded = to_utf16le(original);
        // UTF-16LE for ASCII chars: each char is 2 bytes, little-endian
        assert_eq!(encoded.len(), 10);
        assert_eq!(encoded[0], b'H');
        assert_eq!(encoded[1], 0);
    }
}
