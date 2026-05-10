import { invoke } from "@tauri-apps/api/core";

export interface GitFileStatus {
  path: string;
  status: "added" | "deleted" | "modified" | "renamed" | "untracked";
  staged: boolean;
}

export interface GitStatusPayload {
  branch: string;
  files: GitFileStatus[];
}

export async function getGitStatus(repoPath: string) {
  try {
    return await invoke<GitStatusPayload | null>("git_status", { repoPath });
  } catch {
    return null;
  }
}

export async function getGitDiff(repoPath: string, path?: string) {
  try {
    return await invoke<string>("git_diff", { repoPath, path });
  } catch {
    return "";
  }
}
