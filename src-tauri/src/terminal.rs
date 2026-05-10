use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::io::{BufRead, BufReader, Write};
use std::process::{Child, ChildStdin, Command, Stdio};
use std::sync::Mutex;
use std::thread;
use std::time::SystemTime;
use tauri::Emitter;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TerminalCommandRequest {
    command: String,
    cwd: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TerminalCommandOutput {
    code: Option<i32>,
    stdout: String,
    stderr: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TerminalSpawnRequest {
    cwd: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TerminalWriteRequest {
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

pub struct TerminalSessions {
    sessions: Mutex<HashMap<String, TerminalSession>>,
}

impl TerminalSessions {
    pub fn new() -> Self {
        Self {
            sessions: Mutex::new(HashMap::new()),
        }
    }
}

#[tauri::command]
pub fn terminal_run(request: TerminalCommandRequest) -> Result<TerminalCommandOutput, String> {
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
pub fn terminal_spawn(
    app: tauri::AppHandle,
    sessions: tauri::State<'_, std::sync::Arc<TerminalSessions>>,
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
pub fn terminal_write(
    sessions: tauri::State<'_, std::sync::Arc<TerminalSessions>>,
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
pub fn terminal_kill(
    sessions: tauri::State<'_, std::sync::Arc<TerminalSessions>>,
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
