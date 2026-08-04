// Shared jsdom setup for desktop unit tests. Module mocks for the Tauri
// plugins (@tauri-apps/plugin-dialog, plugin-fs, api/*) live in the test
// files that need them — vi.mock only affects the file that calls it.
