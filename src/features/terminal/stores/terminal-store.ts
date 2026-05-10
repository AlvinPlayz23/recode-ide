import { create } from "zustand";
import { runTerminalCommand } from "@/features/terminal/services/terminal-service";

interface TerminalLine {
  id: string;
  kind: "input" | "stdout" | "stderr" | "system";
  text: string;
}

interface TerminalState {
  lines: TerminalLine[];
  isRunning: boolean;
  actions: {
    runCommand: (command: string, cwd: string | null) => Promise<void>;
  };
}

export const useTerminalStore = create<TerminalState>((set) => ({
  lines: [
    {
      id: "welcome",
      kind: "system",
      text: "Command terminal ready. Full PTY support comes next.",
    },
  ],
  isRunning: false,
  actions: {
    runCommand: async (command, cwd) => {
      const trimmed = command.trim();
      if (!trimmed) return;

      set((state) => ({
        isRunning: true,
        lines: [...state.lines, { id: crypto.randomUUID(), kind: "input", text: trimmed }],
      }));

      try {
        const output = await runTerminalCommand(trimmed, cwd);
        set((state) => ({
          isRunning: false,
          lines: [
            ...state.lines,
            ...(output.stdout
              ? [{ id: crypto.randomUUID(), kind: "stdout" as const, text: output.stdout.trimEnd() }]
              : []),
            ...(output.stderr
              ? [{ id: crypto.randomUUID(), kind: "stderr" as const, text: output.stderr.trimEnd() }]
              : []),
            {
              id: crypto.randomUUID(),
              kind: "system" as const,
              text: `exit ${output.code ?? 0}`,
            },
          ],
        }));
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
  },
}));
