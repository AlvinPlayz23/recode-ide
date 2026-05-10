import { invoke } from "@tauri-apps/api/core";

export interface LspPosition {
  line: number;
  character: number;
}

export interface LspRange {
  start: LspPosition;
  end: LspPosition;
}

export interface RecodeDiagnostic {
  filePath: string;
  range: LspRange;
  severity: "error" | "warning" | "info";
  message: string;
  source: string;
}

export interface RecodeCompletionItem {
  label: string;
  detail: string;
  kind: string;
  insertText: string;
}

export async function getDiagnostics(input: {
  filePath: string;
  content: string;
  languageId: string;
}) {
  return invoke<RecodeDiagnostic[]>("lsp_get_diagnostics", { request: input });
}

export async function getCompletions(input: {
  content: string;
  languageId: string;
  line: number;
  character: number;
}) {
  return invoke<RecodeCompletionItem[]>("lsp_get_completions", { request: input });
}
