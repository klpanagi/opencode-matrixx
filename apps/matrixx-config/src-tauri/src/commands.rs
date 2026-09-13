use serde::{Deserialize, Serialize};
use std::path::Path;

#[derive(Debug, Serialize, Deserialize)]
pub struct ConfigPaths {
    pub opencode_jsonc: String,
    pub matrixx_jsonc: String,
}

#[tauri::command]
pub fn read_config(path: String) -> Result<String, String> {
    if !Path::new(&path).exists() {
        return Ok("{}".to_string());
    }
    crate::file_ops::read_file(&path).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn write_config(path: String, content: String) -> Result<(), String> {
    let _: serde_json::Value =
        serde_json::from_str(&content).map_err(|e| format!("Invalid JSON: {}", e))?;
    crate::file_ops::write_file(&path, &content).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn resolve_paths() -> Result<ConfigPaths, String> {
    crate::config_path::resolve().map_err(|e| e.to_string())
}
