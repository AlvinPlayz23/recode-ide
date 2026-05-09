import { create } from "zustand";
import { writeFile } from "@/features/file-explorer/services/file-service";

export interface EditorPosition {
  line: number;
  column: number;
  offset: number;
}

export interface EditorBuffer {
  id: string;
  path: string;
  name: string;
  content: string;
  savedContent: string;
  languageId: string;
  cursor: EditorPosition;
  scrollTop: number;
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
  actions: {
    openBuffer: (input: OpenBufferInput) => void;
    closeBuffer: (bufferId: string) => void;
    setActiveBuffer: (bufferId: string) => void;
    updateBufferContent: (bufferId: string, content: string) => void;
    saveBuffer: (bufferId: string) => Promise<void>;
    saveActiveBuffer: () => Promise<void>;
    setCursor: (bufferId: string, cursor: EditorPosition) => void;
    setScrollTop: (bufferId: string, scrollTop: number) => void;
  };
}

const createBufferId = (path: string) => `buffer:${path}`;

export const useEditorStore = create<EditorState>((set, get) => ({
  buffers: [],
  activeBufferId: null,
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
        scrollTop: 0,
      };

      set((state) => ({
        buffers: [...state.buffers, nextBuffer],
        activeBufferId: nextBuffer.id,
      }));
    },
    closeBuffer: (bufferId) => {
      set((state) => {
        const buffers = state.buffers.filter((buffer) => buffer.id !== bufferId);
        const activeBufferId =
          state.activeBufferId === bufferId ? (buffers.at(-1)?.id ?? null) : state.activeBufferId;
        return { buffers, activeBufferId };
      });
    },
    setActiveBuffer: (bufferId) => set({ activeBufferId: bufferId }),
    updateBufferContent: (bufferId, content) => {
      set((state) => ({
        buffers: state.buffers.map((buffer) =>
          buffer.id === bufferId ? { ...buffer, content } : buffer,
        ),
      }));
    },
    saveBuffer: async (bufferId) => {
      const buffer = get().buffers.find((candidate) => candidate.id === bufferId);
      if (!buffer) return;

      const saved = await writeFile(buffer.path, buffer.content);
      if (!saved) return;

      set((state) => ({
        buffers: state.buffers.map((candidate) =>
          candidate.id === bufferId
            ? { ...candidate, savedContent: candidate.content }
            : candidate,
        ),
      }));
    },
    saveActiveBuffer: async () => {
      const activeBufferId = get().activeBufferId;
      if (!activeBufferId) return;
      await get().actions.saveBuffer(activeBufferId);
    },
    setCursor: (bufferId, cursor) => {
      set((state) => ({
        buffers: state.buffers.map((buffer) =>
          buffer.id === bufferId ? { ...buffer, cursor } : buffer,
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
  },
}));
