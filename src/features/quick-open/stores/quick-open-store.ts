import { create } from "zustand";

interface QuickOpenState {
  isOpen: boolean;
  query: string;
  actions: {
    open: () => void;
    close: () => void;
    setQuery: (query: string) => void;
  };
}

export const useQuickOpenStore = create<QuickOpenState>((set) => ({
  isOpen: false,
  query: "",
  actions: {
    open: () => set({ isOpen: true, query: "" }),
    close: () => set({ isOpen: false, query: "" }),
    setQuery: (query) => set({ query }),
  },
}));
