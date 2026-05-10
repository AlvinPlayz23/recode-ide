import { invoke } from "@tauri-apps/api/core";
import { Store } from "@tauri-apps/plugin-store";
import type { ProjectFile } from "@/features/project/stores/project-store";

interface ProjectOpenResult {
  rootPath: string;
  files: ProjectFile[];
}

export async function openProjectFolder(): Promise<ProjectOpenResult | null> {
  try {
    return await invoke<ProjectOpenResult | null>("project_open_folder");
  } catch {
    return null;
  }
}

export async function listProjectFiles(rootPath: string): Promise<ProjectFile[]> {
  try {
    return await invoke<ProjectFile[]>("fs_list_files", { rootPath });
  } catch {
    return [];
  }
}

export async function saveRecentWorkspace(rootPath: string) {
  const store = await Store.load("workspace.json");
  await store.set("recentWorkspace", rootPath);
  await store.save();
}

export async function loadRecentWorkspace() {
  const store = await Store.load("workspace.json");
  return (await store.get<string>("recentWorkspace")) ?? null;
}
