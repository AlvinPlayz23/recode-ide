import { useMemo } from "react";
import type { RecodeDiagnostic } from "@/features/lsp/services/lsp-service";
import { useDiagnosticsStore } from "@/features/lsp/stores/diagnostics-store";
import { useProjectStore } from "@/features/project/stores/project-store";
import { ErrorIcon } from "@/features/window/components/icons";

export function DiagnosticsPanel() {
  const diagnosticsByFile = useDiagnosticsStore((state) => state.diagnosticsByFile);
  const files = useProjectStore((state) => state.files);
  const openFile = useProjectStore((state) => state.actions.openFile);

  const groups = useMemo(() => {
    return Object.entries(diagnosticsByFile)
      .map(([filePath, diagnostics]) => ({
        filePath,
        relativePath: files.find((file) => file.path === filePath)?.relativePath ?? filePath,
        fileName: filePath.split(/[\\/]/).filter(Boolean).at(-1) ?? filePath,
        diagnostics,
      }))
      .filter((group) => group.diagnostics.length > 0)
      .sort((a, b) => a.relativePath.localeCompare(b.relativePath));
  }, [diagnosticsByFile, files]);

  const count = groups.reduce((total, group) => total + group.diagnostics.length, 0);

  return (
    <div className="navigator-panel diagnostics-panel">
      <div className="panel-header">
        <h2>Diagnostics</h2>
      </div>
      <div className="panel-subheader">
        <ErrorIcon size={12} />
        <span>{count} issue{count === 1 ? "" : "s"}</span>
      </div>
      <div className="diagnostics-list">
        {groups.length === 0 ? (
          <div className="empty-row">No diagnostics in open files.</div>
        ) : (
          groups.map((group) => (
            <section className="diagnostic-group" key={group.filePath}>
              <div className="diagnostic-file-title">{group.relativePath}</div>
              {group.diagnostics.map((diagnostic, index) => (
                <DiagnosticRow
                  diagnostic={diagnostic}
                  key={`${diagnostic.range.start.line}:${diagnostic.range.start.character}:${index}`}
                  onClick={() => void openFile(group.filePath, group.fileName)}
                />
              ))}
            </section>
          ))
        )}
      </div>
    </div>
  );
}

function DiagnosticRow({
  diagnostic,
  onClick,
}: {
  diagnostic: RecodeDiagnostic;
  onClick: () => void;
}) {
  return (
    <button type="button" className={`diagnostic-row ${diagnostic.severity}`} onClick={onClick}>
      <span className="diagnostic-severity">{diagnostic.severity[0].toUpperCase()}</span>
      <span className="diagnostic-message">{diagnostic.message}</span>
      <span className="diagnostic-location">
        {diagnostic.range.start.line + 1}:{diagnostic.range.start.character + 1}
      </span>
      <span className="diagnostic-source">{diagnostic.source}</span>
    </button>
  );
}
