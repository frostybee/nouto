# Commands and shortcuts

## Tauri commands by module

Every command below is registered in `generate_handler!` in `packages/desktop/src-tauri/src/lib.rs` and implemented in the matching `commands/*.rs` file.

| Module | What it covers |
|---|---|
| top-level (`commands/mod.rs`) | `ready`, `load_data`, `save_collections`, `save_environments`, `save_trash`, `get_settings`, `update_settings`, `create_settings_window`, `open_external` |
| `lifecycle` | `quit_app` — see [persistence-and-recovery.md](./persistence-and-recovery.md) for the close handshake |
| `recovery` | `save_emergency_data`, `cleanup_old_recovery_files` — crash dumps |
| `global_shortcut` | `register_global_shortcut`, `unregister_global_shortcut` |
| `history` | request history CRUD: get, clear, delete, save-to-collection, stats, export, import |
| `http` | `send_request`, `cancel_request`, `pick_ssl_file`, `select_file`, `introspect_graphql` |
| `grpc` | reflection, proto loading/scanning, invoke, streaming (send/end/commit), connection pool management |
| `websocket` | connect, send, disconnect, session save/load/list/delete |
| `sse` | `sse_connect`, `sse_disconnect` |
| `oauth` | `start_oauth_flow`, `refresh_oauth_token`, `clear_oauth_token`, `oauth_deep_link_callback` |
| `runner` | collection runner: start, cancel, history (list/detail/delete/clear), data file selection |
| `mock_server` | start, stop, update routes, clear logs |
| `benchmark` | `start_benchmark`, `cancel_benchmark` |
| `secrets` | `store_secret`, `get_secret`, `delete_secret` — thin OS keychain wrappers |
| `graphql_sub` | `gql_sub_subscribe`, `gql_sub_unsubscribe` |
| `project` | project directory / recent-projects / workspace metadata management |
| `fonts` | `list_fonts` |
| `backup` | `export_backup`, `import_backup` |
| `updater` | `get_install_type`, `is_update_supported` |
| `openapi` | schema/example validation, proxy fetch, external `$ref` file read/write |

On the frontend, a message reaches one of these commands only if its `type` is listed in `RUST_COMMAND_TYPES` in `src/lib/tauri.ts`; see [architecture-guide.md](./architecture-guide.md) for the naming convention.

## Global shortcut ("bring Nouto to front")

`commands/global_shortcut.rs` registers/unregisters an OS-level global accelerator via `tauri-plugin-global-shortcut`. The saved shortcut (setting key `desktop.globalShortcut`) is re-registered at startup; when the user records a new one in Settings, the frontend (`src/lib/global-shortcut.ts`) unregisters the old accelerator and registers the new one, rolling back to the previous value if registration fails (for example, a conflict with another app's global shortcut).

This is separate from the in-app command-shortcut system (`packages/ui/src/lib/shortcuts.ts`), which binds keyboard combos to app commands while the window has focus and is shared with the VS Code extension.

## Browser-key suppression

Tauri's WebView2/WebKitGTK-based windows still respond to some browser chrome shortcuts (Ctrl+F for find, Ctrl+P for print, F5/Ctrl+R for reload) unless the app intercepts them. `src/lib/browser-keys.ts` registers a capture-phase `keydown` listener that calls `preventDefault()` on those combos without stopping propagation, so the app's own shortcut dispatcher still runs normally for keys Nouto actually binds.
