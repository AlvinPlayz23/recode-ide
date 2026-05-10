import { useEffect, useMemo, useRef, useState } from "react";
import { fuzzyScore } from "@/features/quick-open/utils/fuzzy-search";
import { useQuickOpenStore } from "@/features/quick-open/stores/quick-open-store";
import { useProjectStore } from "@/features/project/stores/project-store";
import { CommandIcon, FileIcon } from "@/features/window/components/icons";

export function QuickOpen() {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const isOpen = useQuickOpenStore((state) => state.isOpen);
  const query = useQuickOpenStore((state) => state.query);
  const setQuery = useQuickOpenStore((state) => state.actions.setQuery);
  const close = useQuickOpenStore((state) => state.actions.close);
  const files = useProjectStore((state) => state.files);
  const openFile = useProjectStore((state) => state.actions.openFile);
  const [selectedIndex, setSelectedIndex] = useState(0);

  const results = useMemo(() => {
    const fileResults = files
      .filter((file) => file.kind === "file")
      .map((file) => ({
        file,
        score: Math.max(fuzzyScore(file.name, query), fuzzyScore(file.relativePath, query)),
      }))
      .filter((result) => result.score > 0)
      .sort((a, b) => b.score - a.score || a.file.relativePath.localeCompare(b.file.relativePath))
      .slice(0, 80);

    return fileResults;
  }, [files, query]);

  useEffect(() => {
    if (!isOpen) return;
    setSelectedIndex(0);
    requestAnimationFrame(() => inputRef.current?.focus());
  }, [isOpen, query]);

  if (!isOpen) return null;

  const openSelected = () => {
    const selected = results[selectedIndex]?.file;
    if (!selected) return;
    void openFile(selected.path, selected.name);
    close();
  };

  return (
    <div className="palette-backdrop" onMouseDown={close}>
      <div className="command-palette quick-open" onMouseDown={(event) => event.stopPropagation()}>
        <div className="palette-input-row">
          <span className="palette-icon">
            <CommandIcon />
          </span>
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape") close();
              if (event.key === "ArrowDown") {
                event.preventDefault();
                setSelectedIndex((index) => Math.min(index + 1, results.length - 1));
              }
              if (event.key === "ArrowUp") {
                event.preventDefault();
                setSelectedIndex((index) => Math.max(index - 1, 0));
              }
              if (event.key === "Enter") {
                event.preventDefault();
                openSelected();
              }
            }}
            placeholder="Type a file name..."
          />
          <kbd>Ctrl</kbd>
          <kbd>P</kbd>
        </div>
        <div className="command-list">
          {results.length === 0 ? (
            <div className="cmd-empty">{files.length === 0 ? "Open a folder first." : "No matching files."}</div>
          ) : (
            results.map(({ file }, index) => (
              <button
                key={file.path}
                type="button"
                className={index === selectedIndex ? "selected" : ""}
                onMouseEnter={() => setSelectedIndex(index)}
                onClick={() => {
                  void openFile(file.path, file.name);
                  close();
                }}
              >
                <span className="cmd-icon">
                  <FileIcon />
                </span>
                <span className="cmd-text">
                  <span className="cmd-title">{file.name}</span>
                  <span className="cmd-detail">{file.relativePath}</span>
                </span>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
