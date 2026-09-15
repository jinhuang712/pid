import type { ThinkingLevel } from "@earendil-works/pi-agent-core";
import { useEffect, useState } from "react";
import { Dot, Popover, Row, Trigger } from "@/ui";

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
      <Trigger placement={placement} title="Thinking level" onClick={() => setOpen(!open)}>
        {current}
      </Trigger>
      <Popover
        open={open}
        onClose={() => setOpen(false)}
        className={`${placement === "up" ? "left-0 bottom-9" : "right-0 top-8"} w-40 py-1`}
      >
        {levels.length === 0 && <div className="px-3 py-1.5 text-xs text-ink-3">not supported</div>}
        {levels.map((l) => (
          <Row
            key={l}
            className="text-xs"
            onClick={() => {
              onSelect(l);
              setOpen(false);
            }}
          >
            <Dot tone={l === current ? "accent" : undefined} />
            <span className="text-ink">{l}</span>
          </Row>
        ))}
      </Popover>
    </div>
  );
}
