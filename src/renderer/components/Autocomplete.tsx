import { type ReactNode, useRef } from "react";
import { Floating, Row, useActiveInView } from "@/ui";

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
  const box = useRef<HTMLDivElement>(null);
  useActiveInView(box, cursor, items.length);
  return (
    <Floating ref={box} className="absolute left-0 right-0 bottom-full mb-2 text-xs max-h-72 overflow-y-auto">
      <div className="px-3 py-1.5 text-ink-3 border-b border-line sticky top-0 bg-paper-2">{title}</div>
      {items.length === 0 && <div className="px-3 py-2 text-ink-3">No matches</div>}
      {items.map((it, i) => (
        <Row
          key={it.id}
          data-index={i}
          active={i === cursor}
          hover={false}
          onMouseEnter={() => onHover(i)}
          onMouseDown={(e) => {
            e.preventDefault();
            onPick(it);
          }}
        >
          {/* the name never gives way to the description; the description truncates */}
          <span className="text-ink shrink-0 max-w-[55%] truncate" title={it.label}>
            {it.label}
          </span>
          {it.detail && (
            <span className="text-ink-3 flex-1 min-w-0 truncate" title={it.detail}>
              {it.detail}
            </span>
          )}
          {!it.detail && <span className="flex-1" />}
          {it.hint && <span className="text-ink-3 shrink-0">{it.hint}</span>}
        </Row>
      ))}
    </Floating>
  );
}
