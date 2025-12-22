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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_stronghold::Builder::new(|pass| todo!()).build())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            greet,
            read_file_text,
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
            ntag216_desktop::write_ntag216_text_desktop,
            ntag216_desktop::write_ntag216_uri_desktop,
            ntag216_desktop::write_ntag216_json_desktop,
            ntag216_desktop::check_nfc_reader,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
