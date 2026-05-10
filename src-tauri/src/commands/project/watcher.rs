use notify::RecursiveMode;
use notify_debouncer_mini::{new_debouncer, DebounceEventResult, Debouncer};
use serde::Serialize;
use std::collections::{HashMap, HashSet};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use std::time::{Duration, SystemTime};
use tauri::Emitter;

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

pub struct FileWatcher {
    app: tauri::AppHandle,
    debouncer: Mutex<Option<Debouncer<notify::RecommendedWatcher>>>,
    watched_paths: Arc<Mutex<HashSet<PathBuf>>>,
    watched_directories: Arc<Mutex<HashSet<PathBuf>>>,
    known_files: Arc<Mutex<HashMap<PathBuf, SystemTime>>>,
}

impl FileWatcher {
    pub fn new(app: tauri::AppHandle) -> Self {
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
        self.watched_paths
            .lock()
            .map_err(|_| "File watcher lock poisoned".to_string())?
            .remove(&path_buf);
        self.watched_directories
            .lock()
            .map_err(|_| "File watcher lock poisoned".to_string())?
            .remove(&path_buf);
        self.known_files
            .lock()
            .map_err(|_| "File watcher lock poisoned".to_string())?
            .remove(&path_buf);

        if let Some(debouncer) = self.debouncer.lock().map_err(|_| "File watcher lock poisoned".to_string())?.as_mut() {
            debouncer.watcher().unwatch(&path_buf).map_err(|error| error.to_string())?;
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

        let mut debouncer_guard = self.debouncer.lock().map_err(|_| "File watcher lock poisoned".to_string())?;
        let debouncer = debouncer_guard.as_mut().ok_or_else(|| "File watcher not initialized".to_string())?;
        debouncer.watcher().watch(path, recursive_mode).map_err(|error| error.to_string())?;

        if path.is_dir() {
            self.watched_directories
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
pub fn set_project_root(path: String, watcher: tauri::State<'_, Arc<FileWatcher>>) -> Result<(), String> {
    watcher.watch_project_root(path)
}

#[tauri::command]
pub fn start_watching(path: String, watcher: tauri::State<'_, Arc<FileWatcher>>) -> Result<(), String> {
    watcher.watch_path(path, true)
}

#[tauri::command]
pub fn stop_watching(path: String, watcher: tauri::State<'_, Arc<FileWatcher>>) -> Result<(), String> {
    watcher.stop_watching(path)
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
