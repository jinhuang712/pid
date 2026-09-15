import { type ReactNode, useRef } from "react";
import { useDismiss } from "./dismiss";
import { Floating } from "./Surface";

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
  useDismiss(ref, onClose, open);
  if (!open) return null;
  return (
    <Floating ref={ref} className={`no-drag absolute z-30 text-sm ${className}`}>
      {children}
    </Floating>
  );
}
