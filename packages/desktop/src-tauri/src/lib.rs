// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/

mod commands;
mod models;
mod services;

pub use commands::*;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Initialize request registry for HTTP request cancellation
    let request_registry = commands::init_request_registry();

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .manage(request_registry)
        .invoke_handler(tauri::generate_handler![
            commands::ready,
            commands::load_data,
            commands::save_collections,
            commands::greet,
            commands::http::send_request,
            commands::http::cancel_request,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
