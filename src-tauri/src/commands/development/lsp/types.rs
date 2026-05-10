use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LspDiagnosticsRequest {
    pub file_path: String,
    pub content: String,
    pub language_id: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LspCompletionsRequest {
    pub content: String,
    pub language_id: String,
    pub line: usize,
    pub character: usize,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LspPositionRequest {
    pub file_path: String,
    pub content: String,
    pub language_id: String,
    pub line: usize,
    pub character: usize,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LspRenameRequest {
    pub file_path: String,
    pub content: String,
    pub language_id: String,
    pub line: usize,
    pub character: usize,
    pub new_name: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LspDocumentSymbolsRequest {
    pub file_path: String,
    pub content: String,
    pub language_id: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LspVisibleRangeRequest {
    #[allow(dead_code)]
    pub file_path: String,
    pub content: String,
    pub language_id: String,
    pub start_line: usize,
    pub end_line: usize,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LspCodeActionsRequest {
    pub file_path: String,
    pub content: String,
    #[allow(dead_code)]
    pub language_id: String,
    pub diagnostic: RecodeDiagnosticContext,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LspRangePosition {
    pub line: usize,
    pub character: usize,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LspRange {
    pub start: LspRangePosition,
    pub end: LspRangePosition,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RecodeDiagnostic {
    pub file_path: String,
    pub range: LspRange,
    pub severity: String,
    pub message: String,
    pub source: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RecodeDiagnosticContext {
    pub range: LspRange,
    #[allow(dead_code)]
    pub severity: String,
    pub message: String,
    #[allow(dead_code)]
    pub source: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RecodeCompletionItem {
    pub label: String,
    pub detail: String,
    pub kind: String,
    pub insert_text: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RecodeHover {
    pub contents: String,
    pub range: Option<LspRange>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RecodeLocation {
    pub uri: String,
    pub range: LspRange,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LspTextEdit {
    pub range: LspRange,
    pub new_text: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RecodeWorkspaceEdit {
    pub changes: std::collections::HashMap<String, Vec<LspTextEdit>>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RecodeDocumentSymbol {
    pub name: String,
    pub kind: String,
    pub detail: Option<String>,
    pub line: usize,
    pub character: usize,
    pub end_line: usize,
    pub end_character: usize,
    pub container_name: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RecodeSignatureParameter {
    pub label: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RecodeSignatureInfo {
    pub label: String,
    pub documentation: Option<String>,
    pub parameters: Vec<RecodeSignatureParameter>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RecodeSignatureHelp {
    pub signatures: Vec<RecodeSignatureInfo>,
    pub active_signature: usize,
    pub active_parameter: usize,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RecodeInlayHint {
    pub line: usize,
    pub character: usize,
    pub label: String,
    pub kind: String,
    pub padding_left: bool,
    pub padding_right: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RecodeSemanticToken {
    pub line: usize,
    pub start_char: usize,
    pub length: usize,
    pub token_type: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RecodeCodeAction {
    pub id: String,
    pub title: String,
    pub kind: String,
    pub edit: Option<RecodeWorkspaceEdit>,
}
