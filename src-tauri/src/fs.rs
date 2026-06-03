use base64::{engine::general_purpose::STANDARD as B64, Engine};

use crate::types::LocalEntry;

#[tauri::command]
pub fn get_home_dir() -> Option<String> {
    dirs::home_dir().map(|p| p.to_string_lossy().into_owned())
}

#[tauri::command]
pub fn get_downloads_dir() -> Option<String> {
    dirs::download_dir().map(|p| p.to_string_lossy().into_owned())
}

#[tauri::command]
pub fn fs_write_local(path: String, data: String) -> Result<(), String> {
    let bytes = B64.decode(&data).map_err(|e| e.to_string())?;
    if let Some(parent) = std::path::Path::new(&path).parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    std::fs::write(&path, &bytes).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn fs_read_local(path: String) -> Result<String, String> {
    let bytes = std::fs::read(&path).map_err(|e| e.to_string())?;
    Ok(B64.encode(&bytes))
}

#[tauri::command]
pub fn fs_list_local(path: String) -> Result<Vec<LocalEntry>, String> {
    let rd = std::fs::read_dir(&path).map_err(|e| e.to_string())?;
    let mut out = Vec::new();
    for entry in rd {
        let e      = entry.map_err(|e| e.to_string())?;
        let is_dir = e.metadata().map(|m| m.is_dir()).unwrap_or(false);
        out.push(LocalEntry {
            name:   e.file_name().to_string_lossy().into_owned(),
            path:   e.path().to_string_lossy().into_owned(),
            is_dir,
        });
    }
    Ok(out)
}
