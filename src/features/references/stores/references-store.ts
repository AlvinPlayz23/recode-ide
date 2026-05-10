import { create } from "zustand";

export interface ReferenceResult {
  filePath: string;
  fileName: string;
  relativePath: string;
  line: number;
  character: number;
  excerpt: string;
}

interface ReferencesState {
  symbol: string | null;
  results: ReferenceResult[];
  isSearching: boolean;
  actions: {
    start: (symbol: string) => void;
    setResults: (results: ReferenceResult[]) => void;
    clear: () => void;
  };
}

export const useReferencesStore = create<ReferencesState>((set) => ({
  symbol: null,
  results: [],
  isSearching: false,
  actions: {
    start: (symbol) => set({ symbol, results: [], isSearching: true }),
    setResults: (results) => set({ results, isSearching: false }),
    clear: () => set({ symbol: null, results: [], isSearching: false }),
  },
}));
