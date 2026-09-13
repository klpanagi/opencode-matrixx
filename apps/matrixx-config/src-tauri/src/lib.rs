pub mod commands;
pub mod config_path;
pub mod file_ops;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            commands::read_config,
            commands::write_config,
            commands::resolve_paths,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
