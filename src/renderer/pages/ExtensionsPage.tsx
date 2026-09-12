import type { Compat, ExtensionView } from "@shared/ecosystem";
import { useEffect, useMemo, useState } from "react";
import { bridge } from "../bridge";
import { fuzzyFilter } from "../fuzzy";
import { Badge, OverrideBadge, PageShell, PathLink, ScopeBar, Toggle } from "./PageShell";
import { useEcoScope } from "./scope";

const COMPAT: Record<Compat, { label: string; tone: "ok" | "warn" | "danger" }> = {
  // Labels hedge on purpose: this is a source-code scan for TUI-only APIs, not a runtime check.
  compatible: { label: "Likely compatible", tone: "ok" },
  partial: { label: "Partial", tone: "warn" },
  unsupported: { label: "Likely TUI-only", tone: "danger" },
};

/**
 * Pi extensions as Pi resolves them from settings.json packages and the extensions directories.
 * Switches write the same +/- patterns as `pi config`. Compatibility is a static scan for
 * terminal-only UI APIs; PID does not adapt them.
 */
export function ExtensionsPage({ folder }: { folder?: string }) {
  const [list, setList] = useState<ExtensionView[]>([]);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<string>();
  const [error, setError] = useState<string>();
  const sc = useEcoScope(folder);

  const load = () => void bridge.eco.extensions(sc.cwd).then(setList);
  useEffect(load, [sc.cwd]);

  const write = (e: ExtensionView, state: "load" | "unload" | "inherit") => {
    setError(undefined);
    bridge.eco
      .setResource({
        kind: "extensions",
        paths: e.entries,
        scope: state === "inherit" ? "project" : sc.scope,
        cwd: sc.cwd,
        state,
      })
      .then(load, (err: unknown) => setError(String(err instanceof Error ? err.message : err)));
  };

  const filtered = useMemo(
    () => fuzzyFilter(list, q, (e) => `${e.name} ${e.source} ${e.description ?? ""}`),
    [list, q],
  );
  const counts = useMemo(() => {
    const c = { compatible: 0, partial: 0, unsupported: 0, off: 0 };
    for (const e of list) {
      c[e.compat]++;
      if (!e.enabled) c.off++;
    }
    return c;
  }, [list]);

  return (
    <PageShell
      title="Extensions"
      note={
        <>
          {list.length} extensions · {counts.compatible} likely compatible · {counts.partial} partial ·{" "}
          {counts.unsupported} likely TUI-only{counts.off > 0 ? ` · ${counts.off} off` : ""}. Labels come from
          scanning each extension's source for TUI-only APIs, not from running it. Switches write the same
          settings as <span className="font-mono">pi config</span>; new sessions pick them up, running ones
          after <span className="font-mono">/reload</span>.
        </>
      }
      toolbar={
        <ScopeBar
          scope={sc.scope}
          projectDir={sc.projectDir}
          explicitProject={sc.explicitProject}
          onScope={sc.setScope}
          onProjectDir={sc.setProjectDir}
          projectFile=".pi/settings.json"
        />
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
      {error && <div className="mb-3 text-xs text-danger">{error}</div>}
      <div className="flex flex-col gap-2">
        {filtered.map((e) => {
          const c = COMPAT[e.compat];
          const key = e.baseDir + e.name;
          const isOpen = open === key;
          const projectOnly = e.scope === "project" && sc.scope === "global";
          const needsDir = sc.scope === "project" && !sc.cwd;
          return (
            <article
              key={key}
              className={`rounded-lg border border-line bg-paper-2 ${e.enabled ? "" : "opacity-60"}`}
            >
              <div className="w-full px-3 py-2 flex items-center gap-2">
                <Toggle
                  value={e.enabled}
                  disabled={projectOnly || needsDir}
                  title={
                    projectOnly
                      ? "A project extension: switch to Project scope to change it"
                      : needsDir
                        ? "Choose a project directory first"
                        : e.enabled
                          ? "Turn off"
                          : "Turn on"
                  }
                  onChange={(v) => write(e, v ? "load" : "unload")}
                />
                <button
                  type="button"
                  onClick={() => setOpen(isOpen ? undefined : key)}
                  className="flex-1 min-w-0 text-left flex items-center gap-2"
                >
                  <span className="font-medium text-ink truncate">{e.name}</span>
                  {e.version && <span className="text-xs text-ink-3">v{e.version}</span>}
                  <Badge tone="muted">{e.scope}</Badge>
                  <span className="flex-1" />
                  {sc.scope === "project" && <OverrideBadge state={e.projectState} />}
                  <Badge tone={c.tone}>{c.label}</Badge>
                  <span className="text-ink-3 text-xs">{isOpen ? "▾" : "▸"}</span>
                </button>
                {sc.scope === "project" && e.projectState && e.projectState !== "inherit" && (
                  <button
                    type="button"
                    onClick={() => write(e, "inherit")}
                    title="Remove the project override and follow the global setting"
                    className="h-6 px-1.5 rounded-md text-xs text-ink-3 hover:bg-paper-3 hover:text-ink"
                  >
                    inherit
                  </button>
                )}
              </div>
              {isOpen && (
                <div className="px-3 pb-3 text-xs flex flex-col gap-1.5 border-t border-line pt-2">
                  {e.description && <p className="text-ink-2">{e.description}</p>}
                  <div className="text-ink-3">
                    source <span className="font-mono text-ink-2">{e.source}</span>
                  </div>
                  {e.baseDir && <PathLink path={e.baseDir} />}
                  <div className="text-ink-3">
                    {e.entries.length} entr{e.entries.length === 1 ? "y" : "ies"} · {e.files.length} source
                    file
                    {e.files.length === 1 ? "" : "s"}
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
