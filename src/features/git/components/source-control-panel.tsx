import { useMemo } from "react";
import { type GitFileStatus } from "@/features/git/services/git-service";
import { useGitStore } from "@/features/git/stores/git-store";
import { useProjectStore } from "@/features/project/stores/project-store";
import { BranchIcon, GitIcon } from "@/features/window/components/icons";

export function SourceControlPanel() {
  const rootPath = useProjectStore((state) => state.rootPath);
  const status = useGitStore((state) => state.status);
  const isLoading = useGitStore((state) => state.isLoading);
  const selectedFile = useGitStore((state) => state.selectedFile);
  const selectedDiff = useGitStore((state) => state.selectedDiff);
  const isDiffLoading = useGitStore((state) => state.isDiffLoading);
  const refresh = useGitStore((state) => state.actions.refresh);
  const selectFile = useGitStore((state) => state.actions.selectFile);

  const staged = useMemo(() => status?.files.filter((file) => file.staged) ?? [], [status]);
  const unstaged = useMemo(() => status?.files.filter((file) => !file.staged) ?? [], [status]);

  return (
    <div className="navigator-panel source-control-panel">
      <div className="panel-header">
        <h2>Source Control</h2>
        <div className="panel-actions">
          <button
            type="button"
            className="icon-button"
            disabled={!rootPath || isLoading}
            onClick={() => void refresh(rootPath)}
            title="Refresh"
          >
            <GitIcon size={13} />
          </button>
        </div>
      </div>
      <div className="panel-subheader">
        <BranchIcon size={12} />
        <span>{status?.branch ?? "No repository"}</span>
      </div>

      {!rootPath ? <div className="empty-row">Open a folder to inspect Git changes.</div> : null}
      {rootPath && !status && !isLoading ? <div className="empty-row">No Git repository found.</div> : null}
      {isLoading ? <div className="empty-row">Loading Git status...</div> : null}

      {status ? (
        <div className="git-list">
          <GitSection title="Changes" files={unstaged} onSelect={(file) => void selectFile(rootPath, file)} selectedFile={selectedFile} />
          <GitSection title="Staged Changes" files={staged} onSelect={(file) => void selectFile(rootPath, file)} selectedFile={selectedFile} />
        </div>
      ) : null}

      <div className="git-diff-preview">
        <div className="git-diff-title">{selectedFile ? selectedFile.path : "Select a changed file"}</div>
        <pre>{isDiffLoading ? "Loading diff..." : selectedDiff || "No unstaged diff available."}</pre>
      </div>
    </div>
  );
}

function GitSection({
  title,
  files,
  selectedFile,
  onSelect,
}: {
  title: string;
  files: GitFileStatus[];
  selectedFile: GitFileStatus | null;
  onSelect: (file: GitFileStatus) => void;
}) {
  if (files.length === 0) return null;

  return (
    <section className="git-section">
      <div className="git-section-title">
        {title} <span>{files.length}</span>
      </div>
      {files.map((file) => (
        <button
          key={`${file.staged ? "staged" : "worktree"}:${file.path}`}
          type="button"
          className={`git-file-row ${
            selectedFile?.path === file.path && selectedFile.staged === file.staged ? "active" : ""
          }`}
          onClick={() => onSelect(file)}
        >
          <span className={`git-status-pill ${file.status}`}>{statusCode(file.status)}</span>
          <span className="git-file-path">{file.path}</span>
        </button>
      ))}
    </section>
  );
}

function statusCode(status: GitFileStatus["status"]) {
  if (status === "modified") return "M";
  if (status === "added") return "A";
  if (status === "deleted") return "D";
  if (status === "renamed") return "R";
  return "U";
}
