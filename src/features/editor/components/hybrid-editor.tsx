import type React from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  EDITOR_CHAR_WIDTH,
  EDITOR_GUTTER_WIDTH,
  EDITOR_LINE_HEIGHT,
  EDITOR_OVERSCAN_LINES,
  isLargeEditorBuffer,
} from "@/features/editor/config/editor-constants";
import type { EditorBuffer } from "@/features/editor/stores/editor-store";
import { offsetToPosition, useEditorStore } from "@/features/editor/stores/editor-store";
import type { HighlightToken } from "@/features/editor/utils/tokenize-line";
import { tokenizeLine } from "@/features/editor/utils/tokenize-line";
import { tokenizeInWorker } from "@/features/editor/workers/tokenizer-client";
import { CompletionDropdown } from "@/features/lsp/components/completion-dropdown";
import {
  getCompletions,
  getDefinition,
  getDiagnostics,
  getHover,
  getInlayHints,
  getSemanticTokens,
  type RecodeCompletionItem,
  type RecodeHover,
  type RecodeInlayHint,
  type RecodeSemanticToken,
} from "@/features/lsp/services/lsp-service";
import { useDiagnosticsStore } from "@/features/lsp/stores/diagnostics-store";
import { useProjectStore } from "@/features/project/stores/project-store";
import { FileIcon } from "@/features/window/components/icons";

interface HybridEditorProps {
  buffer: EditorBuffer | null;
}

const emptyDiagnostics: ReturnType<typeof useDiagnosticsStore.getState>["diagnosticsByFile"][string] = [];

export function HybridEditor({ buffer }: HybridEditorProps) {
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const hoverTimerRef = useRef<number | null>(null);
  const hoverRequestRef = useRef(0);
  const updateBufferContent = useEditorStore((state) => state.actions.updateBufferContent);
  const undo = useEditorStore((state) => state.actions.undo);
  const redo = useEditorStore((state) => state.actions.redo);
  const setCursor = useEditorStore((state) => state.actions.setCursor);
  const setSelection = useEditorStore((state) => state.actions.setSelection);
  const setScrollPosition = useEditorStore((state) => state.actions.setScrollPosition);
  const setSearchQuery = useEditorStore((state) => state.actions.setSearchQuery);
  const goToSearchMatch = useEditorStore((state) => state.actions.goToSearchMatch);
  const revealPosition = useEditorStore((state) => state.actions.revealPosition);
  const openFileAt = useProjectStore((state) => state.actions.openFileAt);
  const [viewportHeight, setViewportHeight] = useState(600);
  const [isFindVisible, setIsFindVisible] = useState(false);
  const [tokenizedLines, setTokenizedLines] = useState<HighlightToken[][]>([]);
  const [completionItems, setCompletionItems] = useState<RecodeCompletionItem[]>([]);
  const [isCompletionDropdownVisible, setIsCompletionDropdownVisible] = useState(false);
  const [selectedCompletionIndex, setSelectedCompletionIndex] = useState(0);
  const [hoverInfo, setHoverInfo] = useState<{
    hover: RecodeHover;
    top: number;
    left: number;
  } | null>(null);
  const [inlayHints, setInlayHints] = useState<RecodeInlayHint[]>([]);
  const [semanticTokens, setSemanticTokens] = useState<RecodeSemanticToken[]>([]);
  const setDiagnostics = useDiagnosticsStore((state) => state.actions.setDiagnostics);
  const diagnostics = useDiagnosticsStore(
    (state) => (buffer ? (state.diagnosticsByFile[buffer.path] ?? emptyDiagnostics) : emptyDiagnostics),
  );

  const lines = useMemo(() => (buffer?.content ?? "").split("\n"), [buffer?.content]);
  const lineStarts = useMemo(() => buildLineStarts(buffer?.content ?? ""), [buffer?.content]);
  const scrollTop = buffer?.scrollTop ?? 0;
  const scrollLeft = buffer?.scrollLeft ?? 0;
  const isLargeBuffer = buffer ? isLargeEditorBuffer(buffer.content, lines.length) : false;
  const startLine = Math.max(0, Math.floor(scrollTop / EDITOR_LINE_HEIGHT) - EDITOR_OVERSCAN_LINES);
  const visibleCount = Math.ceil(viewportHeight / EDITOR_LINE_HEIGHT) + EDITOR_OVERSCAN_LINES * 2;
  const endLine = Math.min(lines.length, startLine + visibleCount);
  const visibleLines = lines.slice(startLine, endLine);
  const selectionRects = useMemo(
    () => (buffer ? buildSelectionRects(buffer, lineStarts, startLine, endLine, scrollLeft) : []),
    [buffer, endLine, lineStarts, scrollLeft, startLine],
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
  const semanticTokensByLine = useMemo(() => {
    const map = new Map<number, RecodeSemanticToken[]>();
    for (const token of semanticTokens) {
      map.set(token.line, [...(map.get(token.line) ?? []), token]);
    }
    return map;
  }, [semanticTokens]);
  const ghostCompletion = useMemo(() => {
    if (!buffer || completionItems.length === 0) return null;
    const prefix = currentWordPrefix(buffer.content, buffer.selection.end);
    const topItem = completionItems[0];
    if (prefix.length < 2) return null;
    if (!topItem.insertText.toLowerCase().startsWith(prefix.toLowerCase())) return null;
    if (topItem.insertText.length <= prefix.length) return null;

    return {
      text: topItem.insertText.slice(prefix.length),
      item: topItem,
    };
  }, [buffer, completionItems]);

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
    inputRef.current.scrollLeft = buffer.scrollLeft;
    inputRef.current.selectionStart = buffer.selection.start;
    inputRef.current.selectionEnd = buffer.selection.end;
    inputRef.current.focus();
  }, [buffer?.id]);

  useEffect(() => {
    const input = inputRef.current;
    if (!input || !buffer) return;
    if (input.value !== buffer.content) {
      input.value = buffer.content;
    }
    input.selectionStart = Math.min(buffer.selection.start, buffer.content.length);
    input.selectionEnd = Math.min(buffer.selection.end, buffer.content.length);
    input.scrollTop = buffer.scrollTop;
    input.scrollLeft = buffer.scrollLeft;
  }, [buffer?.content, buffer?.cursor.offset, buffer?.scrollLeft, buffer?.scrollTop, buffer?.selection.end, buffer?.selection.start]);

  useEffect(() => {
    if (!buffer || isLargeBuffer) {
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
  }, [buffer?.content, buffer?.languageId, isLargeBuffer]);

  useEffect(() => {
    if (!inputRef.current || !buffer) return;
    if (document.activeElement !== inputRef.current) return;
    inputRef.current.selectionStart = buffer.selection.start;
    inputRef.current.selectionEnd = buffer.selection.end;
    scrollSelectionIntoView(inputRef.current, buffer);
  }, [buffer?.activeSearchMatchIndex]);

  useEffect(() => {
    if (!buffer || isLargeBuffer) {
      if (buffer) setDiagnostics(buffer.path, []);
      return;
    }
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
  }, [buffer?.content, buffer?.languageId, buffer?.path, isLargeBuffer, setDiagnostics]);

  useEffect(() => {
    if (!buffer || isLargeBuffer) {
      setCompletionItems([]);
      setIsCompletionDropdownVisible(false);
      return;
    }
    const prefix = currentWordPrefix(buffer.content, buffer.selection.end);
    if (prefix.length < 2) {
      setCompletionItems([]);
      setIsCompletionDropdownVisible(false);
      return;
    }

    let cancelled = false;
    const timer = window.setTimeout(() => {
      void requestCompletions({ showDropdown: false }).then(() => {
        if (cancelled) return;
      });
    }, 180);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [buffer?.content, buffer?.languageId, buffer?.selection.end, isLargeBuffer]);

  useEffect(() => {
    if (!buffer || isLargeBuffer) {
      setInlayHints([]);
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void getInlayHints({
        filePath: buffer.path,
        content: buffer.content,
        languageId: buffer.languageId,
        startLine,
        endLine,
      }).then((hints) => {
        if (!cancelled) setInlayHints(hints);
      });
    }, 300);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [buffer?.content, buffer?.languageId, buffer?.path, endLine, isLargeBuffer, startLine]);

  useEffect(() => {
    if (!buffer || isLargeBuffer) {
      setSemanticTokens([]);
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void getSemanticTokens({
        filePath: buffer.path,
        content: buffer.content,
        languageId: buffer.languageId,
      }).then((tokens) => {
        if (!cancelled) setSemanticTokens(tokens);
      });
    }, 500);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [buffer?.content, buffer?.languageId, buffer?.path, isLargeBuffer]);

  useEffect(() => {
    setHoverInfo(null);
    hoverRequestRef.current += 1;
  }, [buffer?.id]);

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
    if (buffer.selection.end !== input.selectionEnd) {
      setIsCompletionDropdownVisible(false);
    }
    setSelection(buffer.id, {
      start: input.selectionStart,
      end: input.selectionEnd,
    });
    setCursor(buffer.id, offsetToPosition(input.value, input.selectionEnd));
  };

  const resolvePointerPosition = (event: React.MouseEvent<HTMLTextAreaElement>) => {
    const input = inputRef.current;
    if (!input) return null;
    const rect = input.getBoundingClientRect();
    const line = Math.max(
      0,
      Math.floor((event.clientY - rect.top + input.scrollTop) / EDITOR_LINE_HEIGHT),
    );
    const column = Math.max(
      0,
      Math.floor((event.clientX - rect.left - EDITOR_GUTTER_WIDTH + input.scrollLeft) / EDITOR_CHAR_WIDTH),
    );
    return { line, column };
  };

  const handleEditorMouseMove = (event: React.MouseEvent<HTMLTextAreaElement>) => {
    if (!buffer) return;
    if (event.ctrlKey || event.metaKey) return;
    const position = resolvePointerPosition(event);
    if (!position) return;

    if (hoverTimerRef.current !== null) {
      window.clearTimeout(hoverTimerRef.current);
    }
    const requestId = ++hoverRequestRef.current;
    const clientX = event.clientX;
    const clientY = event.clientY;

    hoverTimerRef.current = window.setTimeout(() => {
      void getHover({
        filePath: buffer.path,
        content: buffer.content,
        languageId: buffer.languageId,
        line: position.line,
        character: position.column,
      })
        .then((hover) => {
          if (!hover || requestId !== hoverRequestRef.current) return;
          setHoverInfo({
            hover,
            top: Math.min(window.innerHeight - 120, clientY + 16),
            left: Math.min(window.innerWidth - 340, clientX + 12),
          });
        })
        .catch(() => {
          if (requestId === hoverRequestRef.current) setHoverInfo(null);
        });
    }, 420);
  };

  const handleEditorMouseLeave = () => {
    hoverRequestRef.current += 1;
    if (hoverTimerRef.current !== null) {
      window.clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = null;
    }
    setHoverInfo(null);
  };

  const handleEditorClick = (event: React.MouseEvent<HTMLTextAreaElement>) => {
    if (!event.ctrlKey && !event.metaKey) {
      handleSelectionChange();
      return;
    }

    event.preventDefault();
    const position = resolvePointerPosition(event);
    if (!position) return;

    void getDefinition({
      filePath: buffer.path,
      content: buffer.content,
      languageId: buffer.languageId,
      line: position.line,
      character: position.column,
    }).then((locations) => {
      const location = locations[0];
      if (!location) return;
      const targetPath = fileUriToPath(location.uri);
      const targetName = targetPath.split(/[\\/]/).filter(Boolean).at(-1) ?? targetPath;
      if (targetPath === buffer.path) {
        revealPosition(buffer.id, location.range.start.line, location.range.start.character);
        requestAnimationFrame(() => inputRef.current?.focus());
        return;
      }
      void openFileAt(targetPath, targetName, location.range.start.line, location.range.start.character);
    });
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (isCompletionDropdownVisible && completionItems.length > 0) {
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
        setIsCompletionDropdownVisible(false);
        return;
      }
    }

    if ((event.ctrlKey || event.metaKey) && event.key === " ") {
      event.preventDefault();
      if (isLargeBuffer) return;
      void requestCompletions({ showDropdown: true });
      return;
    }

    if (event.key === "Escape" && ghostCompletion) {
      event.preventDefault();
      setCompletionItems([]);
      setIsCompletionDropdownVisible(false);
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
      if (ghostCompletion) {
        applyCompletion(ghostCompletion.item);
        return;
      }

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

  const requestCompletions = async ({ showDropdown }: { showDropdown: boolean }) => {
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
    setIsCompletionDropdownVisible(showDropdown && items.length > 0);
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
    setIsCompletionDropdownVisible(false);
  };

  return (
    <section className="hybrid-editor" ref={viewportRef}>
      {isLargeBuffer ? (
        <div className="large-file-banner">
          Large file mode: expensive diagnostics, semantic overlays, inlay hints, and automatic completions are paused.
        </div>
      ) : null}
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
        style={
          {
            "--editor-scroll-left": `${scrollLeft}px`,
            height: lines.length * EDITOR_LINE_HEIGHT,
            transform: `translateY(${-scrollTop}px)`,
          } as React.CSSProperties
        }
        aria-hidden="true"
      >
        <div className="selection-layer" style={{ transform: `translateY(${startLine * EDITOR_LINE_HEIGHT}px)` }}>
          {selectionRects.map((rect) => (
            <span
              className="selection-rect"
              key={`${rect.line}-${rect.left}-${rect.width}`}
              style={{
                top: rect.line * EDITOR_LINE_HEIGHT,
                left: rect.left,
                width: rect.width,
                height: EDITOR_LINE_HEIGHT,
              }}
            />
          ))}
        </div>
        <div style={{ transform: `translateY(${startLine * EDITOR_LINE_HEIGHT}px)` }}>
          {visibleLines.map((line, index) => {
            const lineNumber = startLine + index + 1;
            const absoluteLineIndex = startLine + index;
            const diagnosticSeverity = diagnosticsByLine.get(absoluteLineIndex);
            return (
              <div
                className={`editor-line ${diagnosticSeverity ? `diagnostic-${diagnosticSeverity}` : ""}`}
                key={`${buffer.id}:${lineNumber}`}
                style={{ height: EDITOR_LINE_HEIGHT }}
                title={diagnostics.find((diagnostic) => diagnostic.range.start.line === absoluteLineIndex)?.message}
              >
                <span className="line-number">{lineNumber}</span>
                <code>
                  {renderLineWithSearch(
                    line,
                    lineStarts[absoluteLineIndex] ?? 0,
                    buffer,
                    tokenizedLines[absoluteLineIndex],
                    semanticTokensByLine.get(absoluteLineIndex),
                  )}
                </code>
              </div>
            );
          })}
        </div>
      </div>
      <div className="inlay-hints-layer" aria-hidden="true">
        {inlayHints.map((hint, index) => (
          <span
            className="inlay-hint"
            key={`${hint.line}:${hint.character}:${hint.label}:${index}`}
            style={{
              top: hint.line * EDITOR_LINE_HEIGHT - scrollTop,
              left: EDITOR_GUTTER_WIDTH + hint.character * EDITOR_CHAR_WIDTH - scrollLeft,
            }}
          >
            {hint.label}
          </span>
        ))}
      </div>
      {ghostCompletion ? (
        <span
          className="ghost-completion"
          style={{
            top: (buffer.cursor.line + 1) * EDITOR_LINE_HEIGHT - scrollTop - EDITOR_LINE_HEIGHT,
            left: EDITOR_GUTTER_WIDTH + buffer.cursor.column * EDITOR_CHAR_WIDTH - scrollLeft,
          }}
          aria-hidden="true"
        >
          {ghostCompletion.text}
        </span>
      ) : null}
      {hoverInfo ? (
        <div
          className="editor-hover-tooltip"
          style={{ top: hoverInfo.top, left: hoverInfo.left }}
          onMouseDown={(event) => event.preventDefault()}
        >
          {hoverInfo.hover.contents}
        </div>
      ) : null}
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
        onClick={handleEditorClick}
        onKeyUp={handleSelectionChange}
        onKeyDown={handleKeyDown}
        onSelect={handleSelectionChange}
        onMouseMove={handleEditorMouseMove}
        onMouseLeave={handleEditorMouseLeave}
        onScroll={(event) =>
          setScrollPosition(buffer.id, event.currentTarget.scrollTop, event.currentTarget.scrollLeft)
        }
      />
      <CompletionDropdown
        items={isCompletionDropdownVisible ? completionItems : []}
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
  semanticTokens?: RecodeSemanticToken[],
) {
  const lineEnd = lineStart + line.length;
  const matches = buffer.searchMatches.filter(
    (match) => match.end > lineStart && match.start <= lineEnd,
  );

  if (matches.length === 0) {
    if (semanticTokens && semanticTokens.length > 0) {
      return renderSemanticLine(line, buffer.languageId, semanticTokens);
    }
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

function renderSemanticLine(line: string, languageId: string, semanticTokens: RecodeSemanticToken[]) {
  const parts: React.ReactNode[] = [];
  let cursor = 0;
  const sorted = [...semanticTokens].sort((a, b) => a.startChar - b.startChar);

  sorted.forEach((semanticToken, index) => {
    const start = Math.max(0, Math.min(semanticToken.startChar, line.length));
    const end = Math.max(start, Math.min(start + semanticToken.length, line.length));
    if (start > cursor) {
      parts.push(renderTokenizedSegment(line.slice(cursor, start), languageId, `semantic-plain-${cursor}`));
    }
    parts.push(
      <span className={`sem ${semanticToken.tokenType}`} key={`semantic-${start}-${index}`}>
        {line.slice(start, end)}
      </span>,
    );
    cursor = end;
  });

  if (cursor < line.length) {
    parts.push(renderTokenizedSegment(line.slice(cursor), languageId, `semantic-tail-${cursor}`));
  }
  return parts;
}

function buildSelectionRects(
  buffer: EditorBuffer,
  lineStarts: number[],
  startLine: number,
  endLine: number,
  scrollLeft: number,
) {
  const start = Math.min(buffer.selection.start, buffer.selection.end);
  const end = Math.max(buffer.selection.start, buffer.selection.end);
  if (start === end) return [];

  const rects: Array<{ line: number; left: number; width: number }> = [];
  for (let line = startLine; line < endLine; line += 1) {
    const lineStart = lineStarts[line] ?? 0;
    const lineEnd = lineStarts[line + 1] ? lineStarts[line + 1] - 1 : buffer.content.length;
    if (end < lineStart || start > lineEnd) continue;

    const selectionStartColumn = Math.max(0, start - lineStart);
    const selectionEndColumn = Math.max(selectionStartColumn, Math.min(lineEnd, end) - lineStart);
    rects.push({
      line: line - startLine,
      left: EDITOR_GUTTER_WIDTH + selectionStartColumn * EDITOR_CHAR_WIDTH - scrollLeft,
      width: Math.max(
        EDITOR_CHAR_WIDTH,
        (selectionEndColumn - selectionStartColumn) * EDITOR_CHAR_WIDTH,
      ),
    });
  }

  return rects;
}

function scrollSelectionIntoView(input: HTMLTextAreaElement, buffer: EditorBuffer) {
  const line = offsetToPosition(buffer.content, buffer.selection.end).line;
  const targetTop = line * EDITOR_LINE_HEIGHT;
  const targetBottom = targetTop + EDITOR_LINE_HEIGHT;
  if (targetTop < input.scrollTop) {
    input.scrollTop = Math.max(0, targetTop - EDITOR_LINE_HEIGHT * 3);
  } else if (targetBottom > input.scrollTop + input.clientHeight) {
    input.scrollTop = targetBottom - input.clientHeight + EDITOR_LINE_HEIGHT * 3;
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

function currentWordPrefix(content: string, offset: number) {
  const start = findWordStart(content, offset);
  return content.slice(start, offset);
}

function fileUriToPath(uri: string) {
  const withoutScheme = uri.replace(/^file:\/\/\/?/, "");
  const decoded = decodeURIComponent(withoutScheme);
  if (/^[A-Za-z]:\//.test(decoded)) return decoded.replaceAll("/", "\\");
  return decoded;
}
