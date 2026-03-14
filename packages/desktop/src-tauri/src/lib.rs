// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/

mod commands;
mod models;
mod services;

pub use commands::*;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Initialize request registry for HTTP request cancellation
    let request_registry = commands::init_request_registry();

    tauri::Builder::default()
        // CRITICAL: Single instance plugin MUST be first
        .plugin(
            tauri_plugin_single_instance::init(|app, args, cwd| {
                println!("[HiveFetch] Second instance detected");
                println!("[HiveFetch] Args: {:?}", args);
                println!("[HiveFetch] CWD: {}", cwd);

                // Restore and focus the existing window
                #[cfg(desktop)]
                {
                    if let Some(window) = app.get_webview_window("main") {
                        let _ = window.unminimize();
                        let _ = window.show();
                        let _ = window.set_focus();
                    }
                }
            })
        )
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
            commands::http::pick_ssl_file,
            commands::grpc::grpc_reflect,
            commands::grpc::grpc_load_proto,
            commands::grpc::grpc_invoke,
            commands::grpc::pick_proto_file,
            commands::grpc::pick_proto_import_dir,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
