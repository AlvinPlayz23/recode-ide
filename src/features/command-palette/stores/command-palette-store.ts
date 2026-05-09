import { create } from "zustand";

interface CommandPaletteState {
  isOpen: boolean;
  actions: {
    open: () => void;
    close: () => void;
  };
}

export const useCommandPaletteStore = create<CommandPaletteState>((set) => ({
  isOpen: false,
  actions: {
    open: () => set({ isOpen: true }),
    close: () => set({ isOpen: false }),
  },
}));
