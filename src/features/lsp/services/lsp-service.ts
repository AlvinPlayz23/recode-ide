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

export interface RecodeHover {
  contents: string;
  range?: LspRange | null;
}

export interface RecodeLocation {
  uri: string;
  range: LspRange;
}

export interface LspTextEdit {
  range: LspRange;
  newText: string;
}

export interface RecodeWorkspaceEdit {
  changes: Record<string, LspTextEdit[]>;
}

export interface RecodeDocumentSymbol {
  name: string;
  kind: string;
  detail?: string | null;
  line: number;
  character: number;
  endLine: number;
  endCharacter: number;
  containerName?: string | null;
}

export interface RecodeSignatureHelp {
  signatures: Array<{
    label: string;
    documentation?: string | null;
    parameters: Array<{ label: string }>;
  }>;
  activeSignature: number;
  activeParameter: number;
}

export interface RecodeInlayHint {
  line: number;
  character: number;
  label: string;
  kind: string;
  paddingLeft: boolean;
  paddingRight: boolean;
}

export interface RecodeSemanticToken {
  line: number;
  startChar: number;
  length: number;
  tokenType: string;
}

export interface RecodeCodeAction {
  id: string;
  title: string;
  kind: string;
  edit?: RecodeWorkspaceEdit | null;
}

export async function getDiagnostics(input: {
  filePath: string;
  content: string;
  languageId: string;
}) {
  return invoke<RecodeDiagnostic[]>("lsp_get_diagnostics", { request: input });
}

export async function notifyDocumentOpen(input: {
  filePath: string;
  content: string;
  languageId?: string;
}) {
  return invoke<void>("lsp_document_open", input);
}

export async function notifyDocumentChange(input: {
  filePath: string;
  content: string;
  version: number;
}) {
  return invoke<void>("lsp_document_change", input);
}

export async function notifyDocumentSave(input: {
  filePath: string;
  content?: string;
}) {
  return invoke<void>("lsp_document_save", input);
}

export async function notifyDocumentClose(filePath: string) {
  return invoke<void>("lsp_document_close", { filePath });
}

export async function getCompletions(input: {
  content: string;
  languageId: string;
  line: number;
  character: number;
}) {
  return invoke<RecodeCompletionItem[]>("lsp_get_completions", { request: input });
}

export async function getDocumentSymbols(input: {
  filePath: string;
  content: string;
  languageId: string;
}) {
  return invoke<RecodeDocumentSymbol[]>("lsp_get_document_symbols", { request: input });
}

export async function getHover(input: {
  filePath: string;
  content: string;
  languageId: string;
  line: number;
  character: number;
}) {
  return invoke<RecodeHover | null>("lsp_get_hover", { request: input });
}

export async function getDefinition(input: {
  filePath: string;
  content: string;
  languageId: string;
  line: number;
  character: number;
}) {
  return invoke<RecodeLocation[]>("lsp_get_definition", { request: input });
}

export async function getReferences(input: {
  filePath: string;
  content: string;
  languageId: string;
  line: number;
  character: number;
}) {
  return invoke<RecodeLocation[]>("lsp_get_references", { request: input });
}

export async function renameSymbol(input: {
  filePath: string;
  content: string;
  languageId: string;
  line: number;
  character: number;
  newName: string;
}) {
  return invoke<RecodeWorkspaceEdit | null>("lsp_rename", { request: input });
}

export async function formatDocument(input: {
  filePath: string;
  content: string;
  languageId: string;
}) {
  return invoke<LspTextEdit[] | null>("lsp_format_document", { request: input });
}

export async function getSignatureHelp(input: {
  filePath: string;
  content: string;
  languageId: string;
  line: number;
  character: number;
}) {
  return invoke<RecodeSignatureHelp | null>("lsp_get_signature_help", { request: input });
}

export async function getInlayHints(input: {
  filePath: string;
  content: string;
  languageId: string;
  startLine: number;
  endLine: number;
}) {
  return invoke<RecodeInlayHint[]>("lsp_get_inlay_hints", { request: input });
}

export async function getSemanticTokens(input: {
  filePath: string;
  content: string;
  languageId: string;
}) {
  return invoke<RecodeSemanticToken[]>("lsp_get_semantic_tokens", { request: input });
}

export async function getCodeActions(input: {
  filePath: string;
  content: string;
  languageId: string;
  diagnostic: Pick<RecodeDiagnostic, "range" | "severity" | "message" | "source">;
}) {
  return invoke<RecodeCodeAction[]>("lsp_get_code_actions", { request: input });
}
