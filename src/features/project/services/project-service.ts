import { invoke } from "@tauri-apps/api/core";
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
