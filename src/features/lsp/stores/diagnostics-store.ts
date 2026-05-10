import { create } from "zustand";
import type { RecodeDiagnostic } from "@/features/lsp/services/lsp-service";

interface DiagnosticsState {
  diagnosticsByFile: Record<string, RecodeDiagnostic[]>;
  actions: {
    setDiagnostics: (filePath: string, diagnostics: RecodeDiagnostic[]) => void;
    clearDiagnostics: (filePath: string) => void;
  };
}

export const useDiagnosticsStore = create<DiagnosticsState>((set) => ({
  diagnosticsByFile: {},
  actions: {
    setDiagnostics: (filePath, diagnostics) =>
      set((state) => ({
        diagnosticsByFile: { ...state.diagnosticsByFile, [filePath]: diagnostics },
      })),
    clearDiagnostics: (filePath) =>
      set((state) => {
        const next = { ...state.diagnosticsByFile };
        delete next[filePath];
        return { diagnosticsByFile: next };
      }),
  },
}));
