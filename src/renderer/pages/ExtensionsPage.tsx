import type { ExtensionView } from "@shared/ecosystem";
import { type PidSupport, pidSupport, type UiSupport } from "@shared/extension-ui";
import { useEffect, useMemo, useRef, useState } from "react";
import { Badge, Toggle } from "@/ui";
import { bridge } from "../bridge";
import { fuzzyFilter } from "../fuzzy";
import { OverrideBadge, PageShell, PathLink, ScopeBar } from "./PageShell";
import { useEcoScope } from "./scope";

/**
 * Pi extensions as Pi resolves them, and how much of each one this host can run.
 *
 * A Pi extension's behaviour — its tools, commands and hooks — runs the same in both hosts. What
 * differs is its interface: the terminal serves every `ctx.ui` member, and PID serves the ones whose
 * payload is data rather than a terminal. Each card says which, per member, from the same table
 * `session-worker.ts` implements.
 */

const SUPPORT: Record<PidSupport, { label: string; tone: "ok" | "warn" | "danger"; note: string }> = {
  full: { label: "Full", tone: "ok", note: "Everything it asks the interface for, PID does." },
  reduced: {
    label: "Reduced",
    tone: "ok",
    note: "PID runs it, and some interface calls have no effect here.",
  },
  guarded: {
    label: "Terminal parts, stood down",
    tone: "warn",
    note: "It needs a terminal for part of itself and checks ctx.mode first, so it skips that part here and the rest still runs.",
  },
  terminal: {
    label: "Terminal parts, attempted",
    tone: "danger",
    note: "It needs a terminal for part of itself and does not check ctx.mode, so those calls happen here and do nothing.",
  },
};

const CELL: Record<UiSupport, { pid: string; tone: string; why: string }> = {
  served: { pid: "✓", tone: "text-ok", why: "PID does the real thing" },
  inert: { pid: "—", tone: "text-ink-3", why: "PID accepts the call and nothing happens" },
  terminal: { pid: "✗", tone: "text-danger", why: "needs a terminal; PID has nothing to pass" },
};

/** Every `ctx.ui` member the extension reaches for, worst support first so the gaps read first. */
function members(e: ExtensionView): { name: string; support: UiSupport }[] {
  const order: UiSupport[] = ["terminal", "inert", "served"];
  return [
    ...e.ui.terminal.map((name) => ({ name, support: "terminal" as const })),
    ...e.ui.inert.map((name) => ({ name, support: "inert" as const })),
    ...e.ui.served.map((name) => ({ name, support: "served" as const })),
  ].sort((a, b) => order.indexOf(a.support) - order.indexOf(b.support) || a.name.localeCompare(b.name));
}

export function ExtensionsPage({ folder, onClose }: { folder?: string; onClose?: () => void }) {
  const [list, setList] = useState<ExtensionView[]>([]);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<string>();
  const [error, setError] = useState<string>();
  const sc = useEcoScope(folder);

  const seq = useRef(0);

  const load = () => {
    const n = ++seq.current;
    void bridge.eco.extensions(sc.cwd).then(
      (list) => {
        // A folder switch starts a second read; the first one landing late must not win.
        if (n === seq.current) setList(list);
      },
      (e: unknown) => {
        if (n === seq.current) setError(String(e instanceof Error ? e.message : e));
      },
    );
  };
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
    const c = { headless: 0, reduced: 0, terminal: 0, off: 0 };
    for (const e of list) {
      const s = pidSupport(e.ui);
      if (s === "full") c.headless++;
      else if (s === "reduced") c.reduced++;
      else c.terminal++;
      if (!e.enabled) c.off++;
    }
    return c;
  }, [list]);

  return (
    <PageShell
      title="Extensions"
      note={
        <>
          {list.length} extensions · {counts.headless + counts.reduced} run fully here · {counts.terminal}{" "}
          need a terminal for part of themselves
          {counts.off > 0 ? ` · ${counts.off} off` : ""}. Tools, commands and hooks run the same in both
          hosts; the difference is the interface, read from each extension's source rather than from running
          it. Switches write the same settings as <span className="font-mono">pi config</span>; new sessions
          pick them up, running ones after <span className="font-mono">/reload</span>.
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
      onClose={onClose}
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
          const support = SUPPORT[pidSupport(e.ui)];
          const used = members(e);
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
                  <Badge tone={support.tone} title={support.note}>
                    in PID: {support.label}
                  </Badge>
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
                <div className="px-3 pb-3 text-xs flex flex-col gap-2 border-t border-line pt-2">
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
                  <p className="text-ink-3">{support.note}</p>
                  {used.length === 0 ? (
                    <p className="text-ink-3">
                      It asks the interface for nothing, so both hosts run all of it.
                    </p>
                  ) : (
                    <table className="w-full text-left">
                      <thead className="text-ink-3">
                        <tr>
                          <th className="font-normal pb-1">interface call</th>
                          <th className="font-normal pb-1 w-16">Pi TUI</th>
                          <th className="font-normal pb-1 w-16">PID</th>
                          <th className="font-normal pb-1">in PID</th>
                        </tr>
                      </thead>
                      <tbody className="font-mono">
                        {used.map((m) => {
                          const cell = CELL[m.support];
                          return (
                            <tr key={m.name} className="border-t border-line/50">
                              <td className="py-0.5 text-ink-2">{m.name}</td>
                              {/* The terminal is the reference host: it serves every member. */}
                              <td className="py-0.5 text-ok">✓</td>
                              <td className={`py-0.5 ${cell.tone}`}>{cell.pid}</td>
                              <td className="py-0.5 font-sans text-ink-3">{cell.why}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}
                  {e.ui.terminal.length > 0 && !e.ui.guarded && (
                    <p className="text-warn">
                      Nothing in the source compares <span className="font-mono">ctx.mode</span> to{" "}
                      <span className="font-mono">"tui"</span>, so those calls happen here and do nothing. A{" "}
                      <span className="font-mono">ctx.hasUI</span> check would not help: PID has a UI, so it
                      is true here too.
                    </p>
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
