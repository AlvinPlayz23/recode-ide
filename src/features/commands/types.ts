import type { ReactNode } from "react";

export interface RecodeCommand {
  id: string;
  title: string;
  category: "File" | "Workbench" | "Editor" | "Git" | "Terminal" | "AI";
  detail?: string;
  icon?: ReactNode;
  when?: () => boolean;
  execute: () => void | Promise<void>;
}

export interface RecodeKeybinding {
  key: string;
  command: string;
  source: "default" | "user";
  enabled?: boolean;
}
