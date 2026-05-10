import { handleSave, handleSaveAs } from "@/features/editor/services/editor-app-actions";
import { useMenuEvents } from "@/features/window/hooks/use-menu-events";

export function useMenuEventsWrapper() {
  useMenuEvents({
    onSave: handleSave,
    onSaveAs: handleSaveAs,
  });
}
