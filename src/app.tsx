import { useEffect } from "react";
import { AiPanel } from "@/features/ai/components/ai-panel";
import { CommandPalette } from "@/features/command-palette/components/command-palette";
import { useGlobalKeymaps } from "@/features/commands/hooks/use-global-keymaps";
import { useRegisterCoreCommands } from "@/features/commands/hooks/use-register-core-commands";
import { HybridEditor } from "@/features/editor/components/hybrid-editor";
import { useEditorStore } from "@/features/editor/stores/editor-store";
import { useFileWatcherStore } from "@/features/project/stores/file-watcher-store";
import { ToastViewport } from "@/features/notifications/components/toast-viewport";
import { useProjectStore } from "@/features/project/stores/project-store";
import { QuickOpen } from "@/features/quick-open/components/quick-open";
import { TerminalPanel } from "@/features/terminal/components/terminal-panel";
import { TabBar } from "@/features/tabs/components/tab-bar";
import { ActivityRail } from "@/features/window/components/activity-rail";
import { SidebarPanel } from "@/features/window/components/sidebar-panel";
import { StatusBar } from "@/features/window/components/status-bar";
import { TitleBar } from "@/features/window/components/title-bar";
import { useMenuEventsWrapper } from "@/features/window/hooks/use-menu-events-wrapper";
import { useWorkbenchStore } from "@/features/window/stores/workbench-store";

export function App() {
  useRegisterCoreCommands();
  useGlobalKeymaps();
  useMenuEventsWrapper();

  const activeBuffer = useEditorStore((state) =>
    state.buffers.find((buffer) => buffer.id === state.activeBufferId),
  );
  const bootstrapDemoWorkspace = useProjectStore(
    (state) => state.actions.bootstrapDemoWorkspace,
  );
  const restoreRecentWorkspace = useProjectStore(
    (state) => state.actions.restoreRecentWorkspace,
  );
  const initializeFileWatcher = useFileWatcherStore((state) => state.actions.initialize);
  const isInspectorVisible = useWorkbenchStore((state) => state.isInspectorVisible);
  const isTerminalVisible = useWorkbenchStore((state) => state.isTerminalVisible);

  useEffect(() => {
    bootstrapDemoWorkspace();
    void initializeFileWatcher();
    void restoreRecentWorkspace();
  }, [bootstrapDemoWorkspace, initializeFileWatcher, restoreRecentWorkspace]);

  return (
    <div className="app-shell">
      <TitleBar />
      <main
        className={`workbench ${isInspectorVisible ? "" : "inspector-hidden"} ${
          isTerminalVisible ? "" : "terminal-hidden"
        }`}
      >
        <ActivityRail />
        <SidebarPanel />
        <section className="editor-column">
          <TabBar />
          <HybridEditor buffer={activeBuffer ?? null} />
          {isTerminalVisible ? <TerminalPanel /> : null}
        </section>
        {isInspectorVisible ? <AiPanel /> : null}
      </main>
      <StatusBar />
      <CommandPalette />
      <QuickOpen />
      <ToastViewport />
    </div>
  );
}
