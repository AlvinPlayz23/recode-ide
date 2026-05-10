import { useMemo, useState, type FormEvent } from "react";
import { useEditorStore } from "@/features/editor/stores/editor-store";
import { type ProjectFile, useProjectStore } from "@/features/project/stores/project-store";
import {
  ChevronDownIcon,
  ChevronRightIcon,
  CloseIcon,
  FileIcon,
  FolderIcon,
  PlusIcon,
} from "@/features/window/components/icons";

type EditingEntry =
  | { mode: "create-file" | "create-folder"; parentPath: string; depth: number; value: string }
  | { mode: "rename"; path: string; depth: number; value: string };

export function FileExplorer() {
  const files = useProjectStore((state) => state.files);
  const rootPath = useProjectStore((state) => state.rootPath);
  const openFolder = useProjectStore((state) => state.actions.openFolder);
  const openFile = useProjectStore((state) => state.actions.openFile);
  const createFile = useProjectStore((state) => state.actions.createFile);
  const createFolder = useProjectStore((state) => state.actions.createFolder);
  const renamePath = useProjectStore((state) => state.actions.renamePath);
  const deletePath = useProjectStore((state) => state.actions.deletePath);
  const activeBufferId = useEditorStore((state) => state.activeBufferId);
  const activePath = useEditorStore(
    (state) => state.buffers.find((buffer) => buffer.id === activeBufferId)?.path,
  );
  const [collapsedPaths, setCollapsedPaths] = useState<Set<string>>(() => new Set());
  const [editingEntry, setEditingEntry] = useState<EditingEntry | null>(null);
  const [operationError, setOperationError] = useState<string | null>(null);

  const visibleRows = useMemo(() => {
    const hiddenDepths: number[] = [];
    const rows: Array<
      | { kind: "file"; file: ProjectFile }
      | { kind: "editing"; entry: EditingEntry; key: string }
    > = [];

    if (
      editingEntry &&
      (editingEntry.mode === "create-file" || editingEntry.mode === "create-folder") &&
      editingEntry.parentPath === rootPath
    ) {
      rows.push({
        kind: "editing",
        entry: editingEntry,
        key: `${editingEntry.mode}:${editingEntry.parentPath}`,
      });
    }

    files.forEach((file) => {
      while (hiddenDepths.length > 0 && file.depth <= hiddenDepths[hiddenDepths.length - 1]) {
        hiddenDepths.pop();
      }

      const isHidden = hiddenDepths.length > 0;
      if (!isHidden && file.kind === "directory" && collapsedPaths.has(file.path)) {
        hiddenDepths.push(file.depth);
      }

      if (isHidden) return;

      if (editingEntry?.mode === "rename" && editingEntry.path === file.path) {
        rows.push({ kind: "editing", entry: editingEntry, key: `rename:${file.path}` });
      } else {
        rows.push({ kind: "file", file });
      }

      if (
        editingEntry &&
        (editingEntry.mode === "create-file" || editingEntry.mode === "create-folder") &&
        editingEntry.parentPath === file.path &&
        file.kind === "directory"
      ) {
        rows.push({
          kind: "editing",
          entry: editingEntry,
          key: `${editingEntry.mode}:${file.path}`,
        });
      }
    });

    return rows;
  }, [collapsedPaths, editingEntry, files, rootPath]);

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

  const requestNewFile = (parentPath = rootPath) => {
    if (!parentPath) return;
    const depth = depthForNewChild(parentPath, files, rootPath);
    expandParent(parentPath);
    setOperationError(null);
    setEditingEntry({ mode: "create-file", parentPath, depth, value: "" });
  };

  const requestNewFolder = (parentPath = rootPath) => {
    if (!parentPath) return;
    const depth = depthForNewChild(parentPath, files, rootPath);
    expandParent(parentPath);
    setOperationError(null);
    setEditingEntry({ mode: "create-folder", parentPath, depth, value: "" });
  };

  const requestRename = (path: string, currentName: string) => {
    const file = files.find((candidate) => candidate.path === path);
    setOperationError(null);
    setEditingEntry({
      mode: "rename",
      path,
      depth: file?.depth ?? 0,
      value: currentName,
    });
  };

  const requestDelete = (path: string, name: string) => {
    const confirmed = window.confirm(`Delete "${name}"? This cannot be undone.`);
    if (!confirmed) return;
    void deletePath(path);
  };

  const expandParent = (parentPath: string) => {
    setCollapsedPaths((current) => {
      if (!current.has(parentPath)) return current;
      const next = new Set(current);
      next.delete(parentPath);
      return next;
    });
  };

  const commitEditingEntry = async () => {
    if (!editingEntry) return;

    const name = editingEntry.value.trim();
    if (!name) {
      setEditingEntry(null);
      setOperationError(null);
      return;
    }

    setOperationError(null);
    let ok = false;
    switch (editingEntry.mode) {
      case "create-file":
        ok = Boolean(await createFile(editingEntry.parentPath, name));
        break;
      case "create-folder":
        ok = Boolean(await createFolder(editingEntry.parentPath, name));
        break;
      case "rename": {
        const current = files.find((file) => file.path === editingEntry.path);
        ok = current?.name === name || Boolean(await renamePath(editingEntry.path, name));
        break;
      }
    }

    if (ok) {
      setEditingEntry(null);
      return;
    }

    setOperationError("Operation failed. Check the name and permissions.");
  };

  const handleEditingSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void commitEditingEntry();
  };

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
            disabled={!rootPath}
            onClick={() => requestNewFile()}
          >
            <PlusIcon />
          </button>
          <button
            type="button"
            className="icon-button"
            aria-label="New folder"
            title="New folder"
            disabled={!rootPath}
            onClick={() => requestNewFolder()}
          >
            <FolderIcon />
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
        {visibleRows.length === 0 ? (
          <div className="empty-row">
            Open a folder to populate the explorer.
          </div>
        ) : null}
        {operationError ? <div className="explorer-error">{operationError}</div> : null}
        {visibleRows.map((row) => {
          if (row.kind === "editing") {
            const entry = row.entry;
            let isFolder = entry.mode === "create-folder";
            if (entry.mode === "rename") {
              isFolder = files.find((file) => file.path === entry.path)?.kind === "directory";
            }
            return (
              <form
                className="file-row editing"
                key={row.key}
                onSubmit={handleEditingSubmit}
                style={{ paddingLeft: 8 + entry.depth * 12 }}
              >
                <span className="file-chevron" />
                <span className="file-icon">{isFolder ? <FolderIcon /> : <FileIcon />}</span>
                <input
                  autoFocus
                  aria-label={entry.mode === "rename" ? "Rename item" : "New item name"}
                  value={entry.value}
                  onBlur={() => void commitEditingEntry()}
                  onChange={(event) => {
                    const value = event.currentTarget.value;
                    setEditingEntry((current) => (current ? { ...current, value } : current));
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Escape") {
                      event.preventDefault();
                      setEditingEntry(null);
                      setOperationError(null);
                    }
                  }}
                  placeholder={isFolder ? "folder-name" : "file-name"}
                />
              </form>
            );
          }

          const file = row.file;
          const isExpanded = !collapsedPaths.has(file.path);
          return (
            <div
              className={`file-row ${file.path === activePath ? "active" : ""}`}
              key={file.path}
              style={{ paddingLeft: 8 + file.depth * 12 }}
              role="treeitem"
              aria-expanded={file.kind === "directory" ? isExpanded : undefined}
            >
              <button
                className="file-main"
                type="button"
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
                  ) : (
                    <span />
                  )}
                </span>
                <span className="file-icon">
                  {file.kind === "directory" ? <FolderIcon /> : <FileIcon />}
                </span>
                <span className="file-name">{file.name}</span>
              </button>
              <span className="file-actions">
                {file.kind === "directory" ? (
                  <>
                    <button
                      type="button"
                      aria-label={`New file in ${file.name}`}
                      title="New file"
                      onClick={() => requestNewFile(file.path)}
                    >
                      +
                    </button>
                    <button
                      type="button"
                      aria-label={`New folder in ${file.name}`}
                      title="New folder"
                      onClick={() => requestNewFolder(file.path)}
                    >
                      <FolderIcon size={11} />
                    </button>
                  </>
                ) : null}
                <button
                  type="button"
                  aria-label={`Rename ${file.name}`}
                  title="Rename"
                  onClick={() => requestRename(file.path, file.name)}
                >
                  rename
                </button>
                <button
                  type="button"
                  aria-label={`Delete ${file.name}`}
                  title="Delete"
                  onClick={() => requestDelete(file.path, file.name)}
                >
                  <CloseIcon size={11} />
                </button>
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function depthForNewChild(parentPath: string, files: ProjectFile[], rootPath: string | null) {
  if (rootPath && parentPath === rootPath) return 0;
  const parent = files.find((file) => file.path === parentPath);
  return parent ? parent.depth + 1 : 0;
}
