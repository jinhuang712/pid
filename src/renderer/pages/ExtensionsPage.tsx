import type { Compat, ExtensionView } from "@shared/ecosystem";
import { useEffect, useMemo, useState } from "react";
import { bridge } from "../bridge";
import { fuzzyFilter } from "../fuzzy";
import { Badge, PageShell, PathLink } from "./PageShell";

const COMPAT: Record<Compat, { label: string; tone: "ok" | "warn" | "danger" }> = {
  compatible: { label: "Compatible", tone: "ok" },
  partial: { label: "Partially compatible", tone: "warn" },
  unsupported: { label: "TUI-only / Unsupported", tone: "danger" },
};

/**
 * Pi extensions from settings.json packages and the extensions directories.
 * Compatibility is a static scan for terminal-only UI APIs; PID does not adapt them.
 */
export function ExtensionsPage({ folder }: { folder?: string }) {
  const [list, setList] = useState<ExtensionView[]>([]);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<string>();

  const load = () => void bridge.eco.extensions(folder).then(setList);
  // biome-ignore lint/correctness/useExhaustiveDependencies: reload when the folder changes
  useEffect(load, [folder]);

  const filtered = useMemo(
    () => fuzzyFilter(list, q, (e) => `${e.name} ${e.source} ${e.description ?? ""}`),
    [list, q],
  );
  const counts = useMemo(() => {
    const c = { compatible: 0, partial: 0, unsupported: 0 };
    for (const e of list) c[e.compat]++;
    return c;
  }, [list]);

  return (
    <PageShell
      title="Extensions"
      note={
        <>
          {list.length} extensions · {counts.compatible} compatible · {counts.partial} partial ·{" "}
          {counts.unsupported} unsupported. Enable or disable them with{" "}
          <span className="font-mono">pi config</span>; PID reads Pi's settings and does not manage them.
        </>
      }
      search={q}
      onSearch={setQ}
      actions={
        <button
          type="button"
          onClick={load}
          className="h-7 px-2 rounded-md text-xs text-ink-2 hover:bg-paper-3 hover:text-ink"
        >
          Refresh
        </button>
      }
    >
      <div className="flex flex-col gap-2">
        {filtered.map((e) => {
          const c = COMPAT[e.compat];
          const isOpen = open === e.baseDir + e.name;
          return (
            <article key={e.baseDir + e.name} className="rounded-lg border border-line bg-paper-2">
              <button
                type="button"
                onClick={() => setOpen(isOpen ? undefined : e.baseDir + e.name)}
                className="w-full text-left px-3 py-2 flex items-center gap-2"
              >
                <span className="font-medium text-ink">{e.name}</span>
                {e.version && <span className="text-xs text-ink-3">v{e.version}</span>}
                <Badge tone="muted">{e.scope}</Badge>
                <span className="flex-1" />
                <Badge tone={c.tone}>{c.label}</Badge>
                <span className="text-ink-3 text-xs">{isOpen ? "▾" : "▸"}</span>
              </button>
              {isOpen && (
                <div className="px-3 pb-3 text-xs flex flex-col gap-1.5 border-t border-line pt-2">
                  {e.description && <p className="text-ink-2">{e.description}</p>}
                  <div className="text-ink-3">
                    source <span className="font-mono text-ink-2">{e.source}</span>
                  </div>
                  {e.baseDir && <PathLink path={e.baseDir} />}
                  <div className="text-ink-3">
                    {e.files.length} source file{e.files.length === 1 ? "" : "s"}
                  </div>
                  {e.uiApis.length > 0 && (
                    <div className="text-ink-3">
                      UI via RPC: <span className="font-mono text-ink-2">{e.uiApis.join(", ")}</span>
                    </div>
                  )}
                  {e.tuiApis.length > 0 && (
                    <div className="text-warn">
                      Terminal-only APIs: <span className="font-mono">{e.tuiApis.join(", ")}</span>
                      {e.compat === "partial" && " (guarded by a mode check, so the rest should work)"}
                    </div>
                  )}
                </div>
              )}
            </article>
          );
        })}
        {filtered.length === 0 && <div className="text-xs text-ink-3">No extensions match.</div>}
      </div>
    </PageShell>
  );
}
