use git2::{Repository, Status};
use notify::RecursiveMode;
use notify_debouncer_mini::{DebounceEventResult, Debouncer, new_debouncer};
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::{Arc, Mutex};
use std::time::{Duration, SystemTime};
use tauri::Emitter;
use tauri::Manager;
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

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct GitStatusPayload {
    branch: String,
    files: Vec<GitFileStatus>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct GitFileStatus {
    path: String,
    status: String,
    staged: bool,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct TerminalCommandRequest {
    command: String,
    cwd: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct TerminalCommandOutput {
    code: Option<i32>,
    stdout: String,
    stderr: String,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct FileChangeEvent {
    path: String,
    event_type: FileChangeType,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "snake_case")]
enum FileChangeType {
    Opened,
    Reloaded,
    Deleted,
}

struct FileWatcher {
    app: tauri::AppHandle,
    debouncer: Mutex<Option<Debouncer<notify::RecommendedWatcher>>>,
    watched_paths: Arc<Mutex<HashSet<PathBuf>>>,
    watched_directories: Arc<Mutex<HashSet<PathBuf>>>,
    known_files: Arc<Mutex<HashMap<PathBuf, SystemTime>>>,
}

impl FileWatcher {
    fn new(app: tauri::AppHandle) -> Self {
        Self {
            app,
            debouncer: Mutex::new(None),
            watched_paths: Arc::new(Mutex::new(HashSet::new())),
            watched_directories: Arc::new(Mutex::new(HashSet::new())),
            known_files: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    fn watch_project_root(&self, path: String) -> Result<(), String> {
        self.watch_path(path, false)
    }

    fn watch_path(&self, path: String, recursive: bool) -> Result<(), String> {
        let path_buf = PathBuf::from(&path);
        if !path_buf.exists() {
            return Err(format!("Path does not exist: {path}"));
        }

        self.ensure_debouncer()?;

        let mut watched_paths = self
            .watched_paths
            .lock()
            .map_err(|_| "File watcher lock poisoned".to_string())?;
        if watched_paths.contains(&path_buf) {
            return Ok(());
        }

        self.setup_path_watching(&path_buf, recursive)?;
        watched_paths.insert(path_buf.clone());
        self.emit(FileChangeEvent {
            path: path_buf.to_string_lossy().to_string(),
            event_type: FileChangeType::Opened,
        });
        Ok(())
    }

    fn stop_watching(&self, path: String) -> Result<(), String> {
        let path_buf = PathBuf::from(path);
        self
            .watched_paths
            .lock()
            .map_err(|_| "File watcher lock poisoned".to_string())?
            .remove(&path_buf);
        self
            .watched_directories
            .lock()
            .map_err(|_| "File watcher lock poisoned".to_string())?
            .remove(&path_buf);
        self
            .known_files
            .lock()
            .map_err(|_| "File watcher lock poisoned".to_string())?
            .remove(&path_buf);

        if let Some(debouncer) = self
            .debouncer
            .lock()
            .map_err(|_| "File watcher lock poisoned".to_string())?
            .as_mut()
        {
            debouncer
                .watcher()
                .unwatch(&path_buf)
                .map_err(|error| error.to_string())?;
        }

        Ok(())
    }

    fn ensure_debouncer(&self) -> Result<(), String> {
        let mut debouncer_guard = self
            .debouncer
            .lock()
            .map_err(|_| "File watcher lock poisoned".to_string())?;
        if debouncer_guard.is_some() {
            return Ok(());
        }

        let app = self.app.clone();
        let watched_paths = Arc::clone(&self.watched_paths);
        let watched_directories = Arc::clone(&self.watched_directories);
        let known_files = Arc::clone(&self.known_files);

        let debouncer = new_debouncer(Duration::from_millis(300), move |result: DebounceEventResult| {
            let Ok(events) = result else { return };
            let Ok(paths) = watched_paths.lock() else { return };
            let Ok(directories) = watched_directories.lock() else { return };

            for event in events {
                if !paths.contains(&event.path)
                    && !directories.iter().any(|directory| event.path.starts_with(directory))
                {
                    continue;
                }

                if let Some(event_type) = determine_file_change_type(&event.path, &known_files) {
                    let _ = app.emit(
                        "file-changed",
                        FileChangeEvent {
                            path: event.path.to_string_lossy().to_string(),
                            event_type,
                        },
                    );
                }
            }
        })
        .map_err(|error| error.to_string())?;

        *debouncer_guard = Some(debouncer);
        Ok(())
    }

    fn setup_path_watching(&self, path: &Path, recursive: bool) -> Result<(), String> {
        let recursive_mode = if path.is_dir() && recursive {
            RecursiveMode::Recursive
        } else {
            RecursiveMode::NonRecursive
        };

        let mut debouncer_guard = self
            .debouncer
            .lock()
            .map_err(|_| "File watcher lock poisoned".to_string())?;
        let debouncer = debouncer_guard
            .as_mut()
            .ok_or_else(|| "File watcher not initialized".to_string())?;
        debouncer
            .watcher()
            .watch(path, recursive_mode)
            .map_err(|error| error.to_string())?;

        if path.is_dir() {
            self
                .watched_directories
                .lock()
                .map_err(|_| "File watcher lock poisoned".to_string())?
                .insert(path.to_path_buf());
            remember_child_file_mtimes(path, &self.known_files);
        } else {
            remember_file_mtime(path, &self.known_files);
        }

        Ok(())
    }

    fn emit(&self, event: FileChangeEvent) {
        let _ = self.app.emit("file-changed", event);
    }
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
fn fs_create_file(parent_path: String, name: String) -> Result<String, String> {
    let path = PathBuf::from(parent_path).join(clean_child_name(&name)?);
    if path.exists() {
        return Err("A file or folder with that name already exists".to_string());
    }

    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }
    fs::write(&path, "").map_err(|error| error.to_string())?;
    Ok(path.to_string_lossy().to_string())
}

#[tauri::command]
fn fs_create_directory(parent_path: String, name: String) -> Result<String, String> {
    let path = PathBuf::from(parent_path).join(clean_child_name(&name)?);
    if path.exists() {
        return Err("A file or folder with that name already exists".to_string());
    }

    fs::create_dir_all(&path).map_err(|error| error.to_string())?;
    Ok(path.to_string_lossy().to_string())
}

#[tauri::command]
fn fs_rename_path(path: String, new_name: String) -> Result<String, String> {
    let current = PathBuf::from(path);
    let parent = current
        .parent()
        .ok_or_else(|| "Cannot rename path without a parent".to_string())?;
    let next = parent.join(clean_child_name(&new_name)?);
    if next.exists() {
        return Err("A file or folder with that name already exists".to_string());
    }

    fs::rename(&current, &next).map_err(|error| error.to_string())?;
    Ok(next.to_string_lossy().to_string())
}

#[tauri::command]
fn fs_delete_path(path: String) -> Result<(), String> {
    let path = PathBuf::from(path);
    if path.is_dir() {
        fs::remove_dir_all(path).map_err(|error| error.to_string())
    } else {
        fs::remove_file(path).map_err(|error| error.to_string())
    }
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
fn set_project_root(path: String, watcher: tauri::State<'_, Arc<FileWatcher>>) -> Result<(), String> {
    watcher.watch_project_root(path)
}

#[tauri::command]
fn start_watching(path: String, watcher: tauri::State<'_, Arc<FileWatcher>>) -> Result<(), String> {
    watcher.watch_path(path, true)
}

#[tauri::command]
fn stop_watching(path: String, watcher: tauri::State<'_, Arc<FileWatcher>>) -> Result<(), String> {
    watcher.stop_watching(path)
}

#[tauri::command]
fn git_status(repo_path: String) -> Result<Option<GitStatusPayload>, String> {
    let repo = match Repository::discover(&repo_path) {
        Ok(repo) => repo,
        Err(_) => return Ok(None),
    };

    let branch = repo
        .head()
        .ok()
        .and_then(|head| head.shorthand().map(ToString::to_string))
        .unwrap_or_else(|| "HEAD".to_string());

    let statuses = repo.statuses(None).map_err(|error| error.to_string())?;
    let mut files = Vec::new();

    for entry in statuses.iter() {
        let Some(path) = entry.path() else { continue };
        let flags = entry.status();
        if flags == Status::CURRENT {
            continue;
        }

        let staged = flags.intersects(
            Status::INDEX_NEW
                | Status::INDEX_MODIFIED
                | Status::INDEX_DELETED
                | Status::INDEX_RENAMED
                | Status::INDEX_TYPECHANGE,
        );
        let unstaged = flags.intersects(
            Status::WT_NEW
                | Status::WT_MODIFIED
                | Status::WT_DELETED
                | Status::WT_RENAMED
                | Status::WT_TYPECHANGE,
        );

        if staged {
            files.push(GitFileStatus {
                path: path.to_string(),
                status: status_label(flags, true),
                staged: true,
            });
        }

        if unstaged {
            files.push(GitFileStatus {
                path: path.to_string(),
                status: status_label(flags, false),
                staged: false,
            });
        }
    }

    Ok(Some(GitStatusPayload { branch, files }))
}

#[tauri::command]
fn git_diff(repo_path: String, path: Option<String>) -> Result<String, String> {
    let repo = Repository::discover(repo_path).map_err(|error| error.to_string())?;
    let workdir = repo
        .workdir()
        .ok_or_else(|| "Repository has no working directory".to_string())?;
    let mut command = Command::new("git");
    command.arg("diff");
    if let Some(path) = path {
        command.arg("--").arg(path);
    }
    let output = command
        .current_dir(workdir)
        .output()
        .map_err(|error| error.to_string())?;
    Ok(String::from_utf8_lossy(&output.stdout).to_string())
}

#[tauri::command]
fn terminal_run(request: TerminalCommandRequest) -> Result<TerminalCommandOutput, String> {
    let cwd = request.cwd.unwrap_or_else(|| ".".to_string());
    let output = if cfg!(target_os = "windows") {
        Command::new("powershell")
            .args(["-NoLogo", "-NoProfile", "-Command", &request.command])
            .current_dir(cwd)
            .output()
    } else {
        Command::new("sh")
            .args(["-lc", &request.command])
            .current_dir(cwd)
            .output()
    }
    .map_err(|error| error.to_string())?;

    Ok(TerminalCommandOutput {
        code: output.status.code(),
        stdout: String::from_utf8_lossy(&output.stdout).to_string(),
        stderr: String::from_utf8_lossy(&output.stderr).to_string(),
    })
}

#[tauri::command]
fn terminal_spawn() -> Result<String, String> {
    Ok("command-terminal".to_string())
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

fn clean_child_name(name: &str) -> Result<String, String> {
    let trimmed = name.trim();
    if trimmed.is_empty() {
        return Err("Name cannot be empty".to_string());
    }
    if trimmed.contains('/') || trimmed.contains('\\') || trimmed == "." || trimmed == ".." {
        return Err("Name must be a direct child name".to_string());
    }
    Ok(trimmed.to_string())
}

fn remember_child_file_mtimes(path: &Path, known_files: &Arc<Mutex<HashMap<PathBuf, SystemTime>>>) {
    let Ok(entries) = fs::read_dir(path) else { return };
    for entry in entries.flatten() {
        let child_path = entry.path();
        if child_path.is_file() {
            remember_file_mtime(&child_path, known_files);
        }
    }
}

fn remember_file_mtime(path: &Path, known_files: &Arc<Mutex<HashMap<PathBuf, SystemTime>>>) {
    let Ok(metadata) = fs::metadata(path) else { return };
    let Ok(modified) = metadata.modified() else { return };
    if let Ok(mut files) = known_files.lock() {
        files.insert(path.to_path_buf(), modified);
    }
}

fn determine_file_change_type(
    path: &Path,
    known_files: &Arc<Mutex<HashMap<PathBuf, SystemTime>>>,
) -> Option<FileChangeType> {
    let Ok(mut files) = known_files.lock() else { return None };
    let path_buf = path.to_path_buf();

    if !path.exists() {
        files.remove(&path_buf);
        return Some(FileChangeType::Deleted);
    }

    let Ok(metadata) = fs::metadata(path) else {
        return Some(FileChangeType::Reloaded);
    };
    if metadata.is_dir() {
        return Some(FileChangeType::Opened);
    }

    let modified = metadata.modified().unwrap_or_else(|_| SystemTime::now());
    match files.get(&path_buf) {
        Some(previous) if *previous == modified => None,
        Some(_) => {
            files.insert(path_buf, modified);
            Some(FileChangeType::Reloaded)
        }
        None => {
            files.insert(path_buf, modified);
            Some(FileChangeType::Opened)
        }
    }
}

fn status_label(flags: Status, staged: bool) -> String {
    if staged {
        if flags.contains(Status::INDEX_NEW) {
            return "added".to_string();
        }
        if flags.contains(Status::INDEX_DELETED) {
            return "deleted".to_string();
        }
        if flags.contains(Status::INDEX_RENAMED) {
            return "renamed".to_string();
        }
        return "modified".to_string();
    }

    if flags.contains(Status::WT_NEW) {
        return "untracked".to_string();
    }
    if flags.contains(Status::WT_DELETED) {
        return "deleted".to_string();
    }
    if flags.contains(Status::WT_RENAMED) {
        return "renamed".to_string();
    }
    "modified".to_string()
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
        .setup(|app| {
            app.manage(Arc::new(FileWatcher::new(app.handle().clone())));
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
            terminal_run,
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
