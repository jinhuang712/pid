import type { Model } from "@earendil-works/pi-ai";
import { useEffect, useMemo, useRef, useState } from "react";
import { Dot, Num, Popover, Row, Trigger, useActiveInView } from "@/ui";
import { fuzzyFilter } from "../fuzzy";

// biome-ignore lint/suspicious/noExplicitAny: Pi models are Model<any> on the wire
type AnyModel = Model<any>;

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
  const [failed, setFailed] = useState<string>();
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setQ("");
    setCursor(0);
    setFailed(undefined);
    // A picker that cannot reach Pi says so; without this the rejection was unhandled and the list
    // read as "no models are configured".
    void load().then(setModels, (e: unknown) => {
      setModels([]);
      setFailed(e instanceof Error ? e.message : String(e));
    });
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

  // The keyboard moves the highlight; the row it lands on has to come into view.
  const box = useRef<HTMLDivElement>(null);
  useActiveInView(box, cursor, filtered.length);

  return (
    <div className="relative">
      <Trigger
        placement={placement}
        onClick={() => setOpen(!open)}
        title={current ? `${current.provider}/${current.id} · from Pi's model configuration` : "Model"}
      >
        {current ? current.id : "model"}
      </Trigger>
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
        <div className="overflow-y-auto pb-1" ref={box}>
          {groups.length === 0 && <div className="px-3 py-2 text-xs text-ink-3">{failed ?? "No models"}</div>}
          {groups.map(([provider, ms]) => (
            <div key={provider}>
              <div className="px-3 pt-1.5 pb-0.5 text-xs text-ink-3">{provider}</div>
              {ms.map((m) => {
                const idx = filtered.indexOf(m);
                const isCurrent = current?.provider === m.provider && current?.id === m.id;
                return (
                  <Row
                    key={`${m.provider}/${m.id}`}
                    data-index={idx}
                    active={idx === cursor}
                    hover={false}
                    className="text-xs"
                    onClick={() => pick(m)}
                    onMouseEnter={() => setCursor(idx)}
                  >
                    <Dot tone={isCurrent ? "accent" : undefined} />
                    <span className="text-ink truncate">{m.id}</span>
                    <span className="text-ink-3 truncate">{m.name}</span>
                    <span className="flex-1" />
                    {m.reasoning && <span className="text-ink-3">think</span>}
                    <Num className="text-ink-3">{Math.round(m.contextWindow / 1000)}k</Num>
                  </Row>
                );
              })}
            </div>
          ))}
        </div>
      </Popover>
    </div>
  );
}
