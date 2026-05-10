import { useEditorStore } from "@/features/editor/stores/editor-store";
import { CloseIcon, FileIcon } from "@/features/window/components/icons";

export function TabBar() {
  const buffers = useEditorStore((state) => state.buffers);
  const activeBufferId = useEditorStore((state) => state.activeBufferId);
  const setActiveBuffer = useEditorStore((state) => state.actions.setActiveBuffer);
  const closeBuffer = useEditorStore((state) => state.actions.closeBuffer);

  return (
    <div className="tab-bar" role="tablist" aria-label="Open files">
      {buffers.map((buffer) => {
        const dirty = buffer.content !== buffer.savedContent;
        const isActive = buffer.id === activeBufferId;
        return (
          <div
            className={`tab ${isActive ? "active" : ""}`}
            key={buffer.id}
            role="tab"
            aria-selected={isActive}
          >
            <button
              type="button"
              className="tab-label"
              onClick={() => setActiveBuffer(buffer.id)}
              title={
                buffer.externalState === "none"
                  ? buffer.path
                  : `${buffer.path} (${buffer.externalState === "deleted" ? "deleted" : "changed"} on disk)`
              }
            >
              <span className="tab-icon">
                <FileIcon size={13} />
              </span>
              <span>{buffer.name}</span>
            </button>
            <button
              type="button"
              className="tab-close"
              onClick={(event) => {
                event.stopPropagation();
                closeBuffer(buffer.id);
              }}
              aria-label={`Close ${buffer.name}`}
              title={dirty ? "Unsaved changes" : "Close"}
            >
              {dirty ? <span className="dirty-dot" /> : <CloseIcon size={12} />}
            </button>
          </div>
        );
      })}
    </div>
  );
}
