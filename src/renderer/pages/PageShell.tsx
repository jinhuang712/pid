import type { ReactNode } from "react";

/** Common frame for the ecosystem pages: title, one-line note, search box, content. */
export function PageShell({
  title,
  note,
  search,
  onSearch,
  actions,
  children,
}: {
  title: string;
  note?: ReactNode;
  search?: string;
  onSearch?: (q: string) => void;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex-1 min-w-0 flex flex-col">
      <div className="px-6 pt-5 pb-3 border-b border-line">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-semibold text-ink">{title}</h1>
          <span className="flex-1" />
          {actions}
        </div>
        {note && <div className="mt-1 text-xs text-ink-3">{note}</div>}
        {onSearch && (
          <input
            value={search ?? ""}
            onChange={(e) => onSearch(e.target.value)}
            placeholder={`Search ${title.toLowerCase()}…`}
            className="mt-3 w-full max-w-md h-8 px-3 rounded-md bg-paper-2 border border-line outline-none focus:border-accent text-sm text-ink placeholder:text-ink-3"
          />
        )}
      </div>
      <div className="flex-1 overflow-y-auto px-6 py-4">{children}</div>
    </div>
  );
}

export function Badge({
  tone,
  children,
}: {
  tone: "ok" | "warn" | "danger" | "muted" | "accent";
  children: ReactNode;
}) {
  const cls = {
    ok: "bg-ok-soft text-ok",
    warn: "bg-warn-soft text-warn",
    danger: "bg-danger-soft text-danger",
    muted: "bg-paper-3 text-ink-2",
    accent: "bg-accent-soft text-accent",
  }[tone];
  return <span className={`inline-flex items-center h-5 px-1.5 rounded text-xs ${cls}`}>{children}</span>;
}

export function PathLink({ path, label }: { path: string; label?: string }) {
  return (
    <button
      type="button"
      onClick={() => void window.bridge.shell.reveal(path)}
      title={`Reveal ${path}`}
      className="font-mono text-xs text-ink-3 hover:text-accent truncate max-w-full text-left"
    >
      {label ?? path.replace(/^\/Users\/[^/]+/, "~")}
    </button>
  );
}
