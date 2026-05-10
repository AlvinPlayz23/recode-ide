import type { HighlightToken } from "@/features/editor/utils/tokenize-line";

interface TokenizeResponse {
  id: number;
  tokenizedLines: HighlightToken[][];
}

let worker: Worker | null = null;
let requestId = 0;
const pending = new Map<number, (tokens: HighlightToken[][]) => void>();

function getWorker() {
  worker ??= new Worker(new URL("./tokenizer-worker.ts", import.meta.url), { type: "module" });
  worker.onmessage = (event: MessageEvent<TokenizeResponse>) => {
    const resolve = pending.get(event.data.id);
    if (!resolve) return;
    pending.delete(event.data.id);
    resolve(event.data.tokenizedLines);
  };
  return worker;
}

export function tokenizeInWorker(content: string, languageId: string) {
  const id = ++requestId;
  return new Promise<HighlightToken[][]>((resolve) => {
    pending.set(id, resolve);
    getWorker().postMessage({ id, content, languageId });
  });
}
