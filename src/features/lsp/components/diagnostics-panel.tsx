import { useMemo, useState } from "react";
import { getCodeActions, type RecodeDiagnostic } from "@/features/lsp/services/lsp-service";
import { applyWorkspaceEdit } from "@/features/lsp/services/workspace-edit";
import { useDiagnosticsStore } from "@/features/lsp/stores/diagnostics-store";
import { useEditorStore } from "@/features/editor/stores/editor-store";
import { useToastStore } from "@/features/notifications/stores/toast-store";
import { useProjectStore } from "@/features/project/stores/project-store";
import { ErrorIcon } from "@/features/window/components/icons";

export function DiagnosticsPanel() {
  const diagnosticsByFile = useDiagnosticsStore((state) => state.diagnosticsByFile);
  const files = useProjectStore((state) => state.files);
  const openFileAt = useProjectStore((state) => state.actions.openFileAt);
  const toast = useToastStore((state) => state.actions);
  const activeBuffer = useEditorStore((state) =>
    state.buffers.find((buffer) => buffer.id === state.activeBufferId),
  );
  const [query, setQuery] = useState("");
  const [severity, setSeverity] = useState<"all" | "error" | "warning" | "info">("all");
  const [onlyCurrentFile, setOnlyCurrentFile] = useState(false);

  const groups = useMemo(() => {
    return Object.entries(diagnosticsByFile)
      .map(([filePath, diagnostics]) => ({
        filePath,
        relativePath: files.find((file) => file.path === filePath)?.relativePath ?? filePath,
        fileName: filePath.split(/[\\/]/).filter(Boolean).at(-1) ?? filePath,
        diagnostics: diagnostics
          .filter((diagnostic) => severity === "all" || diagnostic.severity === severity)
          .filter((diagnostic) => {
            const needle = query.trim().toLowerCase();
            if (!needle) return true;
            return `${diagnostic.message} ${diagnostic.source} ${diagnostic.severity}`
              .toLowerCase()
              .includes(needle);
          }),
      }))
      .filter((group) => !onlyCurrentFile || group.filePath === activeBuffer?.path)
      .filter((group) => group.diagnostics.length > 0)
      .sort((a, b) => a.relativePath.localeCompare(b.relativePath));
  }, [activeBuffer?.path, diagnosticsByFile, files, onlyCurrentFile, query, severity]);

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
      <div className="diagnostics-toolbar">
        <input
          value={query}
          onChange={(event) => setQuery(event.currentTarget.value)}
          placeholder="Filter diagnostics"
        />
        <select
          value={severity}
          onChange={(event) =>
            setSeverity(event.currentTarget.value as "all" | "error" | "warning" | "info")
          }
        >
          <option value="all">All</option>
          <option value="error">Errors</option>
          <option value="warning">Warnings</option>
          <option value="info">Info</option>
        </select>
        <button
          type="button"
          className={onlyCurrentFile ? "active" : ""}
          onClick={() => setOnlyCurrentFile((value) => !value)}
        >
          Current
        </button>
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
                  fileContent={useEditorStore.getState().buffers.find((buffer) => buffer.path === group.filePath)?.content ?? ""}
                  languageId={useEditorStore.getState().buffers.find((buffer) => buffer.path === group.filePath)?.languageId ?? "plaintext"}
                  key={`${diagnostic.range.start.line}:${diagnostic.range.start.character}:${index}`}
                  onClick={() =>
                    void openFileAt(
                      group.filePath,
                      group.fileName,
                      diagnostic.range.start.line,
                      diagnostic.range.start.character,
                    )
                  }
                  onQuickFix={async () => {
                    const buffer = useEditorStore.getState().buffers.find((buffer) => buffer.path === group.filePath);
                    if (!buffer) {
                      toast.error("Quick fix unavailable", "Open the file first.");
                      return;
                    }
                    const actions = await getCodeActions({
                      filePath: group.filePath,
                      content: buffer.content,
                      languageId: buffer.languageId,
                      diagnostic,
                    });
                    const action = actions[0];
                    if (!action?.edit) {
                      toast.error("No quick fix", diagnostic.message);
                      return;
                    }
                    await applyWorkspaceEdit(action.edit);
                    toast.success("Applied quick fix", action.title);
                  }}
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
  fileContent,
  languageId,
  onClick,
  onQuickFix,
}: {
  diagnostic: RecodeDiagnostic;
  fileContent: string;
  languageId: string;
  onClick: () => void;
  onQuickFix: () => void;
}) {
  const canQuickFix = fileContent.length > 0 && languageId.length > 0;
  return (
    <button type="button" className={`diagnostic-row ${diagnostic.severity}`} onClick={onClick}>
      <span className="diagnostic-severity">{diagnostic.severity[0].toUpperCase()}</span>
      <span className="diagnostic-message">{diagnostic.message}</span>
      <span className="diagnostic-location">
        {diagnostic.range.start.line + 1}:{diagnostic.range.start.character + 1}
      </span>
      <span className="diagnostic-source">{diagnostic.source}</span>
      {canQuickFix ? (
        <span
          className="diagnostic-fix"
          role="button"
          tabIndex={0}
          onClick={(event) => {
            event.stopPropagation();
            void onQuickFix();
          }}
          onKeyDown={(event) => {
            if (event.key !== "Enter" && event.key !== " ") return;
            event.preventDefault();
            event.stopPropagation();
            void onQuickFix();
          }}
        >
          Fix
        </span>
      ) : null}
    </button>
  );
}
