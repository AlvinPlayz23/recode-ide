import { useEditorStore } from "@/features/editor/stores/editor-store";
import { useProjectStore } from "@/features/project/stores/project-store";
import { useWorkbenchStore } from "@/features/window/stores/workbench-store";
import {
  BranchIcon,
  CheckIcon,
  ErrorIcon,
  SparkleIcon,
  TerminalIcon,
} from "@/features/window/components/icons";

export function StatusBar() {
  const rootPath = useProjectStore((state) => state.rootPath);
  const activeBuffer = useEditorStore((state) =>
    state.buffers.find((buffer) => buffer.id === state.activeBufferId),
  );
  const toggleTerminal = useWorkbenchStore((state) => state.actions.toggleTerminal);

  const lineCount = activeBuffer ? activeBuffer.content.split("\n").length : 0;
  const cursor = activeBuffer?.cursor;
  const workspaceLabel = rootPath ? rootPath.split(/[\\/]/).filter(Boolean).at(-1) : "demo";

  return (
    <footer className="status-bar">
      <div className="status-group">
        <span className="status-item accent">
          <span className="status-icon">
            <BranchIcon />
          </span>
          main
        </span>
        <span className="status-item">
          <span className="status-icon">
            <CheckIcon />
          </span>
          0
        </span>
        <span className="status-item">
          <span className="status-icon">
            <ErrorIcon />
          </span>
          0 issues
        </span>
        <span className="status-item">{workspaceLabel}</span>
      </div>

      <div className="status-group">
        {activeBuffer ? (
          <>
            <span className="status-item">
              Ln {(cursor?.line ?? 0) + 1}, Col {(cursor?.column ?? 0) + 1}
            </span>
            <span className="status-item">{lineCount} lines</span>
            <span className="status-item">UTF-8</span>
            <span className="status-item">{activeBuffer.languageId.toUpperCase()}</span>
          </>
        ) : (
          <span className="status-item">No editor</span>
        )}
        <button
          type="button"
          className="status-item button"
          onClick={toggleTerminal}
          aria-label="Toggle terminal"
        >
          <span className="status-icon">
            <TerminalIcon size={12} />
          </span>
        </button>
        <span className="status-item warning">
          <span className="status-icon">
            <SparkleIcon size={12} />
          </span>
          Approval mode
        </span>
      </div>
    </footer>
  );
}
