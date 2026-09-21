import type { SkillView } from "@shared/ecosystem";
import { useEffect, useMemo, useRef, useState } from "react";
import { Badge, Toggle } from "@/ui";
import { bridge } from "../bridge";
import { fuzzyFilter } from "../fuzzy";
import { OverrideBadge, PageShell, PathLink, ScopeBar } from "./PageShell";
import { useEcoScope } from "./scope";

/**
 * Pi's skills, as Pi's own loader discovers them, with the on/off state `pi config` would show.
 * Toggles write Pi's settings; PID adds search and a way to open the file.
 */
export function SkillsPage({
  folder,
  onUse,
  onClose,
}: {
  folder?: string;
  onUse: (name: string) => void;
  onClose?: () => void;
}) {
  const [skills, setSkills] = useState<SkillView[]>([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const sc = useEcoScope(folder);

  const seq = useRef(0);

  const load = () => {
    const n = ++seq.current;
    setLoading(true);
    void bridge.eco.skills(sc.cwd).then(
      (s) => {
        // A folder switch starts a second read; the first one landing late must not win, and its
        // failure is not this folder's failure.
        if (n !== seq.current) return;
        setSkills(s);
        setLoading(false);
      },
      (e: unknown) => {
        if (n !== seq.current) return;
        setError(String(e instanceof Error ? e.message : e));
        setLoading(false);
      },
    );
  };
  useEffect(load, [sc.cwd]);

  const toggle = (s: SkillView, on: boolean) => {
    setError(undefined);
    bridge.eco
      .setResource({
        kind: "skills",
        paths: [s.path],
        scope: sc.scope,
        cwd: sc.cwd,
        state: on ? "load" : "unload",
      })
      .then(load, (e: unknown) => setError(String(e instanceof Error ? e.message : e)));
  };
  const clearOverride = (s: SkillView) => {
    setError(undefined);
    bridge.eco
      .setResource({ kind: "skills", paths: [s.path], scope: "project", cwd: sc.cwd, state: "inherit" })
      .then(load, (e: unknown) => setError(String(e instanceof Error ? e.message : e)));
  };

  const filtered = useMemo(
    () => fuzzyFilter(skills, q, (s) => `${s.name} ${s.description} ${s.source}`),
    [skills, q],
  );
  const bySource = useMemo(() => {
    const g = new Map<string, SkillView[]>();
    for (const s of filtered) g.set(s.source, [...(g.get(s.source) ?? []), s]);
    return [...g.entries()];
  }, [filtered]);
  const disabledCount = skills.filter((s) => !s.enabled).length;

  return (
    <PageShell
      title="Skills"
      note={
        <>
          {skills.length} skills from ~/.pi/agent/skills{sc.cwd ? ", the project's .pi/skills," : ""} and
          installed packages{disabledCount > 0 ? ` · ${disabledCount} off` : ""}. Switches write the same
          settings as <span className="font-mono">pi config</span>; new sessions pick them up, running ones
          after <span className="font-mono">/reload</span>. Use one by typing{" "}
          <span className="font-mono">/name</span> in the composer.
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
      {loading && <div className="text-xs text-ink-3">Loading…</div>}
      {!loading && filtered.length === 0 && <div className="text-xs text-ink-3">No skills match.</div>}
      {bySource.map(([source, list]) => (
        <section key={source} className="mb-6">
          <h2 className="text-xs text-ink-3 mb-2 flex items-center gap-2">
            <Badge tone={source === "user" ? "accent" : source === "project" ? "ok" : "muted"}>
              {source}
            </Badge>
            <span>{list.length}</span>
          </h2>
          <div className="grid gap-2 grid-cols-[repeat(auto-fill,minmax(320px,1fr))]">
            {list.map((s) => {
              const projectOnly = s.source === "project" && sc.scope === "global";
              const needsDir = sc.scope === "project" && !sc.cwd;
              return (
                <article
                  key={s.path}
                  className={`rounded-lg border border-line bg-paper-2 p-3 flex flex-col gap-1 min-w-0 ${s.enabled ? "" : "opacity-60"}`}
                >
                  <div className="flex items-center gap-2">
                    <Toggle
                      value={s.enabled}
                      disabled={projectOnly || needsDir}
                      title={
                        projectOnly
                          ? "A project skill: switch to Project scope to change it"
                          : needsDir
                            ? "Choose a project directory first"
                            : s.enabled
                              ? "Turn off"
                              : "Turn on"
                      }
                      onChange={(v) => toggle(s, v)}
                    />
                    <span className="font-medium text-ink truncate">/{s.name}</span>
                    <span className="flex-1" />
                    {sc.scope === "project" && <OverrideBadge state={s.projectState} />}
                    {sc.scope === "project" && s.projectState && s.projectState !== "inherit" && (
                      <button
                        type="button"
                        onClick={() => clearOverride(s)}
                        title="Remove the project override and follow the global setting"
                        className="h-6 px-1.5 rounded-md text-xs text-ink-3 hover:bg-paper-3 hover:text-ink"
                      >
                        inherit
                      </button>
                    )}
                    {s.disableModelInvocation && <Badge tone="warn">manual only</Badge>}
                    <button
                      type="button"
                      onClick={() => onUse(s.name)}
                      disabled={!folder}
                      title={folder ? "Insert into composer" : "Open a folder first"}
                      className="h-6 px-2 rounded-md text-xs text-ink-2 hover:bg-paper-3 hover:text-ink disabled:opacity-40"
                    >
                      Use
                    </button>
                  </div>
                  <p className="text-xs text-ink-2 line-clamp-3">{s.description || "No description"}</p>
                  <PathLink path={s.path} />
                </article>
              );
            })}
          </div>
        </section>
      ))}
    </PageShell>
  );
}
