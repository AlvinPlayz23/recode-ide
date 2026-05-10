import type { RecodeCompletionItem } from "@/features/lsp/services/lsp-service";

interface CompletionDropdownProps {
  items: RecodeCompletionItem[];
  selectedIndex: number;
  line: number;
  column: number;
  scrollTop: number;
  onSelect: (item: RecodeCompletionItem) => void;
  onHover: (index: number) => void;
}

const lineHeight = 22;
const gutterWidth = 48;
const charWidth = 7.83;

export function CompletionDropdown({
  items,
  selectedIndex,
  line,
  column,
  scrollTop,
  onSelect,
  onHover,
}: CompletionDropdownProps) {
  if (items.length === 0) return null;

  return (
    <div
      className="completion-dropdown"
      style={{
        top: (line + 1) * lineHeight - scrollTop,
        left: gutterWidth + column * charWidth,
      }}
    >
      {items.map((item, index) => (
        <button
          key={`${item.label}:${index}`}
          type="button"
          className={index === selectedIndex ? "selected" : ""}
          onMouseEnter={() => onHover(index)}
          onMouseDown={(event) => {
            event.preventDefault();
            onSelect(item);
          }}
        >
          <span className="completion-label">{item.label}</span>
          <span className="completion-detail">{item.detail}</span>
        </button>
      ))}
    </div>
  );
}
