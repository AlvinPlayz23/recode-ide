interface Token {
  value: string;
  kind: "keyword" | "string" | "comment" | "number" | "plain";
}

const keywordPattern = /\b(import|from|export|function|const|let|return|if|else|type|interface|struct|fn|pub|mod|use|async|await)\b/g;

export function tokenizeLine(line: string, languageId: string): Token[] {
  if (line.trimStart().startsWith("//") || line.trimStart().startsWith("#")) {
    return [{ value: line, kind: "comment" }];
  }

  const tokens: Token[] = [];
  let cursor = 0;
  const regex = /(".*?"|'.*?'|`.*?`|\b\d+(?:\.\d+)?\b|\b(import|from|export|function|const|let|return|if|else|type|interface|struct|fn|pub|mod|use|async|await)\b)/g;

  for (const match of line.matchAll(regex)) {
    const index = match.index ?? 0;
    if (index > cursor) {
      tokens.push({ value: line.slice(cursor, index), kind: "plain" });
    }

    const value = match[0];
    if (value.startsWith("\"") || value.startsWith("'") || value.startsWith("`")) {
      tokens.push({ value, kind: "string" });
    } else if (/^\d/.test(value)) {
      tokens.push({ value, kind: "number" });
    } else if (keywordPattern.test(value) || languageId === "rust") {
      keywordPattern.lastIndex = 0;
      tokens.push({ value, kind: "keyword" });
    } else {
      tokens.push({ value, kind: "plain" });
    }
    cursor = index + value.length;
  }

  if (cursor < line.length) {
    tokens.push({ value: line.slice(cursor), kind: "plain" });
  }

  return tokens.length > 0 ? tokens : [{ value: line, kind: "plain" }];
}
