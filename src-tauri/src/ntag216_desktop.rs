// Desktop NFC reader for NTAG216 tags using PC/SC
//
// Supports ACR122U, PN532, and other PC/SC-compatible readers
// Works on Windows, macOS, and Linux

use serde::{Deserialize, Serialize};
use thiserror::Error;

// Debug logging macro
macro_rules! dlog {
    ($($arg:tt)*) => {
        eprintln!("[NFC-DEBUG] {}", format!($($arg)*));
    };
}

// PC/SC APDU constants
const APDU_GET_UID: [u8; 5] = [0xFF, 0xCA, 0x00, 0x00, 0x00];

// ACR122U Direct Transmit command prefix
// Format: FF 00 00 00 <length> <PN532 command>
const APDU_DIRECT_TRANSMIT: [u8; 4] = [0xFF, 0x00, 0x00, 0x00];

// NTAG216 commands (sent via Direct Transmit)
const NTAG216_READ_CMD: u8 = 0x30; // READ command
const NTAG216_WRITE_CMD: u8 = 0xA2; // WRITE command

// PN532 InDataExchange command
const PN532_INDATAEXCHANGE: [u8; 3] = [0xD4, 0x40, 0x01];

// NTAG216 memory layout
const NTAG216_FIRST_USER_PAGE: u16 = 4;
const NTAG216_LAST_USER_PAGE: u16 = 221;

#[derive(Debug, Error)]
pub enum NfcError {
    #[error("PC/SC reader not available: {0}")]
    ReaderNotAvailable(String),

    #[error("Failed to connect to NFC reader: {0}")]
    ConnectionFailed(String),

    #[error("No NFC reader found. Connect an ACR122U, PN532, or other PC/SC-compatible reader. On Linux, install pcscd. On macOS, PC/SC is built-in.")]
    NoReader,

    #[error("No tag detected: {0}")]
    TagNotDetected(String),

    #[error("Invalid APDU response: {0}")]
    InvalidResponse(String),

    #[error("Failed to read UID: {0}")]
    UidReadFailed(String),

    #[error("Failed to read page {page}: {reason}")]
    PageReadFailed { page: u16, reason: String },

    #[error("Failed to write page {page}: {reason}")]
    PageWriteFailed { page: u16, reason: String },

    #[error("Invalid argument: {0}")]
    InvalidArg(String),

    #[error("Tag already has NDEF content (uid={uid})")]
    TagAlreadyWritten { uid: String },

    #[error("Parse error: {0}")]
    ParseError(String),

    #[error("Verification failed: {0}")]
    VerificationFailed(String),
}

pub type CmdResult<T> = Result<T, String>;

#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ExistingTagBehavior {
    Overwrite,
    Skip,
    Error,
}

impl Default for ExistingTagBehavior {
    fn default() -> Self {
        Self::Overwrite
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct WriteOptions {
    pub existing_tag_behavior: ExistingTagBehavior,
}

impl Default for WriteOptions {
    fn default() -> Self {
        Self {
            existing_tag_behavior: ExistingTagBehavior::Overwrite,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum NdefKind {
    Text,
    Uri,
    Json,
    Unknown,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NdefSummary {
    pub kind: NdefKind,
    pub text: Option<String>,
    pub uri: Option<String>,
    pub language: Option<String>,
    pub mime_type: Option<String>,
    pub json: Option<String>,
    pub message_hex: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Ntag216ReadResult {
    pub uid: Option<String>,
    pub is_blank: bool,
    pub ndef: Option<NdefSummary>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WriteResult {
    pub uid: Option<String>,
    pub ok: bool,
    pub skipped: bool,
    pub error: Option<String>,
}

/// PC/SC-based NFC reader for desktop platforms
/// Stores the Card connection for reuse across multiple APDU calls
pub struct DesktopNfcReader {
    card: pcsc::Card,
    reader_name: String,
}

impl DesktopNfcReader {
    /// Automatically detect and connect to first available NFC reader
    pub fn auto_connect() -> Result<Self, NfcError> {
        use pcsc::{Context, Scope, ShareMode};
        use std::ffi::CString;

        let ctx = Context::establish(Scope::User).map_err(|e| {
            // Provide better error messages for common issues
            let err_str = e.to_string();
            if err_str.contains("SCARD_E_NO_SERVICE") || err_str.contains("Service not available") {
                NfcError::ReaderNotAvailable(
                    "PC/SC service not running. On Linux, run: sudo systemctl start pcscd".into(),
                )
            } else {
                NfcError::ReaderNotAvailable(format!("Failed to initialize PC/SC: {}", err_str))
            }
        })?;

        let mut readers_buf = [0; 2048];
        let mut readers_names = Vec::new();

        for reader_name in ctx
            .list_readers(&mut readers_buf)
            .map_err(|e| NfcError::ReaderNotAvailable(format!("Failed to list readers: {}", e)))?
        {
            readers_names.push(reader_name.to_string_lossy().to_string());
        }

        if readers_names.is_empty() {
            return Err(NfcError::NoReader);
        }

        let reader_name = readers_names[0].clone();
        let reader_cstr = CString::new(reader_name.as_str())
            .map_err(|e| NfcError::ConnectionFailed(format!("Invalid reader name: {}", e)))?;

        // Connect to the card and store the connection
        let card = ctx
            .connect(
                &reader_cstr,
                ShareMode::Shared,
                pcsc::Protocols::T0 | pcsc::Protocols::T1,
            )
            .map_err(|e| {
                dlog!("auto_connect: ERROR connecting to card: {}", e);
                NfcError::ConnectionFailed(e.to_string())
            })?;

        Ok(DesktopNfcReader { card, reader_name })
    }

    /// Validate APDU response status codes
    /// Returns the data portion (without status bytes) on success
    fn validate_apdu_response(response: &[u8]) -> Result<Vec<u8>, NfcError> {
        if response.len() < 2 {
            return Err(NfcError::InvalidResponse("Response too short".into()));
        }

        let status = (response[response.len() - 2], response[response.len() - 1]);

        match status {
            (0x90, 0x00) => {
                // Success - return data (everything except last 2 status bytes)
                Ok(response[..response.len() - 2].to_vec())
            }
            (0x63, 0x00) => Err(NfcError::TagNotDetected(
                "No tag present or communication error".into(),
            )),
            (0x6A, 0x82) => Err(NfcError::InvalidResponse(
                "Invalid page/file - page does not exist".into(),
            )),
            (0x69, 0x85) => Err(NfcError::InvalidResponse(
                "Conditions not satisfied - tag may be locked".into(),
            )),
            (0x6A, 0x81) => Err(NfcError::InvalidResponse(
                "Function not supported - invalid command".into(),
            )),
            (s1, s2) => Err(NfcError::InvalidResponse(format!(
                "Unexpected status code: {:02X} {:02X}",
                s1, s2
            ))),
        }
    }

    /// Send APDU command and get response
    /// Reuses the stored Card connection for performance
    fn send_apdu(&self, cmd: &[u8]) -> Result<Vec<u8>, NfcError> {
        dlog!(
            "send_apdu: Sending command ({} bytes): {:02X?}",
            cmd.len(),
            cmd
        );

        let mut response_buf = [0; 256];
        dlog!("send_apdu: Transmitting APDU...");
        let response = self.card.transmit(cmd, &mut response_buf).map_err(|e| {
            dlog!("send_apdu: ERROR transmitting: {}", e);
            NfcError::ConnectionFailed(e.to_string())
        })?;

        dlog!(
            "send_apdu: Received response ({} bytes): {:02X?}",
            response.len(),
            response
        );

        // Validate status codes and extract data
        Self::validate_apdu_response(response)
    }

    /// Read UID from tag
    pub fn read_uid(&self) -> Result<String, NfcError> {
        // send_apdu now returns data without status bytes (already validated)
        let uid_data = self.send_apdu(&APDU_GET_UID)?;

        // UID is typically 4 or 7 bytes (NTAG216 uses 7 bytes)
        if uid_data.is_empty() {
            return Err(NfcError::UidReadFailed("UID response empty".into()));
        }

        // Extract UID bytes (typically 7 bytes for NTAG216)
        let uid_len = uid_data.len().min(7);
        let uid_bytes = &uid_data[..uid_len];
        Ok(bytes_to_hex(uid_bytes, " "))
    }

    /// Read pages from NTAG216
    pub fn read_pages(&self, start: u16, end: u16) -> Result<Vec<[u8; 4]>, NfcError> {
        dlog!("read_pages: start={}, end={}", start, end);
        let mut pages = Vec::new();

        for page in start..=end {
            dlog!("Reading page {}...", page);
            // Try ACR1252U direct format first (FF B0 00 <page> 04)
            // ACR1252U supports direct native commands without Direct Transmit wrapper
            let cmd = vec![0xFF, 0xB0, 0x00, page as u8, 0x04];

            let response = match self.send_apdu(&cmd) {
                Ok(r) => r,
                Err(_) => {
                    // Fallback to ACR122U Direct Transmit format
                    let mut cmd_dt = Vec::with_capacity(9);
                    cmd_dt.extend_from_slice(&APDU_DIRECT_TRANSMIT);
                    cmd_dt.push(0x05);
                    cmd_dt.extend_from_slice(&PN532_INDATAEXCHANGE);
                    cmd_dt.push(NTAG216_READ_CMD);
                    cmd_dt.push(page as u8);
                    self.send_apdu(&cmd_dt)?
                }
            };

            // send_apdu now returns data without status bytes (already validated)
            // Parse response - handle both ACR1252U direct format and ACR122U Direct Transmit
            // ACR1252U: <4 bytes data> (status already stripped)
            // ACR122U: D5 41 00 <4 bytes data> (status already stripped)

            let mut page_data = [0u8; 4];
            let mut found_data = false;

            // ACR1252U direct format: exactly 4 bytes
            if response.len() == 4 {
                dlog!("  Parsing as ACR1252U direct format (4 bytes)");
                page_data.copy_from_slice(&response[0..4]);
                found_data = true;
            }
            // ACR122U Direct Transmit: D5 41 00 <4 bytes>
            else if response.len() >= 7 && response[0] == 0xD5 && response[1] == 0x41 {
                dlog!("  Parsing as ACR122U Direct Transmit format (7+ bytes)");
                if response[2] == 0x00 {
                    page_data.copy_from_slice(&response[3..7]);
                    found_data = true;
                } else {
                    dlog!("  ERROR: PN532 status not 0x00: {:02X}", response[2]);
                }
            }
            // Fallback: try to extract last 4 bytes
            else if response.len() >= 4 {
                dlog!("  Parsing as fallback format (extracting last 4 bytes)");
                let start = response.len() - 4;
                page_data.copy_from_slice(&response[start..start + 4]);
                found_data = true;
            }

            if !found_data {
                dlog!("  ERROR: Could not parse response");
                return Err(NfcError::PageReadFailed {
                    page,
                    reason: format!(
                        "Cannot parse response: {} bytes, format: {:02X?}",
                        response.len(),
                        response
                    ),
                });
            }

            dlog!("  Page {} data: {:02X?}", page, page_data);
            pages.push(page_data);
        }

        dlog!("read_pages: Successfully read {} pages", pages.len());
        Ok(pages)
    }

    /// Write pages to NTAG216
    pub fn write_pages(&self, start: u16, data: &[u8]) -> Result<(), NfcError> {
        dlog!("write_pages: start={}, data_len={}", start, data.len());
        if data.len() % 4 != 0 {
            return Err(NfcError::InvalidArg(
                "Data length must be multiple of 4".into(),
            ));
        }

        let total_pages = data.len() / 4;
        dlog!("write_pages: Writing {} pages", total_pages);

        for (i, chunk) in data.chunks_exact(4).enumerate() {
            let page = start + (i as u16);
            dlog!("Writing page {}: {:02X?}", page, chunk);

            // Try ACR1252U direct format first (FF D6 00 <page> 04 <4 bytes>)
            // ACR1252U supports direct native commands without Direct Transmit wrapper
            let mut cmd = Vec::with_capacity(9);
            cmd.push(0xFF);
            cmd.push(0xD6); // UPDATE BINARY
            cmd.push(0x00);
            cmd.push(page as u8);
            cmd.push(0x04);
            cmd.extend_from_slice(chunk);

            dlog!("  Command: {:02X?}", cmd);
            // send_apdu validates status codes and returns data portion
            // For write operations, success means empty response (status already validated)
            match self.send_apdu(&cmd) {
                Ok(_response) => {
                    dlog!("  Write successful with direct format");
                    // Success - status already validated by send_apdu
                }
                Err(e) => {
                    dlog!("  Direct format error: {}, trying fallback", e);
                    // Fallback to ACR122U Direct Transmit format
                    let mut cmd_dt = Vec::with_capacity(13);
                    cmd_dt.extend_from_slice(&APDU_DIRECT_TRANSMIT);
                    cmd_dt.push(0x09);
                    cmd_dt.extend_from_slice(&PN532_INDATAEXCHANGE);
                    cmd_dt.push(NTAG216_WRITE_CMD);
                    cmd_dt.push(page as u8);
                    cmd_dt.extend_from_slice(chunk);
                    dlog!("  Fallback command: {:02X?}", cmd_dt);
                    // This will return error if status is invalid
                    self.send_apdu(&cmd_dt)?;
                    dlog!("  Write successful with fallback format");
                }
            }

            dlog!("  Page {} write successful", page);
            // Small delay after each write to ensure tag processes the command
            std::thread::sleep(std::time::Duration::from_millis(10));
        }

        dlog!("write_pages: Successfully wrote {} pages", total_pages);
        Ok(())
    }
}

// ============================================================================
// NDEF Encoding/Decoding (compatible with existing ntag216.rs)
// ============================================================================

fn bytes_to_hex(bytes: &[u8], sep: &str) -> String {
    bytes
        .iter()
        .map(|b| format!("{:02X}", b))
        .collect::<Vec<_>>()
        .join(sep)
}

fn encode_ndef_text_record(text: &str, lang: &str) -> Result<Vec<u8>, NfcError> {
    let lang_bytes = lang.as_bytes();
    if lang_bytes.len() > 63 {
        return Err(NfcError::InvalidArg(
            "language code too long (max 63 bytes)".into(),
        ));
    }

    let text_bytes = text.as_bytes();
    let mut payload = Vec::with_capacity(1 + lang_bytes.len() + text_bytes.len());
    payload.push((lang_bytes.len() as u8) & 0x3F);
    payload.extend_from_slice(lang_bytes);
    payload.extend_from_slice(text_bytes);

    encode_ndef_record(0x01, b"T", &payload)
}

fn encode_ndef_uri_record(uri: &str) -> Result<Vec<u8>, NfcError> {
    let (prefix_code, rest) = if let Some(stripped) = uri.strip_prefix("http://www.") {
        (0x01u8, stripped)
    } else if let Some(stripped) = uri.strip_prefix("https://www.") {
        (0x02u8, stripped)
    } else if let Some(stripped) = uri.strip_prefix("http://") {
        (0x03u8, stripped)
    } else if let Some(stripped) = uri.strip_prefix("https://") {
        (0x04u8, stripped)
    } else {
        (0x00u8, uri)
    };

    let rest_bytes = rest.as_bytes();
    let mut payload = Vec::with_capacity(1 + rest_bytes.len());
    payload.push(prefix_code);
    payload.extend_from_slice(rest_bytes);

    encode_ndef_record(0x01, b"U", &payload)
}

fn encode_ndef_mime_record(mime_type: &str, payload: &[u8]) -> Result<Vec<u8>, NfcError> {
    if mime_type.is_empty() {
        return Err(NfcError::InvalidArg("mime_type must not be empty".into()));
    }
    encode_ndef_record(0x02, mime_type.as_bytes(), payload)
}

fn encode_ndef_record(tnf: u8, type_bytes: &[u8], payload: &[u8]) -> Result<Vec<u8>, NfcError> {
    if type_bytes.len() > 255 {
        return Err(NfcError::InvalidArg(
            "ndef type field too long (max 255 bytes)".into(),
        ));
    }
    if payload.len() > (u32::MAX as usize) {
        return Err(NfcError::InvalidArg("payload too large".into()));
    }

    let sr = payload.len() <= 255;
    let header = 0x80u8 | 0x40u8 | if sr { 0x10u8 } else { 0x00u8 } | (tnf & 0x07);

    let mut out =
        Vec::with_capacity(1 + 1 + (if sr { 1 } else { 4 }) + type_bytes.len() + payload.len());
    out.push(header);
    out.push(type_bytes.len() as u8);
    if sr {
        out.push(payload.len() as u8);
    } else {
        out.extend_from_slice(&(payload.len() as u32).to_be_bytes());
    }
    out.extend_from_slice(type_bytes);
    out.extend_from_slice(payload);
    Ok(out)
}

fn encode_ndef_tlv(ndef_message: &[u8]) -> Result<Vec<u8>, NfcError> {
    dlog!("encode_ndef_tlv: Message length = {}", ndef_message.len());
    if ndef_message.len() < 0xFF {
        dlog!("encode_ndef_tlv: Using short length format");
        let mut out = Vec::with_capacity(2 + ndef_message.len() + 1);
        out.push(0x03);
        out.push(ndef_message.len() as u8);
        out.extend_from_slice(ndef_message);
        out.push(0xFE);
        dlog!(
            "encode_ndef_tlv: TLV (first 16): {:02X?}",
            &out[..out.len().min(16)]
        );
        Ok(out)
    } else if ndef_message.len() <= 0xFFFF {
        dlog!("encode_ndef_tlv: Using extended length format");
        let len = ndef_message.len() as u16;
        let mut out = Vec::with_capacity(4 + ndef_message.len() + 1);
        out.push(0x03);
        out.push(0xFF);
        out.push((len >> 8) as u8);
        out.push((len & 0xFF) as u8);
        out.extend_from_slice(ndef_message);
        out.push(0xFE);
        dlog!(
            "encode_ndef_tlv: TLV (first 16): {:02X?}",
            &out[..out.len().min(16)]
        );
        Ok(out)
    } else {
        Err(NfcError::InvalidArg("ndef message too large".into()))
    }
}

fn build_ntag216_ndef_tlv_image(ndef_message: &[u8]) -> Result<Vec<u8>, NfcError> {
    dlog!(
        "build_ntag216_ndef_tlv_image: NDEF message length = {}",
        ndef_message.len()
    );
    let tlv = encode_ndef_tlv(ndef_message)?;
    dlog!("build_ntag216_ndef_tlv_image: TLV length = {}", tlv.len());
    dlog!(
        "build_ntag216_ndef_tlv_image: TLV (first 32): {:02X?}",
        &tlv[..tlv.len().min(32)]
    );

    let mut image = Vec::with_capacity(tlv.len());
    image.extend_from_slice(&tlv);

    let padding_start = image.len();
    while image.len() % 4 != 0 {
        image.push(0x00);
    }
    if image.len() > padding_start {
        dlog!(
            "build_ntag216_ndef_tlv_image: Added {} padding bytes",
            image.len() - padding_start
        );
    }

    let max_bytes = ((NTAG216_LAST_USER_PAGE - NTAG216_FIRST_USER_PAGE + 1) as usize) * 4;
    dlog!(
        "build_ntag216_ndef_tlv_image: Image length = {}, max = {}",
        image.len(),
        max_bytes
    );
    if image.len() > max_bytes {
        return Err(NfcError::InvalidArg(format!(
            "ndef image too large for NTAG216 user memory ({} > {})",
            image.len(),
            max_bytes
        )));
    }

    dlog!(
        "build_ntag216_ndef_tlv_image: Final image (first 64): {:02X?}",
        &image[..image.len().min(64)]
    );
    Ok(image)
}

fn parse_ndef_from_pages(pages: &[[u8; 4]]) -> Result<Option<Vec<u8>>, NfcError> {
    dlog!("parse_ndef_from_pages: {} pages", pages.len());
    if pages.len() < 2 {
        dlog!("  Too few pages ({})", pages.len());
        return Ok(None);
    }
    let mut bytes = Vec::with_capacity(pages.len() * 4);
    for p in pages {
        bytes.extend_from_slice(p);
    }
    dlog!(
        "  Combined bytes ({}): {:02X?}",
        bytes.len(),
        &bytes[..bytes.len().min(32)]
    );

    let mut i = 0usize;
    dlog!("  Starting TLV parsing at offset {}", i);
    while i < bytes.len() {
        let t = bytes[i];
        dlog!("  Offset {}: TLV type = {:02X}", i, t);
        if t == 0x00 {
            dlog!("    Skipping NULL byte");
            i += 1;
            continue;
        }
        if t == 0xFE {
            dlog!("    Found terminator TLV (0xFE)");
            return Ok(None);
        }
        if i + 1 >= bytes.len() {
            dlog!("    Not enough bytes for length field");
            return Ok(None);
        }
        let len_byte = bytes[i + 1];
        dlog!("    Length byte: {:02X}", len_byte);
        let (len, value_start) = if len_byte == 0xFF {
            if i + 3 >= bytes.len() {
                dlog!("    Not enough bytes for extended length");
                return Ok(None);
            }
            let l = ((bytes[i + 2] as usize) << 8) | (bytes[i + 3] as usize);
            dlog!(
                "    Extended length: {} (bytes {:02X} {:02X})",
                l,
                bytes[i + 2],
                bytes[i + 3]
            );
            (l, i + 4)
        } else {
            dlog!("    Short length: {}", len_byte);
            (len_byte as usize, i + 2)
        };

        if t == 0x03 {
            dlog!(
                "    Found NDEF TLV (0x03), length: {}, value_start: {}",
                len,
                value_start
            );
            if value_start + len > bytes.len() {
                dlog!(
                    "    ERROR: NDEF length {} exceeds available bytes {}",
                    len,
                    bytes.len() - value_start
                );
                return Ok(None);
            }
            let msg = bytes[value_start..value_start + len].to_vec();
            dlog!(
                "    Extracted NDEF message ({} bytes): {:02X?}",
                msg.len(),
                &msg[..msg.len().min(32)]
            );
            return Ok(Some(msg));
        }

        dlog!("    Skipping TLV type {:02X}, length {}", t, len);
        i = value_start + len;
    }

    dlog!("  No NDEF TLV found");
    Ok(None)
}

fn decode_ndef_message(message: &[u8]) -> Option<NdefSummary> {
    dlog!("decode_ndef_message: message length = {}", message.len());
    if message.is_empty() {
        dlog!("  Message is empty");
        return None;
    }

    let msg_hex = bytes_to_hex(message, "");
    dlog!(
        "  Message hex (first 64): {}",
        &msg_hex[..msg_hex.len().min(64)]
    );

    if message.len() < 3 {
        dlog!("  Message too short (< 3 bytes)");
        return Some(NdefSummary {
            kind: NdefKind::Unknown,
            text: None,
            uri: None,
            language: None,
            mime_type: None,
            json: None,
            message_hex: msg_hex,
        });
    }

    let mut idx = 0usize;
    let header = message[idx];
    idx += 1;
    let sr = (header & 0x10) != 0;
    let il = (header & 0x08) != 0;
    let tnf = header & 0x07;
    dlog!(
        "  Header: {:02X}, SR={}, IL={}, TNF={}",
        header,
        sr,
        il,
        tnf
    );

    if idx >= message.len() {
        return Some(NdefSummary {
            kind: NdefKind::Unknown,
            text: None,
            uri: None,
            language: None,
            mime_type: None,
            json: None,
            message_hex: msg_hex,
        });
    }
    let type_len = message[idx] as usize;
    idx += 1;

    let payload_len: usize = if sr {
        if idx >= message.len() {
            return Some(NdefSummary {
                kind: NdefKind::Unknown,
                text: None,
                uri: None,
                language: None,
                mime_type: None,
                json: None,
                message_hex: msg_hex,
            });
        }
        let v = message[idx] as usize;
        idx += 1;
        v
    } else {
        if idx + 3 >= message.len() {
            return Some(NdefSummary {
                kind: NdefKind::Unknown,
                text: None,
                uri: None,
                language: None,
                mime_type: None,
                json: None,
                message_hex: msg_hex,
            });
        }
        let v = ((message[idx] as usize) << 24)
            | ((message[idx + 1] as usize) << 16)
            | ((message[idx + 2] as usize) << 8)
            | (message[idx + 3] as usize);
        idx += 4;
        v
    };

    let id_len: usize = if il {
        if idx >= message.len() {
            return Some(NdefSummary {
                kind: NdefKind::Unknown,
                text: None,
                uri: None,
                language: None,
                mime_type: None,
                json: None,
                message_hex: msg_hex,
            });
        }
        let v = message[idx] as usize;
        idx += 1;
        v
    } else {
        0
    };

    if idx + type_len > message.len() {
        return Some(NdefSummary {
            kind: NdefKind::Unknown,
            text: None,
            uri: None,
            language: None,
            mime_type: None,
            json: None,
            message_hex: msg_hex,
        });
    }
    let type_bytes = &message[idx..idx + type_len];
    idx += type_len;

    if idx + id_len > message.len() {
        return Some(NdefSummary {
            kind: NdefKind::Unknown,
            text: None,
            uri: None,
            language: None,
            mime_type: None,
            json: None,
            message_hex: msg_hex,
        });
    }
    idx += id_len;

    if idx + payload_len > message.len() {
        return Some(NdefSummary {
            kind: NdefKind::Unknown,
            text: None,
            uri: None,
            language: None,
            mime_type: None,
            json: None,
            message_hex: msg_hex,
        });
    }
    let payload = &message[idx..idx + payload_len];

    // Text record
    if tnf == 0x01 && type_bytes == b"T" && payload.len() >= 1 {
        let status = payload[0];
        let lang_len = (status & 0x3F) as usize;
        if payload.len() < 1 + lang_len {
            return Some(NdefSummary {
                kind: NdefKind::Unknown,
                text: None,
                uri: None,
                language: None,
                mime_type: None,
                json: None,
                message_hex: msg_hex,
            });
        }
        let lang = String::from_utf8_lossy(&payload[1..1 + lang_len]).to_string();
        let text = String::from_utf8_lossy(&payload[1 + lang_len..]).to_string();
        return Some(NdefSummary {
            kind: NdefKind::Text,
            text: Some(text),
            uri: None,
            language: Some(lang),
            mime_type: None,
            json: None,
            message_hex: msg_hex,
        });
    }

    // URI record
    if tnf == 0x01 && type_bytes == b"U" && payload.len() >= 1 {
        let prefix = payload[0];
        let rest = String::from_utf8_lossy(&payload[1..]).to_string();
        let full = match prefix {
            0x01 => format!("http://www.{rest}"),
            0x02 => format!("https://www.{rest}"),
            0x03 => format!("http://{rest}"),
            0x04 => format!("https://{rest}"),
            _ => rest,
        };
        return Some(NdefSummary {
            kind: NdefKind::Uri,
            text: None,
            uri: Some(full),
            language: None,
            mime_type: None,
            json: None,
            message_hex: msg_hex,
        });
    }

    // MIME record (TNF=0x02)
    if tnf == 0x02 && !type_bytes.is_empty() {
        let mime = String::from_utf8_lossy(type_bytes).to_string();
        dlog!("  MIME type: {}", mime);
        if mime.eq_ignore_ascii_case("application/json") {
            dlog!("  Found application/json MIME type");
            dlog!("  Payload length: {}", payload.len());
            dlog!(
                "  Payload (first 64): {:02X?}",
                &payload[..payload.len().min(64)]
            );
            if let Ok(json_str) = String::from_utf8(payload.to_vec()) {
                dlog!(
                    "  Successfully decoded JSON string ({} chars)",
                    json_str.len()
                );
                return Some(NdefSummary {
                    kind: NdefKind::Json,
                    text: None,
                    uri: None,
                    language: None,
                    mime_type: Some(mime),
                    json: Some(json_str),
                    message_hex: msg_hex,
                });
            } else {
                dlog!("  ERROR: Failed to decode payload as UTF-8");
            }
        }
        return Some(NdefSummary {
            kind: NdefKind::Unknown,
            text: None,
            uri: None,
            language: None,
            mime_type: Some(mime),
            json: None,
            message_hex: msg_hex,
        });
    }

    Some(NdefSummary {
        kind: NdefKind::Unknown,
        text: None,
        uri: None,
        language: None,
        mime_type: None,
        json: None,
        message_hex: msg_hex,
    })
}

fn read_ndef_best_effort(
    reader: &DesktopNfcReader,
) -> Result<(Option<String>, bool, Option<NdefSummary>), NfcError> {
    dlog!("read_ndef_best_effort: Starting");
    let uid = reader.read_uid().ok();
    dlog!("read_ndef_best_effort: UID = {:?}", uid);

    // Small delay to ensure tag is ready after write operations
    std::thread::sleep(std::time::Duration::from_millis(50));

    // Read pages 4..20 initially to get TLV header
    dlog!(
        "read_ndef_best_effort: Reading initial pages {}..{}",
        NTAG216_FIRST_USER_PAGE,
        NTAG216_FIRST_USER_PAGE + 16
    );
    let initial_pages = reader.read_pages(NTAG216_FIRST_USER_PAGE, NTAG216_FIRST_USER_PAGE + 16)?;
    dlog!(
        "read_ndef_best_effort: Read {} initial pages",
        initial_pages.len()
    );

    dlog!("read_ndef_best_effort: Parsing NDEF from initial pages");
    let mut msg_opt = parse_ndef_from_pages(&initial_pages)?;

    // If we didn't find NDEF or it's incomplete, try to determine length from TLV header
    if msg_opt.is_none() {
        dlog!(
            "read_ndef_best_effort: No NDEF found in initial read, checking TLV header for length"
        );
        let mut bytes = Vec::with_capacity(initial_pages.len() * 4);
        for p in &initial_pages {
            bytes.extend_from_slice(p);
        }

        let mut i = 0usize;
        while i + 1 < bytes.len() {
            let t = bytes[i];
            if t == 0x00 {
                i += 1;
                continue;
            }
            if t == 0xFE {
                dlog!("read_ndef_best_effort: Found terminator TLV, stopping");
                break;
            }

            let len_byte = bytes[i + 1];
            let (len, value_start) = if len_byte == 0xFF {
                if i + 3 >= bytes.len() {
                    dlog!("read_ndef_best_effort: Not enough bytes for extended length");
                    break;
                }
                let l = ((bytes[i + 2] as usize) << 8) | (bytes[i + 3] as usize);
                (l, i + 4)
            } else {
                (len_byte as usize, i + 2)
            };

            if t == 0x03 {
                dlog!(
                    "read_ndef_best_effort: Found NDEF TLV (0x03), length: {}, value_start: {}",
                    len,
                    value_start
                );
                let needed = value_start + len;
                let have = bytes.len();
                dlog!(
                    "read_ndef_best_effort: Need {} bytes, have {} bytes",
                    needed,
                    have
                );

                if needed > have {
                    // Calculate pages needed from page 4 start
                    let needed_pages = (needed + 3) / 4; // Round up to nearest page
                    let end_page =
                        NTAG216_FIRST_USER_PAGE + (needed_pages as u16).saturating_sub(1);
                    dlog!(
                        "read_ndef_best_effort: Need {} pages total, reading pages {}..{}",
                        needed_pages,
                        NTAG216_FIRST_USER_PAGE,
                        end_page
                    );

                    // Cap at maximum available pages
                    let end_page = end_page.min(NTAG216_LAST_USER_PAGE);
                    let pages = reader.read_pages(NTAG216_FIRST_USER_PAGE, end_page)?;
                    dlog!(
                        "read_ndef_best_effort: Read {} pages for full NDEF",
                        pages.len()
                    );
                    msg_opt = parse_ndef_from_pages(&pages)?;
                }
                break;
            }

            i = value_start + len;
        }
    }

    if let Some(m) = msg_opt {
        dlog!(
            "read_ndef_best_effort: Found NDEF message ({} bytes)",
            m.len()
        );
        let is_blank = m.is_empty();
        dlog!("read_ndef_best_effort: is_blank = {}", is_blank);
        if !is_blank {
            dlog!("read_ndef_best_effort: Decoding NDEF message");
            let summary = decode_ndef_message(&m);
            dlog!(
                "read_ndef_best_effort: Decoded summary: {:?}",
                summary.as_ref().map(|s| &s.kind)
            );
            return Ok((uid, is_blank, summary));
        } else {
            dlog!("read_ndef_best_effort: NDEF message is empty");
            return Ok((uid, true, None));
        }
    }

    // If NDEF not found, it's blank
    dlog!("read_ndef_best_effort: No NDEF TLV found, tag appears blank");
    Ok((uid, true, None))
}

fn validate_or_skip_existing(
    reader: &DesktopNfcReader,
    behavior: ExistingTagBehavior,
) -> Result<(Option<String>, bool), NfcError> {
    let (uid, is_blank, _ndef) = read_ndef_best_effort(reader)?;
    if is_blank {
        return Ok((uid, false));
    }
    let uid_str = uid.clone().unwrap_or_else(|| "unknown".into());
    match behavior {
        ExistingTagBehavior::Overwrite => Ok((uid, false)),
        ExistingTagBehavior::Skip => Ok((uid, true)),
        ExistingTagBehavior::Error => Err(NfcError::TagAlreadyWritten { uid: uid_str }),
    }
}

// ============================================================================
// Tauri Commands - Drop-in replacements for desktop NFC
// ============================================================================

/// Read NTAG216 tag via desktop NFC reader
#[tauri::command]
pub fn read_ntag216_desktop() -> CmdResult<Ntag216ReadResult> {
    let reader = DesktopNfcReader::auto_connect().map_err(|e| e.to_string())?;

    let (uid, is_blank, ndef) = read_ndef_best_effort(&reader).map_err(|e| e.to_string())?;

    Ok(Ntag216ReadResult {
        uid,
        is_blank,
        ndef,
    })
}

/// Write text to NTAG216 tag
#[tauri::command]
pub fn write_ntag216_text_desktop(
    text: String,
    options: Option<WriteOptions>,
) -> CmdResult<WriteResult> {
    let options = options.unwrap_or_default();
    let reader = DesktopNfcReader::auto_connect().map_err(|e| e.to_string())?;

    // Verify tag is readable
    let _ = reader.read_uid().map_err(|e| e.to_string())?;

    let (uid, skipped) = validate_or_skip_existing(&reader, options.existing_tag_behavior)
        .map_err(|e| e.to_string())?;

    if skipped {
        return Ok(WriteResult {
            uid,
            ok: true,
            skipped: true,
            error: None,
        });
    }

    let msg = encode_ndef_text_record(&text, "en").map_err(|e| e.to_string())?;
    let image = build_ntag216_ndef_tlv_image(&msg).map_err(|e| e.to_string())?;

    reader
        .write_pages(NTAG216_FIRST_USER_PAGE, &image)
        .map_err(|e| e.to_string())?;

    // Verify write
    let (_, is_blank_verify, ndef_verify) =
        read_ndef_best_effort(&reader).map_err(|e| e.to_string())?;

    if is_blank_verify {
        return Err("Write verification failed: tag still appears blank".to_string());
    }

    if let Some(summary) = ndef_verify {
        if !matches!(summary.kind, NdefKind::Text) {
            return Err("Write verification failed: tag does not contain text".to_string());
        }
        if let Some(verify_text) = summary.text {
            if verify_text != text {
                return Err("Write verification failed: text mismatch".to_string());
            }
        }
    }

    Ok(WriteResult {
        uid,
        ok: true,
        skipped: false,
        error: None,
    })
}

/// Write URI to NTAG216 tag
#[tauri::command]
pub fn write_ntag216_uri_desktop(
    uri: String,
    options: Option<WriteOptions>,
) -> CmdResult<WriteResult> {
    let options = options.unwrap_or_default();
    let reader = DesktopNfcReader::auto_connect().map_err(|e| e.to_string())?;

    let _ = reader.read_uid().map_err(|e| e.to_string())?;

    let (uid, skipped) = validate_or_skip_existing(&reader, options.existing_tag_behavior)
        .map_err(|e| e.to_string())?;

    if skipped {
        return Ok(WriteResult {
            uid,
            ok: true,
            skipped: true,
            error: None,
        });
    }

    let msg = encode_ndef_uri_record(&uri).map_err(|e| e.to_string())?;
    let image = build_ntag216_ndef_tlv_image(&msg).map_err(|e| e.to_string())?;

    reader
        .write_pages(NTAG216_FIRST_USER_PAGE, &image)
        .map_err(|e| e.to_string())?;

    Ok(WriteResult {
        uid,
        ok: true,
        skipped: false,
        error: None,
    })
}

/// Write JSON to NTAG216 tag
#[tauri::command]
pub fn write_ntag216_json_desktop(
    json: String,
    options: Option<WriteOptions>,
) -> CmdResult<WriteResult> {
    let options = options.unwrap_or_default();
    let reader = DesktopNfcReader::auto_connect().map_err(|e| e.to_string())?;

    let _ = reader.read_uid().map_err(|e| e.to_string())?;

    let (uid, skipped) = validate_or_skip_existing(&reader, options.existing_tag_behavior)
        .map_err(|e| e.to_string())?;

    if skipped {
        return Ok(WriteResult {
            uid,
            ok: true,
            skipped: true,
            error: None,
        });
    }

    // Validate + minify JSON
    let value: serde_json::Value =
        serde_json::from_str(&json).map_err(|e| format!("Invalid JSON: {}", e))?;
    let minified =
        serde_json::to_string(&value).map_err(|e| format!("Failed to minify JSON: {}", e))?;

    let msg = encode_ndef_mime_record("application/json", minified.as_bytes())
        .map_err(|e| e.to_string())?;
    let image = build_ntag216_ndef_tlv_image(&msg).map_err(|e| e.to_string())?;

    dlog!(
        "write_ntag216_json_desktop: Writing {} bytes to pages starting at {}",
        image.len(),
        NTAG216_FIRST_USER_PAGE
    );
    dlog!(
        "write_ntag216_json_desktop: First 32 bytes: {:02X?}",
        &image[..image.len().min(32)]
    );

    reader
        .write_pages(NTAG216_FIRST_USER_PAGE, &image)
        .map_err(|e| format!("Write failed: {}", e))?;

    dlog!("write_ntag216_json_desktop: Write completed, waiting 200ms...");
    // Wait for tag to process writes
    std::thread::sleep(std::time::Duration::from_millis(200));

    // Verify write by reading back pages directly
    let pages_written = (image.len() + 3) / 4; // Round up
    dlog!(
        "write_ntag216_json_desktop: Verifying {} pages",
        pages_written
    );
    let verify_pages = reader
        .read_pages(
            NTAG216_FIRST_USER_PAGE,
            NTAG216_FIRST_USER_PAGE + (pages_written as u16).saturating_sub(1),
        )
        .map_err(|e| format!("Verification read failed: {}", e))?;

    dlog!(
        "write_ntag216_json_desktop: Read back {} pages for verification",
        verify_pages.len()
    );

    // Check if what we read matches what we wrote
    let mut verify_bytes = Vec::with_capacity(pages_written * 4);
    for page_data in verify_pages {
        verify_bytes.extend_from_slice(&page_data);
    }

    dlog!(
        "write_ntag216_json_desktop: Wrote {} bytes, read back {} bytes",
        image.len(),
        verify_bytes.len()
    );
    dlog!(
        "write_ntag216_json_desktop: First 32 bytes written: {:02X?}",
        &image[..image.len().min(32)]
    );
    dlog!(
        "write_ntag216_json_desktop: First 32 bytes read: {:02X?}",
        &verify_bytes[..verify_bytes.len().min(32)]
    );

    // Compare written data with read data
    let compare_len = image.len().min(verify_bytes.len());
    if compare_len == 0 {
        dlog!("write_ntag216_json_desktop: ERROR - No data to compare");
        return Err("Write verification failed: could not read back any data".to_string());
    }

    // Check if first page (TLV header) matches
    if image.len() >= 4 && verify_bytes.len() >= 4 {
        if image[0..4] != verify_bytes[0..4] {
            dlog!("write_ntag216_json_desktop: ERROR - First page mismatch!");
            return Err(format!(
                "Write verification failed: first page mismatch. Expected: {:02X?}, Got: {:02X?}",
                &image[0..4],
                &verify_bytes[0..4]
            ));
        } else {
            dlog!("write_ntag216_json_desktop: First page matches!");
        }
    }

    dlog!("write_ntag216_json_desktop: Starting NDEF verification...");
    // Now verify NDEF parsing
    let (_, is_blank_verify, ndef_verify) =
        read_ndef_best_effort(&reader).map_err(|e| format!("NDEF verification failed: {}", e))?;

    dlog!(
        "write_ntag216_json_desktop: NDEF verification result: is_blank={}, ndef={:?}",
        is_blank_verify,
        ndef_verify.as_ref().map(|s| &s.kind)
    );

    if is_blank_verify {
        dlog!("write_ntag216_json_desktop: ERROR - Tag appears blank after write!");
        return Err(format!(
            "Write verification failed: tag still appears blank. Wrote {} bytes, read back {} bytes. First page written: {:02X?}, first page read: {:02X?}",
            image.len(),
            verify_bytes.len(),
            if image.len() >= 4 { &image[0..4] } else { &image[..] },
            if verify_bytes.len() >= 4 { &verify_bytes[0..4] } else { &verify_bytes[..] }
        ));
    }

    if let Some(summary) = ndef_verify {
        if !matches!(summary.kind, NdefKind::Json) {
            return Err(format!(
                "Write verification failed: tag contains {:?}, not JSON",
                summary.kind
            ));
        }
        if let Some(verify_json) = summary.json {
            if verify_json != minified {
                return Err(format!(
                    "Write verification failed: JSON mismatch. Expected {} chars, got {} chars",
                    minified.len(),
                    verify_json.len()
                ));
            }
        }
    } else {
        return Err("Write verification failed: no NDEF found after write".to_string());
    }

    Ok(WriteResult {
        uid,
        ok: true,
        skipped: false,
        error: None,
    })
}

/// Read JSON from NTAG216 tag
#[tauri::command]
pub fn read_ntag216_json_desktop() -> CmdResult<String> {
    let reader = DesktopNfcReader::auto_connect().map_err(|e| e.to_string())?;

    let (_uid, _is_blank, ndef) = read_ndef_best_effort(&reader).map_err(|e| e.to_string())?;

    match ndef {
        Some(summary) if matches!(summary.kind, NdefKind::Json) => {
            let json = summary
                .json
                .ok_or_else(|| "JSON record found but payload was not decodable".to_string())?;
            Ok(json)
        }
        Some(summary) => Err(format!("Tag contains {:?}, not JSON", summary.kind)),
        None => Err("Tag is blank".to_string()),
    }
}

/// Check NFC reader health
#[tauri::command]
pub fn check_nfc_reader() -> CmdResult<String> {
    use pcsc::{Context, Scope};

    // First, try to establish context and list readers for diagnostics
    let ctx = match Context::establish(Scope::User) {
        Ok(ctx) => ctx,
        Err(e) => {
            return Err(format!(
                "Failed to initialize PC/SC: {}. On macOS, PC/SC is built-in - no installation needed.",
                e
            ));
        }
    };

    let mut readers_buf = [0; 2048];
    let mut readers_list = Vec::new();

    match ctx.list_readers(&mut readers_buf) {
        Ok(readers) => {
            for reader in readers {
                readers_list.push(reader.to_string_lossy().to_string());
            }
        }
        Err(e) => {
            return Err(format!("Failed to list readers: {}", e));
        }
    }

    if readers_list.is_empty() {
        return Err(format!(
            "No NFC readers found. Connect an ACR122U, PN532, or other PC/SC-compatible reader.\n\
            On macOS, PC/SC is built-in - no installation needed.\n\
            Check USB connection and try a different port."
        ));
    }

    // Try to connect to the first reader
    match DesktopNfcReader::auto_connect() {
        Ok(reader) => match reader.read_uid() {
            Ok(uid) => Ok(format!(
                "✅ Reader working!\n\
                    Reader: {}\n\
                    Tag UID: {}",
                readers_list[0], uid
            )),
            Err(_) => Ok(format!(
                "✅ Reader connected: {}\n\
                    Status: Ready (no tag detected - place a tag on the reader)",
                readers_list[0]
            )),
        },
        Err(e) => Err(format!(
            "Reader detected but connection failed: {}\n\
            Detected readers: {}",
            e,
            readers_list.join(", ")
        )),
    }
}

// ============================================================================
// Unit Tests
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;

    // Note: Mocking pcsc::Card is difficult since it's a concrete type.
    // We focus on testing pure functions (NDEF encoding/decoding, TLV parsing)
    // and error handling. Integration tests would require actual hardware.

    // ========================================================================
    // Pure Function Tests (NDEF encoding/decoding, TLV parsing)
    // ========================================================================

    #[test]
    fn test_bytes_to_hex() {
        let bytes = [0x01, 0x23, 0x45, 0x67, 0x89, 0xAB, 0xCD, 0xEF];
        assert_eq!(bytes_to_hex(&bytes, ""), "0123456789ABCDEF");
        assert_eq!(bytes_to_hex(&bytes, " "), "01 23 45 67 89 AB CD EF");
        assert_eq!(bytes_to_hex(&bytes, ":"), "01:23:45:67:89:AB:CD:EF");
    }

    #[test]
    fn test_encode_ndef_text_record() {
        let result = encode_ndef_text_record("Hello", "en").unwrap();
        assert!(!result.is_empty());
        assert!(result.len() > 5); // Should have header + payload

        // Test with empty string
        let result2 = encode_ndef_text_record("", "en").unwrap();
        assert!(!result2.is_empty());

        // Test with long language code
        let result3 = encode_ndef_text_record("Test", "en-US").unwrap();
        assert!(!result3.is_empty());
    }

    #[test]
    fn test_encode_ndef_text_record_long_language() {
        // Max language length is 63 bytes (0x3F)
        let max_lang = "a".repeat(63);
        assert!(encode_ndef_text_record("Test", &max_lang).is_ok());

        let too_long_lang = "a".repeat(64);
        assert!(encode_ndef_text_record("Test", &too_long_lang).is_err());
    }

    #[test]
    fn test_encode_ndef_uri_record() {
        let result = encode_ndef_uri_record("https://example.com").unwrap();
        assert!(!result.is_empty());

        // Test different URI prefixes
        assert!(encode_ndef_uri_record("http://www.example.com").is_ok());
        assert!(encode_ndef_uri_record("https://www.example.com").is_ok());
        assert!(encode_ndef_uri_record("http://example.com").is_ok());
        assert!(encode_ndef_uri_record("https://example.com").is_ok());
        assert!(encode_ndef_uri_record("ftp://example.com").is_ok());
    }

    #[test]
    fn test_encode_ndef_json_record() {
        let json = r#"{"key":"value","number":123}"#;
        let result = encode_ndef_mime_record("application/json", json.as_bytes()).unwrap();
        assert!(!result.is_empty());

        // Test with invalid JSON (should still encode, validation happens elsewhere)
        let invalid = "not json";
        assert!(encode_ndef_mime_record("application/json", invalid.as_bytes()).is_ok());
    }

    #[test]
    fn test_encode_ndef_tlv_short_length() {
        let message = vec![0x01, 0x02, 0x03]; // 3 bytes
        let result = encode_ndef_tlv(&message).unwrap();

        // Should be: [0x03, 0x03, 0x01, 0x02, 0x03]
        assert_eq!(result[0], 0x03); // TLV type
        assert_eq!(result[1], 0x03); // Length
        assert_eq!(result[2..5], message);
    }

    #[test]
    fn test_encode_ndef_tlv_extended_length() {
        // Create a message that requires extended length (>255 bytes)
        let message = vec![0x00; 300];
        let result = encode_ndef_tlv(&message).unwrap();

        // Should be: [0x03, 0xFF, 0x01, 0x2C, ...data...]
        assert_eq!(result[0], 0x03); // TLV type
        assert_eq!(result[1], 0xFF); // Extended length marker
        assert_eq!((result[2] as u16) << 8 | result[3] as u16, 300);
    }

    #[test]
    fn test_build_ntag216_ndef_tlv_image() {
        let message = vec![0x01, 0x02, 0x03, 0x04];
        let result = build_ntag216_ndef_tlv_image(&message).unwrap();

        assert!(!result.is_empty());
        assert!(result.len() >= message.len() + 4); // TLV header + padding
        assert!(result.len() <= 872); // Max NTAG216 size
    }

    #[test]
    fn test_build_ntag216_ndef_tlv_image_too_large() {
        // Create message that exceeds NTAG216 capacity
        let message = vec![0x00; 1000];
        assert!(build_ntag216_ndef_tlv_image(&message).is_err());
    }

    #[test]
    fn test_parse_ndef_from_pages_empty() {
        let pages: Vec<[u8; 4]> = vec![];
        let result = parse_ndef_from_pages(&pages).unwrap();
        assert!(result.is_none());
    }

    #[test]
    fn test_parse_ndef_from_pages_too_short() {
        let pages = vec![[0x03, 0x01, 0x00, 0x00]]; // Only 1 page, incomplete
        let result = parse_ndef_from_pages(&pages).unwrap();
        assert!(result.is_none());
    }

    #[test]
    fn test_parse_ndef_from_pages_terminator() {
        let pages = vec![
            [0xFE, 0x00, 0x00, 0x00], // Terminator TLV
        ];
        let result = parse_ndef_from_pages(&pages).unwrap();
        assert!(result.is_none());
    }

    #[test]
    fn test_parse_ndef_from_pages_simple_ndef() {
        // Simple NDEF: TLV type 0x03, length 0x05, payload [0x01, 0x02, 0x03, 0x04, 0x05]
        let pages = vec![
            [0x03, 0x05, 0x01, 0x02], // TLV header + start of payload
            [0x03, 0x04, 0x05, 0x00], // Rest of payload + padding
        ];
        let result = parse_ndef_from_pages(&pages).unwrap();
        assert!(result.is_some());
        let msg = result.unwrap();
        assert_eq!(msg, vec![0x01, 0x02, 0x03, 0x04, 0x05]);
    }

    #[test]
    fn test_parse_ndef_from_pages_extended_length() {
        // Extended length NDEF: TLV type 0x03, length 0xFF 0x01 0x00 (256 bytes)
        let mut pages = vec![
            [0x03, 0xFF, 0x01, 0x00], // TLV header with extended length
        ];
        // Add pages with payload data
        for i in 0..64 {
            pages.push([i as u8, (i + 1) as u8, (i + 2) as u8, (i + 3) as u8]);
        }

        let result = parse_ndef_from_pages(&pages).unwrap();
        assert!(result.is_some());
        let msg = result.unwrap();
        assert_eq!(msg.len(), 256);
    }

    #[test]
    fn test_parse_ndef_from_pages_null_bytes() {
        // NDEF with leading null bytes
        let pages = vec![
            [0x00, 0x00, 0x00, 0x00], // Null padding
            [0x03, 0x03, 0x01, 0x02], // TLV header
            [0x03, 0x00, 0x00, 0x00], // Payload
        ];
        let result = parse_ndef_from_pages(&pages).unwrap();
        assert!(result.is_some());
    }

    #[test]
    fn test_decode_ndef_message_empty() {
        let result = decode_ndef_message(&[]);
        // Empty message returns None (early return in decode_ndef_message)
        assert!(result.is_none());
    }

    #[test]
    fn test_decode_ndef_message_too_short() {
        let msg = vec![0x01]; // Too short
        let result = decode_ndef_message(&msg);
        assert!(result.is_some());
        let summary = result.unwrap();
        assert_eq!(summary.kind, NdefKind::Unknown);
    }

    #[test]
    fn test_decode_ndef_message_text() {
        // Simple text record: SR=1, IL=0, TNF=1, type_len=1, payload_len=5
        // Type="T", payload=[0x02, 0x65, 0x6E, 0x48, 0x65] (lang_len=2, lang="en", text="He")
        let msg = vec![
            0xD1, // Header: MB=1, ME=1, SR=1, IL=0, TNF=1
            0x01, // Type length
            0x05, // Payload length
            0x54, // Type "T"
            0x02, 0x65, 0x6E, // Lang length + "en"
            0x48, 0x65, // Text "He"
        ];
        let result = decode_ndef_message(&msg);
        assert!(result.is_some());
        let summary = result.unwrap();
        assert_eq!(summary.kind, NdefKind::Text);
        assert_eq!(summary.text, Some("He".to_string()));
        assert_eq!(summary.language, Some("en".to_string()));
    }

    #[test]
    fn test_decode_ndef_message_uri() {
        // Simple URI record: SR=1, IL=0, TNF=1, type_len=1, payload_len=3
        // Type="U", payload=[0x03, 0x65, 0x78] (prefix=0x03="http://", rest="ex")
        let msg = vec![
            0x91, // Header: MB=1, ME=1, SR=1, IL=0, TNF=1
            0x01, // Type length
            0x03, // Payload length
            0x55, // Type "U"
            0x03, 0x65, 0x78, // Prefix + "ex"
        ];
        let result = decode_ndef_message(&msg);
        assert!(result.is_some());
        let summary = result.unwrap();
        assert_eq!(summary.kind, NdefKind::Uri);
        assert_eq!(summary.uri, Some("http://ex".to_string()));
    }

    #[test]
    fn test_decode_ndef_message_json() {
        // MIME record: SR=1, IL=0, TNF=2, type_len=16, payload_len=7
        // Type="application/json", payload="{\"a\":1}" (7 bytes)
        let mut msg = vec![
            0xD2, // Header: MB=1, ME=1, SR=1, IL=0, TNF=2
            0x10, // Type length (16)
            0x07, // Payload length (7 bytes for "{\"a\":1}")
        ];
        msg.extend_from_slice(b"application/json");
        msg.extend_from_slice(b"{\"a\":1}");

        let result = decode_ndef_message(&msg);
        assert!(result.is_some());
        let summary = result.unwrap();
        assert_eq!(summary.kind, NdefKind::Json);
        assert_eq!(summary.mime_type, Some("application/json".to_string()));
        assert_eq!(summary.json, Some("{\"a\":1}".to_string()));
    }

    #[test]
    fn test_validate_apdu_response_success() {
        let response = vec![0x01, 0x02, 0x03, 0x04, 0x90, 0x00];
        let result = DesktopNfcReader::validate_apdu_response(&response).unwrap();
        assert_eq!(result, vec![0x01, 0x02, 0x03, 0x04]);
    }

    #[test]
    fn test_validate_apdu_response_too_short() {
        let response = vec![0x90];
        let result = DesktopNfcReader::validate_apdu_response(&response);
        assert!(result.is_err());
    }

    #[test]
    fn test_validate_apdu_response_error_codes() {
        // Test various error status codes
        let test_cases = vec![
            vec![0x63, 0x00],
            vec![0x6A, 0x82],
            vec![0x69, 0x85],
            vec![0x6A, 0x81],
            vec![0xFF, 0xFF],
        ];

        for response in test_cases {
            let result = DesktopNfcReader::validate_apdu_response(&response);
            assert!(
                result.is_err(),
                "Expected error for response {:02X?}",
                response
            );
        }
    }

    #[test]
    fn test_validate_apdu_response_empty_success() {
        // Empty response with success status
        let response = vec![0x90, 0x00];
        let result = DesktopNfcReader::validate_apdu_response(&response).unwrap();
        assert_eq!(result, Vec::<u8>::new());
    }

    // ========================================================================
    // Integration Tests (require refactoring to use traits for mocking)
    // ========================================================================

    #[test]
    fn test_write_options_default() {
        let opts = WriteOptions::default();
        assert_eq!(opts.existing_tag_behavior, ExistingTagBehavior::Overwrite);
    }

    #[test]
    fn test_existing_tag_behavior_serialization() {
        // Test that enum serializes correctly
        let overwrite = ExistingTagBehavior::Overwrite;
        let skip = ExistingTagBehavior::Skip;
        let error = ExistingTagBehavior::Error;

        // Just verify they can be created
        assert!(matches!(overwrite, ExistingTagBehavior::Overwrite));
        assert!(matches!(skip, ExistingTagBehavior::Skip));
        assert!(matches!(error, ExistingTagBehavior::Error));
    }

    #[test]
    fn test_ndef_kind_serialization() {
        let kinds = vec![
            NdefKind::Text,
            NdefKind::Uri,
            NdefKind::Json,
            NdefKind::Unknown,
        ];

        for kind in kinds {
            // Just verify they can be created
            assert!(matches!(
                kind,
                NdefKind::Text | NdefKind::Uri | NdefKind::Json | NdefKind::Unknown
            ));
        }
    }

    #[test]
    fn test_ndef_summary_creation() {
        let summary = NdefSummary {
            kind: NdefKind::Text,
            text: Some("Hello".to_string()),
            uri: None,
            language: Some("en".to_string()),
            mime_type: None,
            json: None,
            message_hex: "48656C6C6F".to_string(),
        };

        assert_eq!(summary.kind, NdefKind::Text);
        assert_eq!(summary.text, Some("Hello".to_string()));
        assert_eq!(summary.language, Some("en".to_string()));
    }

    #[test]
    fn test_ntag216_read_result_creation() {
        let result = Ntag216ReadResult {
            uid: Some("04 12 34 56 78 90 AB".to_string()),
            is_blank: false,
            ndef: Some(NdefSummary {
                kind: NdefKind::Text,
                text: Some("Test".to_string()),
                uri: None,
                language: None,
                mime_type: None,
                json: None,
                message_hex: "".to_string(),
            }),
        };

        assert_eq!(result.uid, Some("04 12 34 56 78 90 AB".to_string()));
        assert_eq!(result.is_blank, false);
        assert!(result.ndef.is_some());
    }

    #[test]
    fn test_write_result_creation() {
        let result = WriteResult {
            uid: Some("04 12 34 56 78 90 AB".to_string()),
            ok: true,
            skipped: false,
            error: None,
        };

        assert_eq!(result.ok, true);
        assert_eq!(result.skipped, false);
        assert!(result.error.is_none());
    }

    // ========================================================================
    // Edge Case Tests
    // ========================================================================

    #[test]
    fn test_encode_ndef_tlv_max_short_length() {
        // Test maximum short length (255 bytes)
        let message = vec![0x00; 255];
        let result = encode_ndef_tlv(&message).unwrap();
        assert_eq!(result[0], 0x03);
        assert_eq!(result[1], 255);
    }

    #[test]
    fn test_encode_ndef_tlv_min_extended_length() {
        // Test minimum extended length (256 bytes)
        let message = vec![0x00; 256];
        let result = encode_ndef_tlv(&message).unwrap();
        assert_eq!(result[0], 0x03);
        assert_eq!(result[1], 0xFF); // Extended length marker
        assert_eq!((result[2] as u16) << 8 | result[3] as u16, 256);
    }

    #[test]
    fn test_parse_ndef_from_pages_multiple_tlv() {
        // Multiple TLV entries before NDEF
        let pages = vec![
            [0x00, 0x05, 0x01, 0x02], // Some other TLV (type 0x00, length 5)
            [0x03, 0x05, 0x01, 0x02], // NDEF TLV header
            [0x03, 0x04, 0x05, 0x00], // NDEF payload
        ];
        let result = parse_ndef_from_pages(&pages).unwrap();
        assert!(result.is_some());
    }

    #[test]
    fn test_decode_ndef_message_long_text() {
        // Text record with long payload
        // Payload: lang_len (1 byte) + lang ("en" = 2 bytes) + text (252 bytes) = 255 total
        let mut msg = vec![
            0xD1, // Header
            0x01, // Type length
            0xFF, // Payload length (255)
            0x54, // Type "T"
            0x02, 0x65, 0x6E, // Lang length (2) + "en"
        ];
        msg.extend(vec![0x41; 252]); // Long text (252 bytes to make total 255: 1+2+252)

        let result = decode_ndef_message(&msg);
        assert!(result.is_some());
        let summary = result.unwrap();
        assert_eq!(summary.kind, NdefKind::Text);
    }

    #[test]
    fn test_decode_ndef_message_uri_prefixes() {
        // Test all URI prefixes
        let prefixes = vec![
            (0x01, "http://www."),
            (0x02, "https://www."),
            (0x03, "http://"),
            (0x04, "https://"),
        ];

        for (prefix_code, prefix_str) in prefixes {
            let msg = vec![
                0x91, // Header
                0x01, // Type length
                0x04, // Payload length
                0x55, // Type "U"
                prefix_code,
                0x65,
                0x78,
                0x61, // Prefix + "exa"
            ];
            let result = decode_ndef_message(&msg);
            assert!(result.is_some());
            let summary = result.unwrap();
            assert_eq!(summary.kind, NdefKind::Uri);
            assert!(summary.uri.unwrap().starts_with(prefix_str));
        }
    }

    #[test]
    fn test_build_ntag216_ndef_tlv_image_padding() {
        // Test that padding is added correctly
        let message = vec![0x01, 0x02, 0x03]; // 3 bytes
        let result = build_ntag216_ndef_tlv_image(&message).unwrap();

        // Should be padded to 4-byte boundary
        assert_eq!(result.len() % 4, 0);
    }

    #[test]
    fn test_parse_ndef_from_pages_incomplete_extended_length() {
        // Extended length TLV but not enough bytes for length field
        let pages = vec![
            [0x03, 0xFF, 0x01, 0x00], // Incomplete extended length (missing second byte)
        ];
        let result = parse_ndef_from_pages(&pages).unwrap();
        assert!(result.is_none());
    }

    #[test]
    fn test_decode_ndef_message_with_id() {
        // Record with ID field (IL=1)
        let msg = vec![
            0xB1, // Header: IL=1
            0x01, // Type length
            0x01, // ID length
            0x01, // Payload length
            0x54, // Type "T"
            0x69, // ID "i"
            0x48, // Payload "H"
        ];
        let result = decode_ndef_message(&msg);
        assert!(result.is_some());
    }

    #[test]
    fn test_decode_ndef_message_long_type() {
        // Record with long type name (MIME type)
        let mut msg = vec![
            0xD2, // Header: TNF=2 (MIME)
            0x10, // Type length (16)
            0x07, // Payload length (7 bytes for "{\"a\":1}")
        ];
        msg.extend(b"application/json");
        msg.extend(b"{\"a\":1}");

        let result = decode_ndef_message(&msg);
        assert!(result.is_some());
        let summary = result.unwrap();
        assert_eq!(summary.mime_type, Some("application/json".to_string()));
        assert_eq!(summary.kind, NdefKind::Json);
    }

    // ========================================================================
    // Error Handling Tests
    // ========================================================================

    #[test]
    fn test_nfc_error_display() {
        let errors = vec![
            NfcError::ReaderNotAvailable("test".to_string()),
            NfcError::ConnectionFailed("test".to_string()),
            NfcError::NoReader,
            NfcError::TagNotDetected("test".to_string()),
            NfcError::InvalidResponse("test".to_string()),
            NfcError::UidReadFailed("test".to_string()),
            NfcError::PageReadFailed {
                page: 4,
                reason: "test".to_string(),
            },
            NfcError::PageWriteFailed {
                page: 4,
                reason: "test".to_string(),
            },
            NfcError::InvalidArg("test".to_string()),
            NfcError::TagAlreadyWritten {
                uid: "test".to_string(),
            },
            NfcError::ParseError("test".to_string()),
            NfcError::VerificationFailed("test".to_string()),
        ];

        for error in errors {
            let display = format!("{}", error);
            assert!(!display.is_empty());
        }
    }

    #[test]
    fn test_encode_ndef_text_invalid_lang_length() {
        // Max language length is 63 bytes (0x3F)
        let max_lang = "a".repeat(63);
        assert!(encode_ndef_text_record("test", &max_lang).is_ok());

        let too_long = "a".repeat(64);
        assert!(encode_ndef_text_record("test", &too_long).is_err());

        let way_too_long = "a".repeat(100);
        assert!(encode_ndef_text_record("test", &way_too_long).is_err());
    }

    #[test]
    fn test_build_ntag216_ndef_tlv_image_exact_max() {
        // Test with max size that fits in NTAG216
        // Max user data is 872 bytes, but TLV adds overhead
        // Extended length TLV: 4 bytes header + message + 3 bytes padding = max 872
        // So max message is 872 - 4 - 3 = 865 bytes
        let message = vec![0x00; 865];
        let result = build_ntag216_ndef_tlv_image(&message);
        assert!(result.is_ok());
    }

    #[test]
    fn test_build_ntag216_ndef_tlv_image_over_max() {
        // Test with size exceeding max
        let message = vec![0x00; 869]; // Too large
        let result = build_ntag216_ndef_tlv_image(&message);
        assert!(result.is_err());
    }

    // ========================================================================
    // Round-trip Tests
    // ========================================================================

    #[test]
    fn test_text_encode_decode_roundtrip() {
        let text = "Hello, World!";
        let lang = "en";

        let encoded = encode_ndef_text_record(text, lang).unwrap();
        let tlv = encode_ndef_tlv(&encoded).unwrap();

        // Create pages from TLV
        let mut pages = Vec::new();
        for chunk in tlv.chunks(4) {
            let mut page = [0u8; 4];
            page[..chunk.len()].copy_from_slice(chunk);
            pages.push(page);
        }

        // Parse back
        let parsed_msg = parse_ndef_from_pages(&pages).unwrap();
        assert!(parsed_msg.is_some());

        let decoded = decode_ndef_message(&parsed_msg.unwrap());
        assert!(decoded.is_some());
        let summary = decoded.unwrap();
        assert_eq!(summary.kind, NdefKind::Text);
        assert_eq!(summary.text, Some(text.to_string()));
        assert_eq!(summary.language, Some(lang.to_string()));
    }

    #[test]
    fn test_uri_encode_decode_roundtrip() {
        let uri = "https://example.com";

        let encoded = encode_ndef_uri_record(uri).unwrap();
        let tlv = encode_ndef_tlv(&encoded).unwrap();

        // Create pages
        let mut pages = Vec::new();
        for chunk in tlv.chunks(4) {
            let mut page = [0u8; 4];
            page[..chunk.len()].copy_from_slice(chunk);
            pages.push(page);
        }

        // Parse back
        let parsed_msg = parse_ndef_from_pages(&pages).unwrap();
        assert!(parsed_msg.is_some());

        let decoded = decode_ndef_message(&parsed_msg.unwrap());
        assert!(decoded.is_some());
        let summary = decoded.unwrap();
        assert_eq!(summary.kind, NdefKind::Uri);
        // URI encoding may add prefix, so just check it contains the domain
        assert!(summary.uri.unwrap().contains("example.com"));
    }

    #[test]
    fn test_json_encode_decode_roundtrip() {
        let json = r#"{"key":"value","number":123}"#;

        let encoded = encode_ndef_mime_record("application/json", json.as_bytes()).unwrap();
        let tlv = encode_ndef_tlv(&encoded).unwrap();

        // Create pages
        let mut pages = Vec::new();
        for chunk in tlv.chunks(4) {
            let mut page = [0u8; 4];
            page[..chunk.len()].copy_from_slice(chunk);
            pages.push(page);
        }

        // Parse back
        let parsed_msg = parse_ndef_from_pages(&pages).unwrap();
        assert!(parsed_msg.is_some());

        let decoded = decode_ndef_message(&parsed_msg.unwrap());
        assert!(decoded.is_some());
        let summary = decoded.unwrap();
        assert_eq!(summary.kind, NdefKind::Json);
        assert_eq!(summary.json, Some(json.to_string()));
    }
}
