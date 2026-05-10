use super::types::{
    LspCompletionsRequest, LspDiagnosticsRequest, LspDocumentSymbolsRequest, LspPositionRequest,
    LspRange, LspRangePosition, LspRenameRequest, LspTextEdit, LspVisibleRangeRequest,
    LspCodeActionsRequest, RecodeCodeAction, RecodeCompletionItem, RecodeDiagnostic,
    RecodeDocumentSymbol, RecodeHover, RecodeInlayHint, RecodeLocation, RecodeSemanticToken,
    RecodeSignatureHelp, RecodeSignatureInfo, RecodeSignatureParameter, RecodeWorkspaceEdit,
};
use std::collections::{HashMap, HashSet};
use std::sync::{Arc, Mutex};

#[derive(Debug, Clone)]
pub struct LspDocument {
    content: String,
    #[allow(dead_code)]
    language_id: Option<String>,
    version: i32,
}

#[derive(Default)]
pub struct LspDocuments {
    documents: Mutex<HashMap<String, LspDocument>>,
}

impl LspDocuments {
    pub fn new() -> Self {
        Self::default()
    }
}

#[tauri::command]
pub fn lsp_document_open(
    documents: tauri::State<'_, Arc<LspDocuments>>,
    file_path: String,
    content: String,
    language_id: Option<String>,
) -> Result<(), String> {
    documents
        .documents
        .lock()
        .map_err(|_| "LSP document lock poisoned".to_string())?
        .insert(
            file_path,
            LspDocument {
                content,
                language_id,
                version: 1,
            },
        );
    Ok(())
}

#[tauri::command]
pub fn lsp_document_change(
    documents: tauri::State<'_, Arc<LspDocuments>>,
    file_path: String,
    content: String,
    version: i32,
) -> Result<(), String> {
    let mut guard = documents
        .documents
        .lock()
        .map_err(|_| "LSP document lock poisoned".to_string())?;
    let document = guard.entry(file_path).or_insert_with(|| LspDocument {
        content: String::new(),
        language_id: None,
        version,
    });
    document.content = content;
    document.version = version;
    Ok(())
}

#[tauri::command]
pub fn lsp_document_save(
    documents: tauri::State<'_, Arc<LspDocuments>>,
    file_path: String,
    content: Option<String>,
) -> Result<(), String> {
    let mut guard = documents
        .documents
        .lock()
        .map_err(|_| "LSP document lock poisoned".to_string())?;
    if let Some(document) = guard.get_mut(&file_path) {
        if let Some(content) = content {
            document.content = content;
        }
    }
    Ok(())
}

#[tauri::command]
pub fn lsp_document_close(
    documents: tauri::State<'_, Arc<LspDocuments>>,
    file_path: String,
) -> Result<(), String> {
    documents
        .documents
        .lock()
        .map_err(|_| "LSP document lock poisoned".to_string())?
        .remove(&file_path);
    Ok(())
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

#[tauri::command]
pub fn lsp_get_document_symbols(
    request: LspDocumentSymbolsRequest,
) -> Result<Vec<RecodeDocumentSymbol>, String> {
    Ok(extract_document_symbols(
        &request.file_path,
        &request.content,
        &request.language_id,
    ))
}

#[tauri::command]
pub fn lsp_get_hover(request: LspPositionRequest) -> Result<Option<RecodeHover>, String> {
    let Some(word) = word_at_position(&request.content, request.line, request.character) else {
        return Ok(None);
    };
    if word.is_empty() {
        return Ok(None);
    }

    let symbols = extract_document_symbols(&request.file_path, &request.content, &request.language_id);
    let symbol = symbols.iter().find(|symbol| symbol.name == word);
    let range = word_range_at_position(&request.content, request.line, request.character);
    let contents = if let Some(symbol) = symbol {
        let detail = symbol.detail.clone().unwrap_or_else(|| symbol.kind.clone());
        format!(
            "{} `{}`\n\nDefined at {}:{}",
            detail,
            symbol.name,
            symbol.line + 1,
            symbol.character + 1
        )
    } else {
        format!(
            "`{}`\n\n{} word from the current document.",
            word,
            request.language_id
        )
    };

    Ok(Some(RecodeHover { contents, range }))
}

#[tauri::command]
pub fn lsp_get_definition(request: LspPositionRequest) -> Result<Vec<RecodeLocation>, String> {
    let Some(word) = word_at_position(&request.content, request.line, request.character) else {
        return Ok(Vec::new());
    };
    let symbols = extract_document_symbols(&request.file_path, &request.content, &request.language_id);
    let Some(symbol) = symbols.iter().find(|symbol| symbol.name == word) else {
        return Ok(Vec::new());
    };

    Ok(vec![RecodeLocation {
        uri: file_uri(&request.file_path),
        range: LspRange {
            start: LspRangePosition {
                line: symbol.line,
                character: symbol.character,
            },
            end: LspRangePosition {
                line: symbol.end_line,
                character: symbol.end_character,
            },
        },
    }])
}

#[tauri::command]
pub fn lsp_get_references(request: LspPositionRequest) -> Result<Vec<RecodeLocation>, String> {
    let Some(word) = word_at_position(&request.content, request.line, request.character) else {
        return Ok(Vec::new());
    };

    Ok(find_word_ranges(&request.content, &word)
        .into_iter()
        .map(|range| RecodeLocation {
            uri: file_uri(&request.file_path),
            range,
        })
        .collect())
}

#[tauri::command]
pub fn lsp_rename(request: LspRenameRequest) -> Result<Option<RecodeWorkspaceEdit>, String> {
    if request.new_name.trim().is_empty() {
        return Err("Rename target cannot be empty".to_string());
    }
    if !is_valid_identifier(request.new_name.trim(), &request.language_id) {
        return Err("Rename target must be a valid identifier".to_string());
    }

    let Some(word) = word_at_position(&request.content, request.line, request.character) else {
        return Ok(None);
    };
    if word == request.new_name {
        return Ok(None);
    }

    let edits: Vec<LspTextEdit> = find_word_ranges(&request.content, &word)
        .into_iter()
        .map(|range| LspTextEdit {
            range,
            new_text: request.new_name.trim().to_string(),
        })
        .collect();
    if edits.is_empty() {
        return Ok(None);
    }

    let mut changes = HashMap::new();
    changes.insert(file_uri(&request.file_path), edits);
    Ok(Some(RecodeWorkspaceEdit { changes }))
}

#[tauri::command]
pub fn lsp_format_document(
    request: LspDocumentSymbolsRequest,
) -> Result<Option<Vec<LspTextEdit>>, String> {
    let formatted = if request.language_id == "json" || request.file_path.ends_with(".json") {
        let value = serde_json::from_str::<serde_json::Value>(&request.content)
            .map_err(|error| format!("JSON format failed: {error}"))?;
        format!("{}\n", serde_json::to_string_pretty(&value).map_err(|error| error.to_string())?)
    } else {
        format_plain_text(&request.content)
    };

    if formatted == request.content {
        return Ok(None);
    }

    Ok(Some(vec![LspTextEdit {
        range: full_document_range(&request.content),
        new_text: formatted,
    }]))
}

#[tauri::command]
pub fn lsp_get_signature_help(request: LspPositionRequest) -> Result<Option<RecodeSignatureHelp>, String> {
    let Some(call) = call_context_at_position(&request.content, request.line, request.character) else {
        return Ok(None);
    };
    let active_parameter = call.argument_prefix.chars().filter(|value| *value == ',').count();
    let parameters = infer_signature_parameters(&request.content, &call.function_name)
        .unwrap_or_else(|| vec!["arg".to_string()]);
    let label = format!("{}({})", call.function_name, parameters.join(", "));

    Ok(Some(RecodeSignatureHelp {
        signatures: vec![RecodeSignatureInfo {
            label,
            documentation: Some("Facade signature help. Real signatures will come from the LSP server.".to_string()),
            parameters: parameters
                .into_iter()
                .map(|label| RecodeSignatureParameter { label })
                .collect(),
        }],
        active_signature: 0,
        active_parameter,
    }))
}

#[tauri::command]
pub fn lsp_get_inlay_hints(request: LspVisibleRangeRequest) -> Result<Vec<RecodeInlayHint>, String> {
    let mut hints = Vec::new();
    for (line_index, line) in request.content.lines().enumerate() {
        if line_index < request.start_line || line_index > request.end_line {
            continue;
        }
        let trimmed = line.trim_start();
        let indent = line.len().saturating_sub(trimmed.len());
        if matches!(request.language_id.as_str(), "typescript" | "typescriptreact" | "javascript" | "javascriptreact") {
            if let Some((name, value)) = variable_assignment(trimmed) {
                if !trimmed.contains(':') {
                    hints.push(RecodeInlayHint {
                        line: line_index,
                        character: indent + name.len() + trimmed.find(&name).unwrap_or_default(),
                        label: format!(": {}", infer_value_type(value)),
                        kind: "type".to_string(),
                        padding_left: true,
                        padding_right: true,
                    });
                }
            }
        }
    }
    Ok(hints)
}

#[tauri::command]
pub fn lsp_get_semantic_tokens(request: LspDocumentSymbolsRequest) -> Result<Vec<RecodeSemanticToken>, String> {
    let symbols = extract_document_symbols(&request.file_path, &request.content, &request.language_id);
    let mut symbol_names: HashMap<String, String> = HashMap::new();
    for symbol in symbols {
        symbol_names.insert(symbol.name, symbol.kind);
    }

    let mut tokens = Vec::new();
    for (line_index, line) in request.content.lines().enumerate() {
        let mut current = String::new();
        let mut start = 0usize;
        for (index, character) in line.char_indices() {
            if character.is_ascii_alphanumeric() || character == '_' || character == '$' {
                if current.is_empty() {
                    start = index;
                }
                current.push(character);
                continue;
            }
            remember_semantic_token(&mut tokens, &symbol_names, &current, line_index, start);
            current.clear();
        }
        remember_semantic_token(&mut tokens, &symbol_names, &current, line_index, start);
    }
    Ok(tokens)
}

#[tauri::command]
pub fn lsp_get_code_actions(request: LspCodeActionsRequest) -> Result<Vec<RecodeCodeAction>, String> {
    let mut actions = Vec::new();
    if request.diagnostic.message.contains("TODO") {
        let range = request.diagnostic.range.clone();
        let mut changes = HashMap::new();
        changes.insert(
            file_uri(&request.file_path),
            vec![LspTextEdit {
                range,
                new_text: "DONE".to_string(),
            }],
        );
        actions.push(RecodeCodeAction {
            id: "replace-todo".to_string(),
            title: "Replace TODO with DONE".to_string(),
            kind: "quickfix".to_string(),
            edit: Some(RecodeWorkspaceEdit { changes }),
        });
    }
    if request.diagnostic.message.contains("Unclosed bracket") {
        let close = match request.content.lines().nth(request.diagnostic.range.start.line).unwrap_or_default().as_bytes().get(request.diagnostic.range.start.character).copied() {
            Some(b'(') => ")",
            Some(b'[') => "]",
            Some(b'{') => "}",
            _ => "",
        };
        if !close.is_empty() {
            let end = full_document_range(&request.content).end;
            let mut changes = HashMap::new();
            changes.insert(
                file_uri(&request.file_path),
                vec![LspTextEdit {
                    range: LspRange { start: end.clone(), end },
                    new_text: close.to_string(),
                }],
            );
            actions.push(RecodeCodeAction {
                id: "close-bracket".to_string(),
                title: format!("Insert closing bracket `{close}`"),
                kind: "quickfix".to_string(),
                edit: Some(RecodeWorkspaceEdit { changes }),
            });
        }
    }
    Ok(actions)
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

fn extract_document_symbols(
    file_path: &str,
    content: &str,
    language_id: &str,
) -> Vec<RecodeDocumentSymbol> {
    let mut symbols = Vec::new();
    let lines: Vec<&str> = content.lines().collect();
    let extension = file_path.rsplit('.').next().unwrap_or_default();
    let language = if language_id == "plaintext" { extension } else { language_id };

    for (line_index, line) in lines.iter().enumerate() {
        let trimmed = line.trim_start();
        let indent = line.len().saturating_sub(trimmed.len());

        if language == "markdown" || extension == "md" {
            if let Some(name) = trimmed.strip_prefix('#') {
                let level = trimmed.chars().take_while(|value| *value == '#').count();
                let title = name.trim_matches('#').trim();
                if !title.is_empty() {
                    symbols.push(symbol(
                        title,
                        "heading",
                        Some(format!("level {level}")),
                        line_index,
                        indent,
                        line_index,
                        line.len(),
                        None,
                    ));
                }
            }
            continue;
        }

        if language == "css" {
            if trimmed.ends_with('{') {
                let name = trimmed.trim_end_matches('{').trim();
                if !name.is_empty() && !name.starts_with('@') {
                    symbols.push(symbol(
                        name,
                        "selector",
                        None,
                        line_index,
                        indent,
                        find_block_end(&lines, line_index),
                        line.len(),
                        None,
                    ));
                }
            }
            continue;
        }

        if language == "rust" || extension == "rs" {
            if let Some((name, kind)) = rust_symbol_name(trimmed) {
                symbols.push(symbol(
                    &name,
                    kind,
                    None,
                    line_index,
                    indent + trimmed.find(&name).unwrap_or_default(),
                    find_block_end(&lines, line_index),
                    line.len(),
                    None,
                ));
            }
            continue;
        }

        if matches!(language, "typescript" | "typescriptreact" | "javascript" | "javascriptreact")
            || matches!(extension, "ts" | "tsx" | "js" | "jsx")
        {
            if let Some((name, kind)) = ts_symbol_name(trimmed) {
                symbols.push(symbol(
                    &name,
                    kind,
                    None,
                    line_index,
                    indent + trimmed.find(&name).unwrap_or_default(),
                    find_block_end(&lines, line_index),
                    line.len(),
                    None,
                ));
            }
        }
    }

    symbols
}

fn symbol(
    name: &str,
    kind: &str,
    detail: Option<String>,
    line: usize,
    character: usize,
    end_line: usize,
    end_character: usize,
    container_name: Option<String>,
) -> RecodeDocumentSymbol {
    RecodeDocumentSymbol {
        name: name.to_string(),
        kind: kind.to_string(),
        detail,
        line,
        character,
        end_line,
        end_character,
        container_name,
    }
}

fn rust_symbol_name(line: &str) -> Option<(String, &'static str)> {
    let line = line
        .strip_prefix("pub ")
        .or_else(|| line.strip_prefix("pub(crate) "))
        .unwrap_or(line);
    for (prefix, kind) in [
        ("async fn ", "function"),
        ("fn ", "function"),
        ("struct ", "struct"),
        ("enum ", "enum"),
        ("trait ", "trait"),
        ("impl ", "impl"),
        ("mod ", "module"),
    ] {
        if let Some(rest) = line.strip_prefix(prefix) {
            return first_identifier(rest).map(|name| (name, kind));
        }
    }
    None
}

fn ts_symbol_name(line: &str) -> Option<(String, &'static str)> {
    let line = line.strip_prefix("export default ").unwrap_or(line);
    let line = line.strip_prefix("export ").unwrap_or(line);
    for (prefix, kind) in [
        ("async function ", "function"),
        ("function ", "function"),
        ("class ", "class"),
        ("interface ", "interface"),
        ("type ", "type"),
        ("enum ", "enum"),
        ("const ", "constant"),
        ("let ", "variable"),
        ("var ", "variable"),
    ] {
        if let Some(rest) = line.strip_prefix(prefix) {
            return first_identifier(rest).map(|name| (name, kind));
        }
    }
    None
}

fn first_identifier(value: &str) -> Option<String> {
    let mut identifier = String::new();
    for character in value.chars() {
        if character.is_ascii_alphanumeric() || character == '_' || character == '$' {
            identifier.push(character);
            continue;
        }
        break;
    }
    if identifier.is_empty() {
        None
    } else {
        Some(identifier)
    }
}

fn find_block_end(lines: &[&str], start_line: usize) -> usize {
    let mut depth = 0usize;
    let mut saw_open = false;
    for (line_index, line) in lines.iter().enumerate().skip(start_line) {
        for character in line.chars() {
            if character == '{' {
                depth += 1;
                saw_open = true;
            } else if character == '}' && depth > 0 {
                depth -= 1;
                if saw_open && depth == 0 {
                    return line_index;
                }
            }
        }
    }
    start_line
}

fn word_at_position(content: &str, line: usize, character: usize) -> Option<String> {
    let line_text = content.lines().nth(line)?;
    let (start, end) = word_bounds(line_text, character.min(line_text.len()))?;
    Some(line_text[start..end].to_string())
}

fn word_range_at_position(content: &str, line: usize, character: usize) -> Option<LspRange> {
    let line_text = content.lines().nth(line)?;
    let (start, end) = word_bounds(line_text, character.min(line_text.len()))?;
    Some(diagnostic_range(line, start, end))
}

fn word_bounds(line: &str, character: usize) -> Option<(usize, usize)> {
    if line.is_empty() {
        return None;
    }
    let mut start = character.min(line.len());
    if start == line.len() && start > 0 {
        start -= 1;
    }
    if !is_word_byte(line.as_bytes()[start]) && start > 0 && is_word_byte(line.as_bytes()[start - 1]) {
        start -= 1;
    }
    if !is_word_byte(line.as_bytes()[start]) {
        return None;
    }
    let mut end = start;
    while start > 0 && is_word_byte(line.as_bytes()[start - 1]) {
        start -= 1;
    }
    while end < line.len() && is_word_byte(line.as_bytes()[end]) {
        end += 1;
    }
    Some((start, end))
}

fn is_word_byte(value: u8) -> bool {
    value.is_ascii_alphanumeric() || value == b'_' || value == b'$'
}

fn file_uri(path: &str) -> String {
    let normalized = path.replace('\\', "/");
    if normalized.starts_with('/') {
        format!("file://{normalized}")
    } else {
        format!("file:///{normalized}")
    }
}

fn find_word_ranges(content: &str, word: &str) -> Vec<LspRange> {
    if word.is_empty() {
        return Vec::new();
    }

    let mut ranges = Vec::new();
    for (line_index, line) in content.lines().enumerate() {
        let mut search_start = 0;
        while search_start < line.len() {
            let Some(relative_index) = line[search_start..].find(word) else {
                break;
            };
            let start = search_start + relative_index;
            let end = start + word.len();
            let before_ok = start == 0 || !is_word_byte(line.as_bytes()[start - 1]);
            let after_ok = end >= line.len() || !is_word_byte(line.as_bytes()[end]);
            if before_ok && after_ok {
                ranges.push(diagnostic_range(line_index, start, end));
            }
            search_start = end;
        }
    }
    ranges
}

fn is_valid_identifier(value: &str, language_id: &str) -> bool {
    if language_id == "markdown" || language_id == "plaintext" {
        return !value.contains('\n') && !value.contains('\r');
    }

    let mut chars = value.chars();
    let Some(first) = chars.next() else {
        return false;
    };
    if !(first.is_ascii_alphabetic() || first == '_' || first == '$') {
        return false;
    }
    chars.all(|value| value.is_ascii_alphanumeric() || value == '_' || value == '$')
}

fn format_plain_text(content: &str) -> String {
    let mut lines: Vec<String> = content
        .replace("\r\n", "\n")
        .split('\n')
        .map(|line| line.trim_end().to_string())
        .collect();
    while lines.last().is_some_and(|line| line.is_empty()) {
        lines.pop();
    }
    format!("{}\n", lines.join("\n"))
}

fn full_document_range(content: &str) -> LspRange {
    let lines: Vec<&str> = content.split('\n').collect();
    let last_line = lines.len().saturating_sub(1);
    let last_column = lines.last().map(|line| line.len()).unwrap_or_default();
    LspRange {
        start: LspRangePosition {
            line: 0,
            character: 0,
        },
        end: LspRangePosition {
            line: last_line,
            character: last_column,
        },
    }
}

struct CallContext {
    function_name: String,
    argument_prefix: String,
}

fn call_context_at_position(content: &str, line: usize, character: usize) -> Option<CallContext> {
    let before_cursor = content
        .lines()
        .take(line + 1)
        .enumerate()
        .map(|(index, value)| {
            if index == line {
                value[..character.min(value.len())].to_string()
            } else {
                value.to_string()
            }
        })
        .collect::<Vec<_>>()
        .join("\n");
    let open_index = before_cursor.rfind('(')?;
    let function_prefix = before_cursor[..open_index].trim_end();
    let function_name = function_prefix
        .chars()
        .rev()
        .take_while(|value| value.is_ascii_alphanumeric() || *value == '_' || *value == '$')
        .collect::<String>()
        .chars()
        .rev()
        .collect::<String>();
    if function_name.is_empty() {
        return None;
    }
    Some(CallContext {
        function_name,
        argument_prefix: before_cursor[open_index + 1..].to_string(),
    })
}

fn infer_signature_parameters(content: &str, function_name: &str) -> Option<Vec<String>> {
    for line in content.lines() {
        let patterns = [
            format!("function {function_name}("),
            format!("fn {function_name}("),
            format!("const {function_name} = ("),
        ];
        for pattern in patterns {
            if let Some(index) = line.find(&pattern) {
                let start = index + pattern.len();
                let end = line[start..].find(')').map(|value| start + value)?;
                let params = line[start..end]
                    .split(',')
                    .map(|value| value.trim().to_string())
                    .filter(|value| !value.is_empty())
                    .collect::<Vec<_>>();
                return Some(params);
            }
        }
    }
    None
}

fn variable_assignment(line: &str) -> Option<(String, &str)> {
    let rest = line
        .strip_prefix("const ")
        .or_else(|| line.strip_prefix("let "))
        .or_else(|| line.strip_prefix("var "))?;
    let equals = rest.find('=')?;
    Some((first_identifier(rest)?, rest[equals + 1..].trim()))
}

fn infer_value_type(value: &str) -> &'static str {
    if value.starts_with('"') || value.starts_with('\'') || value.starts_with('`') {
        "string"
    } else if value.starts_with("true") || value.starts_with("false") {
        "boolean"
    } else if value.chars().next().is_some_and(|character| character.is_ascii_digit()) {
        "number"
    } else if value.starts_with('[') {
        "array"
    } else if value.starts_with('{') {
        "object"
    } else {
        "unknown"
    }
}

fn remember_semantic_token(
    tokens: &mut Vec<RecodeSemanticToken>,
    symbol_names: &HashMap<String, String>,
    current: &str,
    line: usize,
    start_char: usize,
) {
    if current.is_empty() {
        return;
    }
    let Some(kind) = symbol_names.get(current) else {
        return;
    };
    tokens.push(RecodeSemanticToken {
        line,
        start_char,
        length: current.len(),
        token_type: kind.clone(),
    });
}
