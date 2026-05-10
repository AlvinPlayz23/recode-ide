import { useMemo, useState } from "react";
import { readFile } from "@/features/file-explorer/services/file-service";
import { type ProjectFile, useProjectStore } from "@/features/project/stores/project-store";
import { SearchIcon } from "@/features/window/components/icons";

interface SearchResult {
  file: ProjectFile;
  line: number;
  column: number;
  excerpt: string;
}

export function WorkspaceSearchPanel() {
  const files = useProjectStore((state) => state.files);
  const openFile = useProjectStore((state) => state.actions.openFile);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  const searchableFiles = useMemo(
    () => files.filter((file) => file.kind === "file" && isProbablyTextFile(file.name)),
    [files],
  );

  const runSearch = async () => {
    const needle = query.trim().toLowerCase();
    if (!needle) {
      setResults([]);
      return;
    }

    setIsSearching(true);
    const nextResults: SearchResult[] = [];
    for (const file of searchableFiles.slice(0, 300)) {
      const content = await readFile(file.path);
      if (!content) continue;
      const lines = content.split("\n");
      for (let index = 0; index < lines.length; index += 1) {
        const column = lines[index].toLowerCase().indexOf(needle);
        if (column < 0) continue;
        nextResults.push({
          file,
          line: index + 1,
          column: column + 1,
          excerpt: lines[index].trim(),
        });
        if (nextResults.length >= 120) break;
      }
      if (nextResults.length >= 120) break;
    }
    setResults(nextResults);
    setIsSearching(false);
  };

  return (
    <div className="navigator-panel">
      <div className="panel-header">
        <h2>Search</h2>
      </div>
      <form
        className="sidebar-search-form"
        onSubmit={(event) => {
          event.preventDefault();
          void runSearch();
        }}
      >
        <SearchIcon size={13} />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search workspace"
        />
      </form>
      <div className="search-summary">
        {isSearching ? "Searching..." : `${results.length} result${results.length === 1 ? "" : "s"}`}
      </div>
      <div className="search-results">
        {results.length === 0 ? (
          <div className="empty-row">Use Ctrl+Shift+F, type a query, then press Enter.</div>
        ) : (
          results.map((result) => (
            <button
              type="button"
              key={`${result.file.path}:${result.line}:${result.column}`}
              className="search-result-row"
              onClick={() => void openFile(result.file.path, result.file.name)}
            >
              <span className="search-result-file">{result.file.relativePath}</span>
              <span className="search-result-meta">
                {result.line}:{result.column}
              </span>
              <span className="search-result-excerpt">{result.excerpt}</span>
            </button>
          ))
        )}
      </div>
    </div>
  );
}

function isProbablyTextFile(name: string) {
  return /\.(css|html|js|jsx|json|md|rs|toml|ts|tsx|txt|yml|yaml)$/i.test(name);
}
