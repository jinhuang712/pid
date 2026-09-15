import { type ReactNode, useRef } from "react";
import { Row } from "./Controls";
import { useDismiss } from "./dismiss";
import { Keys } from "./Key";
import { Divider, Floating } from "./Surface";

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
  useDismiss(ref, onClose);
  const left = Math.min(x, window.innerWidth - 240);
  const top = Math.min(y, window.innerHeight - 40 * items.length - 16);
  return (
    <Floating ref={ref} style={{ left, top }} className="fixed z-50 w-56 py-1 text-sm">
      {header && <div className="px-3 py-1 text-xs text-ink-3 truncate">{header}</div>}
      {items.map((it, i) =>
        it === "sep" ? (
          // biome-ignore lint/suspicious/noArrayIndexKey: separators have no identity
          <Divider key={`sep-${i}`} inset />
        ) : (
          <Row
            key={it.label}
            disabled={it.disabled}
            onClick={() => {
              onClose();
              it.onClick();
            }}
            className={it.danger ? "text-danger" : "text-ink"}
          >
            <span className="flex-1 truncate">{it.label}</span>
            {it.hint && <Keys keys={[...it.hint]} />}
          </Row>
        ),
      )}
    </Floating>
  );
}
