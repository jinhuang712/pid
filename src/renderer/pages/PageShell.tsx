import type { ProjectState, ToggleScope } from "@shared/ecosystem";
import type { ReactNode } from "react";

/** Common frame for the ecosystem pages: title, one-line note, search box, content. */
export function PageShell({
  title,
  note,
  search,
  onSearch,
  actions,
  toolbar,
  children,
}: {
  title: string;
  note?: ReactNode;
  search?: string;
  onSearch?: (q: string) => void;
  actions?: ReactNode;
  /** A row under the note, for scope selection and similar controls. */
  toolbar?: ReactNode;
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
        {toolbar && <div className="mt-3">{toolbar}</div>}
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
  title,
  children,
}: {
  tone: "ok" | "warn" | "danger" | "muted" | "accent";
  title?: string;
  children: ReactNode;
}) {
  const cls = {
    ok: "bg-ok-soft text-ok",
    warn: "bg-warn-soft text-warn",
    danger: "bg-danger-soft text-danger",
    muted: "bg-paper-3 text-ink-2",
    accent: "bg-accent-soft text-accent",
  }[tone];
  return (
    <span title={title} className={`inline-flex items-center h-5 px-1.5 rounded text-xs ${cls}`}>
      {children}
    </span>
  );
}

export function PathLink({ path, label }: { path: string; label?: string }) {
  return (
    <button
      type="button"
      onClick={() => void window.bridge.shell.reveal(path)}
      title={`Reveal ${path}`}
      className="font-mono text-xs text-ink-3 hover:text-accent truncate max-w-full text-left"
    >
      {label ?? tilde(path)}
    </button>
  );
}

export const tilde = (path: string) => path.replace(/^\/Users\/[^/]+/, "~");

export function Toggle({
  value,
  onChange,
  disabled,
  title,
}: {
  value: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  title?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={value}
      disabled={disabled}
      title={title}
      onClick={(e) => {
        e.stopPropagation();
        onChange(!value);
      }}
      className={`relative shrink-0 w-9 h-5 rounded-full transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${value ? "bg-accent" : "bg-paper-4"}`}
    >
      <span
        className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${value ? "left-4.5" : "left-0.5"}`}
      />
    </button>
  );
}

/**
 * Global / Project switch for the ecosystem pages, with the project directory shown and
 * changeable. Global writes Pi's ~/.pi/agent settings; Project writes <dir>/.pi overrides.
 */
export function ScopeBar({
  scope,
  projectDir,
  explicitProject,
  onScope,
  onProjectDir,
  globalFile = "~/.pi/agent/settings.json",
  projectFile = ".pi/",
}: {
  scope: ToggleScope;
  projectDir?: string;
  explicitProject: boolean;
  /** What the global switch writes, shown as a hint. */
  globalFile?: string;
  /** What the project switch writes, relative to the project directory. */
  projectFile?: string;
  onScope: (s: ToggleScope) => void;
  onProjectDir: (dir?: string) => void;
}) {
  const pick = () => void window.bridge.pickFolder().then((d) => d && onProjectDir(d));
  return (
    <div className="flex items-center gap-3 text-xs min-w-0">
      <div className="inline-flex rounded-md border border-line bg-paper-2 p-0.5">
        {(["global", "project"] as const).map((o) => (
          <button
            type="button"
            key={o}
            onClick={() => onScope(o)}
            className={`h-6 px-2.5 rounded ${o === scope ? "bg-paper-4 text-ink" : "text-ink-2 hover:text-ink"}`}
          >
            {o === "global" ? "Global" : "Project"}
          </button>
        ))}
      </div>
      <span className="text-ink-3 shrink-0">
        {scope === "global" ? `writes ${globalFile}` : `writes ${projectFile} in`}
      </span>
      {scope === "project" && (
        <>
          {projectDir ? (
            <PathLink path={projectDir} />
          ) : (
            <span className="text-warn">no project directory — choose one</span>
          )}
          <button
            type="button"
            onClick={pick}
            className="h-6 px-2 rounded-md text-ink-2 hover:bg-paper-3 hover:text-ink shrink-0"
          >
            Choose…
          </button>
          {explicitProject && (
            <button
              type="button"
              onClick={() => onProjectDir(undefined)}
              title="Follow the active folder again"
              className="h-6 px-2 rounded-md text-ink-3 hover:bg-paper-3 hover:text-ink shrink-0"
            >
              Use active folder
            </button>
          )}
        </>
      )}
    </div>
  );
}

/** Badge explaining a project-layer override state; nothing for "inherit". */
export function OverrideBadge({ state }: { state?: ProjectState }) {
  if (!state || state === "inherit") return null;
  return <Badge tone={state === "load" ? "ok" : "warn"}>project {state}</Badge>;
}
