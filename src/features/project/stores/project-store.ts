import { create } from "zustand";
import {
  listProjectFiles,
  loadRecentWorkspace,
  openProjectFolder,
  saveRecentWorkspace,
} from "@/features/project/services/project-service";
import { useEditorStore } from "@/features/editor/stores/editor-store";
import {
  createDirectory,
  createFile,
  deletePath,
  readFile,
  renamePath,
} from "@/features/file-explorer/services/file-service";
import { useGitStore } from "@/features/git/stores/git-store";
import { useFileWatcherStore } from "@/features/project/stores/file-watcher-store";

export interface ProjectFile {
  path: string;
  relativePath: string;
  name: string;
  kind: "file" | "directory";
  depth: number;
}

interface ProjectState {
  rootPath: string | null;
  files: ProjectFile[];
  actions: {
    bootstrapDemoWorkspace: () => void;
    refreshFiles: () => Promise<void>;
    openFolder: () => Promise<void>;
    openFile: (path: string, name: string) => Promise<void>;
    openFileAt: (path: string, name: string, line: number, column?: number) => Promise<void>;
    createFile: (parentPath: string, name: string) => Promise<string | null>;
    createFolder: (parentPath: string, name: string) => Promise<string | null>;
    renamePath: (path: string, newName: string) => Promise<string | null>;
    deletePath: (path: string) => Promise<boolean>;
    restoreRecentWorkspace: () => Promise<void>;
  };
}

const demoFiles: ProjectFile[] = [
  { path: "src", relativePath: "src", name: "src", kind: "directory", depth: 0 },
  { path: "src/main.tsx", relativePath: "src/main.tsx", name: "main.tsx", kind: "file", depth: 1 },
  { path: "src/features", relativePath: "src/features", name: "features", kind: "directory", depth: 1 },
  { path: "src/features/editor", relativePath: "src/features/editor", name: "editor", kind: "directory", depth: 2 },
  {
    path: "src/features/editor/hybrid-editor.tsx",
    relativePath: "src/features/editor/hybrid-editor.tsx",
    name: "hybrid-editor.tsx",
    kind: "file",
    depth: 3,
  },
  { path: "src-tauri", relativePath: "src-tauri", name: "src-tauri", kind: "directory", depth: 0 },
  { path: "src-tauri/src", relativePath: "src-tauri/src", name: "src", kind: "directory", depth: 1 },
  { path: "src-tauri/src/lib.rs", relativePath: "src-tauri/src/lib.rs", name: "lib.rs", kind: "file", depth: 2 },
  { path: "PLAN.md", relativePath: "PLAN.md", name: "PLAN.md", kind: "file", depth: 0 },
];

export function detectLanguage(name: string) {
  if (name.endsWith(".tsx")) return "typescriptreact";
  if (name.endsWith(".ts")) return "typescript";
  if (name.endsWith(".rs")) return "rust";
  if (name.endsWith(".md")) return "markdown";
  if (name.endsWith(".json")) return "json";
  if (name.endsWith(".css")) return "css";
  if (name.endsWith(".html")) return "html";
  return "plaintext";
}

export const useProjectStore = create<ProjectState>((set, get) => ({
  rootPath: null,
  files: [],
  actions: {
    bootstrapDemoWorkspace: () => {
      if (get().files.length > 0) return;

      set({ files: demoFiles });
      useEditorStore.getState().actions.openBuffer({
        path: "src/main.tsx",
        name: "main.tsx",
        languageId: "typescriptreact",
        content: `import { App } from "./app";\n\n// Recode starts as an AI cockpit, then grows into a full IDE.\nexport function main() {\n  return <App />;\n}\n`,
      });
    },
    refreshFiles: async () => {
      const rootPath = get().rootPath;
      if (!rootPath) return;

      const files = await listProjectFiles(rootPath);
      set({ files });
      await useGitStore.getState().actions.refresh(rootPath);
    },
    openFolder: async () => {
      const project = await openProjectFolder();
      if (!project) return;
      set({ rootPath: project.rootPath, files: project.files });
      await saveRecentWorkspace(project.rootPath);
      await useGitStore.getState().actions.refresh(project.rootPath);
      await useFileWatcherStore.getState().actions.setProjectRoot(project.rootPath);
    },
    openFile: async (path, name) => {
      const content = await readFile(path);
      useEditorStore.getState().actions.openBuffer({
        path,
        name,
        content: content ?? `// Unable to read ${name}\n`,
        languageId: detectLanguage(name),
      });
    },
    openFileAt: async (path, name, line, column = 0) => {
      await get().actions.openFile(path, name);
      const buffer = useEditorStore.getState().buffers.find((buffer) => buffer.path === path);
      if (buffer) {
        useEditorStore.getState().actions.revealPosition(buffer.id, line, column);
      }
    },
    createFile: async (parentPath, name) => {
      const path = await createFile(parentPath, name);
      if (!path) return null;

      await get().actions.refreshFiles();
      await get().actions.openFile(path, name);
      return path;
    },
    createFolder: async (parentPath, name) => {
      const path = await createDirectory(parentPath, name);
      if (!path) return null;

      await get().actions.refreshFiles();
      return path;
    },
    renamePath: async (path, newName) => {
      const nextPath = await renamePath(path, newName);
      if (!nextPath) return null;

      useEditorStore.getState().actions.reconcileRenamedPath(path, nextPath);
      await get().actions.refreshFiles();
      return nextPath;
    },
    deletePath: async (path) => {
      const deleted = await deletePath(path);
      if (!deleted) return false;

      useEditorStore.getState().actions.closeBuffersUnderPath(path);
      await get().actions.refreshFiles();
      return true;
    },
    restoreRecentWorkspace: async () => {
      const rootPath = await loadRecentWorkspace();
      if (!rootPath) return;

      const files = await listProjectFiles(rootPath);
      if (files.length === 0) return;

      set({ rootPath, files });
      await useGitStore.getState().actions.refresh(rootPath);
      await useFileWatcherStore.getState().actions.setProjectRoot(rootPath);
    },
  },
}));
