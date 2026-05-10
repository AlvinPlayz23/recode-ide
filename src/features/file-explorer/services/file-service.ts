import { invoke } from "@tauri-apps/api/core";
import { save } from "@tauri-apps/plugin-dialog";

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

export async function pickSaveFilePath(defaultPath?: string): Promise<string | null> {
  try {
    return await save({
      title: "Save As",
      defaultPath,
      filters: [
        { name: "All Files", extensions: ["*"] },
        {
          name: "Text Files",
          extensions: ["txt", "md", "json", "js", "ts", "tsx", "jsx", "css", "html", "rs", "toml"],
        },
      ],
    });
  } catch (error) {
    console.error("Save As dialog failed", error);
    return null;
  }
}

export async function createFile(parentPath: string, name: string): Promise<string | null> {
  try {
    return await invoke<string>("fs_create_file", { parentPath, name });
  } catch {
    return null;
  }
}

export async function createDirectory(parentPath: string, name: string): Promise<string | null> {
  try {
    return await invoke<string>("fs_create_directory", { parentPath, name });
  } catch {
    return null;
  }
}

export async function renamePath(path: string, newName: string): Promise<string | null> {
  try {
    return await invoke<string>("fs_rename_path", { path, newName });
  } catch {
    return null;
  }
}

export async function deletePath(path: string): Promise<boolean> {
  try {
    await invoke("fs_delete_path", { path });
    return true;
  } catch {
    return false;
  }
}
