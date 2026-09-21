import type { RefObject } from "react";
import { useEffect } from "react";

/**
 * Close when the pointer goes down outside `ref`, or when Escape is pressed.
 *
 * Every transient surface wants exactly this and nothing more, so the two listeners and their
 * teardown live here rather than being retyped at each one. `active` is false for a surface that is
 * currently closed: the listeners are not attached at all, so a closed popover costs nothing.
 */
export function useDismiss(ref: RefObject<HTMLElement | null>, onClose: () => void, active = true): void {
  useEffect(() => {
    if (!active) return;
    const down = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const key = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      // The surface is what Escape is for, so it takes the key: the window listens too, and an
      // unclaimed Escape there drops the user out of the session behind the popover.
      e.preventDefault();
      onClose();
    };
    document.addEventListener("mousedown", down);
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("mousedown", down);
      document.removeEventListener("keydown", key);
    };
  }, [ref, onClose, active]);
}
