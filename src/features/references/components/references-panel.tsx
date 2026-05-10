import { useMemo } from "react";
import { useProjectStore } from "@/features/project/stores/project-store";
import { useReferencesStore } from "@/features/references/stores/references-store";

export function ReferencesPanel() {
  const symbol = useReferencesStore((state) => state.symbol);
  const results = useReferencesStore((state) => state.results);
  const isSearching = useReferencesStore((state) => state.isSearching);
  const openFileAt = useProjectStore((state) => state.actions.openFileAt);

  const groups = useMemo(() => {
    const byFile = new Map<string, typeof results>();
    for (const result of results) {
      byFile.set(result.filePath, [...(byFile.get(result.filePath) ?? []), result]);
    }
    return Array.from(byFile.entries()).map(([filePath, fileResults]) => ({
      filePath,
      fileName: fileResults[0]?.fileName ?? filePath,
      relativePath: fileResults[0]?.relativePath ?? filePath,
      results: fileResults,
    }));
  }, [results]);

  return (
    <div className="navigator-panel references-panel">
      <div className="panel-header">
        <h2>References</h2>
      </div>
      <div className="panel-subheader">
        <span>{symbol ? `"${symbol}"` : "No symbol selected"}</span>
        <span>{isSearching ? "Searching..." : `${results.length} found`}</span>
      </div>
      <div className="references-list">
        {!symbol ? (
          <div className="empty-row">Put the cursor on a symbol and run Find References.</div>
        ) : groups.length === 0 ? (
          <div className="empty-row">{isSearching ? "Scanning workspace..." : "No references found."}</div>
        ) : (
          groups.map((group) => (
            <section className="reference-group" key={group.filePath}>
              <div className="reference-file-title">{group.relativePath}</div>
              {group.results.map((result) => (
                <button
                  type="button"
                  className="reference-row"
                  key={`${result.filePath}:${result.line}:${result.character}`}
                  onClick={() =>
                    void openFileAt(result.filePath, result.fileName, result.line, result.character)
                  }
                >
                  <span className="reference-location">
                    {result.line + 1}:{result.character + 1}
                  </span>
                  <span className="reference-excerpt">{result.excerpt}</span>
                </button>
              ))}
            </section>
          ))
        )}
      </div>
    </div>
  );
}
