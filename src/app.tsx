import { useEffect } from "react";
import { AiPanel } from "@/features/ai/components/ai-panel";
import { CommandPalette } from "@/features/command-palette/components/command-palette";
import { HybridEditor } from "@/features/editor/components/hybrid-editor";
import { useEditorStore } from "@/features/editor/stores/editor-store";
import { FileExplorer } from "@/features/file-explorer/components/file-explorer";
import { useProjectStore } from "@/features/project/stores/project-store";
import { TerminalPanel } from "@/features/terminal/components/terminal-panel";
import { TabBar } from "@/features/tabs/components/tab-bar";
import { ActivityRail } from "@/features/window/components/activity-rail";
import { StatusBar } from "@/features/window/components/status-bar";
import { TitleBar } from "@/features/window/components/title-bar";
import { useWorkbenchStore } from "@/features/window/stores/workbench-store";

export function App() {
  const activeBuffer = useEditorStore((state) =>
    state.buffers.find((buffer) => buffer.id === state.activeBufferId),
  );
  const bootstrapDemoWorkspace = useProjectStore(
    (state) => state.actions.bootstrapDemoWorkspace,
  );
  const isInspectorVisible = useWorkbenchStore((state) => state.isInspectorVisible);
  const isTerminalVisible = useWorkbenchStore((state) => state.isTerminalVisible);

  useEffect(() => {
    bootstrapDemoWorkspace();
  }, [bootstrapDemoWorkspace]);

  return (
    <div className="app-shell">
      <TitleBar />
      <main
        className={`workbench ${isInspectorVisible ? "" : "inspector-hidden"} ${
          isTerminalVisible ? "" : "terminal-hidden"
        }`}
      >
        <ActivityRail />
        <FileExplorer />
        <section className="editor-column">
          <TabBar />
          <HybridEditor buffer={activeBuffer ?? null} />
          {isTerminalVisible ? <TerminalPanel /> : null}
        </section>
        {isInspectorVisible ? <AiPanel /> : null}
      </main>
      <StatusBar />
      <CommandPalette />
    </div>
  );
}
