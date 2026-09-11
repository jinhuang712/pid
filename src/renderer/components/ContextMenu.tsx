import { type ReactNode, useEffect, useRef } from "react";
import { Keys } from "./Key";

export interface MenuItem {
  label: string;
  hint?: string;
  danger?: boolean;
  disabled?: boolean;
  onClick: () => void;
}

/** Small anchored menu at a screen position; closes on outside click or Escape. */
export function ContextMenu({
  x,
  y,
  items,
  onClose,
  header,
}: {
  x: number;
  y: number;
  items: (MenuItem | "sep")[];
  onClose: () => void;
  header?: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const down = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const key = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("mousedown", down);
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("mousedown", down);
      document.removeEventListener("keydown", key);
    };
  }, [onClose]);
  const left = Math.min(x, window.innerWidth - 240);
  const top = Math.min(y, window.innerHeight - 40 * items.length - 16);
  return (
    <div
      ref={ref}
      style={{ left, top }}
      className="fixed z-50 w-56 py-1 rounded-xl border border-line-2 bg-paper-2 shadow-[0_10px_40px_rgba(0,0,0,0.3)] text-sm"
    >
      {header && <div className="px-3 py-1 text-xs text-ink-3 truncate">{header}</div>}
      {items.map((it, i) =>
        it === "sep" ? (
          // biome-ignore lint/suspicious/noArrayIndexKey: separators have no identity
          <div key={`sep-${i}`} className="my-1 border-t border-line" />
        ) : (
          <button
            type="button"
            key={it.label}
            disabled={it.disabled}
            onClick={() => {
              onClose();
              it.onClick();
            }}
            className={`w-full h-7 px-3 flex items-center gap-2 text-left disabled:opacity-40 hover:bg-paper-3 ${
              it.danger ? "text-danger" : "text-ink"
            }`}
          >
            <span className="flex-1 truncate">{it.label}</span>
            {it.hint && <Keys keys={[...it.hint]} />}
          </button>
        ),
      )}
    </div>
  );
}
