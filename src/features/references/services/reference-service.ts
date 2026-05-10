import { readFile } from "@/features/file-explorer/services/file-service";
import type { ProjectFile } from "@/features/project/stores/project-store";
import type { ReferenceResult } from "@/features/references/stores/references-store";

export async function findWorkspaceReferences(files: ProjectFile[], symbol: string) {
  const results: ReferenceResult[] = [];
  if (!symbol.trim()) return results;

  const pattern = new RegExp(`(^|[^\\w$])(${escapeRegExp(symbol)})(?=[^\\w$]|$)`, "g");
  const searchableFiles = files.filter((file) => file.kind === "file" && isProbablyTextFile(file.name));

  for (const file of searchableFiles.slice(0, 500)) {
    const content = await readFile(file.path);
    if (!content) continue;

    const lines = content.split("\n");
    for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
      const line = lines[lineIndex];
      pattern.lastIndex = 0;
      let match = pattern.exec(line);
      while (match) {
        const prefixLength = match[1]?.length ?? 0;
        const character = match.index + prefixLength;
        results.push({
          filePath: file.path,
          fileName: file.name,
          relativePath: file.relativePath,
          line: lineIndex,
          character,
          excerpt: line.trim(),
        });
        if (results.length >= 250) return results;
        match = pattern.exec(line);
      }
    }
  }

  return results;
}

function isProbablyTextFile(name: string) {
  return /\.(css|html|js|jsx|json|md|rs|toml|ts|tsx|txt|yml|yaml)$/i.test(name);
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
