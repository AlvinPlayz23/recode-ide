import { create } from "zustand";
import {
  getGitDiff,
  getGitStatus,
  type GitFileStatus,
  type GitStatusPayload,
} from "@/features/git/services/git-service";

interface GitState {
  status: GitStatusPayload | null;
  isLoading: boolean;
  selectedFile: GitFileStatus | null;
  selectedDiff: string;
  isDiffLoading: boolean;
  actions: {
    refresh: (repoPath: string | null) => Promise<void>;
    selectFile: (repoPath: string | null, file: GitFileStatus) => Promise<void>;
  };
}

export const useGitStore = create<GitState>((set) => ({
  status: null,
  isLoading: false,
  selectedFile: null,
  selectedDiff: "",
  isDiffLoading: false,
  actions: {
    refresh: async (repoPath) => {
      if (!repoPath) {
        set({ status: null, isLoading: false, selectedFile: null, selectedDiff: "" });
        return;
      }
      set({ isLoading: true });
      const status = await getGitStatus(repoPath);
      set({ status, isLoading: false });
    },
    selectFile: async (repoPath, file) => {
      if (!repoPath) return;
      set({ selectedFile: file, selectedDiff: "", isDiffLoading: true });
      const diff = await getGitDiff(repoPath, file.path);
      set({ selectedDiff: diff, isDiffLoading: false });
    },
  },
}));
