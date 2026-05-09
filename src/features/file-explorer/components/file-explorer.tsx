import { useMemo, useState } from "react";
import { useEditorStore } from "@/features/editor/stores/editor-store";
import { useProjectStore } from "@/features/project/stores/project-store";
import {
  ChevronDownIcon,
  ChevronRightIcon,
  FileIcon,
  FolderIcon,
  PlusIcon,
} from "@/features/window/components/icons";

export function FileExplorer() {
  const files = useProjectStore((state) => state.files);
  const rootPath = useProjectStore((state) => state.rootPath);
  const openFolder = useProjectStore((state) => state.actions.openFolder);
  const openFile = useProjectStore((state) => state.actions.openFile);
  const activeBufferId = useEditorStore((state) => state.activeBufferId);
  const activePath = useEditorStore(
    (state) => state.buffers.find((buffer) => buffer.id === activeBufferId)?.path,
  );
  const [collapsedPaths, setCollapsedPaths] = useState<Set<string>>(() => new Set());

  const visibleFiles = useMemo(() => {
    const hiddenDepths: number[] = [];

    return files.filter((file) => {
      while (hiddenDepths.length > 0 && file.depth <= hiddenDepths[hiddenDepths.length - 1]) {
        hiddenDepths.pop();
      }

      const isHidden = hiddenDepths.length > 0;
      if (!isHidden && file.kind === "directory" && collapsedPaths.has(file.path)) {
        hiddenDepths.push(file.depth);
      }

      return !isHidden;
    });
  }, [collapsedPaths, files]);

  const toggleDirectory = (path: string) => {
    setCollapsedPaths((current) => {
      const next = new Set(current);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  };

  const rootLabel = rootPath?.split(/[\\/]/).filter(Boolean).at(-1) ?? "Demo Workspace";

  return (
    <div className="navigator-panel">
      <div className="panel-header">
        <h2>Explorer</h2>
        <div className="panel-actions">
          <button
            type="button"
            className="icon-button"
            aria-label="New file"
            title="New file"
          >
            <PlusIcon />
          </button>
          <button
            type="button"
            className="icon-button"
            onClick={openFolder}
            aria-label="Open folder"
            title="Open folder"
          >
            <FolderIcon />
          </button>
        </div>
      </div>
      <div className="panel-subheader">
        <span className="chevron">
          <ChevronDownIcon size={10} />
        </span>
        <span>{rootLabel}</span>
      </div>
      <div className="file-list" role="tree" aria-label="Project files">
        {visibleFiles.length === 0 ? (
          <div className="empty-row">
            Open a folder to populate the explorer.
          </div>
        ) : null}
        {visibleFiles.map((file) => {
          const isExpanded = !collapsedPaths.has(file.path);
          return (
            <button
              className={`file-row ${file.path === activePath ? "active" : ""}`}
              key={file.path}
              style={{ paddingLeft: 8 + file.depth * 12 }}
              type="button"
              role="treeitem"
              aria-expanded={file.kind === "directory" ? isExpanded : undefined}
              onClick={() => {
                if (file.kind === "directory") {
                  toggleDirectory(file.path);
                  return;
                }
                void openFile(file.path, file.name);
              }}
            >
              <span className="file-chevron">
                {file.kind === "directory" ? (
                  isExpanded ? (
                    <ChevronDownIcon size={10} />
                  ) : (
                    <ChevronRightIcon size={10} />
                  )
                ) : null}
              </span>
              <span className="file-icon">
                {file.kind === "directory" ? <FolderIcon /> : <FileIcon />}
              </span>
              <span className="file-name">{file.name}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
