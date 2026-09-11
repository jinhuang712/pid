import { useEffect, useState } from "react";

export interface ForkPoint {
  entryId: string;
  text: string;
}

/** Pi's native fork: pick a user message, Pi creates a new session lineage from that point. */
export function ForkDialog({
  title,
  load,
  onFork,
  onClose,
}: {
  title: string;
  load: () => Promise<ForkPoint[]>;
  onFork: (entryId: string) => void;
  onClose: () => void;
}) {
  const [points, setPoints] = useState<ForkPoint[]>();
  useEffect(() => {
    void load().then(setPoints);
  }, [load]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [onClose]);
  return (
    <div className="absolute inset-0 z-40 bg-black/30 flex items-start justify-center pt-[16vh]">
      <button
        type="button"
        aria-label="Close"
        className="absolute inset-0 cursor-default"
        onMouseDown={onClose}
      />
      <dialog
        open
        aria-label="Fork session"
        className="relative m-0 p-0 w-[560px] max-w-[92vw] max-h-[60vh] rounded-xl border border-line bg-paper-2 shadow-2xl text-ink flex flex-col"
      >
        <div className="px-4 pt-3 pb-2 border-b border-line">
          <div className="text-sm font-medium">Fork from…</div>
          <div className="text-xs text-ink-3 truncate">{title}</div>
        </div>
        <div className="overflow-y-auto py-1">
          {points === undefined && <div className="px-4 py-2 text-xs text-ink-3">Loading…</div>}
          {points?.length === 0 && <div className="px-4 py-2 text-xs text-ink-3">No user messages yet.</div>}
          {points?.map((p, i) => (
            <button
              type="button"
              key={p.entryId}
              onClick={() => onFork(p.entryId)}
              className="w-full flex items-start gap-3 px-4 py-1.5 text-left text-sm hover:bg-paper-3"
            >
              <span className="text-ink-3 tabular-nums shrink-0 w-5 text-xs pt-0.5">{i + 1}</span>
              <span className="text-ink line-clamp-2">{p.text}</span>
            </button>
          ))}
        </div>
        <div className="px-4 h-7 flex items-center text-xs text-ink-3 border-t border-line">
          The new session starts before the chosen message; its text lands in the composer.
        </div>
      </dialog>
    </div>
  );
}
