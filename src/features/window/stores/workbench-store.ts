import { create } from "zustand";

interface WorkbenchState {
  isInspectorVisible: boolean;
  isTerminalVisible: boolean;
  actions: {
    toggleInspector: () => void;
    toggleTerminal: () => void;
  };
}

export const useWorkbenchStore = create<WorkbenchState>((set) => ({
  isInspectorVisible: true,
  isTerminalVisible: true,
  actions: {
    toggleInspector: () => set((state) => ({ isInspectorVisible: !state.isInspectorVisible })),
    toggleTerminal: () => set((state) => ({ isTerminalVisible: !state.isTerminalVisible })),
  },
}));
