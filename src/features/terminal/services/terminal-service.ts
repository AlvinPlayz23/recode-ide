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
