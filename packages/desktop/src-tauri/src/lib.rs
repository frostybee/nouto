// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/

mod commands;
pub mod error;
mod models;
mod services;
mod state;
mod tray;

pub use commands::*;
use services::grpc_client::init_grpc_pool_cache;
use services::history_storage::HistoryStorage;
use services::runner_history::RunnerHistory;
use services::storage::StorageService;
use services::ws_session_storage::WsSessionStorage;
use state::AppState;
use std::sync::atomic::Ordering;
use tauri::{Emitter, Listener, Manager};

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
    let project_dir_state: commands::ProjectDirState =
        std::sync::Arc::new(tokio::sync::Mutex::new(None));
    // Initialize file watcher state
    let file_watcher_state = services::file_watcher::init_file_watcher_state();
    let last_write_timestamp = services::file_watcher::init_last_write_timestamp();
    // Initialize env file watcher state
    let env_file_watcher_state = services::file_watcher::init_env_file_watcher_state();
    // Initialize OpenAPI meta-schema validator cache
    let schema_validator_cache = commands::openapi::init_schema_validator_cache();

    tauri::Builder::default()
        // CRITICAL: Single instance plugin MUST be first
        .plugin(tauri_plugin_single_instance::init(|app, args, cwd| {
            log::info!("Second instance detected");
            log::debug!("Second instance args: {:?}", args);
            log::debug!("Second instance cwd: {}", cwd);

            // Restore and focus the existing window
            #[cfg(desktop)]
            {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.unminimize();
                    let _ = window.show();
                    let _ = window.set_focus();
                }
            }
        }))
        // Logging goes second so every later plugin's setup is captured.
        .plugin({
            #[allow(unused_mut)]
            let mut targets = vec![
                tauri_plugin_log::Target::new(tauri_plugin_log::TargetKind::Stdout),
                tauri_plugin_log::Target::new(tauri_plugin_log::TargetKind::LogDir {
                    file_name: None,
                }),
            ];
            // Excluded on Linux where WebKitGTK's webview does not exist during
            // setup(), and app.emit() deadlocks on the IPC socket.
            #[cfg(not(target_os = "linux"))]
            targets.push(tauri_plugin_log::Target::new(
                tauri_plugin_log::TargetKind::Webview,
            ));
            // Third-party crates (rustls, keyring, tao) stay at Info; only the
            // app crate gets Debug in dev builds.
            tauri_plugin_log::Builder::new()
                .level(log::LevelFilter::Info)
                .level_for(
                    "nouto_lib",
                    if cfg!(debug_assertions) {
                        log::LevelFilter::Debug
                    } else {
                        log::LevelFilter::Info
                    },
                )
                .targets(targets)
                .build()
        })
        // Window geometry (size, position, maximized) persists across launches.
        // The Settings window is created fresh each time and is left out.
        .plugin(
            tauri_plugin_window_state::Builder::new()
                .with_state_flags(
                    tauri_plugin_window_state::StateFlags::SIZE
                        | tauri_plugin_window_state::StateFlags::POSITION
                        | tauri_plugin_window_state::StateFlags::MAXIMIZED,
                )
                .with_denylist(&["settings"])
                .build(),
        )
        // Global hotkey: one handler; registration is driven by the frontend
        // from the saved setting (commands/global_shortcut.rs).
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(commands::global_shortcut::handle_shortcut_event)
                .build(),
        )
        // Launch at login. The OS registration is the source of truth; the
        // Settings page reads isEnabled() live rather than mirroring a flag.
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            None,
        ))
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_os::init())
        .manage(AppState::default())
        .on_window_event(|window, event| {
            if window.label() != "main" {
                return;
            }
            match event {
                // Two-phase close: Rust prevents the close and asks the frontend
                // to run its unsaved-changes prompt and flush debounced saves.
                // The frontend then hides (macOS) or calls `quit_app`, which sets
                // `force_close` so teardown is not intercepted again.
                tauri::WindowEvent::CloseRequested { api, .. } => {
                    let state = window.state::<AppState>();
                    if !state.force_close.load(Ordering::SeqCst) {
                        api.prevent_close();
                        let _ = window.emit(
                            "app:close-requested",
                            commands::lifecycle::CloseRequest::for_current_platform(),
                        );
                    }
                }
                // Auxiliary windows (Settings) are independent top-level windows, so
                // closing the main window would otherwise leave them and the process
                // alive.
                tauri::WindowEvent::Destroyed => {
                    for (label, w) in window.app_handle().webview_windows() {
                        if label != "main" {
                            let _ = w.destroy();
                        }
                    }
                }
                _ => {}
            }
        })
        .setup(|app| {
            // Initialize StorageService with app data directory
            let app_data_dir = app
                .path()
                .app_data_dir()
                .expect("Failed to resolve app data directory");
            let storage = StorageService::new(app_data_dir.clone());
            app.manage(storage);
            let history = HistoryStorage::new(app_data_dir.clone());
            app.manage(history);
            let ws_session_storage = WsSessionStorage::new(app_data_dir.clone());
            app.manage(ws_session_storage);
            let runner_history = RunnerHistory::new(app_data_dir);
            app.manage(runner_history);

            // Set window icon (needed for dev mode; production uses bundle icon)
            if let Some(main_window) = app.get_webview_window("main") {
                if let Ok(icon) =
                    tauri::image::Image::from_bytes(include_bytes!("../icons/icon.png"))
                {
                    let _ = main_window.set_icon(icon);
                }
            }

            // No tray is a cosmetic loss, not a reason to abort startup.
            if let Err(e) = tray::init_tray(app.handle()) {
                log::warn!("Tray icon unavailable: {e}");
            }

            // Listen for deep-link URLs (nouto:// protocol)
            let app_handle = app.handle().clone();
            app.listen("deep-link://new-url", move |event| {
                let payload = event.payload();
                log::info!("Deep link received: {}", payload);
                // Forward the deep-link URL to the frontend
                let _ = app_handle.emit("deepLinkReceived", payload);
            });

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
        .manage(last_write_timestamp)
        .manage(env_file_watcher_state)
        .manage(schema_validator_cache)
        .manage(commands::oauth::PendingOAuth::default())
        .invoke_handler(tauri::generate_handler![
            commands::ready,
            commands::load_data,
            commands::lifecycle::quit_app,
            commands::global_shortcut::register_global_shortcut,
            commands::global_shortcut::unregister_global_shortcut,
            commands::save_collections,
            commands::save_environments,
            commands::save_trash,
            commands::get_settings,
            commands::update_settings,
            commands::create_settings_window,
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
            commands::oauth::oauth_deep_link_callback,
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
            commands::project::link_env_file,
            commands::project::unlink_env_file,
            commands::project::open_project_dir,
            commands::project::close_project,
            commands::project::get_recent_projects,
            commands::project::remove_recent_project,
            commands::project::clear_recent_projects_cmd,
            commands::project::open_recent_project,
            commands::project::create_project,
            commands::project::get_workspace_meta,
            commands::project::update_workspace_meta,
            commands::project::delete_workspace_meta,
            commands::fonts::list_fonts,
            commands::backup::export_backup,
            commands::backup::import_backup,
            commands::updater::get_install_type,
            commands::updater::is_update_supported,
            commands::openapi::validate_openapi_schema,
            commands::openapi::validate_openapi_examples,
            commands::openapi::openapi_proxy_fetch,
            commands::openapi::read_openapi_ref_file,
            commands::openapi::write_openapi_ref_file,
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app_handle, event| match event {
            // macOS keeps the process alive after the main window is hidden, so a
            // dock-icon click has to bring it back itself.
            #[cfg(target_os = "macos")]
            tauri::RunEvent::Reopen {
                has_visible_windows,
                ..
            } => {
                if !has_visible_windows {
                    if let Some(window) = app_handle.get_webview_window("main") {
                        let _ = window.unminimize();
                        let _ = window.show();
                        let _ = window.set_focus();
                    }
                }
            }
            tauri::RunEvent::Exit => {
                commands::global_shortcut::unregister_all(app_handle);
            }
            _ => {}
        });
}
