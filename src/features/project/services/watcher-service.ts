import { invoke } from "@tauri-apps/api/core";

export async function setProjectRootWatcher(path: string) {
  await invoke("set_project_root", { path });
}

export async function startWatchingPath(path: string) {
  await invoke("start_watching", { path });
}

export async function stopWatchingPath(path: string) {
  await invoke("stop_watching", { path });
}
