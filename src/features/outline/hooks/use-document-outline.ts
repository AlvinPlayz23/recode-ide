import { useEffect, useMemo, useState } from "react";
import { useEditorStore } from "@/features/editor/stores/editor-store";
import { getDocumentSymbols } from "@/features/lsp/services/lsp-service";
import { normalizeOutlineSymbols } from "@/features/outline/utils/outline-symbols";

const outlineRefreshDelayMs = 250;

export function useDocumentOutline(isActive = true) {
  const activeBuffer = useEditorStore((state) =>
    state.buffers.find((buffer) => buffer.id === state.activeBufferId),
  );
  const [isLoading, setIsLoading] = useState(false);
  const [rawSymbols, setRawSymbols] = useState<
    Awaited<ReturnType<typeof getDocumentSymbols>>
  >([]);

  useEffect(() => {
    if (!isActive || !activeBuffer) {
      setRawSymbols([]);
      setIsLoading(false);
      return;
    }

    let cancelled = false;
    const timer = window.setTimeout(() => {
      setIsLoading(true);
      void getDocumentSymbols({
        filePath: activeBuffer.path,
        content: activeBuffer.content,
        languageId: activeBuffer.languageId,
      })
        .then((symbols) => {
          if (!cancelled) setRawSymbols(symbols);
        })
        .catch(() => {
          if (!cancelled) setRawSymbols([]);
        })
        .finally(() => {
          if (!cancelled) setIsLoading(false);
        });
    }, outlineRefreshDelayMs);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [activeBuffer?.content, activeBuffer?.id, activeBuffer?.languageId, activeBuffer?.path, isActive]);

  const symbols = useMemo(
    () => normalizeOutlineSymbols(rawSymbols, activeBuffer?.path ?? ""),
    [activeBuffer?.path, rawSymbols],
  );

  return {
    activeBuffer,
    isLoading,
    symbols,
  };
}
