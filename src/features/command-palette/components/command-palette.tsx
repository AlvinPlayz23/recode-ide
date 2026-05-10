import { useEffect, useMemo, useState } from "react";
import { useCommandPaletteStore } from "@/features/command-palette/stores/command-palette-store";
import { commandRegistry } from "@/features/commands/command-registry";
import {
  displayKeybinding,
  keymapRegistry,
} from "@/features/commands/keymap-registry";
import {
  CommandIcon,
  SearchIcon,
} from "@/features/window/components/icons";

export function CommandPalette() {
  const isOpen = useCommandPaletteStore((state) => state.isOpen);
  const close = useCommandPaletteStore((state) => state.actions.close);
  const [query, setQuery] = useState("");

  const commands = commandRegistry.all();
  const filteredCommands = commands.filter((command) =>
    `${command.title} ${command.detail ?? ""} ${command.category}`
      .toLowerCase()
      .includes(query.toLowerCase()),
  );

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
                disabled={command.when ? !command.when() : false}
                key={command.id}
                type="button"
                onClick={() => void commandRegistry.execute(command.id)}
              >
                <span className="cmd-icon">{command.icon}</span>
                <span className="cmd-text">
                  <span className="cmd-title">{command.title}</span>
                  <span className="cmd-detail">{command.detail}</span>
                </span>
                {keymapRegistry.getForCommand(command.id) ? (
                  <span className="cmd-shortcut">
                    {displayKeybinding(keymapRegistry.getForCommand(command.id)!.key)
                      .split("+")
                      .map((key) => (
                        <kbd key={key}>
                          {key === "Ctrl" || key === "Cmd" ? <CommandIcon size={9} /> : key}
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
