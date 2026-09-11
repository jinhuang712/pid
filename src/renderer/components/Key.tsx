import type { ReactNode } from "react";

/**
 * Key caps. Every shortcut in PID is drawn with these — never bare "⌘K" text.
 * `keys` is a chord such as ["⌘", "K"]; the optional label follows it.
 */
export function Keys({
  keys,
  label,
  className = "",
}: {
  keys: string[];
  label?: ReactNode;
  className?: string;
}) {
  return (
    <span className={`inline-flex items-center gap-1 whitespace-nowrap ${className}`}>
      {keys.map((k) => (
        <Key key={k}>{k}</Key>
      ))}
      {label && <span className="ml-0.5 text-[12px] text-ink-3">{label}</span>}
    </span>
  );
}

export function Key({ children, small }: { children: ReactNode; small?: boolean }) {
  return (
    <kbd
      className={`inline-flex items-center justify-center rounded-[5px] bg-paper-3 border border-line-2 text-ink-2 font-sans leading-none shadow-[inset_0_-1px_0_rgba(0,0,0,0.35)] ${
        small ? "h-4 min-w-4 px-1 text-[11px]" : "h-[18px] min-w-[18px] px-1.5 text-[11px]"
      }`}
    >
      {children}
    </kbd>
  );
}

/** A sigil chip: clicking inserts the sigil into the composer. */
export function SigilChip({
  sigil,
  label,
  compact,
  onClick,
}: {
  sigil: string;
  label: string;
  compact?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={`Insert ${sigil} ${label}`}
      className={`h-[22px] rounded-full inline-flex items-center gap-1.5 text-[12px] text-ink-3 hover:text-ink-2 hover:bg-paper-3 whitespace-nowrap ${
        compact ? "px-1" : "pl-1.5 pr-2"
      }`}
    >
      <Key small>{sigil}</Key>
      {!compact && label}
    </button>
  );
}
