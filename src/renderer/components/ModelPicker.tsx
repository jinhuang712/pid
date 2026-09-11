import type { Model } from "@earendil-works/pi-ai";
import { useEffect, useMemo, useRef, useState } from "react";
import { fuzzyFilter } from "../fuzzy";
import { Popover } from "./Popover";

// biome-ignore lint/suspicious/noExplicitAny: Pi models are Model<any> on the wire
type AnyModel = Model<any>;

function Chevron() {
  return (
    <svg
      width="10"
      height="10"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      className="ml-1 inline-block opacity-70"
    >
      <title>open</title>
      <path d="m5 6 3 3 3-3" />
    </svg>
  );
}

export function ModelPicker({
  current,
  load,
  onSelect,
  placement = "down",
}: {
  placement?: "up" | "down";
  current?: { provider: string; id: string };
  load: () => Promise<AnyModel[]>;
  onSelect: (m: AnyModel) => void;
}) {
  const [open, setOpen] = useState(false);
  const [models, setModels] = useState<AnyModel[]>([]);
  const [q, setQ] = useState("");
  const [cursor, setCursor] = useState(0);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setQ("");
    setCursor(0);
    void load().then(setModels);
    requestAnimationFrame(() => input.current?.focus());
  }, [open, load]);

  const filtered = useMemo(
    () => fuzzyFilter(models, q, (m) => `${m.provider}/${m.id} ${m.name}`),
    [models, q],
  );
  const groups = useMemo(() => {
    const g = new Map<string, AnyModel[]>();
    for (const m of filtered) g.set(m.provider, [...(g.get(m.provider) ?? []), m]);
    return [...g.entries()];
  }, [filtered]);

  const pick = (m: AnyModel) => {
    onSelect(m);
    setOpen(false);
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={`no-drag h-6.5 px-2 rounded-md text-xs text-ink-2 hover:text-ink ${placement === "up" ? "h-[26px] rounded-full text-[12.5px] hover:bg-paper-3" : "hover:bg-paper-3"}`}
        title={current ? `${current.provider}/${current.id} · from Pi's model configuration` : "Model"}
      >
        {current ? current.id : "model"}
        <Chevron />
      </button>
      <Popover
        open={open}
        onClose={() => setOpen(false)}
        className={`${placement === "up" ? "left-0 bottom-9" : "right-0 top-8"} w-96 max-h-[60vh] flex flex-col`}
      >
        <input
          ref={input}
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setCursor(0);
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") setCursor((c) => Math.min(c + 1, filtered.length - 1));
            else if (e.key === "ArrowUp") setCursor((c) => Math.max(c - 1, 0));
            else if (e.key === "Enter" && filtered[cursor]) pick(filtered[cursor]);
          }}
          placeholder="Search models…"
          className="m-2 h-7 px-2 rounded-md bg-paper-3 outline-none text-ink placeholder:text-ink-3 text-xs"
        />
        <div className="overflow-y-auto pb-1">
          {groups.length === 0 && <div className="px-3 py-2 text-xs text-ink-3">No models</div>}
          {groups.map(([provider, ms]) => (
            <div key={provider}>
              <div className="px-3 pt-1.5 pb-0.5 text-xs text-ink-3">{provider}</div>
              {ms.map((m) => {
                const idx = filtered.indexOf(m);
                const isCurrent = current?.provider === m.provider && current?.id === m.id;
                return (
                  <button
                    type="button"
                    key={`${m.provider}/${m.id}`}
                    onClick={() => pick(m)}
                    onMouseEnter={() => setCursor(idx)}
                    className={`w-full flex items-center gap-2 px-3 h-7 text-left text-xs ${idx === cursor ? "bg-paper-3" : ""}`}
                  >
                    <span
                      className={`w-1.5 h-1.5 rounded-full ${isCurrent ? "bg-accent" : "bg-transparent"}`}
                    />
                    <span className="text-ink truncate">{m.id}</span>
                    <span className="text-ink-3 truncate">{m.name}</span>
                    <span className="flex-1" />
                    {m.reasoning && <span className="text-ink-3">think</span>}
                    <span className="text-ink-3 tabular-nums">{Math.round(m.contextWindow / 1000)}k</span>
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </Popover>
    </div>
  );
}
