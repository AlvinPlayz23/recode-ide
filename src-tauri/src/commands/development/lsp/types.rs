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

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LspRangePosition {
    pub line: usize,
    pub character: usize,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LspRange {
    pub start: LspRangePosition,
    pub end: LspRangePosition,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RecodeDiagnostic {
    pub file_path: String,
    pub range: LspRange,
    pub severity: String,
    pub message: String,
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
