import { type ReactNode, useEffect, useRef } from "react";

/** Minimal anchored popover: closes on outside click or Escape. */
export function Popover({
  open,
  onClose,
  children,
  className = "",
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const down = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("mousedown", down);
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("mousedown", down);
      document.removeEventListener("keydown", key);
    };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div
      ref={ref}
      className={`no-drag absolute z-30 rounded-xl border border-line-2 bg-paper-2 shadow-[0_10px_40px_rgba(0,0,0,0.3)] text-sm ${className}`}
    >
      {children}
    </div>
  );
}
