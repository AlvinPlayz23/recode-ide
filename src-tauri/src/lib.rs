use git2::{Repository, Status};
use notify::RecursiveMode;
use notify_debouncer_mini::{DebounceEventResult, Debouncer, new_debouncer};
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::fs;
use std::io::{BufRead, BufReader, Write};
use std::path::{Path, PathBuf};
use std::process::{Child, ChildStdin, Command, Stdio};
use std::sync::{Arc, Mutex};
use std::thread;
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

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct LspDiagnosticsRequest {
    file_path: String,
    content: String,
    language_id: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct LspCompletionsRequest {
    content: String,
    language_id: String,
    line: usize,
    character: usize,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct LspRangePosition {
    line: usize,
    character: usize,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct LspRange {
    start: LspRangePosition,
    end: LspRangePosition,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct RecodeDiagnostic {
    file_path: String,
    range: LspRange,
    severity: String,
    message: String,
    source: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct RecodeCompletionItem {
    label: String,
    detail: String,
    kind: String,
    insert_text: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct TerminalSpawnRequest {
    cwd: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct TerminalWriteRequest {
    session_id: String,
    input: String,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct TerminalOutputEvent {
    session_id: String,
    stream: String,
    text: String,
}

struct TerminalSession {
    child: Child,
    stdin: ChildStdin,
}

struct TerminalSessions {
    sessions: Mutex<HashMap<String, TerminalSession>>,
}

impl TerminalSessions {
    fn new() -> Self {
        Self {
            sessions: Mutex::new(HashMap::new()),
        }
    }
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
fn terminal_spawn(
    app: tauri::AppHandle,
    sessions: tauri::State<'_, Arc<TerminalSessions>>,
    request: TerminalSpawnRequest,
) -> Result<String, String> {
    let session_id = format!(
        "terminal-{}",
        SystemTime::now()
            .duration_since(SystemTime::UNIX_EPOCH)
            .map_err(|error| error.to_string())?
            .as_millis()
    );

    let mut command = if cfg!(target_os = "windows") {
        let mut command = Command::new("powershell");
        command.args(["-NoLogo", "-NoProfile"]);
        command
    } else {
        let mut command = Command::new("sh");
        command.arg("-i");
        command
    };

    if let Some(cwd) = request.cwd {
        command.current_dir(cwd);
    }

    let mut child = command
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|error| error.to_string())?;

    let stdin = child
        .stdin
        .take()
        .ok_or_else(|| "Terminal stdin unavailable".to_string())?;
    let stdout = child.stdout.take();
    let stderr = child.stderr.take();

    if let Some(stdout) = stdout {
        pipe_terminal_stream(app.clone(), session_id.clone(), "stdout", stdout);
    }
    if let Some(stderr) = stderr {
        pipe_terminal_stream(app.clone(), session_id.clone(), "stderr", stderr);
    }

    sessions
        .sessions
        .lock()
        .map_err(|_| "Terminal session lock poisoned".to_string())?
        .insert(session_id.clone(), TerminalSession { child, stdin });

    let _ = app.emit(
        "terminal-output",
        TerminalOutputEvent {
            session_id: session_id.clone(),
            stream: "system".to_string(),
            text: "Shell session started\n".to_string(),
        },
    );

    Ok(session_id)
}

#[tauri::command]
fn terminal_write(
    sessions: tauri::State<'_, Arc<TerminalSessions>>,
    request: TerminalWriteRequest,
) -> Result<(), String> {
    let mut guard = sessions
        .sessions
        .lock()
        .map_err(|_| "Terminal session lock poisoned".to_string())?;
    let session = guard
        .get_mut(&request.session_id)
        .ok_or_else(|| "Terminal session not found".to_string())?;
    session
        .stdin
        .write_all(request.input.as_bytes())
        .map_err(|error| error.to_string())?;
    session.stdin.flush().map_err(|error| error.to_string())?;
    Ok(())
}

#[tauri::command]
fn terminal_kill(
    sessions: tauri::State<'_, Arc<TerminalSessions>>,
    session_id: String,
) -> Result<(), String> {
    let mut guard = sessions
        .sessions
        .lock()
        .map_err(|_| "Terminal session lock poisoned".to_string())?;
    if let Some(mut session) = guard.remove(&session_id) {
        let _ = session.child.kill();
    }
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
fn lsp_get_diagnostics(request: LspDiagnosticsRequest) -> Result<Vec<RecodeDiagnostic>, String> {
    let mut diagnostics = Vec::new();
    let mut bracket_stack: Vec<(char, usize, usize)> = Vec::new();

    for (line_index, line) in request.content.lines().enumerate() {
        if let Some(column) = line.find("TODO") {
            diagnostics.push(RecodeDiagnostic {
                file_path: request.file_path.clone(),
                range: diagnostic_range(line_index, column, column + 4),
                severity: "info".to_string(),
                message: "TODO marker".to_string(),
                source: "recode-lsp".to_string(),
            });
        }

        for (character, value) in line.chars().enumerate() {
            match value {
                '(' | '[' | '{' => bracket_stack.push((value, line_index, character)),
                ')' | ']' | '}' => {
                    if !matches_bracket(bracket_stack.last().map(|entry| entry.0), value) {
                        diagnostics.push(RecodeDiagnostic {
                            file_path: request.file_path.clone(),
                            range: diagnostic_range(line_index, character, character + 1),
                            severity: "warning".to_string(),
                            message: format!("Unmatched closing bracket `{value}`"),
                            source: "recode-lsp".to_string(),
                        });
                    } else {
                        bracket_stack.pop();
                    }
                }
                _ => {}
            }
        }
    }

    if request.language_id == "json" {
        if let Err(error) = serde_json::from_str::<serde_json::Value>(&request.content) {
            diagnostics.push(RecodeDiagnostic {
                file_path: request.file_path,
                range: diagnostic_range(error.line().saturating_sub(1), error.column().saturating_sub(1), error.column()),
                severity: "error".to_string(),
                message: error.to_string(),
                source: "json".to_string(),
            });
            return Ok(diagnostics);
        }
    }

    for (_, line, character) in bracket_stack.into_iter().take(20) {
        diagnostics.push(RecodeDiagnostic {
            file_path: request.file_path.clone(),
            range: diagnostic_range(line, character, character + 1),
            severity: "warning".to_string(),
            message: "Unclosed bracket".to_string(),
            source: "recode-lsp".to_string(),
        });
    }

    Ok(diagnostics)
}

#[tauri::command]
fn lsp_get_completions(request: LspCompletionsRequest) -> Result<Vec<RecodeCompletionItem>, String> {
    let prefix = completion_prefix(&request.content, request.line, request.character);
    let keywords = completion_keywords(&request.language_id);
    Ok(keywords
        .into_iter()
        .filter(|label| prefix.is_empty() || label.starts_with(&prefix))
        .take(40)
        .map(|label| RecodeCompletionItem {
            label: label.to_string(),
            detail: format!("{} keyword", request.language_id),
            kind: "keyword".to_string(),
            insert_text: label.to_string(),
        })
        .collect())
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

fn pipe_terminal_stream<R>(app: tauri::AppHandle, session_id: String, stream: &'static str, reader: R)
where
    R: std::io::Read + Send + 'static,
{
    thread::spawn(move || {
        let reader = BufReader::new(reader);
        for line in reader.lines().map_while(Result::ok) {
            let _ = app.emit(
                "terminal-output",
                TerminalOutputEvent {
                    session_id: session_id.clone(),
                    stream: stream.to_string(),
                    text: format!("{line}\n"),
                },
            );
        }
    });
}

fn diagnostic_range(line: usize, start: usize, end: usize) -> LspRange {
    LspRange {
        start: LspRangePosition { line, character: start },
        end: LspRangePosition {
            line,
            character: end.max(start + 1),
        },
    }
}

fn matches_bracket(open: Option<char>, close: char) -> bool {
    matches!(
        (open, close),
        (Some('('), ')') | (Some('['), ']') | (Some('{'), '}')
    )
}

fn completion_prefix(content: &str, line: usize, character: usize) -> String {
    let line_text = content.lines().nth(line).unwrap_or_default();
    let prefix_end = character.min(line_text.len());
    let before_cursor = &line_text[..prefix_end];
    before_cursor
        .chars()
        .rev()
        .take_while(|value| value.is_ascii_alphanumeric() || *value == '_')
        .collect::<String>()
        .chars()
        .rev()
        .collect()
}

fn completion_keywords(language_id: &str) -> Vec<&'static str> {
    match language_id {
        "rust" => vec![
            "async", "await", "break", "const", "continue", "crate", "enum", "fn", "impl", "let",
            "match", "mod", "move", "mut", "pub", "return", "self", "struct", "trait", "use",
            "where",
        ],
        "typescript" | "typescriptreact" => vec![
            "async", "await", "const", "export", "extends", "function", "import", "interface",
            "let", "return", "type", "useEffect", "useRef", "useState",
        ],
        "json" => vec!["false", "null", "true"],
        "css" => vec!["display", "flex", "grid", "position", "color", "background", "border"],
        _ => vec!["TODO", "fixme", "note"],
    }
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
            terminal_run,
            terminal_spawn,
            terminal_write,
            terminal_kill,
            lsp_start,
            lsp_request,
            lsp_get_diagnostics,
            lsp_get_completions,
            ai_set_token,
            ai_get_token
        ])
        .run(tauri::generate_context!())
        .expect("error while running Recode");
}
