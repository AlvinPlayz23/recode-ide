import { commandRegistry } from "@/features/commands/command-registry";
import type { RecodeKeybinding } from "@/features/commands/types";

class KeymapRegistry {
  private keybindings: RecodeKeybinding[] = [];

  register(keybinding: RecodeKeybinding) {
    const existingIndex = this.keybindings.findIndex(
      (candidate) =>
        candidate.command === keybinding.command && candidate.source === keybinding.source,
    );
    if (existingIndex >= 0) {
      this.keybindings[existingIndex] = keybinding;
      return;
    }
    this.keybindings.push(keybinding);
  }

  registerMany(keybindings: RecodeKeybinding[]) {
    for (const keybinding of keybindings) {
      this.register(keybinding);
    }
  }

  replaceAll(keybindings: RecodeKeybinding[]) {
    this.keybindings = [];
    this.registerMany(keybindings);
  }

  all() {
    return [...this.keybindings];
  }

  getForCommand(commandId: string) {
    return this.keybindings.find((keybinding) => keybinding.command === commandId);
  }

  async handleKeyboardEvent(event: KeyboardEvent) {
    const normalized = normalizeKeyboardEvent(event);
    const match = this.keybindings.find(
      (keybinding) => keybinding.enabled !== false && keybinding.key === normalized,
    );
    if (!match) return false;

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    try {
      await commandRegistry.execute(match.command);
    } catch (error) {
      console.error(`Command failed: ${match.command}`, error);
    }
    return true;
  }

  clear() {
    this.keybindings = [];
  }
}

export const keymapRegistry = new KeymapRegistry();

function normalizeKeyboardEvent(event: KeyboardEvent) {
  const parts: string[] = [];
  if (event.ctrlKey || event.metaKey) parts.push("Mod");
  if (event.altKey) parts.push("Alt");
  if (event.shiftKey) parts.push("Shift");

  const key = event.key.length === 1 ? event.key.toUpperCase() : event.key;
  parts.push(key);
  return parts.join("+");
}

export function displayKeybinding(keybinding: string) {
  return keybinding.replace("Mod", navigator.platform.toLowerCase().includes("mac") ? "Cmd" : "Ctrl");
}
