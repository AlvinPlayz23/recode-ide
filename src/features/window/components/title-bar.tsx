import { useCommandPaletteStore } from "@/features/command-palette/stores/command-palette-store";
import { useProjectStore } from "@/features/project/stores/project-store";
import { useWorkbenchStore } from "@/features/window/stores/workbench-store";
import {
  CommandIcon,
  PanelBottomIcon,
  PanelRightIcon,
  SearchIcon,
} from "@/features/window/components/icons";

export function TitleBar() {
  const open = useCommandPaletteStore((state) => state.actions.open);
  const rootPath = useProjectStore((state) => state.rootPath);
  const isTerminalVisible = useWorkbenchStore((state) => state.isTerminalVisible);
  const isInspectorVisible = useWorkbenchStore((state) => state.isInspectorVisible);
  const toggleTerminal = useWorkbenchStore((state) => state.actions.toggleTerminal);
  const toggleInspector = useWorkbenchStore((state) => state.actions.toggleInspector);

  const workspaceLabel = rootPath?.split(/[\\/]/).filter(Boolean).at(-1) ?? "Demo Workspace";

  return (
    <header className="title-bar">
      <div className="title-bar-left">
        <div className="traffic-lights" aria-hidden="true">
          <span className="traffic-light close" />
          <span className="traffic-light minimize" />
          <span className="traffic-light zoom" />
        </div>
        <div className="title-breadcrumb">
          <span className="app-mark">R</span>
          <span className="crumb-app">Recode</span>
          <span className="crumb-sep">/</span>
          <span className="crumb-workspace">{workspaceLabel}</span>
        </div>
      </div>

      <div className="title-bar-center">
        <button type="button" className="command-center" onClick={open}>
          <span className="cc-icon">
            <SearchIcon size={12} />
          </span>
          <span>Search files, commands, symbols</span>
          <kbd>
            <CommandIcon size={9} />
          </kbd>
          <kbd>K</kbd>
        </button>
      </div>

      <div className="title-bar-right">
        <button
          type="button"
          className={`icon-button ${isTerminalVisible ? "active" : ""}`}
          onClick={toggleTerminal}
          aria-label="Toggle terminal"
          title="Toggle terminal"
        >
          <PanelBottomIcon size={14} />
        </button>
        <button
          type="button"
          className={`icon-button ${isInspectorVisible ? "active" : ""}`}
          onClick={toggleInspector}
          aria-label="Toggle inspector"
          title="Toggle inspector"
        >
          <PanelRightIcon size={14} />
        </button>
      </div>
    </header>
  );
}
