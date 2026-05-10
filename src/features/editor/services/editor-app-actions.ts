import { applyTextEditsToContent, applyWorkspaceEdit } from "@/features/lsp/services/workspace-edit";
import { formatDocument, renameSymbol } from "@/features/lsp/services/lsp-service";
import { useReferencesStore } from "@/features/references/stores/references-store";
import { findWorkspaceReferences } from "@/features/references/services/reference-service";
import { useProjectStore } from "@/features/project/stores/project-store";
import { useEditorStore } from "@/features/editor/stores/editor-store";
import { useToastStore } from "@/features/notifications/stores/toast-store";
import { useWorkbenchStore } from "@/features/window/stores/workbench-store";

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

export async function handleRenameSymbol() {
  const { activeBufferId, buffers } = useEditorStore.getState();
  const buffer = buffers.find((candidate) => candidate.id === activeBufferId);
  if (!buffer) return false;

  const currentSymbol = wordAtOffset(buffer.content, buffer.selection.end);
  if (!currentSymbol) {
    useToastStore.getState().actions.error("Rename unavailable", "Place the cursor on a symbol.");
    return false;
  }

  const nextName = window.prompt("Rename symbol", currentSymbol);
  if (!nextName || nextName.trim() === currentSymbol) return false;

  try {
    const edit = await renameSymbol({
      filePath: buffer.path,
      content: buffer.content,
      languageId: buffer.languageId,
      line: buffer.cursor.line,
      character: buffer.cursor.column,
      newName: nextName.trim(),
    });
    if (!edit) return false;
    const result = await applyWorkspaceEdit(edit);
    useToastStore
      .getState()
      .actions.success("Renamed symbol", `${currentSymbol} -> ${nextName.trim()} in ${result.editedFiles} file(s)`);
    return true;
  } catch (error) {
    useToastStore.getState().actions.error("Rename failed", error instanceof Error ? error.message : String(error));
    return false;
  }
}

export async function handleFindReferences() {
  const { activeBufferId, buffers } = useEditorStore.getState();
  const buffer = buffers.find((candidate) => candidate.id === activeBufferId);
  if (!buffer) return false;

  const symbol = wordAtOffset(buffer.content, buffer.selection.end);
  if (!symbol) {
    useToastStore.getState().actions.error("References unavailable", "Place the cursor on a symbol.");
    return false;
  }

  useReferencesStore.getState().actions.start(symbol);
  useWorkbenchStore.getState().actions.setActiveSidebarView("references");
  const files = useProjectStore.getState().files;
  const results = await findWorkspaceReferences(files, symbol);
  useReferencesStore.getState().actions.setResults(results);
  return true;
}

export async function handleFormatDocument() {
  const { activeBufferId, buffers, actions } = useEditorStore.getState();
  const buffer = buffers.find((candidate) => candidate.id === activeBufferId);
  if (!buffer) return false;

  try {
    const edits = await formatDocument({
      filePath: buffer.path,
      content: buffer.content,
      languageId: buffer.languageId,
    });
    if (!edits || edits.length === 0) {
      useToastStore.getState().actions.success("Already formatted", buffer.name);
      return true;
    }

    actions.updateBufferContent(buffer.id, applyTextEditsToContent(buffer.content, edits));
    useToastStore.getState().actions.success("Formatted", buffer.name);
    return true;
  } catch (error) {
    useToastStore.getState().actions.error("Format failed", error instanceof Error ? error.message : String(error));
    return false;
  }
}

function wordAtOffset(content: string, offset: number) {
  const safeOffset = Math.max(0, Math.min(offset, content.length));
  let start = safeOffset;
  if (start === content.length && start > 0) start -= 1;
  if (!/[\w$]/.test(content[start] ?? "") && start > 0 && /[\w$]/.test(content[start - 1])) {
    start -= 1;
  }
  if (!/[\w$]/.test(content[start] ?? "")) return "";
  let end = start;
  while (start > 0 && /[\w$]/.test(content[start - 1])) start -= 1;
  while (end < content.length && /[\w$]/.test(content[end])) end += 1;
  return content.slice(start, end);
}
