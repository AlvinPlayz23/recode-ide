import { useEffect, useMemo, useRef, useState } from "react";
import type { EditorBuffer } from "@/features/editor/stores/editor-store";
import { useEditorStore } from "@/features/editor/stores/editor-store";
import { tokenizeLine } from "@/features/editor/utils/tokenize-line";
import { FileIcon } from "@/features/window/components/icons";

interface HybridEditorProps {
  buffer: EditorBuffer | null;
}

const lineHeight = 22;
const overscan = 12;

export function HybridEditor({ buffer }: HybridEditorProps) {
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const updateBufferContent = useEditorStore((state) => state.actions.updateBufferContent);
  const setCursor = useEditorStore((state) => state.actions.setCursor);
  const setScrollTop = useEditorStore((state) => state.actions.setScrollTop);
  const [viewportHeight, setViewportHeight] = useState(600);

  const lines = useMemo(() => (buffer?.content ?? "").split("\n"), [buffer?.content]);
  const scrollTop = buffer?.scrollTop ?? 0;
  const startLine = Math.max(0, Math.floor(scrollTop / lineHeight) - overscan);
  const visibleCount = Math.ceil(viewportHeight / lineHeight) + overscan * 2;
  const endLine = Math.min(lines.length, startLine + visibleCount);
  const visibleLines = lines.slice(startLine, endLine);

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
  };

  const handleSelectionChange = () => {
    const input = inputRef.current;
    if (!input) return;
    const offset = input.selectionStart;
    const beforeCursor = input.value.slice(0, offset);
    const split = beforeCursor.split("\n");
    setCursor(buffer.id, {
      line: split.length - 1,
      column: split.at(-1)?.length ?? 0,
      offset,
    });
  };

  return (
    <section className="hybrid-editor" ref={viewportRef}>
      <div
        className="editor-render-layer"
        style={{ height: lines.length * lineHeight, transform: `translateY(${-scrollTop}px)` }}
        aria-hidden="true"
      >
        <div style={{ transform: `translateY(${startLine * lineHeight}px)` }}>
          {visibleLines.map((line, index) => {
            const lineNumber = startLine + index + 1;
            return (
              <div className="editor-line" key={`${buffer.id}:${lineNumber}`} style={{ height: lineHeight }}>
                <span className="line-number">{lineNumber}</span>
                <code>
                  {tokenizeLine(line, buffer.languageId).map((token, tokenIndex) => (
                    <span className={`tok ${token.kind}`} key={`${token.value}:${tokenIndex}`}>
                      {token.value || " "}
                    </span>
                  ))}
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
        aria-label={`Editing ${buffer.name}`}
        onChange={(event) => handleInput(event.currentTarget.value)}
        onClick={handleSelectionChange}
        onKeyUp={handleSelectionChange}
        onSelect={handleSelectionChange}
        onScroll={(event) => setScrollTop(buffer.id, event.currentTarget.scrollTop)}
      />
    </section>
  );
}
