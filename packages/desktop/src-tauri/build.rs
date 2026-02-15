fn main() {
    // For Phase 1, skip Windows resource file embedding to avoid icon format issues
    // Icons will be properly configured in Phase 10 (Packaging)
    #[cfg(all(windows, debug_assertions))]
    {
        println!("cargo:rustc-env=TAURI_SKIP_EMBEDDED_APP_ICON=true");
    }

    tauri_build::build()
}
