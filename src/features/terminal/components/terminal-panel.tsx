import { CloseIcon, PlusIcon, TerminalIcon } from "@/features/window/components/icons";
import { useWorkbenchStore } from "@/features/window/stores/workbench-store";

export function TerminalPanel() {
  const toggleTerminal = useWorkbenchStore((state) => state.actions.toggleTerminal);

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
        <pre>
{`recode % `}<span className="terminal-prompt">recode agent --explain</span>{`
Ready. Terminal spawning will be wired through the Rust terminal crate next.`}
        </pre>
      </div>
    </section>
  );
}
