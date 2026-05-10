import { tokenizeLine } from "@/features/editor/utils/tokenize-line";
import { Language, Parser, Query } from "web-tree-sitter";
import type { HighlightToken } from "@/features/editor/utils/tokenize-line";

interface TokenizeRequest {
  id: number;
  content: string;
  languageId: string;
}

interface LoadedLanguage {
  parser: Parser;
  query: Query | null;
}

const loadedLanguages = new Map<string, Promise<LoadedLanguage>>();
let initPromise: Promise<void> | null = null;

self.onmessage = (event: MessageEvent<TokenizeRequest>) => {
  const { id, content, languageId } = event.data;
  void tokenizeWithTreeSitter(content, languageId)
    .catch(() => content.split("\n").map((line) => tokenizeLine(line, languageId)))
    .then((tokenizedLines) => {
      self.postMessage({ id, tokenizedLines });
    });
};

async function initializeTreeSitter() {
  initPromise ??= Parser.init({
    locateFile(scriptName: string) {
      const baseOrigin = globalThis.location?.origin ? `${globalThis.location.origin}/` : "/";
      return new URL(`tree-sitter/${scriptName}`, baseOrigin).toString();
    },
  });
  return initPromise;
}

async function tokenizeWithTreeSitter(content: string, languageId: string) {
  const loaded = await loadLanguage(languageId);
  if (!loaded.query) {
    return content.split("\n").map((line) => tokenizeLine(line, languageId));
  }

  const tree = loaded.parser.parse(content);
  if (!tree) {
    return content.split("\n").map((line) => tokenizeLine(line, languageId));
  }

  try {
    const captures = loaded.query.captures(tree.rootNode);
    return buildTokenizedLines(content, captures);
  } finally {
    tree.delete();
  }
}

function loadLanguage(languageId: string) {
  const assetLanguageId = getAssetLanguageId(languageId);
  const existing = loadedLanguages.get(assetLanguageId);
  if (existing) return existing;

  const loading = (async (): Promise<LoadedLanguage> => {
    await initializeTreeSitter();
    const wasmBytes = await fetchBytes(`/tree-sitter/parsers/${assetLanguageId}/parser.wasm`);
    const language = await Language.load(wasmBytes);
    const parser = new Parser();
    parser.setLanguage(language);

    let query: Query | null = null;
    try {
      const queryText = await fetchText(`/tree-sitter/parsers/${assetLanguageId}/highlights.scm`);
      query = queryText.trim() ? new Query(language, queryText) : null;
    } catch {
      query = null;
    }

    return { parser, query };
  })();

  loadedLanguages.set(assetLanguageId, loading);
  return loading;
}

async function fetchBytes(url: string) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to fetch ${url}`);
  return new Uint8Array(await response.arrayBuffer());
}

async function fetchText(url: string) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to fetch ${url}`);
  return response.text();
}

function getAssetLanguageId(languageId: string) {
  if (languageId === "typescriptreact") return "tsx";
  if (languageId === "javascriptreact") return "tsx";
  return languageId;
}

function buildTokenizedLines(content: string, captures: ReturnType<Query["captures"]>) {
  const lines = content.split("\n");
  const lineStarts = buildLineStarts(content);
  const tokenizedLines = lines.map<HighlightToken[]>((line) => [{ value: line, kind: "plain" }]);

  const ranges = captures
    .map((capture) => ({
      start: capture.node.startIndex,
      end: capture.node.endIndex,
      kind: mapCaptureName(capture.name),
    }))
    .filter((range) => range.end > range.start)
    .sort((a, b) => a.start - b.start || b.end - a.end);

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex];
    const lineStart = lineStarts[lineIndex] ?? 0;
    const lineEnd = lineStart + line.length;
    const lineRanges = ranges.filter((range) => range.end > lineStart && range.start < lineEnd);

    if (lineRanges.length === 0) continue;

    const tokens: HighlightToken[] = [];
    let cursor = 0;

    for (const range of lineRanges) {
      const start = Math.max(0, range.start - lineStart);
      const end = Math.min(line.length, range.end - lineStart);
      if (start < cursor) continue;
      if (start > cursor) {
        tokens.push({ value: line.slice(cursor, start), kind: "plain" });
      }
      tokens.push({ value: line.slice(start, end), kind: range.kind });
      cursor = end;
    }

    if (cursor < line.length) {
      tokens.push({ value: line.slice(cursor), kind: "plain" });
    }

    tokenizedLines[lineIndex] = tokens.length > 0 ? tokens : [{ value: line, kind: "plain" }];
  }

  return tokenizedLines;
}

function buildLineStarts(content: string) {
  const starts = [0];
  for (let index = 0; index < content.length; index += 1) {
    if (content[index] === "\n") starts.push(index + 1);
  }
  return starts;
}

function mapCaptureName(name: string): HighlightToken["kind"] {
  if (name.includes("comment")) return "comment";
  if (name.includes("string")) return "string";
  if (name.includes("number") || name.includes("constant.numeric")) return "number";
  if (
    name.includes("keyword") ||
    name.includes("function") ||
    name.includes("type") ||
    name.includes("operator") ||
    name.includes("constructor")
  ) {
    return "keyword";
  }
  return "plain";
}
