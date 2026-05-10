import { useToastStore } from "@/features/notifications/stores/toast-store";
import { CloseIcon } from "@/features/window/components/icons";

export function ToastViewport() {
  const toasts = useToastStore((state) => state.toasts);
  const dismiss = useToastStore((state) => state.actions.dismiss);

  if (toasts.length === 0) return null;

  return (
    <div className="toast-viewport" aria-live="polite">
      {toasts.map((toast) => (
        <div className={`toast-message ${toast.type}`} key={toast.id}>
          <div className="toast-content">
            <strong>{toast.title}</strong>
            {toast.detail ? <span>{toast.detail}</span> : null}
          </div>
          <button type="button" className="icon-button" onClick={() => dismiss(toast.id)} aria-label="Dismiss">
            <CloseIcon size={12} />
          </button>
        </div>
      ))}
    </div>
  );
}
