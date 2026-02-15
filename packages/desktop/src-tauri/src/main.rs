// Prevents additional console window on Windows in release mode
#![cfg_attr(
    all(not(debug_assertions), target_os = "windows"),
    windows_subsystem = "windows"
)]

fn main() {
    hivefetch_lib::run();
}
