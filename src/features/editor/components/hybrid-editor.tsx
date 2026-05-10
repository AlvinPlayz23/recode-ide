import type React from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { EditorBuffer } from "@/features/editor/stores/editor-store";
import { offsetToPosition, useEditorStore } from "@/features/editor/stores/editor-store";
import type { HighlightToken } from "@/features/editor/utils/tokenize-line";
import { tokenizeLine } from "@/features/editor/utils/tokenize-line";
import { tokenizeInWorker } from "@/features/editor/workers/tokenizer-client";
import { CompletionDropdown } from "@/features/lsp/components/completion-dropdown";
import { getCompletions, getDiagnostics, type RecodeCompletionItem } from "@/features/lsp/services/lsp-service";
import { useDiagnosticsStore } from "@/features/lsp/stores/diagnostics-store";
import { FileIcon } from "@/features/window/components/icons";

interface HybridEditorProps {
  buffer: EditorBuffer | null;
}

const lineHeight = 22;
const overscan = 12;
const emptyDiagnostics: ReturnType<typeof useDiagnosticsStore.getState>["diagnosticsByFile"][string] = [];

export function HybridEditor({ buffer }: HybridEditorProps) {
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const updateBufferContent = useEditorStore((state) => state.actions.updateBufferContent);
  const saveBuffer = useEditorStore((state) => state.actions.saveBuffer);
  const undo = useEditorStore((state) => state.actions.undo);
  const redo = useEditorStore((state) => state.actions.redo);
  const setCursor = useEditorStore((state) => state.actions.setCursor);
  const setSelection = useEditorStore((state) => state.actions.setSelection);
  const setScrollTop = useEditorStore((state) => state.actions.setScrollTop);
  const setSearchQuery = useEditorStore((state) => state.actions.setSearchQuery);
  const goToSearchMatch = useEditorStore((state) => state.actions.goToSearchMatch);
  const [viewportHeight, setViewportHeight] = useState(600);
  const [isFindVisible, setIsFindVisible] = useState(false);
  const [tokenizedLines, setTokenizedLines] = useState<HighlightToken[][]>([]);
  const [completionItems, setCompletionItems] = useState<RecodeCompletionItem[]>([]);
  const [selectedCompletionIndex, setSelectedCompletionIndex] = useState(0);
  const setDiagnostics = useDiagnosticsStore((state) => state.actions.setDiagnostics);
  const diagnostics = useDiagnosticsStore(
    (state) => (buffer ? (state.diagnosticsByFile[buffer.path] ?? emptyDiagnostics) : emptyDiagnostics),
  );

  const lines = useMemo(() => (buffer?.content ?? "").split("\n"), [buffer?.content]);
  const lineStarts = useMemo(() => buildLineStarts(buffer?.content ?? ""), [buffer?.content]);
  const scrollTop = buffer?.scrollTop ?? 0;
  const startLine = Math.max(0, Math.floor(scrollTop / lineHeight) - overscan);
  const visibleCount = Math.ceil(viewportHeight / lineHeight) + overscan * 2;
  const endLine = Math.min(lines.length, startLine + visibleCount);
  const visibleLines = lines.slice(startLine, endLine);
  const selectionRects = useMemo(
    () => (buffer ? buildSelectionRects(buffer, lineStarts, startLine, endLine) : []),
    [buffer, endLine, lineStarts, startLine],
  );
  const diagnosticsByLine = useMemo(() => {
    const map = new Map<number, "error" | "warning" | "info">();
    for (const diagnostic of diagnostics) {
      const existing = map.get(diagnostic.range.start.line);
      if (existing === "error") continue;
      if (diagnostic.severity === "error" || !existing || existing === "info") {
        map.set(diagnostic.range.start.line, diagnostic.severity);
      }
    }
    return map;
  }, [diagnostics]);

  useEffect(() => {
    if (!viewportRef.current) return;
    const observer = new ResizeObserver(([entry]) => {
      setViewportHeight(entry.contentRect.height);
    });
    observer.observe(viewportRef.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!inputRef.current || !buffer) return;
    inputRef.current.value = buffer.content;
    inputRef.current.scrollTop = buffer.scrollTop;
    inputRef.current.selectionStart = buffer.selection.start;
    inputRef.current.selectionEnd = buffer.selection.end;
    inputRef.current.focus();
  }, [buffer?.id]);

  useEffect(() => {
    if (!buffer) {
      setTokenizedLines([]);
      return;
    }

    let cancelled = false;
    void tokenizeInWorker(buffer.content, buffer.languageId).then((nextTokens) => {
      if (!cancelled) setTokenizedLines(nextTokens);
    });
    return () => {
      cancelled = true;
    };
  }, [buffer?.content, buffer?.languageId]);

  useEffect(() => {
    if (!inputRef.current || !buffer) return;
    if (document.activeElement !== inputRef.current) return;
    inputRef.current.selectionStart = buffer.selection.start;
    inputRef.current.selectionEnd = buffer.selection.end;
    scrollSelectionIntoView(inputRef.current, buffer);
  }, [buffer?.activeSearchMatchIndex]);

  useEffect(() => {
    if (!buffer) return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void getDiagnostics({
        filePath: buffer.path,
        content: buffer.content,
        languageId: buffer.languageId,
      }).then((nextDiagnostics) => {
        if (!cancelled) setDiagnostics(buffer.path, nextDiagnostics);
      });
    }, 250);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [buffer?.content, buffer?.languageId, buffer?.path, setDiagnostics]);

  if (!buffer) {
    return (
      <section className="editor-empty">
        <span className="empty-mark">
          <FileIcon size={26} />
        </span>
        <h1>No file open</h1>
        <p>
          Pick a file from the explorer or press <kbd>Ctrl</kbd>
          <kbd>K</kbd> to search the workspace.
        </p>
      </section>
    );
  }

  const handleInput = (content: string) => {
    setCompletionItems([]);
    updateBufferContent(buffer.id, content);
    const input = inputRef.current;
    if (!input) return;
    setSelection(buffer.id, {
      start: input.selectionStart,
      end: input.selectionEnd,
    });
    setCursor(buffer.id, offsetToPosition(content, input.selectionEnd));
  };

  const handleSelectionChange = () => {
    const input = inputRef.current;
    if (!input) return;
    setSelection(buffer.id, {
      start: input.selectionStart,
      end: input.selectionEnd,
    });
    setCursor(buffer.id, offsetToPosition(input.value, input.selectionEnd));
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (completionItems.length > 0) {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setSelectedCompletionIndex((index) => Math.min(index + 1, completionItems.length - 1));
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        setSelectedCompletionIndex((index) => Math.max(index - 1, 0));
        return;
      }
      if (event.key === "Enter" || event.key === "Tab") {
        event.preventDefault();
        applyCompletion(completionItems[selectedCompletionIndex]);
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        setCompletionItems([]);
        return;
      }
    }

    if ((event.ctrlKey || event.metaKey) && event.key === " ") {
      event.preventDefault();
      void requestCompletions();
      return;
    }

    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
      event.preventDefault();
      void saveBuffer(buffer.id);
      return;
    }

    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z" && !event.shiftKey) {
      event.preventDefault();
      undo(buffer.id);
      return;
    }

    if (
      ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "y") ||
      ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase() === "z")
    ) {
      event.preventDefault();
      redo(buffer.id);
      return;
    }

    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "f") {
      event.preventDefault();
      setIsFindVisible(true);
      return;
    }

    if (event.key === "Escape" && isFindVisible) {
      event.preventDefault();
      setIsFindVisible(false);
      return;
    }

    if (event.key === "Tab") {
      event.preventDefault();
      const input = inputRef.current;
      if (!input) return;

      const start = input.selectionStart;
      const end = input.selectionEnd;
      const value = input.value;
      const replacement = "  ";
      const nextValue = value.slice(0, start) + replacement + value.slice(end);
      const nextOffset = start + replacement.length;

      input.value = nextValue;
      input.selectionStart = nextOffset;
      input.selectionEnd = nextOffset;
      updateBufferContent(buffer.id, nextValue);
      setSelection(buffer.id, { start: nextOffset, end: nextOffset });
      setCursor(buffer.id, offsetToPosition(nextValue, nextOffset));
    }
  };

  const requestCompletions = async () => {
    const input = inputRef.current;
    if (!input) return;
    const position = offsetToPosition(input.value, input.selectionEnd);
    const items = await getCompletions({
      content: input.value,
      languageId: buffer.languageId,
      line: position.line,
      character: position.column,
    });
    setSelectedCompletionIndex(0);
    setCompletionItems(items);
  };

  const applyCompletion = (item?: RecodeCompletionItem) => {
    if (!item) return;
    const input = inputRef.current;
    if (!input) return;

    const start = findWordStart(input.value, input.selectionStart);
    const end = input.selectionEnd;
    const nextValue = input.value.slice(0, start) + item.insertText + input.value.slice(end);
    const nextOffset = start + item.insertText.length;

    input.value = nextValue;
    input.selectionStart = nextOffset;
    input.selectionEnd = nextOffset;
    updateBufferContent(buffer.id, nextValue);
    setSelection(buffer.id, { start: nextOffset, end: nextOffset });
    setCursor(buffer.id, offsetToPosition(nextValue, nextOffset));
    setCompletionItems([]);
  };

  return (
    <section className="hybrid-editor" ref={viewportRef}>
      {isFindVisible ? (
        <div className="find-bar">
          <input
            autoFocus
            value={buffer.searchQuery}
            onChange={(event) => setSearchQuery(buffer.id, event.currentTarget.value)}
            placeholder="Find in file"
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                goToSearchMatch(buffer.id, event.shiftKey ? -1 : 1);
              }
              if (event.key === "Escape") {
                event.preventDefault();
                setIsFindVisible(false);
              }
            }}
          />
          <span>
            {buffer.searchMatches.length === 0
              ? "No results"
              : `${buffer.activeSearchMatchIndex + 1}/${buffer.searchMatches.length}`}
          </span>
          <button type="button" onClick={() => goToSearchMatch(buffer.id, -1)}>Prev</button>
          <button type="button" onClick={() => goToSearchMatch(buffer.id, 1)}>Next</button>
          <button type="button" onClick={() => setIsFindVisible(false)}>Close</button>
        </div>
      ) : null}
      <div
        className="editor-render-layer"
        style={{ height: lines.length * lineHeight, transform: `translateY(${-scrollTop}px)` }}
        aria-hidden="true"
      >
        <div className="selection-layer" style={{ transform: `translateY(${startLine * lineHeight}px)` }}>
          {selectionRects.map((rect) => (
            <span
              className="selection-rect"
              key={`${rect.line}-${rect.left}-${rect.width}`}
              style={{
                top: rect.line * lineHeight,
                left: rect.left,
                width: rect.width,
                height: lineHeight,
              }}
            />
          ))}
        </div>
        <div style={{ transform: `translateY(${startLine * lineHeight}px)` }}>
          {visibleLines.map((line, index) => {
            const lineNumber = startLine + index + 1;
            const absoluteLineIndex = startLine + index;
            const diagnosticSeverity = diagnosticsByLine.get(absoluteLineIndex);
            return (
              <div
                className={`editor-line ${diagnosticSeverity ? `diagnostic-${diagnosticSeverity}` : ""}`}
                key={`${buffer.id}:${lineNumber}`}
                style={{ height: lineHeight }}
                title={diagnostics.find((diagnostic) => diagnostic.range.start.line === absoluteLineIndex)?.message}
              >
                <span className="line-number">{lineNumber}</span>
                <code>
                  {renderLineWithSearch(
                    line,
                    lineStarts[absoluteLineIndex] ?? 0,
                    buffer,
                    tokenizedLines[absoluteLineIndex],
                  )}
                </code>
              </div>
            );
          })}
        </div>
      </div>
      <textarea
        ref={inputRef}
        className="editor-input-layer"
        defaultValue={buffer.content}
        spellCheck={false}
        autoCapitalize="off"
        autoComplete="off"
        autoCorrect="off"
        wrap="off"
        aria-label={`Editing ${buffer.name}`}
        onChange={(event) => handleInput(event.currentTarget.value)}
        onClick={handleSelectionChange}
        onKeyUp={handleSelectionChange}
        onKeyDown={handleKeyDown}
        onSelect={handleSelectionChange}
        onScroll={(event) => setScrollTop(buffer.id, event.currentTarget.scrollTop)}
      />
      <CompletionDropdown
        items={completionItems}
        selectedIndex={selectedCompletionIndex}
        line={buffer.cursor.line}
        column={buffer.cursor.column}
        scrollTop={scrollTop}
        onHover={setSelectedCompletionIndex}
        onSelect={applyCompletion}
      />
    </section>
  );
}

function buildLineStarts(content: string) {
  const starts = [0];
  for (let index = 0; index < content.length; index += 1) {
    if (content[index] === "\n") starts.push(index + 1);
  }
  return starts;
}

function renderLineWithSearch(
  line: string,
  lineStart: number,
  buffer: EditorBuffer,
  precomputedTokens?: HighlightToken[],
) {
  const lineEnd = lineStart + line.length;
  const matches = buffer.searchMatches.filter(
    (match) => match.end > lineStart && match.start <= lineEnd,
  );

  if (matches.length === 0) {
    return (precomputedTokens ?? tokenizeLine(line, buffer.languageId)).map((token, tokenIndex) => (
      <span className={`tok ${token.kind}`} key={`${token.value}:${tokenIndex}`}>
        {token.value || " "}
      </span>
    ));
  }

  const parts: React.ReactNode[] = [];
  let cursor = 0;

  matches.forEach((match) => {
    const start = Math.max(0, match.start - lineStart);
    const end = Math.min(line.length, match.end - lineStart);
    if (start > cursor) {
      parts.push(renderTokenizedSegment(line.slice(cursor, start), buffer.languageId, `plain-${cursor}`));
    }
    parts.push(
      <mark
        className={`search-hit ${
          buffer.searchMatches[buffer.activeSearchMatchIndex] === match ? "active" : ""
        }`}
        key={`match-${match.start}`}
      >
        {line.slice(start, end)}
      </mark>,
    );
    cursor = end;
  });

  if (cursor < line.length) {
    parts.push(renderTokenizedSegment(line.slice(cursor), buffer.languageId, `plain-${cursor}`));
  }

  return parts;
}

function buildSelectionRects(
  buffer: EditorBuffer,
  lineStarts: number[],
  startLine: number,
  endLine: number,
) {
  const start = Math.min(buffer.selection.start, buffer.selection.end);
  const end = Math.max(buffer.selection.start, buffer.selection.end);
  if (start === end) return [];

  const rects: Array<{ line: number; left: number; width: number }> = [];
  const charWidth = 7.83;
  const gutterWidth = 48;

  for (let line = startLine; line < endLine; line += 1) {
    const lineStart = lineStarts[line] ?? 0;
    const lineEnd = lineStarts[line + 1] ? lineStarts[line + 1] - 1 : buffer.content.length;
    if (end < lineStart || start > lineEnd) continue;

    const selectionStartColumn = Math.max(0, start - lineStart);
    const selectionEndColumn = Math.max(selectionStartColumn, Math.min(lineEnd, end) - lineStart);
    rects.push({
      line: line - startLine,
      left: gutterWidth + selectionStartColumn * charWidth,
      width: Math.max(charWidth, (selectionEndColumn - selectionStartColumn) * charWidth),
    });
  }

  return rects;
}

function scrollSelectionIntoView(input: HTMLTextAreaElement, buffer: EditorBuffer) {
  const line = offsetToPosition(buffer.content, buffer.selection.end).line;
  const targetTop = line * lineHeight;
  const targetBottom = targetTop + lineHeight;
  if (targetTop < input.scrollTop) {
    input.scrollTop = Math.max(0, targetTop - lineHeight * 3);
  } else if (targetBottom > input.scrollTop + input.clientHeight) {
    input.scrollTop = targetBottom - input.clientHeight + lineHeight * 3;
  }
}

function renderTokenizedSegment(segment: string, languageId: string, keyPrefix: string) {
  return tokenizeLine(segment, languageId).map((token, tokenIndex) => (
    <span className={`tok ${token.kind}`} key={`${keyPrefix}-${token.value}-${tokenIndex}`}>
      {token.value || " "}
    </span>
  ));
}

function findWordStart(content: string, offset: number) {
  let index = Math.max(0, offset);
  while (index > 0 && /[\w$]/.test(content[index - 1])) {
    index -= 1;
  }
  return index;
}
