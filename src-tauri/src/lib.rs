mod ntag216;
mod serial;

// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            greet,
            serial::list_serial_ports,
            serial::auto_detect_proxmark_port,
            ntag216::read_ntag216,
            ntag216::read_ntag216_json,
            ntag216::write_ntag216_text,
            ntag216::write_ntag216_uri,
            ntag216::write_ntag216_json,
            ntag216::write_ntag216_raw,
            ntag216::write_ntag216_page,
            ntag216::batch_write_ntag216_text,
            ntag216::clone_ntag216_to_n_tags
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
