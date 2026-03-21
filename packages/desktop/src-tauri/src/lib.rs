// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/

mod commands;
mod models;
mod services;

pub use commands::*;
use services::grpc_client::init_grpc_pool_cache;
use services::storage::StorageService;
use services::history_storage::HistoryStorage;
use services::ws_session_storage::WsSessionStorage;
use services::runner_history::RunnerHistory;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Initialize request registry for HTTP request cancellation
    let request_registry = commands::init_request_registry();
    // Initialize WebSocket connection registry
    let ws_registry = commands::init_ws_registry();
    // Initialize SSE connection registry
    let sse_registry = commands::init_sse_registry();
    // Initialize gRPC streaming connection registry
    let grpc_stream_registry = commands::init_grpc_stream_registry();
    // Initialize gRPC descriptor pool cache
    let grpc_pool_cache = init_grpc_pool_cache();
    // Initialize collection runner cancellation registry
    let runner_registry = commands::init_runner_registry();
    // Initialize mock server state
    let mock_server_state = commands::mock_server::MockServerState::new();
    // Initialize benchmark cancellation registry
    let benchmark_registry = commands::init_benchmark_registry();
    // Initialize GraphQL subscription registry
    let gql_sub_registry = commands::init_gql_sub_registry();
    // Initialize project directory state
    let project_dir_state: commands::ProjectDirState = std::sync::Arc::new(tokio::sync::Mutex::new(None));
    // Initialize file watcher state
    let file_watcher_state = services::file_watcher::init_file_watcher_state();
    // Initialize env file watcher state
    let env_file_watcher_state = services::file_watcher::init_env_file_watcher_state();

    tauri::Builder::default()
        // CRITICAL: Single instance plugin MUST be first
        .plugin(
            tauri_plugin_single_instance::init(|app, args, cwd| {
                println!("[Nouto] Second instance detected");
                println!("[Nouto] Args: {:?}", args);
                println!("[Nouto] CWD: {}", cwd);

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
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .setup(|app| {
            // Initialize StorageService with app data directory
            let app_data_dir = app.path().app_data_dir()
                .expect("Failed to resolve app data directory");
            let storage = StorageService::new(app_data_dir.clone());
            app.manage(storage);
            let history = HistoryStorage::new(app_data_dir.clone());
            app.manage(history);
            let ws_session_storage = WsSessionStorage::new(app_data_dir.clone());
            app.manage(ws_session_storage);
            let runner_history = RunnerHistory::new(app_data_dir);
            app.manage(runner_history);
            Ok(())
        })
        .manage(request_registry)
        .manage(ws_registry)
        .manage(sse_registry)
        .manage(grpc_stream_registry)
        .manage(grpc_pool_cache)
        .manage(runner_registry)
        .manage(mock_server_state)
        .manage(benchmark_registry)
        .manage(gql_sub_registry)
        .manage(project_dir_state)
        .manage(file_watcher_state)
        .manage(env_file_watcher_state)
        .invoke_handler(tauri::generate_handler![
            commands::ready,
            commands::load_data,
            commands::save_collections,
            commands::save_environments,
            commands::update_settings,
            commands::open_external,
            commands::history::get_history,
            commands::history::clear_history,
            commands::history::delete_history_entry,
            commands::history::save_history_to_collection,
            commands::history::get_history_entry,
            commands::history::get_history_stats,
            commands::history::get_request_history,
            commands::history::get_drawer_history,
            commands::history::export_history,
            commands::history::import_history,
            commands::greet,
            commands::http::send_request,
            commands::http::cancel_request,
            commands::http::pick_ssl_file,
            commands::http::select_file,
            commands::http::introspect_graphql,
            commands::grpc::grpc_reflect,
            commands::grpc::grpc_load_proto,
            commands::grpc::grpc_invoke,
            commands::grpc::grpc_send_message,
            commands::grpc::grpc_end_stream,
            commands::grpc::grpc_invalidate_pool,
            commands::grpc::grpc_commit_stream,
            commands::grpc::pick_proto_file,
            commands::grpc::pick_proto_import_dir,
            commands::grpc::scan_proto_dir,
            commands::websocket::ws_connect,
            commands::websocket::ws_send,
            commands::websocket::ws_disconnect,
            commands::websocket::ws_save_session,
            commands::websocket::ws_load_session_by_id,
            commands::websocket::ws_list_sessions,
            commands::websocket::ws_delete_session,
            commands::sse::sse_connect,
            commands::sse::sse_disconnect,
            commands::oauth::start_oauth_flow,
            commands::oauth::refresh_oauth_token,
            commands::oauth::clear_oauth_token,
            commands::runner::start_collection_run,
            commands::runner::cancel_collection_run,
            commands::runner::get_runner_history,
            commands::runner::get_runner_history_detail,
            commands::runner::delete_runner_history_entry,
            commands::runner::clear_runner_history,
            commands::runner::select_data_file,
            commands::mock_server::start_mock_server,
            commands::mock_server::stop_mock_server,
            commands::mock_server::update_mock_routes,
            commands::mock_server::clear_mock_logs,
            commands::benchmark::start_benchmark,
            commands::benchmark::cancel_benchmark,
            commands::secrets::store_secret,
            commands::secrets::get_secret,
            commands::secrets::delete_secret,
            commands::graphql_sub::gql_sub_subscribe,
            commands::graphql_sub::gql_sub_unsubscribe,
            commands::link_env_file,
            commands::unlink_env_file,
            commands::open_project_dir,
            commands::close_project,
            commands::get_recent_projects,
            commands::remove_recent_project,
            commands::clear_recent_projects_cmd,
            commands::open_recent_project,
            commands::create_project,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
