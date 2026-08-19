use std::sync::atomic::Ordering;

use tauri::State;

use crate::state::AppState;

#[tauri::command]
pub fn set_has_unsaved_changes(state: State<AppState>, dirty: bool) {
    state.has_unsaved_changes.store(dirty, Ordering::SeqCst);
}

#[tauri::command]
pub fn has_unsaved_changes(state: State<AppState>) -> bool {
    state.has_unsaved_changes.load(Ordering::SeqCst)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn dirty_flag_defaults_to_false() {
        let state = AppState::default();
        assert!(!state.has_unsaved_changes.load(Ordering::SeqCst));
    }

    #[test]
    fn dirty_flag_round_trips() {
        let state = AppState::default();
        state.has_unsaved_changes.store(true, Ordering::SeqCst);
        assert!(state.has_unsaved_changes.load(Ordering::SeqCst));
        state.has_unsaved_changes.store(false, Ordering::SeqCst);
        assert!(!state.has_unsaved_changes.load(Ordering::SeqCst));
    }
}
