import { create } from "zustand";
import {
  killTerminalSession,
  spawnTerminalSession,
  writeTerminalSession,
} from "@/features/terminal/services/terminal-service";

interface TerminalLine {
  id: string;
  kind: "input" | "stdout" | "stderr" | "system";
  text: string;
}

interface TerminalState {
  lines: TerminalLine[];
  sessionId: string | null;
  isRunning: boolean;
  actions: {
    appendOutput: (kind: TerminalLine["kind"], text: string) => void;
    ensureSession: (cwd: string | null) => Promise<void>;
    runCommand: (command: string, cwd: string | null) => Promise<void>;
    killSession: () => Promise<void>;
  };
}

export const useTerminalStore = create<TerminalState>((set) => ({
  lines: [
    {
      id: "welcome",
      kind: "system",
      text: "Shell terminal ready.",
    },
  ],
  sessionId: null,
  isRunning: false,
  actions: {
    appendOutput: (kind, text) => {
      if (!text) return;
      set((state) => ({
        lines: [...state.lines, { id: crypto.randomUUID(), kind, text: text.trimEnd() }],
      }));
    },
    ensureSession: async (cwd) => {
      if (useTerminalStore.getState().sessionId) return;
      set({ isRunning: true });
      try {
        const sessionId = await spawnTerminalSession(cwd);
        set({ sessionId, isRunning: false });
      } catch (error) {
        set((state) => ({
          isRunning: false,
          lines: [
            ...state.lines,
            {
              id: crypto.randomUUID(),
              kind: "stderr",
              text: error instanceof Error ? error.message : "Terminal failed to start",
            },
          ],
        }));
      }
    },
    runCommand: async (command, cwd) => {
      const trimmed = command.trim();
      if (!trimmed) return;
      await useTerminalStore.getState().actions.ensureSession(cwd);
      const sessionId = useTerminalStore.getState().sessionId;
      if (!sessionId) return;

      set((state) => ({
        isRunning: true,
        lines: [...state.lines, { id: crypto.randomUUID(), kind: "input", text: trimmed }],
      }));

      try {
        await writeTerminalSession(sessionId, `${trimmed}\n`);
        set({ isRunning: false });
      } catch (error) {
        set((state) => ({
          isRunning: false,
          lines: [
            ...state.lines,
            {
              id: crypto.randomUUID(),
              kind: "stderr",
              text: error instanceof Error ? error.message : "Command failed",
            },
          ],
        }));
      }
    },
    killSession: async () => {
      const sessionId = useTerminalStore.getState().sessionId;
      if (!sessionId) return;
      await killTerminalSession(sessionId);
      set((state) => ({
        sessionId: null,
        isRunning: false,
        lines: [
          ...state.lines,
          { id: crypto.randomUUID(), kind: "system", text: "Shell session stopped." },
        ],
      }));
    },
  },
}));
