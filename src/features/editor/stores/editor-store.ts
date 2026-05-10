import { create } from "zustand";
import {
  pickSaveFilePath,
  readFile,
  writeFile,
} from "@/features/file-explorer/services/file-service";
import {
  notifyDocumentChange,
  notifyDocumentClose,
  notifyDocumentOpen,
  notifyDocumentSave,
} from "@/features/lsp/services/lsp-service";
import {
  EDITOR_LINE_HEIGHT,
  EDITOR_MAX_UNDO_ENTRIES,
  EDITOR_UNDO_GROUP_MS,
} from "@/features/editor/config/editor-constants";
import { useToastStore } from "@/features/notifications/stores/toast-store";
import { useFileWatcherStore } from "@/features/project/stores/file-watcher-store";

export interface EditorPosition {
  line: number;
  column: number;
  offset: number;
}

export interface EditorSelection {
  start: number;
  end: number;
}

export interface SearchMatch {
  start: number;
  end: number;
}

interface UndoSnapshot {
  content: string;
  selection: EditorSelection;
  cursor: EditorPosition;
  scrollTop: number;
  scrollLeft: number;
}

export interface EditorBuffer {
  id: string;
  path: string;
  name: string;
  content: string;
  savedContent: string;
  languageId: string;
  cursor: EditorPosition;
  selection: EditorSelection;
  scrollTop: number;
  scrollLeft: number;
  searchQuery: string;
  searchMatches: SearchMatch[];
  activeSearchMatchIndex: number;
  undoStack: UndoSnapshot[];
  redoStack: UndoSnapshot[];
  lastEditAt: number;
  externalState: "none" | "modified" | "deleted";
  lspVersion: number;
}

interface OpenBufferInput {
  path: string;
  name: string;
  content: string;
  languageId: string;
}

interface EditorState {
  buffers: EditorBuffer[];
  activeBufferId: string | null;
  lastSaveError: string | null;
  lastSaveStatus: "idle" | "saving" | "saved" | "error";
  actions: {
    openBuffer: (input: OpenBufferInput) => void;
    closeBuffer: (bufferId: string) => void;
    setActiveBuffer: (bufferId: string) => void;
    updateBufferContent: (bufferId: string, content: string, options?: { pushUndo?: boolean }) => void;
    saveBuffer: (bufferId: string) => Promise<boolean>;
    saveBufferAs: (bufferId: string) => Promise<boolean>;
    saveActiveBuffer: () => Promise<void>;
    revertBuffer: (bufferId: string) => Promise<boolean>;
    setCursor: (bufferId: string, cursor: EditorPosition) => void;
    setSelection: (bufferId: string, selection: EditorSelection) => void;
    setScrollTop: (bufferId: string, scrollTop: number) => void;
    setScrollPosition: (bufferId: string, scrollTop: number, scrollLeft: number) => void;
    revealPosition: (bufferId: string, line: number, column?: number) => void;
    setSearchQuery: (bufferId: string, query: string) => void;
    goToSearchMatch: (bufferId: string, direction: 1 | -1) => void;
    undo: (bufferId: string) => void;
    redo: (bufferId: string) => void;
    clearSaveStatus: () => void;
    reconcileRenamedPath: (oldPath: string, newPath: string) => void;
    closeBuffersUnderPath: (path: string) => void;
    reloadBufferFromDisk: (path: string) => Promise<void>;
    handleExternalDelete: (path: string) => void;
  };
}

const createBufferId = (path: string) => `buffer:${path}`;

export const useEditorStore = create<EditorState>((set, get) => ({
  buffers: [],
  activeBufferId: null,
  lastSaveError: null,
  lastSaveStatus: "idle",
  actions: {
    openBuffer: (input) => {
      const existing = get().buffers.find((buffer) => buffer.path === input.path);
      if (existing) {
        set({ activeBufferId: existing.id });
        return;
      }

      const nextBuffer: EditorBuffer = {
        id: createBufferId(input.path),
        path: input.path,
        name: input.name,
        content: input.content,
        savedContent: input.content,
        languageId: input.languageId,
        cursor: { line: 0, column: 0, offset: 0 },
        selection: { start: 0, end: 0 },
        scrollTop: 0,
        scrollLeft: 0,
        searchQuery: "",
        searchMatches: [],
        activeSearchMatchIndex: -1,
        undoStack: [],
        redoStack: [],
        lastEditAt: 0,
        externalState: "none",
        lspVersion: 1,
      };

      set((state) => ({
        buffers: [...state.buffers, nextBuffer],
        activeBufferId: nextBuffer.id,
      }));
      void notifyDocumentOpen({
        filePath: nextBuffer.path,
        content: nextBuffer.content,
        languageId: nextBuffer.languageId,
      }).catch((error) => console.warn("LSP document open failed", error));
    },
    closeBuffer: (bufferId) => {
      const buffer = get().buffers.find((candidate) => candidate.id === bufferId);
      if (!buffer) return;
      if (buffer && buffer.content !== buffer.savedContent) {
        const shouldClose = window.confirm(`Close "${buffer.name}" without saving changes?`);
        if (!shouldClose) return;
      }

      set((state) => {
        const buffers = state.buffers.filter((buffer) => buffer.id !== bufferId);
        const activeBufferId =
          state.activeBufferId === bufferId ? (buffers.at(-1)?.id ?? null) : state.activeBufferId;
        return { buffers, activeBufferId };
      });
      void notifyDocumentClose(buffer.path).catch((error) =>
        console.warn("LSP document close failed", error),
      );
    },
    setActiveBuffer: (bufferId) => set({ activeBufferId: bufferId }),
    updateBufferContent: (bufferId, content, options) => {
      set((state) => ({
        buffers: state.buffers.map((buffer) => {
          if (buffer.id !== bufferId) return buffer;
          const now = Date.now();
          const shouldPushUndo =
            options?.pushUndo !== false &&
            buffer.content !== content &&
            (now - buffer.lastEditAt > EDITOR_UNDO_GROUP_MS || buffer.undoStack.length === 0);
          const undoStack = shouldPushUndo
            ? [...buffer.undoStack, snapshotBuffer(buffer)].slice(-EDITOR_MAX_UNDO_ENTRIES)
            : buffer.undoStack;
          const searchMatches = findSearchMatches(content, buffer.searchQuery);
          const lspVersion = buffer.lspVersion + 1;
          const activeSearchMatchIndex =
            searchMatches.length === 0
              ? -1
              : Math.min(Math.max(buffer.activeSearchMatchIndex, 0), searchMatches.length - 1);
          return {
            ...buffer,
            content,
            searchMatches,
            activeSearchMatchIndex,
            undoStack,
            redoStack: options?.pushUndo === false ? buffer.redoStack : [],
            lastEditAt: now,
            externalState: "none",
            lspVersion,
          };
        }),
      }));
      const buffer = get().buffers.find((candidate) => candidate.id === bufferId);
      if (buffer) {
        void notifyDocumentChange({
          filePath: buffer.path,
          content,
          version: buffer.lspVersion,
        }).catch((error) => console.warn("LSP document change failed", error));
      }
    },
    saveBuffer: async (bufferId) => {
      const buffer = get().buffers.find((candidate) => candidate.id === bufferId);
      if (!buffer) return false;

      set({ lastSaveError: null, lastSaveStatus: "saving" });
      useFileWatcherStore.getState().actions.markPendingSave(buffer.path);
      const saved = await writeFile(buffer.path, buffer.content);
      if (!saved) {
        useToastStore.getState().actions.error("Save failed", buffer.path);
        set({
          lastSaveError: `Could not save ${buffer.name}`,
          lastSaveStatus: "error",
        });
        return false;
      }

      set((state) => ({
        lastSaveError: null,
        lastSaveStatus: "saved",
        buffers: state.buffers.map((candidate) =>
          candidate.id === bufferId
            ? { ...candidate, savedContent: candidate.content, externalState: "none" }
          : candidate,
        ),
      }));
      void notifyDocumentSave({ filePath: buffer.path, content: buffer.content }).catch((error) =>
        console.warn("LSP document save failed", error),
      );
      useToastStore.getState().actions.success("Saved", buffer.name);
      return true;
    },
    saveBufferAs: async (bufferId) => {
      const buffer = get().buffers.find((candidate) => candidate.id === bufferId);
      if (!buffer) return false;

      const nextPath = await pickSaveFilePath(buffer.name);
      if (!nextPath) return false;
      if (nextPath === buffer.path) {
        return await get().actions.saveBuffer(bufferId);
      }

      set({ lastSaveError: null, lastSaveStatus: "saving" });
      useFileWatcherStore.getState().actions.markPendingSave(nextPath);
      const saved = await writeFile(nextPath, buffer.content);
      if (!saved) {
        useToastStore.getState().actions.error("Save As failed", nextPath);
        set({
          lastSaveError: `Could not save ${buffer.name}`,
          lastSaveStatus: "error",
        });
        return false;
      }

      const nextId = createBufferId(nextPath);
      set((state) => ({
        activeBufferId: state.activeBufferId === bufferId ? nextId : state.activeBufferId,
        lastSaveError: null,
        lastSaveStatus: "saved",
        buffers: state.buffers.map((candidate) =>
          candidate.id === bufferId
            ? {
                ...candidate,
                id: nextId,
                path: nextPath,
                name: basename(nextPath),
                savedContent: candidate.content,
                externalState: "none",
              }
            : candidate,
        ),
      }));
      void notifyDocumentClose(buffer.path).catch((error) =>
        console.warn("LSP document close failed", error),
      );
      void notifyDocumentOpen({
        filePath: nextPath,
        content: buffer.content,
        languageId: buffer.languageId,
      }).catch((error) => console.warn("LSP document open failed", error));
      void notifyDocumentSave({ filePath: nextPath, content: buffer.content }).catch((error) =>
        console.warn("LSP document save failed", error),
      );
      useToastStore.getState().actions.success("Saved As", basename(nextPath));
      return true;
    },
    saveActiveBuffer: async () => {
      const activeBufferId = get().activeBufferId;
      if (!activeBufferId) return;
      await get().actions.saveBuffer(activeBufferId);
    },
    revertBuffer: async (bufferId) => {
      const buffer = get().buffers.find((candidate) => candidate.id === bufferId);
      if (!buffer) return false;

      if (buffer.content !== buffer.savedContent) {
        const shouldRevert = window.confirm(`Revert "${buffer.name}" to the version on disk?`);
        if (!shouldRevert) return false;
      }

      const content = await readFile(buffer.path);
      if (content === null) {
        useToastStore.getState().actions.error("Revert failed", buffer.path);
        set({
          lastSaveError: `Could not reload ${buffer.name}`,
          lastSaveStatus: "error",
        });
        return false;
      }

      set((state) => ({
        buffers: state.buffers.map((candidate) =>
          candidate.id === bufferId
            ? {
                ...candidate,
                content,
                savedContent: content,
                externalState: "none",
                undoStack: [...candidate.undoStack, snapshotBuffer(candidate)].slice(
                  -EDITOR_MAX_UNDO_ENTRIES,
                ),
                redoStack: [],
              }
            : candidate,
        ),
      }));
      return true;
    },
    setCursor: (bufferId, cursor) => {
      set((state) => ({
        buffers: state.buffers.map((buffer) =>
          buffer.id === bufferId ? { ...buffer, cursor } : buffer,
        ),
      }));
    },
    setSelection: (bufferId, selection) => {
      set((state) => ({
        buffers: state.buffers.map((buffer) =>
          buffer.id === bufferId ? { ...buffer, selection } : buffer,
        ),
      }));
    },
    setScrollTop: (bufferId, scrollTop) => {
      set((state) => ({
        buffers: state.buffers.map((buffer) =>
          buffer.id === bufferId ? { ...buffer, scrollTop } : buffer,
        ),
      }));
    },
    setScrollPosition: (bufferId, scrollTop, scrollLeft) => {
      set((state) => ({
        buffers: state.buffers.map((buffer) =>
          buffer.id === bufferId ? { ...buffer, scrollTop, scrollLeft } : buffer,
        ),
      }));
    },
    revealPosition: (bufferId, line, column = 0) => {
      set((state) => ({
        buffers: state.buffers.map((buffer) => {
          if (buffer.id !== bufferId) return buffer;
          const offset = positionToOffset(buffer.content, line, column);
          return {
            ...buffer,
            selection: { start: offset, end: offset },
            cursor: offsetToPosition(buffer.content, offset),
            scrollTop: Math.max(0, line * EDITOR_LINE_HEIGHT - EDITOR_LINE_HEIGHT * 5),
          };
        }),
      }));
    },
    setSearchQuery: (bufferId, query) => {
      set((state) => ({
        buffers: state.buffers.map((buffer) => {
          if (buffer.id !== bufferId) return buffer;
          const searchMatches = findSearchMatches(buffer.content, query);
          return {
            ...buffer,
            searchQuery: query,
            searchMatches,
            activeSearchMatchIndex: searchMatches.length > 0 ? 0 : -1,
          };
        }),
      }));
    },
    goToSearchMatch: (bufferId, direction) => {
      set((state) => ({
        buffers: state.buffers.map((buffer) => {
          if (buffer.id !== bufferId || buffer.searchMatches.length === 0) return buffer;
          const nextIndex =
            (buffer.activeSearchMatchIndex + direction + buffer.searchMatches.length) %
            buffer.searchMatches.length;
          const match = buffer.searchMatches[nextIndex];
          return {
            ...buffer,
            activeSearchMatchIndex: nextIndex,
            selection: { start: match.start, end: match.end },
            cursor: offsetToPosition(buffer.content, match.end),
          };
        }),
      }));
    },
    undo: (bufferId) => {
      set((state) => ({
        buffers: state.buffers.map((buffer) => {
          if (buffer.id !== bufferId || buffer.undoStack.length === 0) return buffer;
          const previous = buffer.undoStack[buffer.undoStack.length - 1];
          const searchMatches = findSearchMatches(previous.content, buffer.searchQuery);
          return {
            ...buffer,
            content: previous.content,
            searchMatches,
            activeSearchMatchIndex: searchMatches.length > 0 ? 0 : -1,
            undoStack: buffer.undoStack.slice(0, -1),
            redoStack: [...buffer.redoStack, snapshotBuffer(buffer)].slice(-EDITOR_MAX_UNDO_ENTRIES),
            selection: previous.selection,
            cursor: previous.cursor,
            scrollTop: previous.scrollTop,
            scrollLeft: previous.scrollLeft,
            lspVersion: buffer.lspVersion + 1,
          };
        }),
      }));
      notifyBufferChanged(get, bufferId);
    },
    redo: (bufferId) => {
      set((state) => ({
        buffers: state.buffers.map((buffer) => {
          if (buffer.id !== bufferId || buffer.redoStack.length === 0) return buffer;
          const next = buffer.redoStack[buffer.redoStack.length - 1];
          const searchMatches = findSearchMatches(next.content, buffer.searchQuery);
          return {
            ...buffer,
            content: next.content,
            searchMatches,
            activeSearchMatchIndex: searchMatches.length > 0 ? 0 : -1,
            undoStack: [...buffer.undoStack, snapshotBuffer(buffer)].slice(-EDITOR_MAX_UNDO_ENTRIES),
            redoStack: buffer.redoStack.slice(0, -1),
            selection: next.selection,
            cursor: next.cursor,
            scrollTop: next.scrollTop,
            scrollLeft: next.scrollLeft,
            lspVersion: buffer.lspVersion + 1,
          };
        }),
      }));
      notifyBufferChanged(get, bufferId);
    },
    clearSaveStatus: () => set({ lastSaveError: null, lastSaveStatus: "idle" }),
    reconcileRenamedPath: (oldPath, newPath) => {
      const oldRoot = normalizePath(oldPath);
      const newRoot = normalizePath(newPath);
      set((state) => {
        let activeBufferId = state.activeBufferId;
        const buffers: EditorBuffer[] = state.buffers.map((buffer): EditorBuffer => {
          const normalized = normalizePath(buffer.path);
          if (normalized !== oldRoot && !normalized.startsWith(`${oldRoot}/`)) {
            return buffer;
          }

          const suffix = normalized === oldRoot ? "" : normalized.slice(oldRoot.length);
          const nextPath = `${newRoot}${suffix}`.replaceAll("/", pathSeparatorFor(newPath));
          const nextId = createBufferId(nextPath);
          if (buffer.id === state.activeBufferId) {
            activeBufferId = nextId;
          }

          return {
            ...buffer,
            id: nextId,
            path: nextPath,
            name: basename(nextPath),
            externalState: "none",
          };
        });
        return { buffers, activeBufferId };
      });
    },
    closeBuffersUnderPath: (path) => {
      const root = normalizePath(path);
      const dirtyBuffers = get().buffers.filter((buffer) => {
        const normalized = normalizePath(buffer.path);
        return (
          (normalized === root || normalized.startsWith(`${root}/`)) &&
          buffer.content !== buffer.savedContent
        );
      });
      if (dirtyBuffers.length > 0) {
        const shouldClose = window.confirm(
          `Close ${dirtyBuffers.length} unsaved file${dirtyBuffers.length === 1 ? "" : "s"}?`,
        );
        if (!shouldClose) return;
      }

      set((state) => {
        const buffers = state.buffers.filter((buffer) => {
          const normalized = normalizePath(buffer.path);
          return normalized !== root && !normalized.startsWith(`${root}/`);
        });
        const activeBufferId = buffers.some((buffer) => buffer.id === state.activeBufferId)
          ? state.activeBufferId
          : (buffers.at(-1)?.id ?? null);
        return { buffers, activeBufferId };
      });
    },
    reloadBufferFromDisk: async (path) => {
      const buffer = get().buffers.find((candidate) => candidate.path === path);
      if (!buffer) return;

      const content = await readFile(path);
      if (content === null) {
        get().actions.handleExternalDelete(path);
        return;
      }

      if (buffer.content !== buffer.savedContent) {
        set((state) => ({
          buffers: state.buffers.map((candidate) =>
            candidate.path === path ? { ...candidate, externalState: "modified" } : candidate,
          ),
        }));
        return;
      }

      set((state) => ({
        buffers: state.buffers.map((candidate) =>
          candidate.path === path
            ? {
                ...candidate,
                content,
                savedContent: content,
                externalState: "none",
                searchMatches: findSearchMatches(content, candidate.searchQuery),
              }
            : candidate,
        ),
      }));
    },
    handleExternalDelete: (path) => {
      set((state) => ({
        buffers: state.buffers.map((candidate) =>
          candidate.path === path
            ? {
                ...candidate,
                externalState:
                  candidate.content === candidate.savedContent ? "deleted" : "modified",
              }
            : candidate,
        ),
      }));
    },
  },
}));

function snapshotBuffer(buffer: EditorBuffer): UndoSnapshot {
  return {
    content: buffer.content,
    selection: buffer.selection,
    cursor: buffer.cursor,
    scrollTop: buffer.scrollTop,
    scrollLeft: buffer.scrollLeft,
  };
}

function notifyBufferChanged(get: () => EditorState, bufferId: string) {
  const buffer = get().buffers.find((candidate) => candidate.id === bufferId);
  if (!buffer) return;
  void notifyDocumentChange({
    filePath: buffer.path,
    content: buffer.content,
    version: buffer.lspVersion,
  }).catch((error) => console.warn("LSP document change failed", error));
}

function basename(path: string) {
  return path.split(/[\\/]/).filter(Boolean).at(-1) ?? path;
}

function normalizePath(path: string) {
  return path.replaceAll("\\", "/").replace(/\/+$/, "");
}

function pathSeparatorFor(path: string) {
  return path.includes("\\") ? "\\" : "/";
}

function findSearchMatches(content: string, query: string): SearchMatch[] {
  if (!query.trim()) return [];

  const matches: SearchMatch[] = [];
  const needle = query.toLowerCase();
  const haystack = content.toLowerCase();
  let index = haystack.indexOf(needle);

  while (index >= 0) {
    matches.push({ start: index, end: index + query.length });
    index = haystack.indexOf(needle, index + Math.max(needle.length, 1));
  }

  return matches;
}

export function offsetToPosition(content: string, offset: number): EditorPosition {
  const safeOffset = Math.max(0, Math.min(offset, content.length));
  const beforeCursor = content.slice(0, safeOffset);
  const split = beforeCursor.split("\n");
  return {
    line: split.length - 1,
    column: split.at(-1)?.length ?? 0,
    offset: safeOffset,
  };
}

export function positionToOffset(content: string, line: number, column: number) {
  const lines = content.split("\n");
  const safeLine = Math.max(0, Math.min(line, lines.length - 1));
  let offset = 0;
  for (let index = 0; index < safeLine; index += 1) {
    offset += lines[index].length + 1;
  }
  return offset + Math.max(0, Math.min(column, lines[safeLine]?.length ?? 0));
}
