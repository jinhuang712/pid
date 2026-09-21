import { type RefObject, useEffect } from "react";

/**
 * Keep the highlighted row in view.
 *
 * A list that moves by keyboard needs this: ArrowDown past the bottom of a scroll box would move a
 * highlight nobody can see, and the next Enter would pick it. `rows` is a dependency so a changed
 * list is checked again at the same cursor position, and the container's rows are marked with
 * `data-index` — the attribute the row primitive already passes through to its button.
 */
export function useActiveInView(box: RefObject<HTMLElement | null>, active: number, rows: number): void {
  useEffect(() => {
    const row = box.current?.querySelector<HTMLElement>(`[data-index="${active}"]`);
    // `rows` is read so that a list which changed under the same cursor is checked again.
    if (!row || rows === 0) return;
    row.scrollIntoView({ block: "nearest" });
  }, [box, active, rows]);
}
