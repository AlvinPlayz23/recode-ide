import { invoke } from "@tauri-apps/api/core";

export async function readFile(path: string): Promise<string | null> {
  try {
    return await invoke<string>("fs_read_file", { path });
  } catch {
    return null;
  }
}

export async function writeFile(path: string, content: string): Promise<boolean> {
  try {
    await invoke("fs_write_file", { path, content });
    return true;
  } catch {
    return false;
  }
}
