import { useState } from "react";
import {
  BugIcon,
  ExtensionIcon,
  FilesIcon,
  GitIcon,
  SearchIcon,
  SettingsIcon,
  SparkleIcon,
} from "@/features/window/components/icons";
import { useWorkbenchStore } from "@/features/window/stores/workbench-store";

const PRIMARY_VIEWS = [
  { id: "files", label: "Files", icon: <FilesIcon size={18} /> },
  { id: "search", label: "Search", icon: <SearchIcon size={18} /> },
  { id: "git", label: "Source Control", icon: <GitIcon size={18} /> },
  { id: "debug", label: "Run and Debug", icon: <BugIcon size={18} /> },
  { id: "extensions", label: "Extensions", icon: <ExtensionIcon size={18} /> },
] as const;

export function ActivityRail() {
  const [active, setActive] = useState<string>("files");
  const isInspectorVisible = useWorkbenchStore((state) => state.isInspectorVisible);
  const toggleInspector = useWorkbenchStore((state) => state.actions.toggleInspector);

  return (
    <nav className="activity-rail" aria-label="Primary navigation">
      {PRIMARY_VIEWS.map((view) => (
        <button
          key={view.id}
          type="button"
          className={`rail-button ${active === view.id ? "active" : ""}`}
          aria-label={view.label}
          title={view.label}
          onClick={() => setActive(view.id)}
        >
          {view.icon}
        </button>
      ))}

      <div className="rail-spacer" />

      <button
        type="button"
        className={`rail-button ${isInspectorVisible ? "active" : ""}`}
        aria-label="Toggle AI Assistant"
        title="Toggle AI Assistant"
        onClick={toggleInspector}
      >
        <SparkleIcon size={18} />
      </button>
      <button
        type="button"
        className="rail-button"
        aria-label="Settings"
        title="Settings"
      >
        <SettingsIcon size={18} />
      </button>
    </nav>
  );
}
