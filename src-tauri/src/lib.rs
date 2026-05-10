mod commands;
mod terminal;

use commands::*;
use std::sync::Arc;
use tauri::{Emitter, Manager};
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
            lsp_get_diagnostics,
            lsp_get_completions
        ])
        .run(tauri::generate_context!())
        .expect("error while running Recode");
}
