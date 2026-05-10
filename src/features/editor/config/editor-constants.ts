export const EDITOR_LINE_HEIGHT = 22;
export const EDITOR_CHAR_WIDTH = 7.83;
export const EDITOR_GUTTER_WIDTH = 48;
export const EDITOR_OVERSCAN_LINES = 12;
export const EDITOR_LARGE_FILE_BYTES = 750_000;
export const EDITOR_LARGE_FILE_LINES = 12_000;
export const EDITOR_UNDO_GROUP_MS = 900;
export const EDITOR_MAX_UNDO_ENTRIES = 100;

export function isLargeEditorBuffer(content: string, lineCount: number) {
  return content.length > EDITOR_LARGE_FILE_BYTES || lineCount > EDITOR_LARGE_FILE_LINES;
}
