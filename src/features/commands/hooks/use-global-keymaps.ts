import { useEffect } from "react";
import { keymapRegistry } from "@/features/commands/keymap-registry";
import { useCommandPaletteStore } from "@/features/command-palette/stores/command-palette-store";

export function useGlobalKeymaps() {
  const closePalette = useCommandPaletteStore((state) => state.actions.close);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closePalette();
        return;
      }
      void keymapRegistry.handleKeyboardEvent(event);
    };

    document.addEventListener("keydown", onKeyDown, true);
    return () => document.removeEventListener("keydown", onKeyDown, true);
  }, [closePalette]);
}
