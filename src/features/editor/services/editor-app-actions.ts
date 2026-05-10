import { useEditorStore } from "@/features/editor/stores/editor-store";

export async function handleSave() {
  const { activeBufferId, actions } = useEditorStore.getState();
  if (!activeBufferId) return false;
  return actions.saveBuffer(activeBufferId);
}

export async function handleSaveAs() {
  const { activeBufferId, actions } = useEditorStore.getState();
  if (!activeBufferId) return false;
  return actions.saveBufferAs(activeBufferId);
}
