import { useState } from "react";
import { CommandIcon, SparkleIcon } from "@/features/window/components/icons";

export function AiPanel() {
  const [prompt, setPrompt] = useState("");

  return (
    <section className="inspector-panel" aria-label="AI assistant">
      <div className="panel-header">
        <h2>Assistant</h2>
        <div className="panel-actions">
          <span className="agent-status">
            <span className="status-dot" />
            Approval mode
          </span>
        </div>
      </div>

      <div className="agent-thread">
        <section className="agent-section">
          <div className="agent-card">
            <div className="agent-avatar">
              <SparkleIcon size={14} />
            </div>
            <div className="agent-message">
              I can read files, propose edits, and request terminal commands once tools are
              connected. Pick a file or ask me to investigate something.
            </div>
          </div>
        </section>

        <section className="agent-section">
          <h3>Roadmap</h3>
          <ol className="agent-steps">
            <li>Connect OpenAI-compatible streaming.</li>
            <li>Add file mentions and selected-code context.</li>
            <li>Preview edits before applying them.</li>
            <li>Wire terminal sessions through the Rust crate.</li>
          </ol>
        </section>

        <section className="agent-section">
          <h3>Context</h3>
          <p>No files attached yet.</p>
        </section>
      </div>

      <form
        className="agent-composer"
        onSubmit={(event) => {
          event.preventDefault();
          setPrompt("");
        }}
      >
        <div className="composer-shell">
          <textarea
            value={prompt}
            onChange={(event) => setPrompt(event.currentTarget.value)}
            placeholder="Ask the agent to explain, edit, or investigate..."
          />
          <div className="composer-actions">
            <span className="composer-meta">
              <kbd>
                <CommandIcon size={9} />
              </kbd>
              <kbd>↵</kbd>
              to send
            </span>
            <button type="submit" className="btn primary" disabled={!prompt.trim()}>
              <SparkleIcon size={12} />
              Send
            </button>
          </div>
        </div>
      </form>
    </section>
  );
}
