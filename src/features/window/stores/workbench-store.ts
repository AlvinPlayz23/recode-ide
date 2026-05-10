import { create } from "zustand";

export type SidebarView = "files" | "search" | "git" | "diagnostics" | "debug" | "extensions";

interface WorkbenchState {
  activeSidebarView: SidebarView;
  isInspectorVisible: boolean;
  isTerminalVisible: boolean;
  actions: {
    setActiveSidebarView: (view: SidebarView) => void;
    toggleInspector: () => void;
    toggleTerminal: () => void;
    showTerminal: () => void;
  };
}

export const useWorkbenchStore = create<WorkbenchState>((set) => ({
  activeSidebarView: "files",
  isInspectorVisible: true,
  isTerminalVisible: true,
  actions: {
    setActiveSidebarView: (view) => set({ activeSidebarView: view }),
    toggleInspector: () => set((state) => ({ isInspectorVisible: !state.isInspectorVisible })),
    toggleTerminal: () => set((state) => ({ isTerminalVisible: !state.isTerminalVisible })),
    showTerminal: () => set({ isTerminalVisible: true }),
  },
}));
