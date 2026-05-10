import { create } from "zustand";
import { getGitStatus, type GitStatusPayload } from "@/features/git/services/git-service";

interface GitState {
  status: GitStatusPayload | null;
  isLoading: boolean;
  actions: {
    refresh: (repoPath: string | null) => Promise<void>;
  };
}

export const useGitStore = create<GitState>((set) => ({
  status: null,
  isLoading: false,
  actions: {
    refresh: async (repoPath) => {
      if (!repoPath) {
        set({ status: null, isLoading: false });
        return;
      }
      set({ isLoading: true });
      const status = await getGitStatus(repoPath);
      set({ status, isLoading: false });
    },
  },
}));
