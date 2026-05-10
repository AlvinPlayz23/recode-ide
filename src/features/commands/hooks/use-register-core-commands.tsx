import { useEffect } from "react";
import { commandRegistry } from "@/features/commands/command-registry";
import { keymapRegistry } from "@/features/commands/keymap-registry";
import { useCommandPaletteStore } from "@/features/command-palette/stores/command-palette-store";
import {
  handleFindReferences,
  handleFormatDocument,
  handleRenameSymbol,
  handleSave,
  handleSaveAs,
} from "@/features/editor/services/editor-app-actions";
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
          await handleSave();
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
          await handleSaveAs();
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
        id: "editor.renameSymbol",
        title: "Rename Symbol",
        category: "Editor",
        detail: activeBufferId ? "Rename the symbol under the cursor" : "No active file",
        when: () => Boolean(useEditorStore.getState().activeBufferId),
        execute: async () => {
          await handleRenameSymbol();
          closePalette();
        },
      },
      {
        id: "editor.findReferences",
        title: "Find References",
        category: "Editor",
        detail: activeBufferId ? "Find workspace references for the symbol under the cursor" : "No active file",
        when: () => Boolean(useEditorStore.getState().activeBufferId),
        execute: async () => {
          await handleFindReferences();
          closePalette();
        },
      },
      {
        id: "editor.formatDocument",
        title: "Format Document",
        category: "Editor",
        detail: activeBufferId ? "Format the active document" : "No active file",
        when: () => Boolean(useEditorStore.getState().activeBufferId),
        execute: async () => {
          await handleFormatDocument();
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
        id: "workbench.showDiagnostics",
        title: "Show Diagnostics",
        category: "Workbench",
        detail: "Open the diagnostics sidebar",
        execute: () => {
          setActiveSidebarView("diagnostics");
          closePalette();
        },
      },
      {
        id: "workbench.showOutline",
        title: "Show Outline",
        category: "Workbench",
        detail: "Open document symbols for the active file",
        execute: () => {
          setActiveSidebarView("outline");
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
      { key: "Mod+Shift+O", command: "workbench.showOutline", source: "default" },
      { key: "Mod+Shift+M", command: "workbench.showDiagnostics", source: "default" },
      { key: "F2", command: "editor.renameSymbol", source: "default" },
      { key: "Shift+F12", command: "editor.findReferences", source: "default" },
      { key: "Alt+Shift+F", command: "editor.formatDocument", source: "default" },
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
    setActiveSidebarView,
    showTerminal,
    toggleInspector,
    toggleTerminal,
  ]);
}
