import type { RecodeDocumentSymbol } from "@/features/lsp/services/lsp-service";

export interface OutlineSymbol extends RecodeDocumentSymbol {
  id: string;
  filePath: string;
  depth: number;
  parentId?: string;
  childCount: number;
  isLastChild: boolean;
}
