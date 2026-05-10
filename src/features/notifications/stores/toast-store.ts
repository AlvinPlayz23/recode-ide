import { create } from "zustand";

export interface ToastMessage {
  id: string;
  type: "info" | "success" | "warning" | "error";
  title: string;
  detail?: string;
}

interface ToastState {
  toasts: ToastMessage[];
  actions: {
    show: (toast: Omit<ToastMessage, "id">) => void;
    success: (title: string, detail?: string) => void;
    error: (title: string, detail?: string) => void;
    dismiss: (id: string) => void;
  };
}

export const useToastStore = create<ToastState>((set, get) => ({
  toasts: [],
  actions: {
    show: (toast) => {
      const id = crypto.randomUUID();
      set((state) => ({ toasts: [...state.toasts, { ...toast, id }].slice(-4) }));
      window.setTimeout(() => get().actions.dismiss(id), 4200);
    },
    success: (title, detail) => get().actions.show({ type: "success", title, detail }),
    error: (title, detail) => get().actions.show({ type: "error", title, detail }),
    dismiss: (id) =>
      set((state) => ({ toasts: state.toasts.filter((toast) => toast.id !== id) })),
  },
}));
