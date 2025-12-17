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
const NTAG216_READ_CMD: u8 = 0x30;  // READ command
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

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
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

#[derive(Debug, Clone, Serialize, Deserialize)]
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
pub struct DesktopNfcReader {
    reader_name: String,
    connected: bool,
}

impl DesktopNfcReader {
    /// Automatically detect and connect to first available NFC reader
    pub fn auto_connect() -> Result<Self, NfcError> {
        use pcsc::{Context, Scope};

        let ctx = Context::establish(Scope::User)
            .map_err(|e| {
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

        Ok(DesktopNfcReader {
            reader_name,
            connected: true,
        })
    }

    /// Send APDU command and get response
    fn send_apdu(&self, cmd: &[u8]) -> Result<Vec<u8>, NfcError> {
        use pcsc::{Context, Scope, ShareMode};
        use std::ffi::CString;

        dlog!("send_apdu: Sending command ({} bytes): {:02X?}", cmd.len(), cmd);
        
        let ctx = Context::establish(Scope::User)
            .map_err(|e| {
                dlog!("send_apdu: ERROR establishing context: {}", e);
                NfcError::ConnectionFailed(e.to_string())
            })?;

        let reader_cstr = CString::new(self.reader_name.as_str())
            .map_err(|e| {
                dlog!("send_apdu: ERROR creating CString: {}", e);
                NfcError::ConnectionFailed(format!("Invalid reader name: {}", e))
            })?;

        dlog!("send_apdu: Connecting to reader: {}", self.reader_name);
        let card = ctx
            .connect(
                &reader_cstr,
                ShareMode::Shared,
                pcsc::Protocols::T0 | pcsc::Protocols::T1,
            )
            .map_err(|e| {
                dlog!("send_apdu: ERROR connecting to card: {}", e);
                NfcError::ConnectionFailed(e.to_string())
            })?;

        let mut response_buf = [0; 256];
        dlog!("send_apdu: Transmitting APDU...");
        let response = card
            .transmit(cmd, &mut response_buf)
            .map_err(|e| {
                dlog!("send_apdu: ERROR transmitting: {}", e);
                NfcError::ConnectionFailed(e.to_string())
            })?;

        dlog!("send_apdu: Received response ({} bytes): {:02X?}", response.len(), response);
        Ok(response.to_vec())
    }

    /// Read UID from tag
    pub fn read_uid(&self) -> Result<String, NfcError> {
        let response = self.send_apdu(&APDU_GET_UID)?;

        // Response format: UID bytes (7) + status bytes
        if response.len() < 9 {
            return Err(NfcError::InvalidResponse(
                "UID response too short".into(),
            ));
        }

        // Check status (should end with 0x90 0x00 for success)
        let status = (response[response.len() - 2], response[response.len() - 1]);
        if status != (0x90, 0x00) && status != (0x61, 0x00) {
            return Err(NfcError::TagNotDetected(format!(
                "Invalid status: {:02X} {:02X}",
                status.0, status.1
            )));
        }

        // Extract UID (first 7 bytes typically)
        let uid_len = if response.len() > 9 {
            response[response.len() - 1] as usize
        } else {
            7
        };

        let uid_bytes = &response[..uid_len.min(response.len() - 2)];
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
            let mut cmd = vec![0xFF, 0xB0, 0x00, page as u8, 0x04];
            
            let mut response = match self.send_apdu(&cmd) {
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

            // Debug: log response for troubleshooting
            // eprintln!("Read page {} response ({} bytes): {:02X?}", page, response.len(), response);

            // Check status (should end with 90 00)
            if response.len() < 2 {
                return Err(NfcError::PageReadFailed {
                    page,
                    reason: format!("Response too short: {} bytes", response.len()),
                });
            }

            let status = (response[response.len() - 2], response[response.len() - 1]);
            if status != (0x90, 0x00) {
                return Err(NfcError::PageReadFailed {
                    page,
                    reason: format!("Invalid status: {:02X} {:02X}", status.0, status.1),
                });
            }

            // Parse response - handle both ACR1252U direct format and ACR122U Direct Transmit
            // ACR1252U: <4 bytes data> 90 00 (6 bytes total)
            // ACR122U: D5 41 00 <4 bytes data> 90 00 (8 bytes total)
            
            let mut page_data = [0u8; 4];
            let mut found_data = false;

            // ACR1252U direct format: <4 bytes> 90 00 (6 bytes)
            if response.len() == 6 {
                dlog!("  Parsing as ACR1252U direct format (6 bytes)");
                page_data.copy_from_slice(&response[0..4]);
                found_data = true;
            }
            // ACR122U Direct Transmit: D5 41 00 <4 bytes> 90 00 (8 bytes)
            else if response.len() >= 8 && response[0] == 0xD5 && response[1] == 0x41 {
                dlog!("  Parsing as ACR122U Direct Transmit format (8+ bytes)");
                if response[2] == 0x00 {
                    page_data.copy_from_slice(&response[3..7]);
                    found_data = true;
                } else {
                    dlog!("  ERROR: PN532 status not 0x00: {:02X}", response[2]);
                }
            }
            // Fallback: try to extract 4 bytes before status
            else if response.len() >= 6 {
                dlog!("  Parsing as fallback format (extracting before status)");
                let data_start = response.len() - 6;
                if data_start + 4 <= response.len() - 2 {
                    page_data.copy_from_slice(&response[data_start..data_start + 4]);
                    found_data = true;
                }
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
            let response = match self.send_apdu(&cmd) {
                Ok(r) => {
                    dlog!("  Direct format response ({} bytes): {:02X?}", r.len(), r);
                    // Check if write succeeded
                    if r.len() >= 2 {
                        let status = (r[r.len() - 2], r[r.len() - 1]);
                        if status == (0x90, 0x00) {
                            dlog!("  Write successful with direct format");
                            r // Success
                        } else {
                            dlog!("  Direct format failed (status {:02X} {:02X}), trying fallback", status.0, status.1);
                            // Try fallback format
                            let mut cmd_dt = Vec::with_capacity(13);
                            cmd_dt.extend_from_slice(&APDU_DIRECT_TRANSMIT);
                            cmd_dt.push(0x09);
                            cmd_dt.extend_from_slice(&PN532_INDATAEXCHANGE);
                            cmd_dt.push(NTAG216_WRITE_CMD);
                            cmd_dt.push(page as u8);
                            cmd_dt.extend_from_slice(chunk);
                            dlog!("  Fallback command: {:02X?}", cmd_dt);
                            let r2 = self.send_apdu(&cmd_dt)?;
                            dlog!("  Fallback response: {:02X?}", r2);
                            r2
                        }
                    } else {
                        dlog!("  Direct format response too short, trying fallback");
                        // Try fallback format
                        let mut cmd_dt = Vec::with_capacity(13);
                        cmd_dt.extend_from_slice(&APDU_DIRECT_TRANSMIT);
                        cmd_dt.push(0x09);
                        cmd_dt.extend_from_slice(&PN532_INDATAEXCHANGE);
                        cmd_dt.push(NTAG216_WRITE_CMD);
                        cmd_dt.push(page as u8);
                        cmd_dt.extend_from_slice(chunk);
                        self.send_apdu(&cmd_dt)?
                    }
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
                    self.send_apdu(&cmd_dt)?
                }
            };

            dlog!("  Final response ({} bytes): {:02X?}", response.len(), response);
            if response.len() < 2 {
                dlog!("  ERROR: Response too short");
                return Err(NfcError::PageWriteFailed {
                    page,
                    reason: format!("Response too short: {} bytes, response: {:02X?}", response.len(), response),
                });
            }

            let status = (response[response.len() - 2], response[response.len() - 1]);
            dlog!("  Write status: {:02X} {:02X}", status.0, status.1);
            if status != (0x90, 0x00) {
                dlog!("  ERROR: Invalid write status");
                return Err(NfcError::PageWriteFailed {
                    page,
                    reason: format!("Invalid status: {:02X} {:02X}, full response: {:02X?}", status.0, status.1, response),
                });
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

    let mut out = Vec::with_capacity(
        1 + 1 + (if sr { 1 } else { 4 }) + type_bytes.len() + payload.len(),
    );
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
        dlog!("encode_ndef_tlv: TLV (first 16): {:02X?}", &out[..out.len().min(16)]);
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
        dlog!("encode_ndef_tlv: TLV (first 16): {:02X?}", &out[..out.len().min(16)]);
        Ok(out)
    } else {
        Err(NfcError::InvalidArg("ndef message too large".into()))
    }
}

fn build_ntag216_ndef_tlv_image(ndef_message: &[u8]) -> Result<Vec<u8>, NfcError> {
    dlog!("build_ntag216_ndef_tlv_image: NDEF message length = {}", ndef_message.len());
    let tlv = encode_ndef_tlv(ndef_message)?;
    dlog!("build_ntag216_ndef_tlv_image: TLV length = {}", tlv.len());
    dlog!("build_ntag216_ndef_tlv_image: TLV (first 32): {:02X?}", &tlv[..tlv.len().min(32)]);

    let mut image = Vec::with_capacity(tlv.len());
    image.extend_from_slice(&tlv);

    let padding_start = image.len();
    while image.len() % 4 != 0 {
        image.push(0x00);
    }
    if image.len() > padding_start {
        dlog!("build_ntag216_ndef_tlv_image: Added {} padding bytes", image.len() - padding_start);
    }

    let max_bytes = ((NTAG216_LAST_USER_PAGE - NTAG216_FIRST_USER_PAGE + 1) as usize) * 4;
    dlog!("build_ntag216_ndef_tlv_image: Image length = {}, max = {}", image.len(), max_bytes);
    if image.len() > max_bytes {
        return Err(NfcError::InvalidArg(format!(
            "ndef image too large for NTAG216 user memory ({} > {})",
            image.len(),
            max_bytes
        )));
    }

    dlog!("build_ntag216_ndef_tlv_image: Final image (first 64): {:02X?}", &image[..image.len().min(64)]);
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
    dlog!("  Combined bytes ({}): {:02X?}", bytes.len(), &bytes[..bytes.len().min(32)]);

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
            dlog!("    Extended length: {} (bytes {:02X} {:02X})", l, bytes[i + 2], bytes[i + 3]);
            (l, i + 4)
        } else {
            dlog!("    Short length: {}", len_byte);
            (len_byte as usize, i + 2)
        };

        if t == 0x03 {
            dlog!("    Found NDEF TLV (0x03), length: {}, value_start: {}", len, value_start);
            if value_start + len > bytes.len() {
                dlog!("    ERROR: NDEF length {} exceeds available bytes {}", len, bytes.len() - value_start);
                return Ok(None);
            }
            let msg = bytes[value_start..value_start + len].to_vec();
            dlog!("    Extracted NDEF message ({} bytes): {:02X?}", msg.len(), &msg[..msg.len().min(32)]);
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
    dlog!("  Message hex (first 64): {}", &msg_hex[..msg_hex.len().min(64)]);

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
    dlog!("  Header: {:02X}, SR={}, IL={}, TNF={}", header, sr, il, tnf);

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
            dlog!("  Payload (first 64): {:02X?}", &payload[..payload.len().min(64)]);
            if let Ok(json_str) = String::from_utf8(payload.to_vec()) {
                dlog!("  Successfully decoded JSON string ({} chars)", json_str.len());
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

fn read_ndef_best_effort(reader: &DesktopNfcReader) -> Result<(Option<String>, bool, Option<NdefSummary>), NfcError> {
    dlog!("read_ndef_best_effort: Starting");
    let uid = reader.read_uid().ok();
    dlog!("read_ndef_best_effort: UID = {:?}", uid);

    // Small delay to ensure tag is ready after write operations
    std::thread::sleep(std::time::Duration::from_millis(50));

    // Read pages 4..20 initially to get TLV header
    dlog!("read_ndef_best_effort: Reading initial pages {}..{}", NTAG216_FIRST_USER_PAGE, NTAG216_FIRST_USER_PAGE + 16);
    let initial_pages = reader.read_pages(NTAG216_FIRST_USER_PAGE, NTAG216_FIRST_USER_PAGE + 16)?;
    dlog!("read_ndef_best_effort: Read {} initial pages", initial_pages.len());

    dlog!("read_ndef_best_effort: Parsing NDEF from initial pages");
    let mut msg_opt = parse_ndef_from_pages(&initial_pages)?;
    
    // If we didn't find NDEF or it's incomplete, try to determine length from TLV header
    if msg_opt.is_none() {
        dlog!("read_ndef_best_effort: No NDEF found in initial read, checking TLV header for length");
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
                dlog!("read_ndef_best_effort: Found NDEF TLV (0x03), length: {}, value_start: {}", len, value_start);
                let needed = value_start + len;
                let have = bytes.len();
                dlog!("read_ndef_best_effort: Need {} bytes, have {} bytes", needed, have);
                
                if needed > have {
                    // Calculate pages needed from page 4 start
                    let needed_pages = (needed + 3) / 4; // Round up to nearest page
                    let end_page = NTAG216_FIRST_USER_PAGE + (needed_pages as u16).saturating_sub(1);
                    dlog!("read_ndef_best_effort: Need {} pages total, reading pages {}..{}", needed_pages, NTAG216_FIRST_USER_PAGE, end_page);
                    
                    // Cap at maximum available pages
                    let end_page = end_page.min(NTAG216_LAST_USER_PAGE);
                    let pages = reader.read_pages(NTAG216_FIRST_USER_PAGE, end_page)?;
                    dlog!("read_ndef_best_effort: Read {} pages for full NDEF", pages.len());
                    msg_opt = parse_ndef_from_pages(&pages)?;
                }
                break;
            }
            
            i = value_start + len;
        }
    }

    if let Some(m) = msg_opt {
        dlog!("read_ndef_best_effort: Found NDEF message ({} bytes)", m.len());
        let is_blank = m.is_empty();
        dlog!("read_ndef_best_effort: is_blank = {}", is_blank);
        if !is_blank {
            dlog!("read_ndef_best_effort: Decoding NDEF message");
            let summary = decode_ndef_message(&m);
            dlog!("read_ndef_best_effort: Decoded summary: {:?}", summary.as_ref().map(|s| &s.kind));
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

    let (uid, is_blank, ndef) =
        read_ndef_best_effort(&reader).map_err(|e| e.to_string())?;

    Ok(Ntag216ReadResult { uid, is_blank, ndef })
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
    let value: serde_json::Value = serde_json::from_str(&json)
        .map_err(|e| format!("Invalid JSON: {}", e))?;
    let minified = serde_json::to_string(&value)
        .map_err(|e| format!("Failed to minify JSON: {}", e))?;

    let msg = encode_ndef_mime_record("application/json", minified.as_bytes())
        .map_err(|e| e.to_string())?;
    let image = build_ntag216_ndef_tlv_image(&msg).map_err(|e| e.to_string())?;

    dlog!("write_ntag216_json_desktop: Writing {} bytes to pages starting at {}", image.len(), NTAG216_FIRST_USER_PAGE);
    dlog!("write_ntag216_json_desktop: First 32 bytes: {:02X?}", &image[..image.len().min(32)]);
    
    reader
        .write_pages(NTAG216_FIRST_USER_PAGE, &image)
        .map_err(|e| format!("Write failed: {}", e))?;

    dlog!("write_ntag216_json_desktop: Write completed, waiting 200ms...");
    // Wait for tag to process writes
    std::thread::sleep(std::time::Duration::from_millis(200));

    // Verify write by reading back pages directly
    let pages_written = (image.len() + 3) / 4; // Round up
    dlog!("write_ntag216_json_desktop: Verifying {} pages", pages_written);
    let verify_pages = reader.read_pages(NTAG216_FIRST_USER_PAGE, NTAG216_FIRST_USER_PAGE + (pages_written as u16).saturating_sub(1))
        .map_err(|e| format!("Verification read failed: {}", e))?;
    
    dlog!("write_ntag216_json_desktop: Read back {} pages for verification", verify_pages.len());
    
    // Check if what we read matches what we wrote
    let mut verify_bytes = Vec::with_capacity(pages_written * 4);
    for page_data in verify_pages {
        verify_bytes.extend_from_slice(&page_data);
    }
    
    dlog!("write_ntag216_json_desktop: Wrote {} bytes, read back {} bytes", image.len(), verify_bytes.len());
    dlog!("write_ntag216_json_desktop: First 32 bytes written: {:02X?}", &image[..image.len().min(32)]);
    dlog!("write_ntag216_json_desktop: First 32 bytes read: {:02X?}", &verify_bytes[..verify_bytes.len().min(32)]);
    
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
    
    dlog!("write_ntag216_json_desktop: NDEF verification result: is_blank={}, ndef={:?}", 
          is_blank_verify, ndef_verify.as_ref().map(|s| &s.kind));

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

    let (_uid, _is_blank, ndef) =
        read_ndef_best_effort(&reader).map_err(|e| e.to_string())?;

    match ndef {
        Some(summary) if matches!(summary.kind, NdefKind::Json) => {
            let json = summary
                .json
                .ok_or_else(|| "JSON record found but payload was not decodable".to_string())?;
            Ok(json)
        }
        Some(summary) => Err(format!(
            "Tag contains {:?}, not JSON",
            summary.kind
        )),
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
        Ok(reader) => {
            match reader.read_uid() {
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
            }
        }
        Err(e) => Err(format!(
            "Reader detected but connection failed: {}\n\
            Detected readers: {}",
            e,
            readers_list.join(", ")
        )),
    }
}
