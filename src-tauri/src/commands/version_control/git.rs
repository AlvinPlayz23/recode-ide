use git2::{Repository, Status};
use serde::Serialize;
use std::process::Command;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitStatusPayload {
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

#[tauri::command]
pub fn git_status(repo_path: String) -> Result<Option<GitStatusPayload>, String> {
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
pub fn git_diff(repo_path: String, path: Option<String>) -> Result<String, String> {
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
