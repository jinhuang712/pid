import { useEffect, useState } from "react";
import { Popover } from "./Popover";

export interface ForkPoint {
  entryId: string;
  text: string;
}

/** Pi's native fork: pick a user message, Pi creates a new session lineage from that point. */
export function ForkMenu({
  open,
  setOpen,
  load,
  onFork,
}: {
  open: boolean;
  setOpen: (o: boolean) => void;
  load: () => Promise<ForkPoint[]>;
  onFork: (entryId: string) => void;
}) {
  const [points, setPoints] = useState<ForkPoint[]>([]);
  useEffect(() => {
    if (open) void load().then(setPoints);
  }, [open, load]);
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="no-drag h-6.5 px-2 rounded-md text-xs text-ink-2 hover:bg-paper-3 hover:text-ink"
        title="Fork this session from a user message"
      >
        Fork
      </button>
      <Popover
        open={open}
        onClose={() => setOpen(false)}
        className="right-0 top-8 w-96 max-h-[60vh] overflow-y-auto py-1"
      >
        <div className="px-3 py-1.5 text-xs text-ink-3">Fork from…</div>
        {points.length === 0 && <div className="px-3 py-1.5 text-xs text-ink-3">No user messages yet</div>}
        {points.map((p, i) => (
          <button
            type="button"
            key={p.entryId}
            onClick={() => {
              onFork(p.entryId);
              setOpen(false);
            }}
            className="w-full flex items-start gap-2 px-3 py-1.5 text-left text-xs hover:bg-paper-3"
          >
            <span className="text-ink-3 tabular-nums shrink-0 w-5">{i + 1}</span>
            <span className="text-ink line-clamp-2">{p.text}</span>
          </button>
        ))}
      </Popover>
    </div>
  );
}
