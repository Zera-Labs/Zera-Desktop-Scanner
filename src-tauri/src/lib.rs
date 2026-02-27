mod ntag216;
mod ntag216_desktop;
mod serial;

// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[tauri::command]
fn read_file_text(path: &str) -> Result<String, String> {
    std::fs::read_to_string(path).map_err(|e| format!("Read failed: {e}"))
}

#[derive(serde::Serialize)]
struct SaveNoteResult {
    path: String,
    already_existed: bool,
}

#[tauri::command]
fn save_note_to_downloads(note_id: &str, content: &str) -> Result<SaveNoteResult, String> {
    let downloads_dir = dirs::download_dir()
        .or_else(|| dirs::home_dir().map(|h| h.join("Downloads")))
        .ok_or_else(|| "Could not find Downloads folder".to_string())?;
    
    let safe_id: String = note_id
        .chars()
        .filter(|c| c.is_alphanumeric())
        .take(20)
        .collect();
    
    if safe_id.is_empty() {
        return Err("Invalid note ID".to_string());
    }
    
    let prefix = format!("note_{}", safe_id);
    if let Ok(entries) = std::fs::read_dir(&downloads_dir) {
        for entry in entries.flatten() {
            let file_name = entry.file_name().to_string_lossy().to_string();
            if file_name.starts_with(&prefix) && file_name.ends_with(".json") {
                return Ok(SaveNoteResult {
                    path: entry.path().to_string_lossy().to_string(),
                    already_existed: true,
                });
            }
        }
    }
    let filename = format!("note_{}_{}.json", safe_id, std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis());
    
    let file_path = downloads_dir.join(&filename);
    
    std::fs::write(&file_path, content)
        .map_err(|e| format!("Failed to save file: {e}"))?;
    
    Ok(SaveNoteResult {
        path: file_path.to_string_lossy().to_string(),
        already_existed: false,
    })
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {

    std::env::set_var("WEBKIT_DISABLE_DMABUF_RENDERER", "1");
    println!("Running Tauri application");
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            greet,
            read_file_text,
            save_note_to_downloads,
            serial::list_serial_ports,
            serial::auto_detect_proxmark_port,
            // Proxmark3 commands (legacy)
            ntag216::read_ntag216,
            ntag216::read_ntag216_json,
            ntag216::write_ntag216_text,
            ntag216::write_ntag216_uri,
            ntag216::write_ntag216_json,
            ntag216::write_ntag216_raw,
            ntag216::write_ntag216_page,
            ntag216::batch_write_ntag216_text,
            ntag216::clone_ntag216_to_n_tags,
            // Desktop NFC commands (PC/SC)
            ntag216_desktop::read_ntag216_desktop,
            ntag216_desktop::read_ntag216_json_desktop,
            ntag216_desktop::read_ntag216_raw_desktop,
            ntag216_desktop::write_ntag216_text_desktop,
            ntag216_desktop::write_ntag216_uri_desktop,
            ntag216_desktop::write_ntag216_json_desktop,
            ntag216_desktop::erase_ntag216_desktop,
            ntag216_desktop::check_nfc_reader,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
