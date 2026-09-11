import type { ThinkingLevel } from "@earendil-works/pi-agent-core";
import { useEffect, useState } from "react";
import { Popover } from "./Popover";

export function ThinkingPicker({
  current,
  load,
  onSelect,
  placement = "down",
}: {
  placement?: "up" | "down";
  current: ThinkingLevel;
  load: () => Promise<ThinkingLevel[]>;
  onSelect: (l: ThinkingLevel) => void;
}) {
  const [open, setOpen] = useState(false);
  const [levels, setLevels] = useState<ThinkingLevel[]>([]);
  useEffect(() => {
    if (open) void load().then(setLevels);
  }, [open, load]);
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={`no-drag h-6.5 px-2 rounded-md text-xs text-ink-2 hover:text-ink ${placement === "up" ? "bg-paper-3 hover:bg-paper-4" : "hover:bg-paper-3"}`}
        title="Thinking level"
      >
        {current}
      </button>
      <Popover
        open={open}
        onClose={() => setOpen(false)}
        className={`${placement === "up" ? "left-0 bottom-8" : "right-0 top-8"} w-40 py-1`}
      >
        {levels.length === 0 && <div className="px-3 py-1.5 text-xs text-ink-3">not supported</div>}
        {levels.map((l) => (
          <button
            type="button"
            key={l}
            onClick={() => {
              onSelect(l);
              setOpen(false);
            }}
            className="w-full flex items-center gap-2 px-3 h-7 text-left text-xs hover:bg-paper-3"
          >
            <span className={`w-1.5 h-1.5 rounded-full ${l === current ? "bg-accent" : "bg-transparent"}`} />
            <span className="text-ink">{l}</span>
          </button>
        ))}
      </Popover>
    </div>
  );
}
