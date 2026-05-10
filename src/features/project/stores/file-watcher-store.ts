import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { create } from "zustand";
import { useEditorStore } from "@/features/editor/stores/editor-store";
import { useProjectStore } from "@/features/project/stores/project-store";
import { setProjectRootWatcher } from "@/features/project/services/watcher-service";

interface FileChangeEvent {
  path: string;
  eventType: "opened" | "reloaded" | "deleted";
}

interface FileWatcherState {
  pendingSaves: Map<string, number>;
  unlisten: UnlistenFn | null;
  actions: {
    initialize: () => Promise<void>;
    setProjectRoot: (path: string | null) => Promise<void>;
    markPendingSave: (path: string) => void;
  };
}

const pendingRefreshes = new Map<string, number>();
const refreshDelayMs = 250;
const pendingSaveWindowMs = 900;

export const useFileWatcherStore = create<FileWatcherState>((set, get) => ({
  pendingSaves: new Map(),
  unlisten: null,
  actions: {
    initialize: async () => {
      get().unlisten?.();

      const unlisten = await listen<FileChangeEvent>("file-changed", async (event) => {
        const { path, eventType } = event.payload;
        const pendingSave = get().pendingSaves.get(path);
        if (pendingSave && Date.now() - pendingSave < pendingSaveWindowMs) {
          return;
        }

        scheduleWorkspaceRefresh();

        const editor = useEditorStore.getState();
        const buffer = editor.buffers.find((candidate) => candidate.path === path);
        if (!buffer) return;

        if (eventType === "deleted") {
          editor.actions.handleExternalDelete(path);
          return;
        }

        if (eventType === "reloaded") {
          await editor.actions.reloadBufferFromDisk(path);
        }
      });

      set({ unlisten });
    },
    setProjectRoot: async (path) => {
      if (!path) return;
      try {
        await setProjectRootWatcher(path);
      } catch (error) {
        console.error("Failed to start project watcher", error);
      }
    },
    markPendingSave: (path) => {
      set((state) => {
        const pendingSaves = new Map(state.pendingSaves);
        pendingSaves.set(path, Date.now());
        return { pendingSaves };
      });

      window.setTimeout(() => {
        set((state) => {
          const timestamp = state.pendingSaves.get(path);
          if (!timestamp || Date.now() - timestamp < pendingSaveWindowMs) return state;
          const pendingSaves = new Map(state.pendingSaves);
          pendingSaves.delete(path);
          return { pendingSaves };
        });
      }, pendingSaveWindowMs);
    },
  },
}));

function scheduleWorkspaceRefresh() {
  const rootPath = useProjectStore.getState().rootPath;
  if (!rootPath) return;

  const existing = pendingRefreshes.get(rootPath);
  if (existing) window.clearTimeout(existing);

  pendingRefreshes.set(
    rootPath,
    window.setTimeout(() => {
      pendingRefreshes.delete(rootPath);
      void useProjectStore.getState().actions.refreshFiles();
    }, refreshDelayMs),
  );
}
