import type { RecodeDocumentSymbol } from "@/features/lsp/services/lsp-service";
import type { OutlineSymbol } from "@/features/outline/types";

function startsBeforeOrAt(a: RecodeDocumentSymbol, b: RecodeDocumentSymbol) {
  return a.line < b.line || (a.line === b.line && a.character <= b.character);
}

function endsAfterOrAt(a: RecodeDocumentSymbol, b: RecodeDocumentSymbol) {
  return a.endLine > b.endLine || (a.endLine === b.endLine && a.endCharacter >= b.endCharacter);
}

function containsSymbol(parent: RecodeDocumentSymbol, child: RecodeDocumentSymbol) {
  return parent !== child && startsBeforeOrAt(parent, child) && endsAfterOrAt(parent, child);
}

export function normalizeOutlineSymbols(
  symbols: RecodeDocumentSymbol[],
  filePath: string,
): OutlineSymbol[] {
  const sorted = [...symbols].sort((a, b) => {
    if (a.line !== b.line) return a.line - b.line;
    if (a.character !== b.character) return a.character - b.character;
    if (a.endLine !== b.endLine) return b.endLine - a.endLine;
    return b.endCharacter - a.endCharacter;
  });
  const stack: { raw: RecodeDocumentSymbol; symbol: OutlineSymbol }[] = [];
  const normalized: OutlineSymbol[] = [];

  sorted.forEach((raw, index) => {
    while (stack.length > 0) {
      const parent = stack[stack.length - 1]?.raw;
      if (parent && containsSymbol(parent, raw)) break;
      stack.pop();
    }

    const parent = stack[stack.length - 1]?.symbol;
    const symbol: OutlineSymbol = {
      ...raw,
      id: `${filePath}:${raw.line}:${raw.character}:${raw.kind}:${raw.name}:${index}`,
      filePath,
      depth: stack.length,
      parentId: parent?.id,
      childCount: 0,
      isLastChild: true,
    };

    if (parent) {
      parent.childCount += 1;
      for (let siblingIndex = normalized.length - 1; siblingIndex >= 0; siblingIndex -= 1) {
        const previousSibling = normalized[siblingIndex];
        if (previousSibling?.parentId !== parent.id) continue;
        previousSibling.isLastChild = false;
        break;
      }
    }

    normalized.push(symbol);
    stack.push({ raw, symbol });
  });

  return normalized;
}

export function filterOutlineSymbols(symbols: OutlineSymbol[], query: string) {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) return symbols;

  const symbolById = new Map(symbols.map((symbol) => [symbol.id, symbol]));
  const includedIds = new Set<string>();

  for (const symbol of symbols) {
    const haystack = [
      symbol.name,
      symbol.kind,
      symbol.detail ?? "",
      symbol.containerName ?? "",
      `${symbol.line + 1}`,
    ]
      .join(" ")
      .toLowerCase();
    if (!haystack.includes(normalizedQuery)) continue;

    let current: OutlineSymbol | undefined = symbol;
    while (current) {
      includedIds.add(current.id);
      current = current.parentId ? symbolById.get(current.parentId) : undefined;
    }
  }

  return symbols.filter((symbol) => includedIds.has(symbol.id));
}
