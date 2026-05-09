use serde::Serialize;
use std::fs;
use std::path::{Path, PathBuf};
use tauri::Emitter;
use tauri_plugin_dialog::DialogExt;
use walkdir::WalkDir;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ProjectFile {
    path: String,
    relative_path: String,
    name: String,
    kind: String,
    depth: usize,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ProjectOpenResult {
    root_path: String,
    files: Vec<ProjectFile>,
}

#[tauri::command]
async fn project_open_folder(app: tauri::AppHandle) -> Result<Option<ProjectOpenResult>, String> {
    let selected = tauri::async_runtime::spawn_blocking(move || {
        app.dialog()
            .file()
            .blocking_pick_folder()
            .map(|path| {
                path.into_path()
                    .map_err(|error| format!("Failed to resolve selected folder path: {error}"))
            })
            .transpose()
    })
    .await
    .map_err(|error| format!("Folder dialog task failed: {error}"))??;

    Ok(selected.map(|root| ProjectOpenResult {
        root_path: root.to_string_lossy().to_string(),
        files: list_project_files(&root),
    }))
}

#[tauri::command]
fn fs_read_file(path: String) -> Result<String, String> {
    fs::read_to_string(path).map_err(|error| error.to_string())
}

#[tauri::command]
fn fs_write_file(path: String, content: String) -> Result<(), String> {
    fs::write(path, content).map_err(|error| error.to_string())
}

#[tauri::command]
fn fs_list_files(root_path: String) -> Result<Vec<ProjectFile>, String> {
    let root = PathBuf::from(&root_path);
    if !root.is_dir() {
        return Err("Workspace root is not a directory".to_string());
    }

    Ok(list_project_files(&root))
}

#[tauri::command]
fn git_status() -> Result<Vec<String>, String> {
    Ok(vec![])
}

#[tauri::command]
fn git_diff(_path: String) -> Result<String, String> {
    Ok(String::new())
}

#[tauri::command]
fn terminal_spawn() -> Result<String, String> {
    Ok("terminal-placeholder".to_string())
}

#[tauri::command]
fn terminal_write(_session_id: String, _input: String) -> Result<(), String> {
    Ok(())
}

#[tauri::command]
fn lsp_start(_workspace_path: String, _language_id: String) -> Result<String, String> {
    Ok("lsp-placeholder".to_string())
}

#[tauri::command]
fn lsp_request(_session_id: String, _method: String, _params: serde_json::Value) -> Result<serde_json::Value, String> {
    Ok(serde_json::json!({ "ok": true }))
}

#[tauri::command]
fn ai_set_token(_provider_id: String, _token: String) -> Result<(), String> {
    Ok(())
}

#[tauri::command]
fn ai_get_token(_provider_id: String) -> Result<Option<String>, String> {
    Ok(None)
}

fn list_project_files(root: &Path) -> Vec<ProjectFile> {
    let mut files: Vec<ProjectFile> = WalkDir::new(root)
        .max_depth(4)
        .into_iter()
        .filter_entry(|entry| {
            let name = entry.file_name().to_string_lossy();
            !matches!(name.as_ref(), ".git" | "node_modules" | "target" | "dist" | ".next")
        })
        .filter_map(Result::ok)
        .filter(|entry| entry.path() != root)
        .take(500)
        .map(|entry| {
            let path = entry.path();
            let relative = path.strip_prefix(root).unwrap_or(path);
            ProjectFile {
                path: path.to_string_lossy().to_string(),
                relative_path: relative.to_string_lossy().replace('\\', "/"),
                name: entry.file_name().to_string_lossy().to_string(),
                kind: if path.is_dir() { "directory" } else { "file" }.to_string(),
                depth: relative.components().count().saturating_sub(1),
            }
        })
        .collect();

    files.sort_by(|a, b| {
        let a_key = (a.relative_path.to_lowercase(), a.kind.as_str() != "directory");
        let b_key = (b.relative_path.to_lowercase(), b.kind.as_str() != "directory");
        a_key.cmp(&b_key)
    });

    files
}

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
        .invoke_handler(tauri::generate_handler![
            project_open_folder,
            fs_read_file,
            fs_write_file,
            fs_list_files,
            git_status,
            git_diff,
            terminal_spawn,
            terminal_write,
            lsp_start,
            lsp_request,
            ai_set_token,
            ai_get_token
        ])
        .run(tauri::generate_context!())
        .expect("error while running Recode");
}
