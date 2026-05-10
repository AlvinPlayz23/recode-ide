import { useEffect } from "react";
import { commandRegistry } from "@/features/commands/command-registry";
import { keymapRegistry } from "@/features/commands/keymap-registry";
import { useCommandPaletteStore } from "@/features/command-palette/stores/command-palette-store";
import { useEditorStore } from "@/features/editor/stores/editor-store";
import { useProjectStore } from "@/features/project/stores/project-store";
import { useQuickOpenStore } from "@/features/quick-open/stores/quick-open-store";
import {
  FolderIcon,
  PanelBottomIcon,
  PanelRightIcon,
  PlusIcon,
} from "@/features/window/components/icons";
import { useWorkbenchStore } from "@/features/window/stores/workbench-store";

export function useRegisterCoreCommands() {
  const openPalette = useCommandPaletteStore((state) => state.actions.open);
  const closePalette = useCommandPaletteStore((state) => state.actions.close);
  const openFolder = useProjectStore((state) => state.actions.openFolder);
  const openQuickOpen = useQuickOpenStore((state) => state.actions.open);
  const activeBufferId = useEditorStore((state) => state.activeBufferId);
  const saveActiveBuffer = useEditorStore((state) => state.actions.saveActiveBuffer);
  const saveBufferAs = useEditorStore((state) => state.actions.saveBufferAs);
  const revertBuffer = useEditorStore((state) => state.actions.revertBuffer);
  const toggleInspector = useWorkbenchStore((state) => state.actions.toggleInspector);
  const toggleTerminal = useWorkbenchStore((state) => state.actions.toggleTerminal);
  const setActiveSidebarView = useWorkbenchStore((state) => state.actions.setActiveSidebarView);
  const showTerminal = useWorkbenchStore((state) => state.actions.showTerminal);

  useEffect(() => {
    commandRegistry.replaceAll([
      {
        id: "workbench.commandPalette",
        title: "Show Command Palette",
        category: "Workbench",
        detail: "Open the central command launcher",
        execute: openPalette,
      },
      {
        id: "project.openFolder",
        title: "Open Folder",
        category: "File",
        detail: "Choose a workspace folder",
        icon: <FolderIcon />,
        execute: async () => {
          await openFolder();
          closePalette();
        },
      },
      {
        id: "file.save",
        title: "Save Active File",
        category: "File",
        detail: activeBufferId ? "Write current buffer to disk" : "No active file",
        icon: <PlusIcon />,
        when: () => Boolean(useEditorStore.getState().activeBufferId),
        execute: async () => {
          await saveActiveBuffer();
          closePalette();
        },
      },
      {
        id: "file.saveAs",
        title: "Save Active File As...",
        category: "File",
        detail: activeBufferId ? "Write current buffer to another path" : "No active file",
        icon: <PlusIcon />,
        when: () => Boolean(useEditorStore.getState().activeBufferId),
        execute: async () => {
          const bufferId = useEditorStore.getState().activeBufferId;
          if (bufferId) await saveBufferAs(bufferId);
          closePalette();
        },
      },
      {
        id: "file.revert",
        title: "Revert Active File",
        category: "File",
        detail: activeBufferId ? "Reload current buffer from disk" : "No active file",
        icon: <PlusIcon />,
        when: () => Boolean(useEditorStore.getState().activeBufferId),
        execute: async () => {
          const bufferId = useEditorStore.getState().activeBufferId;
          if (bufferId) await revertBuffer(bufferId);
          closePalette();
        },
      },
      {
        id: "file.quickOpen",
        title: "Quick Open",
        category: "File",
        detail: "Find and open files in the workspace",
        icon: <FolderIcon />,
        execute: () => {
          openQuickOpen();
          closePalette();
        },
      },
      {
        id: "workbench.showSearch",
        title: "Show Workspace Search",
        category: "Workbench",
        detail: "Open the search sidebar",
        execute: () => {
          setActiveSidebarView("search");
          closePalette();
        },
      },
      {
        id: "workbench.showSourceControl",
        title: "Show Source Control",
        category: "Workbench",
        detail: "Open the Git sidebar",
        execute: () => {
          setActiveSidebarView("git");
          closePalette();
        },
      },
      {
        id: "workbench.toggleInspector",
        title: "Toggle Agent Inspector",
        category: "Workbench",
        detail: "Show or hide the right-side AI inspector",
        icon: <PanelRightIcon />,
        execute: () => {
          toggleInspector();
          closePalette();
        },
      },
      {
        id: "workbench.toggleTerminal",
        title: "Toggle Terminal",
        category: "Workbench",
        detail: "Show or hide the bottom utility area",
        icon: <PanelBottomIcon />,
        execute: () => {
          toggleTerminal();
          closePalette();
        },
      },
      {
        id: "workbench.showTerminal",
        title: "Show Terminal",
        category: "Workbench",
        detail: "Open the bottom terminal panel",
        icon: <PanelBottomIcon />,
        execute: () => {
          showTerminal();
          closePalette();
        },
      },
    ]);

    keymapRegistry.replaceAll([
      { key: "Mod+K", command: "workbench.commandPalette", source: "default" },
      { key: "Mod+O", command: "project.openFolder", source: "default" },
      { key: "Mod+P", command: "file.quickOpen", source: "default" },
      { key: "Mod+Shift+F", command: "workbench.showSearch", source: "default" },
      { key: "Mod+Shift+G", command: "workbench.showSourceControl", source: "default" },
      { key: "Mod+S", command: "file.save", source: "default" },
      { key: "Mod+Shift+S", command: "file.saveAs", source: "default" },
      { key: "Mod+`", command: "workbench.toggleTerminal", source: "default" },
    ]);
  }, [
    activeBufferId,
    closePalette,
    openFolder,
    openPalette,
    openQuickOpen,
    revertBuffer,
    saveActiveBuffer,
    saveBufferAs,
    setActiveSidebarView,
    showTerminal,
    toggleInspector,
    toggleTerminal,
  ]);
}
