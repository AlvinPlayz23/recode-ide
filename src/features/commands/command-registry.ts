import type { RecodeCommand } from "@/features/commands/types";

class CommandRegistry {
  private commands = new Map<string, RecodeCommand>();

  register(command: RecodeCommand) {
    this.commands.set(command.id, command);
  }

  registerMany(commands: RecodeCommand[]) {
    for (const command of commands) {
      this.register(command);
    }
  }

  replaceAll(commands: RecodeCommand[]) {
    this.commands.clear();
    this.registerMany(commands);
  }

  get(commandId: string) {
    return this.commands.get(commandId);
  }

  all() {
    return Array.from(this.commands.values());
  }

  async execute(commandId: string) {
    const command = this.commands.get(commandId);
    if (!command) {
      console.warn(`Command not found: ${commandId}`);
      return;
    }
    if (command.when && !command.when()) return;
    try {
      await command.execute();
    } catch (error) {
      console.error(`Command failed: ${commandId}`, error);
    }
  }

  clear() {
    this.commands.clear();
  }
}

export const commandRegistry = new CommandRegistry();
