import { useEditorStore } from "@/features/editor/stores/editor-store";
import { useGitStore } from "@/features/git/stores/git-store";
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
  const saveStatus = useEditorStore((state) => state.lastSaveStatus);
  const saveError = useEditorStore((state) => state.lastSaveError);
  const gitStatus = useGitStore((state) => state.status);
  const toggleTerminal = useWorkbenchStore((state) => state.actions.toggleTerminal);

  const lineCount = activeBuffer ? activeBuffer.content.split("\n").length : 0;
  const cursor = activeBuffer?.cursor;
  const workspaceLabel = rootPath ? rootPath.split(/[\\/]/).filter(Boolean).at(-1) : "demo";
  const dirty = activeBuffer ? activeBuffer.content !== activeBuffer.savedContent : false;
  const changedFiles = gitStatus?.files.length ?? 0;

  return (
    <footer className="status-bar">
      <div className="status-group">
        <span className="status-item accent">
          <span className="status-icon">
            <BranchIcon />
          </span>
          {gitStatus?.branch ?? "no git"}
        </span>
        <span className="status-item">
          <span className="status-icon">
            <CheckIcon />
          </span>
          {changedFiles}
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
            {dirty ? <span className="status-item warning">Unsaved</span> : null}
            {activeBuffer.externalState === "modified" ? (
              <span className="status-item warning">Changed on disk</span>
            ) : null}
            {activeBuffer.externalState === "deleted" ? (
              <span className="status-item warning">Deleted on disk</span>
            ) : null}
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
        {saveStatus === "saving" ? <span className="status-item">Saving...</span> : null}
        {saveStatus === "saved" ? <span className="status-item accent">Saved</span> : null}
        {saveStatus === "error" ? (
          <span className="status-item warning" title={saveError ?? undefined}>
            Save failed
          </span>
        ) : null}
      </div>
    </footer>
  );
}
