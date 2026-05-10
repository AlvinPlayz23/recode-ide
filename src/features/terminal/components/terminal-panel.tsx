import { listen } from "@tauri-apps/api/event";
import { useEffect, useState } from "react";
import { useProjectStore } from "@/features/project/stores/project-store";
import type { TerminalOutputEvent } from "@/features/terminal/services/terminal-service";
import { useTerminalStore } from "@/features/terminal/stores/terminal-store";
import { CloseIcon, PlusIcon, TerminalIcon } from "@/features/window/components/icons";
import { useWorkbenchStore } from "@/features/window/stores/workbench-store";

export function TerminalPanel() {
  const [command, setCommand] = useState("");
  const rootPath = useProjectStore((state) => state.rootPath);
  const lines = useTerminalStore((state) => state.lines);
  const sessionId = useTerminalStore((state) => state.sessionId);
  const isRunning = useTerminalStore((state) => state.isRunning);
  const appendOutput = useTerminalStore((state) => state.actions.appendOutput);
  const ensureSession = useTerminalStore((state) => state.actions.ensureSession);
  const runCommand = useTerminalStore((state) => state.actions.runCommand);
  const killSession = useTerminalStore((state) => state.actions.killSession);
  const toggleTerminal = useWorkbenchStore((state) => state.actions.toggleTerminal);

  useEffect(() => {
    void ensureSession(rootPath);
  }, [ensureSession, rootPath]);

  useEffect(() => {
    let disposed = false;
    let cleanup: (() => void) | null = null;
    void listen<TerminalOutputEvent>("terminal-output", (event) => {
      if (disposed) return;
      if (event.payload.sessionId !== useTerminalStore.getState().sessionId) return;
      appendOutput(event.payload.stream, event.payload.text);
    }).then((unlisten) => {
      cleanup = unlisten;
    });

    return () => {
      disposed = true;
      cleanup?.();
    };
  }, [appendOutput]);

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
            <TerminalIcon size={12} /> shell
          </button>
          <button type="button" className="icon-button" aria-label="New terminal">
            <PlusIcon />
          </button>
        </div>
        <div className="terminal-actions">
          <span className="terminal-pill">session: local</span>
          <span className="terminal-pill">{sessionId ? "attached" : "starting"}</span>
          <span className="terminal-pill">{isRunning ? "running" : "idle"}</span>
          <button
            type="button"
            className="icon-button"
            aria-label="Restart terminal"
            title="Restart terminal"
            onClick={() => {
              void killSession().then(() => ensureSession(rootPath));
            }}
          >
            <PlusIcon />
          </button>
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
