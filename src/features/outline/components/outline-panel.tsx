import { useMemo, useState } from "react";
import type { OutlineSymbol } from "@/features/outline/types";
import { filterOutlineSymbols } from "@/features/outline/utils/outline-symbols";
import { useDocumentOutline } from "@/features/outline/hooks/use-document-outline";
import { useProjectStore } from "@/features/project/stores/project-store";

export function OutlinePanel() {
  const { activeBuffer, isLoading, symbols } = useDocumentOutline(true);
  const openFileAt = useProjectStore((state) => state.actions.openFileAt);
  const [query, setQuery] = useState("");

  const visibleSymbols = useMemo(() => filterOutlineSymbols(symbols, query), [query, symbols]);

  return (
    <div className="navigator-panel outline-panel">
      <div className="panel-header">
        <h2>Outline</h2>
      </div>
      <div className="panel-subheader">
        <span>{activeBuffer ? activeBuffer.name : "No active file"}</span>
        {isLoading ? <span>Scanning...</span> : <span>{symbols.length} symbols</span>}
      </div>
      <div className="sidebar-search-form">
        <input
          value={query}
          onChange={(event) => setQuery(event.currentTarget.value)}
          placeholder="Filter symbols"
        />
      </div>
      <div className="outline-list">
        {!activeBuffer ? (
          <div className="empty-row">Open a source file to see its outline.</div>
        ) : visibleSymbols.length === 0 ? (
          <div className="empty-row">No symbols found for this file yet.</div>
        ) : (
          visibleSymbols.map((symbol) => (
            <OutlineRow
              key={symbol.id}
              symbol={symbol}
              onOpen={() =>
                void openFileAt(symbol.filePath, activeBuffer.name, symbol.line, symbol.character)
              }
            />
          ))
        )}
      </div>
    </div>
  );
}

function OutlineRow({ symbol, onOpen }: { symbol: OutlineSymbol; onOpen: () => void }) {
  return (
    <button
      type="button"
      className="outline-row"
      style={{ paddingLeft: 10 + symbol.depth * 14 }}
      onClick={onOpen}
      title={`${symbol.kind} ${symbol.name}`}
    >
      <span className={`outline-kind ${symbol.kind}`}>{symbol.kind.slice(0, 1).toUpperCase()}</span>
      <span className="outline-name">{symbol.name}</span>
      <span className="outline-line">{symbol.line + 1}</span>
    </button>
  );
}
