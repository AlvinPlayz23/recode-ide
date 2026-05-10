mod commands;
mod terminal;

use commands::*;
use std::sync::Arc;
use tauri::{Emitter, Manager};
use commands::development::lsp::commands::LspDocuments;
use terminal::TerminalSessions;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_log::Builder::new().build())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_single_instance::init(|app, argv, cwd| {
            let _ = app.emit("single-instance", serde_json::json!({ "argv": argv, "cwd": cwd }));
        }))
        .plugin(tauri_plugin_store::Builder::new().build());

    #[cfg(not(any(target_os = "android", target_os = "ios")))]
    let builder = builder.plugin(tauri_plugin_window_state::Builder::default().build());

    builder
        .setup(|app| {
            app.manage(Arc::new(FileWatcher::new(app.handle().clone())));
            app.manage(Arc::new(TerminalSessions::new()));
            app.manage(Arc::new(LspDocuments::new()));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            project_open_folder,
            fs_read_file,
            fs_write_file,
            fs_create_file,
            fs_create_directory,
            fs_rename_path,
            fs_delete_path,
            fs_list_files,
            set_project_root,
            start_watching,
            stop_watching,
            git_status,
            git_diff,
            terminal::terminal_run,
            terminal::terminal_spawn,
            terminal::terminal_write,
            terminal::terminal_kill,
            lsp_document_open,
            lsp_document_change,
            lsp_document_save,
            lsp_document_close,
            lsp_get_diagnostics,
            lsp_get_completions,
            lsp_get_document_symbols,
            lsp_get_hover,
            lsp_get_definition,
            lsp_get_references,
            lsp_rename,
            lsp_format_document,
            lsp_get_signature_help,
            lsp_get_inlay_hints,
            lsp_get_semantic_tokens,
            lsp_get_code_actions
        ])
        .run(tauri::generate_context!())
        .expect("error while running Recode");
}
