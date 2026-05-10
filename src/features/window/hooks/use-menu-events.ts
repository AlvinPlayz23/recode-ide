import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { useEffect, useRef } from "react";

interface MenuHandlers {
  onSave: () => unknown | Promise<unknown>;
  onSaveAs: () => unknown | Promise<unknown>;
}

export function useMenuEvents(handlers: MenuHandlers) {
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  useEffect(() => {
    let disposed = false;
    let cleanupSave: (() => void) | null = null;
    let cleanupSaveAs: (() => void) | null = null;
    const currentWindow = getCurrentWebviewWindow();

    const onBrowserSave = () => {
      void handlersRef.current.onSave();
    };
    const onBrowserSaveAs = () => {
      void handlersRef.current.onSaveAs();
    };

    window.addEventListener("menu-save", onBrowserSave);
    window.addEventListener("menu-save-as", onBrowserSaveAs);

    void currentWindow.listen("menu_save", () => {
      if (!disposed) void handlersRef.current.onSave();
    }).then((unlisten) => {
      cleanupSave = unlisten;
    });

    void currentWindow.listen("menu_save_as", () => {
      if (!disposed) void handlersRef.current.onSaveAs();
    }).then((unlisten) => {
      cleanupSaveAs = unlisten;
    });

    return () => {
      disposed = true;
      cleanupSave?.();
      cleanupSaveAs?.();
      window.removeEventListener("menu-save", onBrowserSave);
      window.removeEventListener("menu-save-as", onBrowserSaveAs);
    };
  }, []);
}
