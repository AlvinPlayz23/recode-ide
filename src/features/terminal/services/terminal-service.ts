import { invoke } from "@tauri-apps/api/core";

export interface TerminalCommandOutput {
  code: number | null;
  stdout: string;
  stderr: string;
}

export async function runTerminalCommand(command: string, cwd: string | null) {
  return invoke<TerminalCommandOutput>("terminal_run", {
    request: {
      command,
      cwd,
    },
  });
}

export interface TerminalOutputEvent {
  sessionId: string;
  stream: "stdout" | "stderr" | "system";
  text: string;
}

export async function spawnTerminalSession(cwd: string | null) {
  return invoke<string>("terminal_spawn", {
    request: {
      cwd,
    },
  });
}

export async function writeTerminalSession(sessionId: string, input: string) {
  return invoke<void>("terminal_write", {
    request: {
      sessionId,
      input,
    },
  });
}

export async function killTerminalSession(sessionId: string) {
  return invoke<void>("terminal_kill", { sessionId });
}
