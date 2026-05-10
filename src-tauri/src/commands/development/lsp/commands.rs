use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LspDiagnosticsRequest {
    file_path: String,
    content: String,
    language_id: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LspCompletionsRequest {
    content: String,
    language_id: String,
    line: usize,
    character: usize,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct LspRangePosition {
    line: usize,
    character: usize,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct LspRange {
    start: LspRangePosition,
    end: LspRangePosition,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RecodeDiagnostic {
    file_path: String,
    range: LspRange,
    severity: String,
    message: String,
    source: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RecodeCompletionItem {
    label: String,
    detail: String,
    kind: String,
    insert_text: String,
}

#[tauri::command]
pub fn lsp_get_diagnostics(request: LspDiagnosticsRequest) -> Result<Vec<RecodeDiagnostic>, String> {
    let mut diagnostics = Vec::new();
    let mut bracket_stack: Vec<(char, usize, usize)> = Vec::new();

    for (line_index, line) in request.content.lines().enumerate() {
        if let Some(column) = line.find("TODO") {
            diagnostics.push(RecodeDiagnostic {
                file_path: request.file_path.clone(),
                range: diagnostic_range(line_index, column, column + 4),
                severity: "info".to_string(),
                message: "TODO marker".to_string(),
                source: "recode-lsp".to_string(),
            });
        }

        for (character, value) in line.chars().enumerate() {
            match value {
                '(' | '[' | '{' => bracket_stack.push((value, line_index, character)),
                ')' | ']' | '}' => {
                    if !matches_bracket(bracket_stack.last().map(|entry| entry.0), value) {
                        diagnostics.push(RecodeDiagnostic {
                            file_path: request.file_path.clone(),
                            range: diagnostic_range(line_index, character, character + 1),
                            severity: "warning".to_string(),
                            message: format!("Unmatched closing bracket `{value}`"),
                            source: "recode-lsp".to_string(),
                        });
                    } else {
                        bracket_stack.pop();
                    }
                }
                _ => {}
            }
        }
    }

    if request.language_id == "json" {
        if let Err(error) = serde_json::from_str::<serde_json::Value>(&request.content) {
            diagnostics.push(RecodeDiagnostic {
                file_path: request.file_path,
                range: diagnostic_range(error.line().saturating_sub(1), error.column().saturating_sub(1), error.column()),
                severity: "error".to_string(),
                message: error.to_string(),
                source: "json".to_string(),
            });
            return Ok(diagnostics);
        }
    }

    for (_, line, character) in bracket_stack.into_iter().take(20) {
        diagnostics.push(RecodeDiagnostic {
            file_path: request.file_path.clone(),
            range: diagnostic_range(line, character, character + 1),
            severity: "warning".to_string(),
            message: "Unclosed bracket".to_string(),
            source: "recode-lsp".to_string(),
        });
    }

    Ok(diagnostics)
}

#[tauri::command]
pub fn lsp_get_completions(request: LspCompletionsRequest) -> Result<Vec<RecodeCompletionItem>, String> {
    let prefix = completion_prefix(&request.content, request.line, request.character);
    let mut seen = HashSet::new();
    let mut items = Vec::new();

    for label in completion_keywords(&request.language_id) {
        if !matches_completion_prefix(label, &prefix) || !seen.insert(label.to_string()) {
            continue;
        }
        items.push(RecodeCompletionItem {
            label: label.to_string(),
            detail: format!("{} keyword", request.language_id),
            kind: "keyword".to_string(),
            insert_text: label.to_string(),
        });
    }

    for word in document_words(&request.content) {
        if items.len() >= 80 {
            break;
        }
        if !matches_completion_prefix(&word, &prefix) || !seen.insert(word.clone()) {
            continue;
        }
        items.push(RecodeCompletionItem {
            label: word.clone(),
            detail: "document word".to_string(),
            kind: "text".to_string(),
            insert_text: word,
        });
    }

    Ok(items)
}

fn diagnostic_range(line: usize, start: usize, end: usize) -> LspRange {
    LspRange {
        start: LspRangePosition { line, character: start },
        end: LspRangePosition {
            line,
            character: end.max(start + 1),
        },
    }
}

fn matches_bracket(open: Option<char>, close: char) -> bool {
    matches!((open, close), (Some('('), ')') | (Some('['), ']') | (Some('{'), '}'))
}

fn completion_prefix(content: &str, line: usize, character: usize) -> String {
    let line_text = content.lines().nth(line).unwrap_or_default();
    let prefix_end = character.min(line_text.len());
    let before_cursor = &line_text[..prefix_end];
    before_cursor
        .chars()
        .rev()
        .take_while(|value| value.is_ascii_alphanumeric() || *value == '_')
        .collect::<String>()
        .chars()
        .rev()
        .collect()
}

fn completion_keywords(language_id: &str) -> Vec<&'static str> {
    match language_id {
        "rust" => vec![
            "async", "await", "break", "const", "continue", "crate", "enum", "fn", "impl", "let",
            "match", "mod", "move", "mut", "pub", "return", "self", "struct", "trait", "use",
            "where",
        ],
        "typescript" | "typescriptreact" => vec![
            "async", "await", "const", "export", "extends", "function", "import", "interface",
            "let", "return", "type", "useEffect", "useRef", "useState",
        ],
        "json" => vec!["false", "null", "true"],
        "css" => vec!["display", "flex", "grid", "position", "color", "background", "border"],
        _ => vec!["TODO", "fixme", "note"],
    }
}

fn matches_completion_prefix(label: &str, prefix: &str) -> bool {
    prefix.is_empty() || label.to_lowercase().starts_with(&prefix.to_lowercase())
}

fn document_words(content: &str) -> Vec<String> {
    let mut counts: HashMap<String, usize> = HashMap::new();
    let mut current = String::new();

    for value in content.chars() {
        if value.is_ascii_alphanumeric() || value == '_' || value == '$' {
            current.push(value);
            continue;
        }

        remember_completion_word(&mut counts, &mut current);
    }
    remember_completion_word(&mut counts, &mut current);

    let mut words: Vec<(String, usize)> = counts.into_iter().collect();
    words.sort_by(|a, b| b.1.cmp(&a.1).then_with(|| a.0.cmp(&b.0)));
    words.into_iter().map(|(word, _)| word).collect()
}

fn remember_completion_word(counts: &mut HashMap<String, usize>, current: &mut String) {
    if current.len() >= 3 && !current.chars().all(|value| value.is_ascii_digit()) {
        *counts.entry(current.clone()).or_insert(0) += 1;
    }
    current.clear();
}
