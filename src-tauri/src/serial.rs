use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SerialPortInfoDto {
    pub port_name: String,
    pub kind: String,
    pub vid: Option<u16>,
    pub pid: Option<u16>,
    pub serial_number: Option<String>,
    pub manufacturer: Option<String>,
    pub product: Option<String>,
}

fn to_dto(info: &serialport::SerialPortInfo) -> SerialPortInfoDto {
    match &info.port_type {
        serialport::SerialPortType::UsbPort(usb) => SerialPortInfoDto {
            port_name: info.port_name.clone(),
            kind: "usb".into(),
            vid: Some(usb.vid),
            pid: Some(usb.pid),
            serial_number: usb.serial_number.clone(),
            manufacturer: usb.manufacturer.clone(),
            product: usb.product.clone(),
        },
        serialport::SerialPortType::BluetoothPort => SerialPortInfoDto {
            port_name: info.port_name.clone(),
            kind: "bluetooth".into(),
            vid: None,
            pid: None,
            serial_number: None,
            manufacturer: None,
            product: None,
        },
        serialport::SerialPortType::PciPort => SerialPortInfoDto {
            port_name: info.port_name.clone(),
            kind: "pci".into(),
            vid: None,
            pid: None,
            serial_number: None,
            manufacturer: None,
            product: None,
        },
        serialport::SerialPortType::Unknown => SerialPortInfoDto {
            port_name: info.port_name.clone(),
            kind: "unknown".into(),
            vid: None,
            pid: None,
            serial_number: None,
            manufacturer: None,
            product: None,
        },
    }
}

fn score_proxmark_candidate(p: &SerialPortInfoDto) -> i32 {
    let mut score = 0i32;
    let pn = p.port_name.to_lowercase();
    let man = p.manufacturer.as_deref().unwrap_or("").to_lowercase();
    let prod = p.product.as_deref().unwrap_or("").to_lowercase();

    if man.contains("proxmark") || prod.contains("proxmark") {
        score += 100;
    }
    if pn.contains("proxmark") {
        score += 80;
    }
    // macOS common patterns
    if pn.contains("usbmodem") {
        score += 40;
    }
    if pn.contains("usbserial") {
        score += 30;
    }
    // Linux common patterns
    if pn.contains("ttyacm") {
        score += 30;
    }
    if pn.contains("ttyusb") {
        score += 20;
    }

    // If we can see it’s USB, prefer over unknown.
    if p.kind == "usb" {
        score += 10;
    }

    score
}

#[tauri::command]
pub fn list_serial_ports() -> Result<Vec<SerialPortInfoDto>, String> {
    let ports = serialport::available_ports().map_err(|e| e.to_string())?;
    let mut out = ports.iter().map(to_dto).collect::<Vec<_>>();
    out.sort_by(|a, b| a.port_name.cmp(&b.port_name));
    Ok(out)
}

#[tauri::command]
pub fn auto_detect_proxmark_port() -> Result<Option<String>, String> {
    let ports = serialport::available_ports().map_err(|e| e.to_string())?;
    let dtos = ports.iter().map(to_dto).collect::<Vec<_>>();

    let mut best: Option<(i32, String)> = None;
    for p in &dtos {
        let s = score_proxmark_candidate(p);
        if s <= 0 {
            continue;
        }
        match &best {
            None => best = Some((s, p.port_name.clone())),
            Some((best_s, _)) if s > *best_s => best = Some((s, p.port_name.clone())),
            _ => {}
        }
    }

    Ok(best.map(|(_, name)| name))
}
