import type { SessionSummary } from "@shared/sessions";

function label(s: SessionSummary) {
  return s.name || s.firstMessage || s.id.slice(0, 8);
}

/** Parent / sibling / child forks, derived from the parentSession header of Pi session files. */
export function Lineage({
  current,
  sessions,
  onOpen,
}: {
  current: SessionSummary | undefined;
  sessions: SessionSummary[];
  onOpen: (s: SessionSummary) => void;
}) {
  if (!current) return null;
  const parent = current.parentSessionPath
    ? sessions.find((s) => s.path === current.parentSessionPath)
    : undefined;
  const children = sessions.filter((s) => s.parentSessionPath === current.path);
  const siblings = current.parentSessionPath
    ? sessions.filter((s) => s.parentSessionPath === current.parentSessionPath && s.path !== current.path)
    : [];
  if (!parent && children.length === 0 && siblings.length === 0) return null;
  const chip = (s: SessionSummary, kind: string) => (
    <button
      type="button"
      key={s.path}
      onClick={() => onOpen(s)}
      title={label(s)}
      className="h-6 px-2 rounded-md bg-paper-2 border border-line text-xs text-ink-2 hover:text-ink hover:bg-paper-3 flex items-center gap-1 max-w-56"
    >
      <span className="text-ink-3">{kind}</span>
      <span className="truncate">{label(s)}</span>
    </button>
  );
  return (
    <div className="shrink-0 px-4 py-2 border-b border-line flex items-center gap-2 overflow-x-auto">
      {parent && chip(parent, "↑ parent")}
      {siblings.map((s) => chip(s, "↔ sibling"))}
      {children.map((s) => chip(s, "↓ fork"))}
    </div>
  );
}
