import { FileExplorer } from "@/features/file-explorer/components/file-explorer";
import { SourceControlPanel } from "@/features/git/components/source-control-panel";
import { WorkspaceSearchPanel } from "@/features/search/components/workspace-search-panel";
import { useWorkbenchStore } from "@/features/window/stores/workbench-store";

export function SidebarPanel() {
  const activeSidebarView = useWorkbenchStore((state) => state.activeSidebarView);

  if (activeSidebarView === "search") return <WorkspaceSearchPanel />;
  if (activeSidebarView === "git") return <SourceControlPanel />;

  if (activeSidebarView === "debug") {
    return <PlaceholderPanel title="Run and Debug" message="Debug sessions come after terminal/LSP." />;
  }

  if (activeSidebarView === "extensions") {
    return <PlaceholderPanel title="Extensions" message="Extension registry is planned after core IDE flows." />;
  }

  return <FileExplorer />;
}

function PlaceholderPanel({ title, message }: { title: string; message: string }) {
  return (
    <div className="navigator-panel">
      <div className="panel-header">
        <h2>{title}</h2>
      </div>
      <div className="empty-row">{message}</div>
    </div>
  );
}
