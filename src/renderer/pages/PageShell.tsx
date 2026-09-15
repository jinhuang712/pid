import type { ProjectState, ToggleScope } from "@shared/ecosystem";
import type { ReactNode } from "react";
import { Badge, Scroll, Segmented } from "@/ui";

/** Common frame for the ecosystem pages: title, one-line note, search box, content. */
export function PageShell({
  title,
  note,
  search,
  onSearch,
  actions,
  onClose,
  toolbar,
  children,
}: {
  title: string;
  note?: ReactNode;
  search?: string;
  onSearch?: (q: string) => void;
  actions?: ReactNode;
  /** Circular close button at the right of the header. Escape already does the same. */
  onClose?: () => void;
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
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              title="Close (esc)"
              aria-label="Close"
              className="w-7 h-7 shrink-0 rounded-full border border-line bg-paper-2 text-ink-3 hover:text-ink hover:border-ink-3 transition-colors flex items-center justify-center"
            >
              <svg
                width="10"
                height="10"
                viewBox="0 0 10 10"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              >
                <title>Close</title>
                <path d="M1.5 1.5l7 7M8.5 1.5l-7 7" />
              </svg>
            </button>
          )}
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
      <Scroll className="px-6 py-4">{children}</Scroll>
    </div>
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
      <Segmented
        label="Where this writes"
        value={scope}
        onChange={onScope}
        options={["global", "project"] as const}
        labels={{ global: "Global", project: "Project" }}
      />
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
