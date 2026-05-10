import { readFile, writeFile } from "@/features/file-explorer/services/file-service";
import { positionToOffset, useEditorStore } from "@/features/editor/stores/editor-store";
import type { LspTextEdit, RecodeWorkspaceEdit } from "@/features/lsp/services/lsp-service";

export interface WorkspaceEditApplyResult {
  editedFiles: number;
}

export function filePathFromUri(uri: string) {
  if (!uri.startsWith("file://")) return uri;
  const withoutScheme = uri.replace(/^file:\/\/\/?/, "");
  const decoded = decodeURIComponent(withoutScheme);
  if (/^[A-Za-z]:\//.test(decoded)) return decoded.replaceAll("/", "\\");
  return decoded;
}

export function applyTextEditsToContent(content: string, edits: LspTextEdit[]) {
  const sortedEdits = [...edits].sort((a, b) => {
    const aOffset = positionToOffset(content, a.range.start.line, a.range.start.character);
    const bOffset = positionToOffset(content, b.range.start.line, b.range.start.character);
    return bOffset - aOffset;
  });

  return sortedEdits.reduce((nextContent, edit) => {
    const startOffset = positionToOffset(
      nextContent,
      edit.range.start.line,
      edit.range.start.character,
    );
    const endOffset = positionToOffset(nextContent, edit.range.end.line, edit.range.end.character);
    return nextContent.slice(0, startOffset) + edit.newText + nextContent.slice(endOffset);
  }, content);
}

export async function applyWorkspaceEdit(
  edit: RecodeWorkspaceEdit,
): Promise<WorkspaceEditApplyResult> {
  const entries = Object.entries(edit.changes ?? {});
  for (const [uri, edits] of entries) {
    const filePath = filePathFromUri(uri);
    const openBuffer = useEditorStore.getState().buffers.find((buffer) => buffer.path === filePath);
    const content = openBuffer?.content ?? (await readFile(filePath));
    if (content === null) continue;

    const nextContent = applyTextEditsToContent(content, edits);
    if (openBuffer) {
      useEditorStore.getState().actions.updateBufferContent(openBuffer.id, nextContent);
    } else {
      await writeFile(filePath, nextContent);
    }
  }

  return { editedFiles: entries.length };
}
