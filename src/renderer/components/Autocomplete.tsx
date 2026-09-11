import type { ReactNode } from "react";

export interface AutocompleteItem {
  id: string;
  label: string;
  detail?: string;
  hint?: string;
  icon?: ReactNode;
}

/** Popup above the composer. Keyboard handling lives in the composer; this only renders. */
export function Autocomplete({
  title,
  items,
  cursor,
  onHover,
  onPick,
}: {
  title: string;
  items: AutocompleteItem[];
  cursor: number;
  onHover: (i: number) => void;
  onPick: (item: AutocompleteItem) => void;
}) {
  return (
    <div className="absolute left-0 right-0 bottom-full mb-2 rounded-xl border border-line-2 bg-paper-2 shadow-[0_10px_40px_rgba(0,0,0,0.3)] text-xs max-h-72 overflow-y-auto">
      <div className="px-3 py-1.5 text-ink-3 border-b border-line sticky top-0 bg-paper-2">{title}</div>
      {items.length === 0 && <div className="px-3 py-2 text-ink-3">No matches</div>}
      {items.map((it, i) => (
        <button
          type="button"
          key={it.id}
          data-index={i}
          onMouseEnter={() => onHover(i)}
          onMouseDown={(e) => {
            e.preventDefault();
            onPick(it);
          }}
          className={`w-full flex items-center gap-2 px-3 h-7 text-left ${i === cursor ? "bg-paper-3" : ""}`}
        >
          {it.icon && <span className="text-ink-3 w-4 shrink-0 text-center">{it.icon}</span>}
          <span className="text-ink truncate">{it.label}</span>
          {it.detail && <span className="text-ink-3 truncate">{it.detail}</span>}
          <span className="flex-1" />
          {it.hint && <span className="text-ink-3 shrink-0">{it.hint}</span>}
        </button>
      ))}
    </div>
  );
}
