use serde::Serialize;
use std::fs;
use std::path::{Path, PathBuf};
use tauri_plugin_dialog::DialogExt;
use walkdir::WalkDir;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectFile {
    path: String,
    relative_path: String,
    name: String,
    kind: String,
    depth: usize,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectOpenResult {
    root_path: String,
    files: Vec<ProjectFile>,
}

#[tauri::command]
pub async fn project_open_folder(app: tauri::AppHandle) -> Result<Option<ProjectOpenResult>, String> {
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
pub fn fs_read_file(path: String) -> Result<String, String> {
    fs::read_to_string(path).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn fs_write_file(path: String, content: String) -> Result<(), String> {
    fs::write(path, content).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn fs_create_file(parent_path: String, name: String) -> Result<String, String> {
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
pub fn fs_create_directory(parent_path: String, name: String) -> Result<String, String> {
    let path = PathBuf::from(parent_path).join(clean_child_name(&name)?);
    if path.exists() {
        return Err("A file or folder with that name already exists".to_string());
    }

    fs::create_dir_all(&path).map_err(|error| error.to_string())?;
    Ok(path.to_string_lossy().to_string())
}

#[tauri::command]
pub fn fs_rename_path(path: String, new_name: String) -> Result<String, String> {
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
pub fn fs_delete_path(path: String) -> Result<(), String> {
    let path = PathBuf::from(path);
    if path.is_dir() {
        fs::remove_dir_all(path).map_err(|error| error.to_string())
    } else {
        fs::remove_file(path).map_err(|error| error.to_string())
    }
}

#[tauri::command]
pub fn fs_list_files(root_path: String) -> Result<Vec<ProjectFile>, String> {
    let root = PathBuf::from(&root_path);
    if !root.is_dir() {
        return Err("Workspace root is not a directory".to_string());
    }

    Ok(list_project_files(&root))
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
