import type { SkillView } from "@shared/ecosystem";
import { useEffect, useMemo, useState } from "react";
import { bridge } from "../bridge";
import { fuzzyFilter } from "../fuzzy";
import { Badge, PageShell, PathLink } from "./PageShell";

/** Pi's skills, as Pi's own loader discovers them. PID adds search and a way to open the file. */
export function SkillsPage({ folder, onUse }: { folder?: string; onUse: (name: string) => void }) {
  const [skills, setSkills] = useState<SkillView[]>([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    void bridge.eco.skills(folder).then((s) => {
      setSkills(s);
      setLoading(false);
    });
  };
  useEffect(load, [folder]);

  const filtered = useMemo(
    () => fuzzyFilter(skills, q, (s) => `${s.name} ${s.description} ${s.source}`),
    [skills, q],
  );
  const bySource = useMemo(() => {
    const g = new Map<string, SkillView[]>();
    for (const s of filtered) g.set(s.source, [...(g.get(s.source) ?? []), s]);
    return [...g.entries()];
  }, [filtered]);

  return (
    <PageShell
      title="Skills"
      note={
        <>
          {skills.length} skills from ~/.pi/agent/skills{folder ? ", this folder's .pi/skills," : ""} and
          installed packages. Use one by typing <span className="font-mono">/name</span> in the composer.
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
            {list.map((s) => (
              <article
                key={s.path}
                className="rounded-lg border border-line bg-paper-2 p-3 flex flex-col gap-1 min-w-0"
              >
                <div className="flex items-center gap-2">
                  <span className="font-medium text-ink truncate">/{s.name}</span>
                  <span className="flex-1" />
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
            ))}
          </div>
        </section>
      ))}
    </PageShell>
  );
}
