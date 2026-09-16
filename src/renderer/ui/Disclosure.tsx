import type { ReactNode } from "react";

/**
 * The chevron that says a thing opens, and the row that opens it.
 *
 * Three places drew this by hand — a tool card, a turn's steps, a thinking block — and two of them
 * were the same ten-pixel path with the same `rotate-90`. It is here once so a fourth caller, an
 * extension's page among them, inherits the size, the rotation and the title text rather than
 * guessing at them.
 */

/** Just the glyph, for a caller that owns its own row. `turn` picks which way closed points. */
export function Chevron({ open, turn = "right" }: { open: boolean; turn?: "right" | "down" }) {
  const right = turn === "right";
  return (
    <svg
      width="10"
      height="10"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      className={`shrink-0 transition-transform ${open ? (right ? "rotate-90" : "rotate-180") : ""}`}
    >
      <title>{open ? "collapse" : "expand"}</title>
      <path d={right ? "m6 4 4 4-4 4" : "m5 6 3 3 3-3"} />
    </svg>
  );
}

/**
 * A summary line that reveals its children.
 *
 * The caller owns `open`, because who decides a section starts closed is a product question — a
 * setting, a count, the first failure — and a component that kept that state could not be told.
 *
 * `lead` and `trail` sit on the summary line but outside the button that opens it, because a switch
 * or an action nested inside a button is not clickable — the outer button swallows it. Without them
 * a row with a switch has to put the switch on a second line, and every card is twice as tall as
 * what it says.
 */
export function Disclosure({
  open,
  onToggle,
  lead,
  summary,
  trail,
  turn = "right",
  className = "",
  children,
}: {
  open: boolean;
  /** Absent for a row with nothing to reveal: the chevron goes with it. */
  onToggle?: () => void;
  /** Controls before the chevron — a switch, a checkbox. Clickable in their own right. */
  lead?: ReactNode;
  summary: ReactNode;
  /** Controls after the summary, at the end of the line. Clickable in their own right. */
  trail?: ReactNode;
  turn?: "right" | "down";
  className?: string;
  children?: ReactNode;
}) {
  return (
    <div className={className}>
      <div className="flex items-center gap-2 min-w-0">
        {lead}
        <button
          type="button"
          onClick={onToggle}
          disabled={!onToggle}
          className={`group flex items-center gap-2 h-6 flex-1 min-w-0 text-left text-xs ${
            onToggle ? "text-ink-2 hover:text-ink" : "text-ink-3 cursor-default"
          }`}
        >
          {onToggle && <Chevron open={open} turn={turn} />}
          {summary}
        </button>
        {trail}
      </div>
      {open && children}
    </div>
  );
}
