import { useState } from "react";
import { useProjectStore } from "@/features/project/stores/project-store";
import { useTerminalStore } from "@/features/terminal/stores/terminal-store";
import { CloseIcon, PlusIcon, TerminalIcon } from "@/features/window/components/icons";
import { useWorkbenchStore } from "@/features/window/stores/workbench-store";

export function TerminalPanel() {
  const [command, setCommand] = useState("");
  const rootPath = useProjectStore((state) => state.rootPath);
  const lines = useTerminalStore((state) => state.lines);
  const isRunning = useTerminalStore((state) => state.isRunning);
  const runCommand = useTerminalStore((state) => state.actions.runCommand);
  const toggleTerminal = useWorkbenchStore((state) => state.actions.toggleTerminal);

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nextCommand = command.trim();
    if (!nextCommand || isRunning) return;
    setCommand("");
    void runCommand(nextCommand, rootPath);
  };

  return (
    <section className="terminal-panel" aria-label="Terminal">
      <div className="terminal-header">
        <div className="terminal-tabs">
          <button type="button" className="terminal-tab active">
            <TerminalIcon size={12} /> zsh
          </button>
          <button type="button" className="terminal-tab">
            <TerminalIcon size={12} /> agent
          </button>
          <button type="button" className="icon-button" aria-label="New terminal">
            <PlusIcon />
          </button>
        </div>
        <div className="terminal-actions">
          <span className="terminal-pill">session: local</span>
          <span className="terminal-pill">{isRunning ? "running" : "idle"}</span>
          <button
            type="button"
            className="icon-button"
            aria-label="Close terminal"
            onClick={toggleTerminal}
          >
            <CloseIcon />
          </button>
        </div>
      </div>
      <div className="terminal-body">
        {lines.map((line) => (
          <pre className={`terminal-line ${line.kind}`} key={line.id}>
            {line.kind === "input" ? `recode % ${line.text}` : line.text}
          </pre>
        ))}
        <form className="terminal-input-row" onSubmit={handleSubmit}>
          <span className="terminal-prompt">recode %</span>
          <input
            aria-label="Terminal command"
            disabled={isRunning}
            value={command}
            onChange={(event) => setCommand(event.target.value)}
            placeholder={rootPath ? "Run command in workspace" : "Open a folder to set cwd"}
          />
        </form>
      </div>
    </section>
  );
}
