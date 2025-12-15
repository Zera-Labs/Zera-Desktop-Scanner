use regex::Regex;
use serde::{Deserialize, Serialize};
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tauri::Emitter;
use tokio::process::Command;

const NTAG216_FIRST_USER_PAGE: u16 = 4;
// Tag CC (page 3) reports NDEF/physical memory size 0x6D * 8 = 872 bytes on NTAG216,
// which corresponds to pages 4..=221 (218 pages). Keep writes inside that range to avoid
// dynamic lock/config pages near the end of memory.
const NTAG216_LAST_USER_PAGE: u16 = 221;

fn debug_enabled() -> bool {
    match std::env::var("DESK_TAURI_DEBUG") {
        Ok(v) => {
            let v = v.trim().to_ascii_lowercase();
            !(v.is_empty() || v == "0" || v == "false" || v == "no")
        }
        Err(_) => cfg!(debug_assertions),
    }
}

fn trunc(s: &str, max: usize) -> String {
    let total_chars = s.chars().count();
    if total_chars <= max {
        return s.to_string();
    }
    let head: String = s.chars().take(max).collect();
    format!("{head}… ({total_chars} chars)")
}

fn hex_preview(bytes: &[u8], max_bytes: usize) -> String {
    let take = bytes.len().min(max_bytes);
    let mut out = bytes_to_hex(&bytes[..take], " ");
    if bytes.len() > take {
        out.push_str(&format!(" … ({} bytes)", bytes.len()));
    }
    out
}

macro_rules! dlog {
    ($($arg:tt)*) => {{
        if debug_enabled() {
            eprintln!("[ntag216] {}", format!($($arg)*));
        }
    }};
}

#[derive(Debug, thiserror::Error)]
pub enum Ntag216Error {
    #[error("pm3/proxmark3 client not found in PATH")]
    Pm3NotFound,

    #[error("pm3 command timed out after {timeout_ms}ms: {cmd}")]
    Timeout { cmd: String, timeout_ms: u64 },

    #[error("pm3 command failed (exit={exit_code:?}): {cmd}\n{output}")]
    CommandFailed {
        cmd: String,
        exit_code: Option<i32>,
        output: String,
    },

    #[error("could not parse UID from pm3 output")]
    UidParseFailed,

    #[error("could not parse page data from pm3 output (page {page})")]
    PageParseFailed { page: u16 },

    #[error("invalid argument: {0}")]
    InvalidArg(String),

    #[error("tag appears to already have NDEF content (uid={uid})")]
    TagAlreadyWritten { uid: String },
}

pub type CmdResult<T> = Result<T, String>;

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ExistingTagBehavior {
    /// Always write, even if tag already has content.
    Overwrite,
    /// Skip writing if tag already has content.
    Skip,
    /// Error if tag already has content.
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
    /// Raw NDEF message bytes (hex, uppercase, no `0x`), if present.
    pub message_hex: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Ntag216ReadResult {
    /// Tag UID as space-separated uppercase hex bytes, e.g. "04 9A 7F 5F B6 2A 81".
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

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BatchWriteTextItem {
    pub label: Option<String>,
    pub text: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct BatchWriteOptions {
    pub existing_tag_behavior: ExistingTagBehavior,
    /// If true, waits for a different UID between items (prevents accidentally re-writing the same physical tag).
    pub require_uid_change: bool,
    /// Max time to wait for a tag (or a different tag) per item.
    pub tag_timeout_ms: u64,
    /// Poll interval while waiting for a tag.
    pub poll_interval_ms: u64,
}

impl Default for BatchWriteOptions {
    fn default() -> Self {
        Self {
            existing_tag_behavior: ExistingTagBehavior::Overwrite,
            require_uid_change: true,
            tag_timeout_ms: 30_000,
            poll_interval_ms: 250,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BatchWriteItemResult {
    pub index: usize,
    pub label: Option<String>,
    pub uid: Option<String>,
    pub ok: bool,
    pub skipped: bool,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BatchWriteResult {
    pub batch_id: String,
    pub total: usize,
    pub ok_count: usize,
    pub skipped_count: usize,
    pub error_count: usize,
    pub results: Vec<BatchWriteItemResult>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BatchProgressEvent {
    pub batch_id: String,
    pub index: usize,
    pub total: usize,
    pub stage: String,
    pub label: Option<String>,
    pub uid: Option<String>,
    pub ok: Option<bool>,
    pub skipped: Option<bool>,
    pub error: Option<String>,
    pub message: Option<String>,
}

fn now_batch_id() -> String {
    let ms = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_else(|_| Duration::from_millis(0))
        .as_millis();
    format!("batch-{}", ms)
}

fn bytes_to_hex(bytes: &[u8], sep: &str) -> String {
    bytes
        .iter()
        .map(|b| format!("{:02X}", b))
        .collect::<Vec<_>>()
        .join(sep)
}

fn hex_to_bytes(hex: &str) -> Result<Vec<u8>, Ntag216Error> {
    let cleaned = hex
        .chars()
        .filter(|c| c.is_ascii_hexdigit())
        .collect::<String>();
    if cleaned.len() % 2 != 0 {
        return Err(Ntag216Error::InvalidArg(
            "hex string must have an even number of hex digits".into(),
        ));
    }
    let mut out = Vec::with_capacity(cleaned.len() / 2);
    for i in (0..cleaned.len()).step_by(2) {
        let byte = u8::from_str_radix(&cleaned[i..i + 2], 16)
            .map_err(|_| Ntag216Error::InvalidArg("invalid hex string".into()))?;
        out.push(byte);
    }
    Ok(out)
}

async fn run_pm3(port: &str, cmd: &str, timeout_ms: u64) -> Result<String, Ntag216Error> {
    let port = port.trim();
    dlog!("run_pm3: cmd='{}' timeout_ms={}", trunc(cmd, 200), timeout_ms);
    let resolved_port = if port.is_empty() {
        crate::serial::auto_detect_proxmark_port()
            .map_err(|e| Ntag216Error::InvalidArg(format!("auto-detect proxmark port failed: {e}")))?
            .ok_or_else(|| {
                Ntag216Error::InvalidArg(
                    "no proxmark serial port specified and auto-detect found nothing. Plug in Proxmark3 and select a port.".into(),
                )
            })?
    } else {
        port.to_string()
    };
    dlog!("run_pm3: resolved_port='{}'", resolved_port);

    // On macOS, sometimes /dev/tty.* can block; try the /dev/cu.* counterpart too (and vice versa).
    let mut port_candidates = vec![resolved_port.clone()];
    if resolved_port.contains("/dev/tty.") {
        port_candidates.push(resolved_port.replacen("/dev/tty.", "/dev/cu.", 1));
    } else if resolved_port.contains("/dev/cu.") {
        port_candidates.push(resolved_port.replacen("/dev/cu.", "/dev/tty.", 1));
    }
    port_candidates.sort();
    port_candidates.dedup();
    dlog!("run_pm3: port_candidates={:?}", port_candidates);

    // Build a short, explicit candidate list. Prefer `proxmark3` if present and do not fall back
    // to `pm3` when `proxmark3` is available (some `pm3` wrappers inject a port automatically,
    // causing "port specified twice" parse errors).
    let mut candidates: Vec<(String, Vec<String>)> = Vec::new();
    for p in port_candidates {
        candidates.extend([
            (
                "proxmark3".into(),
                vec!["-p".into(), p.clone(), "-w".into(), "-c".into(), cmd.into()],
            ),
            // Some installs only have `pm3` in PATH; keep as a fallback.
            (
                "pm3".into(),
                vec!["-p".into(), p.clone(), "-w".into(), "-c".into(), cmd.into()],
            ),
            (
                "pm3".into(),
                vec!["-p".into(), p.clone(), "-c".into(), cmd.into()],
            ),
        ]);
    }

    let mut last_not_found = true;
    let mut last_err: Option<Ntag216Error> = None;
    let mut proxmark3_available = false;

    for (bin, args) in candidates {
        if bin == "pm3" && proxmark3_available {
            // If `proxmark3` exists, prefer it; `pm3` is often a wrapper that can break CLI parsing.
            continue;
        }
        dlog!("run_pm3: trying bin='{}' args={:?}", bin, args);
        let mut command = Command::new(&bin);
        command.args(args);
        command.kill_on_drop(true);

        let output = match tokio::time::timeout(Duration::from_millis(timeout_ms), command.output())
            .await
        {
            Ok(res) => match res {
                Ok(out) => out,
                Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
                    last_not_found = last_not_found && true;
                    continue;
                }
                Err(e) => {
                    last_not_found = false;
                    if bin == "proxmark3" {
                        proxmark3_available = true;
                    }
                    last_err = Some(Ntag216Error::CommandFailed {
                        cmd: format!("{bin} {}", cmd),
                        exit_code: None,
                        output: format!("spawn error: {e}"),
                    });
                    continue;
                }
            },
            Err(_) => {
                return Err(Ntag216Error::Timeout {
                    cmd: cmd.to_string(),
                    timeout_ms,
                })
            }
        };

        if bin == "proxmark3" {
            proxmark3_available = true;
        }
        last_not_found = false;

        let stdout = String::from_utf8_lossy(&output.stdout).to_string();
        let stderr = String::from_utf8_lossy(&output.stderr).to_string();
        let combined = if stderr.trim().is_empty() {
            stdout.clone()
        } else if stdout.trim().is_empty() {
            stderr.clone()
        } else {
            format!("{stdout}\n{stderr}")
        };

        dlog!(
            "run_pm3: exit={:?} success={} output='{}'",
            output.status.code(),
            output.status.success(),
            trunc(&combined, 1500)
        );

        if output.status.success() {
            return Ok(combined);
        }

        let combined_lc = combined.to_lowercase();
        if combined_lc.contains("offline mode") || combined_lc.contains("[offline|") {
            last_err = Some(Ntag216Error::InvalidArg(format!(
                "proxmark3 is in OFFLINE mode (could not connect). Select the correct serial port (usually /dev/tty.usbmodem* on macOS). Output:\n{combined}"
            )));
            continue;
        }

        last_err = Some(Ntag216Error::CommandFailed {
            cmd: format!("{bin} {}", cmd),
            exit_code: output.status.code(),
            output: combined,
        });
    }

    if last_not_found {
        return Err(Ntag216Error::Pm3NotFound);
    }

    Err(last_err.unwrap_or(Ntag216Error::Pm3NotFound))
}

fn parse_uid(output: &str) -> Option<String> {
    // Example: "UID: 04 9A 7F 5F B6 2A 81"
    let re = Regex::new(r"(?i)\buid\b[^0-9a-f]*((?:[0-9a-f]{2}[\s:]+){6,}[0-9a-f]{2})")
        .ok()?;
    let caps = re.captures(output)?;
    let raw = caps.get(1)?.as_str();
    let bytes: Vec<u8> = raw
        .split(|c: char| !c.is_ascii_hexdigit())
        .filter(|s| !s.is_empty())
        .take(16)
        .filter_map(|h| u8::from_str_radix(h, 16).ok())
        .collect();
    if bytes.len() < 7 {
        return None;
    }
    Some(bytes_to_hex(&bytes[..7], " "))
}

async fn read_uid(port: &str) -> Result<String, Ntag216Error> {
    let out = run_pm3(port, "hf mfu info", 15_000).await?;
    parse_uid(&out).ok_or(Ntag216Error::UidParseFailed)
}

fn encode_ndef_text_record(text: &str, lang: &str) -> Result<Vec<u8>, Ntag216Error> {
    let lang_bytes = lang.as_bytes();
    if lang_bytes.len() > 63 {
        return Err(Ntag216Error::InvalidArg(
            "language code too long (max 63 bytes)".into(),
        ));
    }

    let text_bytes = text.as_bytes();
    let mut payload = Vec::with_capacity(1 + lang_bytes.len() + text_bytes.len());
    payload.push((lang_bytes.len() as u8) & 0x3F); // status byte (UTF-8 + lang length)
    payload.extend_from_slice(lang_bytes);
    payload.extend_from_slice(text_bytes);

    encode_ndef_record(0x01, b"T", &payload)
}

fn encode_ndef_uri_record(uri: &str) -> Result<Vec<u8>, Ntag216Error> {
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

fn encode_ndef_mime_record(mime_type: &str, payload: &[u8]) -> Result<Vec<u8>, Ntag216Error> {
    if mime_type.is_empty() {
        return Err(Ntag216Error::InvalidArg("mime_type must not be empty".into()));
    }
    encode_ndef_record(0x02, mime_type.as_bytes(), payload)
}

fn encode_ndef_record(tnf: u8, type_bytes: &[u8], payload: &[u8]) -> Result<Vec<u8>, Ntag216Error> {
    if type_bytes.len() > 255 {
        return Err(Ntag216Error::InvalidArg(
            "ndef type field too long (max 255 bytes)".into(),
        ));
    }
    if payload.len() > (u32::MAX as usize) {
        return Err(Ntag216Error::InvalidArg("payload too large".into()));
    }

    let sr = payload.len() <= 255;
    let header = 0x80u8 // MB
        | 0x40u8 // ME
        | if sr { 0x10u8 } else { 0x00u8 } // SR
        | (tnf & 0x07);

    let mut out = Vec::with_capacity(1 + 1 + (if sr { 1 } else { 4 }) + type_bytes.len() + payload.len());
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

fn encode_ndef_tlv(ndef_message: &[u8]) -> Result<Vec<u8>, Ntag216Error> {
    dlog!("encode_ndef_tlv: ndef_message_len={}", ndef_message.len());
    if ndef_message.len() < 0xFF {
        let mut out = Vec::with_capacity(2 + ndef_message.len() + 1);
        out.push(0x03);
        out.push(ndef_message.len() as u8);
        out.extend_from_slice(ndef_message);
        out.push(0xFE); // terminator TLV
        Ok(out)
    } else if ndef_message.len() <= 0xFFFF {
        let len = ndef_message.len() as u16;
        let mut out = Vec::with_capacity(4 + ndef_message.len() + 1);
        out.push(0x03);
        out.push(0xFF);
        out.push((len >> 8) as u8);
        out.push((len & 0xFF) as u8);
        out.extend_from_slice(ndef_message);
        out.push(0xFE);
        Ok(out)
    } else {
        Err(Ntag216Error::InvalidArg(
            "ndef message too large".into(),
        ))
    }
}

fn build_ntag216_ndef_tlv_image(ndef_message: &[u8]) -> Result<Vec<u8>, Ntag216Error> {
    // NOTE: On NTAG21x, the Capability Container (CC) is stored in page 3 (read-only on most tags).
    // The user data area starts at page 4; the NDEF TLV begins at page 4 offset 0.
    let tlv = encode_ndef_tlv(ndef_message)?;

    let mut image = Vec::with_capacity(tlv.len());
    image.extend_from_slice(&tlv);

    // Pad to 4-byte pages.
    while image.len() % 4 != 0 {
        image.push(0x00);
    }

    let max_bytes = ((NTAG216_LAST_USER_PAGE - NTAG216_FIRST_USER_PAGE + 1) as usize) * 4;
    if image.len() > max_bytes {
        return Err(Ntag216Error::InvalidArg(format!(
            "ndef image too large for NTAG216 user memory ({} > {})",
            image.len(),
            max_bytes
        )));
    }

    dlog!(
        "build_ntag216_ndef_tlv_image: tlv_len={} image_len={} pages={} page4='{}'",
        tlv.len(),
        image.len(),
        image.len() / 4,
        hex_preview(&image[..image.len().min(4)], 4)
    );
    Ok(image)
}

async fn write_page(port: &str, page: u16, data4: [u8; 4]) -> Result<(), Ntag216Error> {
    let hex = bytes_to_hex(&data4, "");
    // NOTE: Different proxmark3 builds have slightly different flag spellings.
    // Empirically, `-b` + `-d` is the most widely supported and avoids the `--blk` errors
    // you saw in logs, so we stick to it.
    let cmd_variants = [format!("hf mfu wrbl -b {page} -d {hex}")];

    let mut last_err: Option<Ntag216Error> = None;
    for cmd in cmd_variants {
        match run_pm3(port, &cmd, 15_000).await {
            Ok(_) => return Ok(()),
            Err(e) => last_err = Some(e),
        }
    }

    Err(last_err.unwrap_or(Ntag216Error::CommandFailed {
        cmd: "hf mfu wrbl".into(),
        exit_code: None,
        output: "unknown failure".into(),
    }))
}

fn bulk_timeout_ms(pages: usize) -> u64 {
    let ms = 30_000u64.saturating_add((pages as u64).saturating_mul(300));
    ms.clamp(30_000, 180_000)
}

async fn write_pages_bulk(port: &str, start_page: u16, bytes: &[u8]) -> Result<(), Ntag216Error> {
    if bytes.is_empty() {
        return Ok(());
    }
    if bytes.len() % 4 != 0 {
        return Err(Ntag216Error::InvalidArg(
            "bulk write bytes length must be a multiple of 4".into(),
        ));
    }

    let page_count = bytes.len() / 4;
    let timeout_ms = bulk_timeout_ms(page_count);
    dlog!(
        "write_pages_bulk: start_page={} pages={} bytes={} timeout_ms={}",
        start_page,
        page_count,
        bytes.len(),
        timeout_ms
    );
    dlog!(
        "write_pages_bulk: first_page_bytes='{}' last_page_bytes='{}'",
        hex_preview(&bytes[..4], 4),
        hex_preview(&bytes[bytes.len() - 4..], 4)
    );

    // Use the known-good flag style: `hf mfu wrbl -b <page> -d <8hex>`.
    let mut cmds: Vec<String> = Vec::with_capacity(page_count);
    for (i, chunk) in bytes.chunks_exact(4).enumerate() {
        let page = start_page + (i as u16);
        let hex = bytes_to_hex(chunk, "");
        cmds.push(format!("hf mfu wrbl -b {page} -d {hex}"));
    }
    let cmdline = cmds.join("; ");
    run_pm3(port, &cmdline, timeout_ms).await?;
    Ok(())
}

async fn read_pages_via_dump(port: &str) -> Result<Vec<[u8; 4]>, Ntag216Error> {
    let out = run_pm3(port, "hf mfu dump", 25_000).await?;
    // Typical proxmark3 dump line:
    // [=]   4/0x04 | 03 00 FE 00 | 0 | ....
    let re_idx = Regex::new(r"(?i)\b(\d{1,3})\s*/\s*0x[0-9a-f]+\b").map_err(|_| {
        Ntag216Error::CommandFailed {
            cmd: "regex init".into(),
            exit_code: None,
            output: "regex init failed".into(),
        }
    })?;

    let mut pages: Vec<Option<[u8; 4]>> = vec![None; 256];
    for line in out.lines() {
        if !line.contains('|') {
            continue;
        }
        let parts: Vec<&str> = line.split('|').collect();
        if parts.len() < 2 {
            continue;
        }
        let header = parts[0];
        let data_part = parts[1];

        let idx: usize = match re_idx
            .captures(header)
            .and_then(|c| c.get(1))
            .and_then(|m| m.as_str().parse().ok())
        {
            Some(v) => v,
            None => continue,
        };
        if idx >= pages.len() {
            continue;
        }

        let bytes: Vec<u8> = data_part
            .split(|c: char| !c.is_ascii_hexdigit())
            .filter(|s| s.len() == 2)
            .filter_map(|h| u8::from_str_radix(h, 16).ok())
            .collect();
        if bytes.len() >= 4 {
            pages[idx] = Some([bytes[0], bytes[1], bytes[2], bytes[3]]);
        }
    }

    // We only need up to 214 pages; return contiguous up to the last seen page.
    let mut max_seen = 0usize;
    for (i, p) in pages.iter().enumerate() {
        if p.is_some() {
            max_seen = i;
        }
    }
    if max_seen == 0 {
        return Err(Ntag216Error::CommandFailed {
            cmd: "hf mfu dump".into(),
            exit_code: None,
            output: "no page lines found in output".into(),
        });
    }

    let mut out_pages = Vec::with_capacity(max_seen + 1);
    for i in 0..=max_seen {
        if let Some(p) = pages[i] {
            out_pages.push(p);
        } else {
            // stop at first gap to avoid returning misleading data
            break;
        }
    }
    Ok(out_pages)
}

async fn read_page_via_rdbl(port: &str, page: u16) -> Result<[u8; 4], Ntag216Error> {
    // Match the `-b` style used for writes to avoid `--blk` incompatibilities.
    let cmd_variants = [format!("hf mfu rdbl -b {page}")];

    let mut last_err: Option<Ntag216Error> = None;
    for cmd in cmd_variants {
        match run_pm3(port, &cmd, 15_000).await {
            Ok(out) => {
                // Grab the first 4 hex bytes we can find.
                let hexes: Vec<u8> = out
                    .split(|c: char| !c.is_ascii_hexdigit())
                    .filter(|s| s.len() == 2)
                    .filter_map(|h| u8::from_str_radix(h, 16).ok())
                    .collect();
                if hexes.len() >= 4 {
                    return Ok([hexes[0], hexes[1], hexes[2], hexes[3]]);
                }
                last_err = Some(Ntag216Error::PageParseFailed { page });
            }
            Err(e) => last_err = Some(e),
        }
    }

    Err(last_err.unwrap_or(Ntag216Error::PageParseFailed { page }))
}

async fn read_pages_range(port: &str, start: u16, end: u16) -> Result<Vec<[u8; 4]>, Ntag216Error> {
    if start > end {
        return Err(Ntag216Error::InvalidArg(
            "start page must be <= end page".into(),
        ));
    }
    let mut pages = Vec::with_capacity((end - start + 1) as usize);
    for p in start..=end {
        pages.push(read_page_via_rdbl(port, p).await?);
    }
    Ok(pages)
}

fn parse_ndef_from_pages(pages: &[[u8; 4]]) -> Result<Option<Vec<u8>>, Ntag216Error> {
    if pages.len() < 2 {
        return Ok(None);
    }
    let mut bytes = Vec::with_capacity(pages.len() * 4);
    for p in pages {
        bytes.extend_from_slice(p);
    }

    // User memory starts at page 4, and NDEF TLVs begin at page 4 offset 0.
    let mut i = 0usize;
    while i < bytes.len() {
        let t = bytes[i];
        if t == 0x00 {
            i += 1;
            continue;
        }
        if t == 0xFE {
            return Ok(None);
        }
        if i + 1 >= bytes.len() {
            return Ok(None);
        }
        let len_byte = bytes[i + 1];
        let (len, value_start) = if len_byte == 0xFF {
            if i + 3 >= bytes.len() {
                return Ok(None);
            }
            let l = ((bytes[i + 2] as usize) << 8) | (bytes[i + 3] as usize);
            (l, i + 4)
        } else {
            (len_byte as usize, i + 2)
        };

        if t == 0x03 {
            if value_start + len > bytes.len() {
                return Ok(None);
            }
            let msg = bytes[value_start..value_start + len].to_vec();
            return Ok(Some(msg));
        }

        i = value_start + len;
    }

    Ok(None)
}

fn decode_ndef_message(message: &[u8]) -> Option<NdefSummary> {
    if message.is_empty() {
        return None;
    }

    let msg_hex = bytes_to_hex(message, "");

    if message.len() < 3 {
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

    // Single record parser (best-effort).
    let mut idx = 0usize;
    let header = message[idx];
    idx += 1;
    let sr = (header & 0x10) != 0;
    let il = (header & 0x08) != 0;
    let tnf = header & 0x07;

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

    let payload_len: usize = if sr {
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

    // MIME media record (TNF=0x02)
    if tnf == 0x02 && !type_bytes.is_empty() {
        let mime = String::from_utf8_lossy(type_bytes).to_string();
        if mime.eq_ignore_ascii_case("application/json") {
            if let Ok(json_str) = String::from_utf8(payload.to_vec()) {
                return Some(NdefSummary {
                    kind: NdefKind::Json,
                    text: None,
                    uri: None,
                    language: None,
                    mime_type: Some(mime),
                    json: Some(json_str),
                    message_hex: msg_hex,
                });
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

async fn read_ndef_best_effort(port: &str) -> Result<(Option<String>, bool, Option<NdefSummary>), Ntag216Error> {
    let uid = read_uid(port).await.ok();

    // Fast path: try dump and parse pages 4.. until we can parse NDEF TLV.
    if let Ok(all_pages) = read_pages_via_dump(port).await {
        if all_pages.len() > NTAG216_FIRST_USER_PAGE as usize + 2 {
            let start = NTAG216_FIRST_USER_PAGE as usize;
            let slice = &all_pages[start..];
            let msg = parse_ndef_from_pages(slice)?;
            if let Some(m) = msg {
                let is_blank = m.is_empty();
                return Ok((uid, is_blank, decode_ndef_message(&m)));
            }
        }
    }

    // Fallback: read pages 4..20 and see if we can determine NDEF length.
    let initial_pages = read_pages_range(port, NTAG216_FIRST_USER_PAGE, NTAG216_FIRST_USER_PAGE + 16).await?;
    let mut msg_opt = parse_ndef_from_pages(&initial_pages)?;
    if msg_opt.is_none() {
        // Could be longer than what we read; try to locate NDEF TLV and length.
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
                break;
            }
            let len_byte = bytes[i + 1];
            let (len, value_start) = if len_byte == 0xFF {
                if i + 3 >= bytes.len() {
                    break;
                }
                let l = ((bytes[i + 2] as usize) << 8) | (bytes[i + 3] as usize);
                (l, i + 4)
            } else {
                (len_byte as usize, i + 2)
            };
            if t == 0x03 {
                let needed = value_start + len;
                let have = bytes.len();
                if needed > have {
                    // Compute pages needed from page4 start.
                    let needed_pages = (needed + 3) / 4;
                    let end_page = NTAG216_FIRST_USER_PAGE + (needed_pages as u16) - 1;
                    let pages = read_pages_range(port, NTAG216_FIRST_USER_PAGE, end_page).await?;
                    msg_opt = parse_ndef_from_pages(&pages)?;
                }
                break;
            }
            i = value_start + len;
        }
    }

    let msg = msg_opt.unwrap_or_default();
    let is_blank = msg.is_empty();
    Ok((uid, is_blank, decode_ndef_message(&msg)))
}

async fn validate_or_skip_existing(
    port: &str,
    behavior: ExistingTagBehavior,
) -> Result<(Option<String>, bool), Ntag216Error> {
    let (uid, is_blank, _ndef) = read_ndef_best_effort(port).await?;
    if is_blank {
        return Ok((uid, false));
    }
    let uid_str = uid.clone().unwrap_or_else(|| "unknown".into());
    match behavior {
        ExistingTagBehavior::Overwrite => Ok((uid, false)),
        ExistingTagBehavior::Skip => Ok((uid, true)),
        ExistingTagBehavior::Error => Err(Ntag216Error::TagAlreadyWritten { uid: uid_str }),
    }
}

#[tauri::command]
pub async fn read_ntag216(port: String) -> CmdResult<Ntag216ReadResult> {
    let (uid, is_blank, ndef) = read_ndef_best_effort(&port)
        .await
        .map_err(|e| e.to_string())?;
    Ok(Ntag216ReadResult { uid, is_blank, ndef })
}

#[tauri::command]
pub async fn write_ntag216_text(
    port: String,
    text: String,
    options: Option<WriteOptions>,
) -> CmdResult<WriteResult> {
    let options = options.unwrap_or_default();
    // Ensure tag present / capture uid.
    let _ = read_uid(&port).await.map_err(|e| e.to_string())?;

    let (uid, skipped) = validate_or_skip_existing(&port, options.existing_tag_behavior)
        .await
        .map_err(|e| e.to_string())?;
    if skipped {
        return Ok(WriteResult {
            uid,
            ok: true,
            skipped: true,
            error: None,
        });
    }

    let msg = encode_ndef_text_record(&text, "en")
        .map_err(|e| e.to_string())?;
    let image = build_ntag216_ndef_tlv_image(&msg).map_err(|e| e.to_string())?;
    write_pages_bulk(&port, NTAG216_FIRST_USER_PAGE, &image)
        .await
        .map_err(|e| e.to_string())?;

    Ok(WriteResult {
        uid,
        ok: true,
        skipped: false,
        error: None,
    })
}

#[tauri::command]
pub async fn write_ntag216_uri(
    port: String,
    uri: String,
    options: Option<WriteOptions>,
) -> CmdResult<WriteResult> {
    let options = options.unwrap_or_default();
    let _ = read_uid(&port).await.map_err(|e| e.to_string())?;

    let (uid, skipped) = validate_or_skip_existing(&port, options.existing_tag_behavior)
        .await
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
    write_pages_bulk(&port, NTAG216_FIRST_USER_PAGE, &image)
        .await
        .map_err(|e| e.to_string())?;

    Ok(WriteResult {
        uid,
        ok: true,
        skipped: false,
        error: None,
    })
}

#[tauri::command]
pub async fn write_ntag216_json(
    port: String,
    json: String,
    options: Option<WriteOptions>,
) -> CmdResult<WriteResult> {
    let options = options.unwrap_or_default();
    let _ = read_uid(&port).await.map_err(|e| e.to_string())?;

    let (uid, skipped) = validate_or_skip_existing(&port, options.existing_tag_behavior)
        .await
        .map_err(|e| e.to_string())?;
    if skipped {
        return Ok(WriteResult {
            uid,
            ok: true,
            skipped: true,
            error: None,
        });
    }

    // Validate + minify JSON to maximize tag capacity.
    dlog!("write_ntag216_json: input_json_len={}", json.len());
    let value: serde_json::Value =
        serde_json::from_str(&json).map_err(|e| Ntag216Error::InvalidArg(format!("invalid json: {e}")).to_string())?;
    let minified =
        serde_json::to_string(&value).map_err(|e| Ntag216Error::InvalidArg(format!("invalid json: {e}")).to_string())?;
    dlog!(
        "write_ntag216_json: minified_len={} preview='{}'",
        minified.len(),
        trunc(&minified, 160)
    );

    let msg = encode_ndef_mime_record("application/json", minified.as_bytes())
        .map_err(|e| e.to_string())?;
    dlog!("write_ntag216_json: ndef_message_len={} hex='{}'", msg.len(), hex_preview(&msg, 32));
    let image = build_ntag216_ndef_tlv_image(&msg).map_err(|e| e.to_string())?;
    write_pages_bulk(&port, NTAG216_FIRST_USER_PAGE, &image)
        .await
        .map_err(|e| e.to_string())?;

    // Post-write verification: read back and ensure we can parse the JSON we just wrote.
    match read_ndef_best_effort(&port).await {
        Ok((_uid2, is_blank2, ndef2)) => {
            dlog!(
                "write_ntag216_json: verify: is_blank={} kind={:?}",
                is_blank2,
                ndef2.as_ref().map(|n| &n.kind)
            );
            if is_blank2 {
                return Err("write completed but tag still appears blank on verify read; check Rust logs for pm3 output and page writes".to_string());
            }
            match ndef2 {
                Some(summary) if matches!(summary.kind, NdefKind::Json) => {
                    let got = summary.json.unwrap_or_default();
                    dlog!(
                        "write_ntag216_json: verify decoded_json_len={} preview='{}'",
                        got.len(),
                        trunc(&got, 120)
                    );
                    if got != minified {
                        dlog!(
                            "write_ntag216_json: verify mismatch: expected_len={} got_len={}",
                            minified.len(),
                            got.len()
                        );
                        return Err("write verification failed: tag JSON does not match what we attempted to write (see Rust logs)".to_string());
                    }
                }
                Some(other) => {
                    dlog!("write_ntag216_json: verify: unexpected kind={:?}", other.kind);
                    return Err("write verification failed: tag does not contain application/json after write (see Rust logs)".to_string());
                }
                None => {
                    return Err("write verification failed: no NDEF found after write (see Rust logs)".to_string());
                }
            }
        }
        Err(e) => {
            dlog!("write_ntag216_json: verify read failed: {}", e);
            return Err(format!("write completed but verify read failed: {e}"));
        }
    }

    Ok(WriteResult {
        uid,
        ok: true,
        skipped: false,
        error: None,
    })
}

#[tauri::command]
pub async fn read_ntag216_json(port: String) -> CmdResult<String> {
    let (_uid, _is_blank, ndef) = read_ndef_best_effort(&port)
        .await
        .map_err(|e| e.to_string())?;
    match ndef {
        Some(summary) if matches!(summary.kind, NdefKind::Json) => {
            let json = summary
                .json
                .ok_or_else(|| "json record found but payload was not decodable as utf-8".to_string())?;
            dlog!(
                "read_ntag216_json: decoded_json_len={} preview='{}'",
                json.len(),
                trunc(&json, 120)
            );
            Ok(json)
        }
        Some(_) => Err("tag does not contain an application/json NDEF record".to_string()),
        None => Err("no ndef message found on tag".to_string()),
    }
}

#[tauri::command]
pub async fn write_ntag216_page(port: String, page: u16, data: Vec<u8>) -> CmdResult<WriteResult> {
    if data.len() != 4 {
        return Err(Ntag216Error::InvalidArg("data must be exactly 4 bytes".into()).to_string());
    }
    if page < NTAG216_FIRST_USER_PAGE || page > NTAG216_LAST_USER_PAGE {
        return Err(Ntag216Error::InvalidArg(
            format!(
                "page must be between {NTAG216_FIRST_USER_PAGE} and {NTAG216_LAST_USER_PAGE} for NTAG216"
            ),
        )
        .to_string());
    }
    let uid = read_uid(&port).await.ok();
    write_page(&port, page, [data[0], data[1], data[2], data[3]])
        .await
        .map_err(|e| e.to_string())?;
    Ok(WriteResult {
        uid,
        ok: true,
        skipped: false,
        error: None,
    })
}

#[tauri::command]
pub async fn write_ntag216_raw(
    port: String,
    data: Vec<u8>,
    start_page: Option<u16>,
) -> CmdResult<WriteResult> {
    let start_page = start_page.unwrap_or(NTAG216_FIRST_USER_PAGE);
    if start_page < NTAG216_FIRST_USER_PAGE || start_page > NTAG216_LAST_USER_PAGE {
        return Err(Ntag216Error::InvalidArg(format!(
            "start_page must be between {NTAG216_FIRST_USER_PAGE} and {NTAG216_LAST_USER_PAGE}"
        ))
        .to_string());
    }
    let max_bytes =
        ((NTAG216_LAST_USER_PAGE - start_page + 1) as usize) * 4;
    if data.len() > max_bytes {
        return Err(Ntag216Error::InvalidArg(format!(
            "data too large for available pages ({} > {})",
            data.len(),
            max_bytes
        ))
        .to_string());
    }
    let uid = read_uid(&port).await.ok();
    let mut padded = data.clone();
    while padded.len() % 4 != 0 {
        padded.push(0x00);
    }
    write_pages_bulk(&port, start_page, &padded)
        .await
        .map_err(|e| e.to_string())?;
    Ok(WriteResult {
        uid,
        ok: true,
        skipped: false,
        error: None,
    })
}

#[tauri::command]
pub async fn batch_write_ntag216_text(
    app: tauri::AppHandle,
    port: String,
    items: Vec<BatchWriteTextItem>,
    options: Option<BatchWriteOptions>,
) -> CmdResult<BatchWriteResult> {
    let options = options.unwrap_or_default();
    let batch_id = now_batch_id();
    let total = items.len();

    let mut results: Vec<BatchWriteItemResult> = Vec::with_capacity(total);
    let mut ok_count = 0usize;
    let mut skipped_count = 0usize;
    let mut error_count = 0usize;
    let mut last_uid: Option<String> = None;

    for (idx, item) in items.into_iter().enumerate() {
        let progress = BatchProgressEvent {
            batch_id: batch_id.clone(),
            index: idx,
            total,
            stage: "waiting_for_tag".into(),
            label: item.label.clone(),
            uid: None,
            ok: None,
            skipped: None,
            error: None,
            message: Some("Present a tag to write...".into()),
        };
        let _ = app.emit("ntag216:batch-progress", progress);

        // Wait for a tag (and optionally a new UID).
        let start = SystemTime::now();
        let mut uid: Option<String> = None;
        loop {
            match read_uid(&port).await {
                Ok(u) => {
                    if options.require_uid_change {
                        if let Some(last) = &last_uid {
                            if last == &u {
                                // Still the same tag; keep waiting.
                            } else {
                                uid = Some(u);
                                break;
                            }
                        } else {
                            uid = Some(u);
                            break;
                        }
                    } else {
                        uid = Some(u);
                        break;
                    }
                }
                Err(_) => {
                    // keep polling
                }
            }

            let elapsed = start
                .duration_since(UNIX_EPOCH)
                .unwrap_or_else(|_| Duration::from_millis(0));
            let now = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap_or_else(|_| Duration::from_millis(0));
            let waited_ms = now.saturating_sub(elapsed).as_millis() as u64;
            if waited_ms >= options.tag_timeout_ms {
                break;
            }
            tokio::time::sleep(Duration::from_millis(options.poll_interval_ms)).await;
        }

        let uid = uid;
        if uid.is_none() {
            let err = format!("timeout waiting for tag ({})", options.tag_timeout_ms);
            let _ = app.emit(
                "ntag216:batch-progress",
                BatchProgressEvent {
                    batch_id: batch_id.clone(),
                    index: idx,
                    total,
                    stage: "error".into(),
                    label: item.label.clone(),
                    uid: None,
                    ok: Some(false),
                    skipped: Some(false),
                    error: Some(err.clone()),
                    message: None,
                },
            );
            results.push(BatchWriteItemResult {
                index: idx,
                label: item.label,
                uid: None,
                ok: false,
                skipped: false,
                error: Some(err),
            });
            error_count += 1;
            continue;
        }

        let uid_val = uid.clone();
        last_uid = uid.clone();

        let _ = app.emit(
            "ntag216:batch-progress",
            BatchProgressEvent {
                batch_id: batch_id.clone(),
                index: idx,
                total,
                stage: "validating".into(),
                label: item.label.clone(),
                uid: uid.clone(),
                ok: None,
                skipped: None,
                error: None,
                message: Some("Checking existing content...".into()),
            },
        );

        let skipped = match validate_or_skip_existing(&port, options.existing_tag_behavior).await {
            Ok((_uid2, skip)) => skip,
            Err(e) => {
                let err = e.to_string();
                let _ = app.emit(
                    "ntag216:batch-progress",
                    BatchProgressEvent {
                        batch_id: batch_id.clone(),
                        index: idx,
                        total,
                        stage: "error".into(),
                        label: item.label.clone(),
                        uid: uid.clone(),
                        ok: Some(false),
                        skipped: Some(false),
                        error: Some(err.clone()),
                        message: None,
                    },
                );
                results.push(BatchWriteItemResult {
                    index: idx,
                    label: item.label,
                    uid: uid.clone(),
                    ok: false,
                    skipped: false,
                    error: Some(err),
                });
                error_count += 1;
                continue;
            }
        };

        if skipped {
            let _ = app.emit(
                "ntag216:batch-progress",
                BatchProgressEvent {
                    batch_id: batch_id.clone(),
                    index: idx,
                    total,
                    stage: "done".into(),
                    label: item.label.clone(),
                    uid: uid.clone(),
                    ok: Some(true),
                    skipped: Some(true),
                    error: None,
                    message: Some("Skipped (already written)".into()),
                },
            );
            results.push(BatchWriteItemResult {
                index: idx,
                label: item.label,
                uid: uid.clone(),
                ok: true,
                skipped: true,
                error: None,
            });
            skipped_count += 1;
            continue;
        }

        let _ = app.emit(
            "ntag216:batch-progress",
            BatchProgressEvent {
                batch_id: batch_id.clone(),
                index: idx,
                total,
                stage: "writing".into(),
                label: item.label.clone(),
                uid: uid.clone(),
                ok: None,
                skipped: None,
                error: None,
                message: Some("Writing NDEF text...".into()),
            },
        );

        let res = write_ntag216_text(
            port.clone(),
            item.text,
            Some(WriteOptions {
                existing_tag_behavior: ExistingTagBehavior::Overwrite,
            }),
        )
        .await;

        match res {
            Ok(_) => {
                let _ = app.emit(
                    "ntag216:batch-progress",
                    BatchProgressEvent {
                        batch_id: batch_id.clone(),
                        index: idx,
                        total,
                        stage: "done".into(),
                        label: item.label.clone(),
                        uid: uid.clone(),
                        ok: Some(true),
                        skipped: Some(false),
                        error: None,
                        message: Some("Written".into()),
                    },
                );
                results.push(BatchWriteItemResult {
                    index: idx,
                    label: item.label,
                    uid: uid_val,
                    ok: true,
                    skipped: false,
                    error: None,
                });
                ok_count += 1;
            }
            Err(e) => {
                let _ = app.emit(
                    "ntag216:batch-progress",
                    BatchProgressEvent {
                        batch_id: batch_id.clone(),
                        index: idx,
                        total,
                        stage: "error".into(),
                        label: item.label.clone(),
                        uid: uid.clone(),
                        ok: Some(false),
                        skipped: Some(false),
                        error: Some(e.clone()),
                        message: None,
                    },
                );
                results.push(BatchWriteItemResult {
                    index: idx,
                    label: item.label,
                    uid: uid_val,
                    ok: false,
                    skipped: false,
                    error: Some(e),
                });
                error_count += 1;
            }
        }
    }

    Ok(BatchWriteResult {
        batch_id,
        total,
        ok_count,
        skipped_count,
        error_count,
        results,
    })
}

#[tauri::command]
pub async fn clone_ntag216_to_n_tags(
    app: tauri::AppHandle,
    port: String,
    count: usize,
    options: Option<BatchWriteOptions>,
) -> CmdResult<BatchWriteResult> {
    if count == 0 {
        return Err(Ntag216Error::InvalidArg("count must be > 0".into()).to_string());
    }
    let options = options.unwrap_or_default();
    let batch_id = now_batch_id();

    // Read source tag NDEF.
    let _ = app.emit(
        "ntag216:batch-progress",
        BatchProgressEvent {
            batch_id: batch_id.clone(),
            index: 0,
            total: count,
            stage: "reading_source".into(),
            label: Some("source".into()),
            uid: None,
            ok: None,
            skipped: None,
            error: None,
            message: Some("Reading source tag...".into()),
        },
    );

    let (source_uid, _is_blank, source_ndef) = read_ndef_best_effort(&port)
        .await
        .map_err(|e| e.to_string())?;
    let source_ndef = source_ndef.ok_or_else(|| {
        Ntag216Error::InvalidArg(
            "source tag has no readable NDEF message to clone".into(),
        )
        .to_string()
    })?;
    let source_bytes = hex_to_bytes(&source_ndef.message_hex)
        .map_err(|e| e.to_string())?;
    let image = build_ntag216_ndef_tlv_image(&source_bytes).map_err(|e| e.to_string())?;

    let total = count;
    let mut results: Vec<BatchWriteItemResult> = Vec::with_capacity(total);
    let mut ok_count = 0usize;
    let mut skipped_count = 0usize;
    let mut error_count = 0usize;
    let mut last_uid: Option<String> = source_uid.clone();

    for idx in 0..count {
        let _ = app.emit(
            "ntag216:batch-progress",
            BatchProgressEvent {
                batch_id: batch_id.clone(),
                index: idx,
                total,
                stage: "waiting_for_tag".into(),
                label: Some("clone".into()),
                uid: None,
                ok: None,
                skipped: None,
                error: None,
                message: Some("Present a target tag to clone onto...".into()),
            },
        );

        // Wait for a new tag vs last_uid (defaults to true).
        let start = SystemTime::now();
        let mut uid: Option<String> = None;
        loop {
            match read_uid(&port).await {
                Ok(u) => {
                    if options.require_uid_change {
                        if let Some(last) = &last_uid {
                            if last == &u {
                                // keep waiting
                            } else {
                                uid = Some(u);
                                break;
                            }
                        } else {
                            uid = Some(u);
                            break;
                        }
                    } else {
                        uid = Some(u);
                        break;
                    }
                }
                Err(_) => {}
            }
            let elapsed = start
                .duration_since(UNIX_EPOCH)
                .unwrap_or_else(|_| Duration::from_millis(0));
            let now = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap_or_else(|_| Duration::from_millis(0));
            let waited_ms = now.saturating_sub(elapsed).as_millis() as u64;
            if waited_ms >= options.tag_timeout_ms {
                break;
            }
            tokio::time::sleep(Duration::from_millis(options.poll_interval_ms)).await;
        }

        let uid = uid;
        if uid.is_none() {
            let err = format!("timeout waiting for tag ({})", options.tag_timeout_ms);
            let _ = app.emit(
                "ntag216:batch-progress",
                BatchProgressEvent {
                    batch_id: batch_id.clone(),
                    index: idx,
                    total,
                    stage: "error".into(),
                    label: Some("clone".into()),
                    uid: None,
                    ok: Some(false),
                    skipped: Some(false),
                    error: Some(err.clone()),
                    message: None,
                },
            );
            results.push(BatchWriteItemResult {
                index: idx,
                label: Some("clone".into()),
                uid: None,
                ok: false,
                skipped: false,
                error: Some(err),
            });
            error_count += 1;
            continue;
        }

        let uid_val = uid.clone();
        last_uid = uid.clone();

        let _ = app.emit(
            "ntag216:batch-progress",
            BatchProgressEvent {
                batch_id: batch_id.clone(),
                index: idx,
                total,
                stage: "validating".into(),
                label: Some("clone".into()),
                uid: uid.clone(),
                ok: None,
                skipped: None,
                error: None,
                message: Some("Checking existing content...".into()),
            },
        );

        let skipped = match validate_or_skip_existing(&port, options.existing_tag_behavior).await {
            Ok((_uid2, skip)) => skip,
            Err(e) => {
                let err = e.to_string();
                let _ = app.emit(
                    "ntag216:batch-progress",
                    BatchProgressEvent {
                        batch_id: batch_id.clone(),
                        index: idx,
                        total,
                        stage: "error".into(),
                        label: Some("clone".into()),
                        uid: uid.clone(),
                        ok: Some(false),
                        skipped: Some(false),
                        error: Some(err.clone()),
                        message: None,
                    },
                );
                results.push(BatchWriteItemResult {
                    index: idx,
                    label: Some("clone".into()),
                    uid: uid.clone(),
                    ok: false,
                    skipped: false,
                    error: Some(err),
                });
                error_count += 1;
                continue;
            }
        };

        if skipped {
            let _ = app.emit(
                "ntag216:batch-progress",
                BatchProgressEvent {
                    batch_id: batch_id.clone(),
                    index: idx,
                    total,
                    stage: "done".into(),
                    label: Some("clone".into()),
                    uid: uid.clone(),
                    ok: Some(true),
                    skipped: Some(true),
                    error: None,
                    message: Some("Skipped (already written)".into()),
                },
            );
            results.push(BatchWriteItemResult {
                index: idx,
                label: Some("clone".into()),
                uid: uid.clone(),
                ok: true,
                skipped: true,
                error: None,
            });
            skipped_count += 1;
            continue;
        }

        let _ = app.emit(
            "ntag216:batch-progress",
            BatchProgressEvent {
                batch_id: batch_id.clone(),
                index: idx,
                total,
                stage: "writing".into(),
                label: Some("clone".into()),
                uid: uid.clone(),
                ok: None,
                skipped: None,
                error: None,
                message: Some("Writing cloned NDEF...".into()),
            },
        );

        // Write prepared image.
        let write_failed: Option<String> = match write_pages_bulk(&port, NTAG216_FIRST_USER_PAGE, &image).await {
            Ok(_) => None,
            Err(e) => Some(e.to_string()),
        };

        if let Some(err) = write_failed {
            let _ = app.emit(
                "ntag216:batch-progress",
                BatchProgressEvent {
                    batch_id: batch_id.clone(),
                    index: idx,
                    total,
                    stage: "error".into(),
                    label: Some("clone".into()),
                    uid: uid.clone(),
                    ok: Some(false),
                    skipped: Some(false),
                    error: Some(err.clone()),
                    message: None,
                },
            );
            results.push(BatchWriteItemResult {
                index: idx,
                label: Some("clone".into()),
                uid: uid_val,
                ok: false,
                skipped: false,
                error: Some(err),
            });
            error_count += 1;
            continue;
        }

        let _ = app.emit(
            "ntag216:batch-progress",
            BatchProgressEvent {
                batch_id: batch_id.clone(),
                index: idx,
                total,
                stage: "done".into(),
                label: Some("clone".into()),
                uid: uid.clone(),
                ok: Some(true),
                skipped: Some(false),
                error: None,
                message: Some("Cloned".into()),
            },
        );

        ok_count += 1;
        results.push(BatchWriteItemResult {
            index: idx,
            label: Some("clone".into()),
            uid: uid_val,
            ok: true,
            skipped: false,
            error: None,
        });
    }

    Ok(BatchWriteResult {
        batch_id,
        total,
        ok_count,
        skipped_count,
        error_count,
        results,
    })
}


