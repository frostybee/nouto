use font_loader::system_fonts;
use serde::Serialize;
use std::collections::HashSet;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FontList {
    pub editor_fonts: Vec<String>,
    pub ui_fonts: Vec<String>,
}

/// List all available system fonts, split into monospace (editor) and proportional (UI) groups.
#[tauri::command]
pub async fn list_fonts() -> Result<FontList, crate::error::AppError> {
    let mut ui_fonts = HashSet::new();
    let mut editor_fonts = HashSet::new();

    let mut property = system_fonts::FontPropertyBuilder::new().monospace().build();
    for font in &system_fonts::query_specific(&mut property) {
        editor_fonts.insert(font.to_string());
    }
    for font in &system_fonts::query_all() {
        if !editor_fonts.contains(font) {
            ui_fonts.insert(font.to_string());
        }
    }

    let mut ui_fonts: Vec<String> = ui_fonts.into_iter().collect();
    let mut editor_fonts: Vec<String> = editor_fonts.into_iter().collect();

    ui_fonts.sort();
    editor_fonts.sort();

    Ok(FontList { ui_fonts, editor_fonts })
}
