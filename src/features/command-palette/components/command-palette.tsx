import { useEffect, useMemo, useState } from "react";
import { useCommandPaletteStore } from "@/features/command-palette/stores/command-palette-store";
import { useEditorStore } from "@/features/editor/stores/editor-store";
import { useProjectStore } from "@/features/project/stores/project-store";
import { useWorkbenchStore } from "@/features/window/stores/workbench-store";
import {
  CommandIcon,
  FolderIcon,
  PanelBottomIcon,
  PanelRightIcon,
  PlusIcon,
  SearchIcon,
} from "@/features/window/components/icons";

export function CommandPalette() {
  const isOpen = useCommandPaletteStore((state) => state.isOpen);
  const open = useCommandPaletteStore((state) => state.actions.open);
  const close = useCommandPaletteStore((state) => state.actions.close);
  const openFolder = useProjectStore((state) => state.actions.openFolder);
  const saveActiveBuffer = useEditorStore((state) => state.actions.saveActiveBuffer);
  const saveBufferAs = useEditorStore((state) => state.actions.saveBufferAs);
  const revertBuffer = useEditorStore((state) => state.actions.revertBuffer);
  const activeBufferId = useEditorStore((state) => state.activeBufferId);
  const toggleInspector = useWorkbenchStore((state) => state.actions.toggleInspector);
  const toggleTerminal = useWorkbenchStore((state) => state.actions.toggleTerminal);
  const [query, setQuery] = useState("");

  const commands = useMemo(
    () => [
      {
        id: "open-folder",
        title: "Open Folder",
        detail: "Choose a workspace folder",
        icon: <FolderIcon />,
        shortcut: ["Ctrl", "O"],
        run: async () => {
          await openFolder();
          close();
        },
      },
      {
        id: "save-file",
        title: "Save Active File",
        detail: activeBufferId ? "Write current buffer to disk" : "No active file",
        icon: <PlusIcon />,
        shortcut: ["Ctrl", "S"],
        disabled: !activeBufferId,
        run: async () => {
          await saveActiveBuffer();
          close();
        },
      },
      {
        id: "save-file-as",
        title: "Save Active File As...",
        detail: activeBufferId ? "Write current buffer to another path" : "No active file",
        icon: <PlusIcon />,
        disabled: !activeBufferId,
        run: async () => {
          if (activeBufferId) await saveBufferAs(activeBufferId);
          close();
        },
      },
      {
        id: "revert-file",
        title: "Revert Active File",
        detail: activeBufferId ? "Reload current buffer from disk" : "No active file",
        icon: <PlusIcon />,
        disabled: !activeBufferId,
        run: async () => {
          if (activeBufferId) await revertBuffer(activeBufferId);
          close();
        },
      },
      {
        id: "toggle-agent",
        title: "Toggle Agent Inspector",
        detail: "Show or hide the right-side AI inspector",
        icon: <PanelRightIcon />,
        run: () => {
          toggleInspector();
          close();
        },
      },
      {
        id: "toggle-terminal",
        title: "Toggle Terminal",
        detail: "Show or hide the bottom utility area",
        icon: <PanelBottomIcon />,
        run: () => {
          toggleTerminal();
          close();
        },
      },
    ],
    [
      activeBufferId,
      close,
      openFolder,
      revertBuffer,
      saveActiveBuffer,
      saveBufferAs,
      toggleInspector,
      toggleTerminal,
    ],
  );

  const filteredCommands = commands.filter((command) =>
    `${command.title} ${command.detail}`.toLowerCase().includes(query.toLowerCase()),
  );

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        open();
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        void saveActiveBuffer();
      }
      if (event.key === "Escape") close();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [close, open, saveActiveBuffer]);

  useEffect(() => {
    if (isOpen) setQuery("");
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="palette-backdrop" role="presentation" onMouseDown={close}>
      <section
        className="command-palette"
        role="dialog"
        aria-modal="true"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="palette-input-row">
          <span className="palette-icon">
            <SearchIcon />
          </span>
          <input
            autoFocus
            placeholder="Run a command, search files..."
            value={query}
            onChange={(event) => setQuery(event.currentTarget.value)}
          />
          <kbd>esc</kbd>
        </div>
        <div className="command-list">
          {filteredCommands.length === 0 ? (
            <div className="cmd-empty">No matches</div>
          ) : (
            filteredCommands.map((command) => (
              <button
                disabled={command.disabled}
                key={command.id}
                type="button"
                onClick={() => void command.run()}
              >
                <span className="cmd-icon">{command.icon}</span>
                <span className="cmd-text">
                  <span className="cmd-title">{command.title}</span>
                  <span className="cmd-detail">{command.detail}</span>
                </span>
                {command.shortcut ? (
                  <span className="cmd-shortcut">
                    {command.shortcut.map((key) => (
                      <kbd key={key}>
                        {key === "Ctrl" ? <CommandIcon size={9} /> : key}
                      </kbd>
                    ))}
                  </span>
                ) : null}
              </button>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
