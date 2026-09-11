import type { RepoInfo } from "@shared/git";
import type { SessionSummary } from "@shared/sessions";
import { type MouseEvent, useMemo, useState } from "react";
import { fuzzyScore } from "../fuzzy";
import { useSettings } from "../settings";
import {
  type Proc,
  procForSession,
  procStatus,
  type SessionStatus,
  type Workspace,
} from "../state/workspace";
import { ContextMenu, type MenuItem } from "./ContextMenu";
import { Logo } from "./Logo";
import type { Page } from "./NavRail";

const base = (p: string) => p.split("/").filter(Boolean).pop() ?? p;
const ago = (iso: string) => {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return "now";
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
};
const SHOW = 6;

export interface SessionActions {
  openFolder: (dir: string) => void;
  newSession: (dir: string) => void;
  openSession: (s: SessionSummary) => void;
  fork: (s: SessionSummary) => void;
  reference: (s: SessionSummary) => void;
  rename: (s: SessionSummary) => void;
  exportHtml: (s: SessionSummary) => void;
  closeProcess: (s: SessionSummary) => void;
  reveal: (path: string) => void;
  newWorktree: (dir: string) => void;
  removeWorktree: (dir: string, path: string) => void;
  forgetFolder: (dir: string) => void;
}

/**
 * Folder → Sessions tree. Folders are real directories (recent ones plus sibling worktrees
 * of any git repository among them). Session status comes from the live pi process.
 */
export function SessionTree({
  folders,
  sessionsByFolder,
  repos,
  ws,
  activeFolder,
  filter,
  filterRef,
  onFilter,
  actions,
  page,
  onPage,
}: {
  page: Page;
  onPage: (p: Page) => void;
  folders: string[];
  sessionsByFolder: Record<string, SessionSummary[]>;
  repos: Record<string, RepoInfo | null>;
  ws: Workspace;
  activeFolder?: string;
  filter: string;
  filterRef: React.RefObject<HTMLInputElement | null>;
  onFilter: (q: string) => void;
  actions: SessionActions;
}) {
  const { settings } = useSettings();
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [more, setMore] = useState<Record<string, boolean>>({});
  const [menu, setMenu] = useState<{ x: number; y: number; items: (MenuItem | "sep")[]; header?: string }>();

  // Worktrees of known repositories appear as folders too, right after their repository.
  const orderedFolders = useMemo(() => {
    const out: string[] = [];
    const seen = new Set<string>();
    for (const f of folders) {
      if (seen.has(f)) continue;
      out.push(f);
      seen.add(f);
      const repo = repos[f];
      if (!repo) continue;
      for (const w of repo.worktrees) {
        if (!seen.has(w.path)) {
          out.push(w.path);
          seen.add(w.path);
        }
      }
    }
    return out;
  }, [folders, repos]);

  const activeProc = ws.activeKey ? ws.procs[ws.activeKey] : undefined;
  const activePath = activeProc?.piState.sessionFile;

  const isOpen = (f: string) => expanded[f] ?? f === activeFolder;
  const toggle = (f: string) => setExpanded((e) => ({ ...e, [f]: !isOpen(f) }));

  const visible = (f: string) => {
    const list = sessionsByFolder[f] ?? [];
    if (!filter) return list;
    const q = filter.toLowerCase();
    return list
      .map((s) => ({ s, score: Math.max(fuzzyScore(q, s.name ?? ""), fuzzyScore(q, s.firstMessage)) }))
      .filter((x) => x.score >= 0)
      .sort((a, b) => b.score - a.score)
      .map((x) => x.s);
  };

  const openMenu = (e: MouseEvent, items: (MenuItem | "sep")[], header?: string) => {
    e.preventDefault();
    e.stopPropagation();
    setMenu({ x: e.clientX, y: e.clientY, items, header });
  };

  const sessionMenu = (s: SessionSummary, live?: Proc): (MenuItem | "sep")[] => [
    { label: "Fork from…", hint: "⌘⇧F", onClick: () => actions.fork(s) },
    { label: "Reference in composer", hint: "$", onClick: () => actions.reference(s) },
    { label: "Rename", onClick: () => actions.rename(s) },
    { label: "Export HTML", onClick: () => actions.exportHtml(s) },
    "sep",
    { label: "Reveal session file", onClick: () => actions.reveal(s.path) },
    { label: "Close process", danger: true, disabled: !live, onClick: () => actions.closeProcess(s) },
  ];

  const folderMenu = (f: string): (MenuItem | "sep")[] => {
    const repo = repos[f];
    const wt = repo?.worktrees.find((w) => w.path === f);
    return [
      { label: "New session", hint: "⌘N", onClick: () => actions.newSession(f) },
      { label: "Reveal in Finder", onClick: () => actions.reveal(f) },
      "sep",
      { label: "New worktree…", disabled: !repo, onClick: () => actions.newWorktree(f) },
      {
        label: "Remove this worktree",
        danger: true,
        disabled: !wt || wt.isMain,
        onClick: () => actions.removeWorktree(f, f),
      },
      "sep",
      { label: "Forget folder", onClick: () => actions.forgetFolder(f) },
    ];
  };

  return (
    <aside
      style={{ width: settings.appearance.sidebarWidth }}
      className="shrink-0 bg-paper-2 flex flex-col min-h-0"
    >
      {/* title row: traffic lights sit at x=16, the mark starts after them */}
      <div className="drag h-[52px] shrink-0 flex items-center pl-[92px] pr-3">
        <button
          type="button"
          onClick={() => onPage("sessions")}
          className="no-drag flex items-center"
          title="Sessions"
        >
          <Logo height={16} />
        </button>
      </div>
      <div className="px-3 pb-2.5">
        <div className="h-[30px] px-2.5 rounded-lg bg-paper-3 flex items-center gap-2 focus-within:ring-1 focus-within:ring-line-2">
          <svg
            width="14"
            height="14"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            className="text-ink-3"
          >
            <title>filter</title>
            <circle cx="7" cy="7" r="4.5" />
            <path d="m10.5 10.5 3 3" />
          </svg>
          <input
            ref={filterRef}
            value={filter}
            onChange={(e) => onFilter(e.target.value)}
            onKeyDown={(e) => e.key === "Escape" && onFilter("")}
            placeholder="Search sessions"
            className="flex-1 bg-transparent outline-none text-[12.5px] text-ink placeholder:text-ink-3"
          />
          <span className="font-mono text-[11px] text-ink-3">⌘K</span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-3 pb-2 flex flex-col gap-px">
        {orderedFolders.map((f) => {
          const repo = repos[f];
          const wt = repo?.worktrees.find((w) => w.path === f);
          const branch = wt?.branch ?? (repo && repo.root === f ? repo.branch : undefined);
          const list = visible(f);
          const total = sessionsByFolder[f]?.length ?? 0;
          const open = isOpen(f) || (filter.length > 0 && list.length > 0);
          const liveHere = Object.values(ws.procs).filter((p) => p.cwd === f);
          const liveStatus = liveHere.map(procStatus);
          const isActive = f === activeFolder;
          const shown = more[f] || filter ? list : list.slice(0, SHOW);
          const hidden = list.length - shown.length;
          // forks nest under their parent when both are in this folder
          const byPath = new Map(list.map((s) => [s.path, s]));
          const roots = settings.sessions.showForkLineage
            ? shown.filter((s) => !(s.parentSessionPath && byPath.has(s.parentSessionPath)))
            : shown;
          const childrenOf = (s: SessionSummary) =>
            settings.sessions.showForkLineage ? shown.filter((c) => c.parentSessionPath === s.path) : [];

          // sessions that have a live process but no file on disk yet (fresh, nothing persisted)
          const unsaved = liveHere.filter((p) => !p.piState.sessionFile);

          return (
            <div key={f}>
              <section
                aria-label={`Folder ${base(f)}`}
                className={`group h-[30px] rounded-lg flex items-center gap-2 px-2 ${
                  isActive ? "text-ink" : "text-ink-2 hover:bg-paper-3 hover:text-ink"
                }`}
                onContextMenu={(e) => openMenu(e, folderMenu(f), f)}
              >
                <button
                  type="button"
                  onClick={() => toggle(f)}
                  className="shrink-0 text-ink-3"
                  title={open ? "Collapse" : "Expand"}
                >
                  <FolderIcon open={open} />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    actions.openFolder(f);
                    if (!open) toggle(f);
                  }}
                  title={f}
                  className={`flex-1 min-w-0 text-left truncate ${isActive ? "font-medium" : ""}`}
                >
                  {base(f)}
                </button>
                {branch && (
                  <span className="font-mono text-xs text-ink-3 truncate max-w-[40%]">{branch}</span>
                )}
                {!open && liveStatus.includes("running") && <Dot status="running" />}
                {!open && liveStatus.includes("needs-you") && <Dot status="needs-you" />}
                {!open && <span className="text-xs text-ink-3 tabular-nums">{total}</span>}
                {open && (
                  <button
                    type="button"
                    onClick={() => actions.newSession(f)}
                    title="New session"
                    className="shrink-0 text-ink-3 hover:text-ink"
                  >
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 16 16"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.5"
                    >
                      <title>new session</title>
                      <path d="M8 3v10M3 8h10" />
                    </svg>
                  </button>
                )}
                <button
                  type="button"
                  onClick={(e) => openMenu(e, folderMenu(f), f)}
                  className="shrink-0 text-ink-3 hover:text-ink opacity-0 group-hover:opacity-100"
                  title="Folder actions"
                >
                  <Dots />
                </button>
              </section>

              {open && (
                <div className="pl-3.5 flex flex-col gap-px mb-1">
                  {unsaved.map((p) => (
                    <SessionRow
                      key={p.key}
                      title={p.conv.messages.length === 0 ? "New session" : userText(p)}
                      meta="now"
                      status={procStatus(p)}
                      active={p.key === ws.activeKey}
                      onActivate={() => actions.openSession({ ...placeholder(p), path: `proc:${p.key}` })}
                    />
                  ))}
                  {roots.map((s) => (
                    <div key={s.path}>
                      <SessionRow
                        title={s.name || s.firstMessage || "(empty session)"}
                        meta={metaFor(s, procForSession(ws, s.path))}
                        status={
                          procForSession(ws, s.path)
                            ? procStatus(procForSession(ws, s.path) as Proc)
                            : "closed"
                        }
                        active={s.path === activePath}
                        onActivate={() => actions.openSession(s)}
                        onFork={() => actions.fork(s)}
                        onMenu={(e) =>
                          openMenu(e, sessionMenu(s, procForSession(ws, s.path)), s.name || s.firstMessage)
                        }
                      />
                      {childrenOf(s).map((c) => (
                        <SessionRow
                          key={c.path}
                          nested
                          title={c.name || c.firstMessage || "(fork)"}
                          meta={metaFor(c, procForSession(ws, c.path))}
                          status={
                            procForSession(ws, c.path)
                              ? procStatus(procForSession(ws, c.path) as Proc)
                              : "closed"
                          }
                          active={c.path === activePath}
                          onActivate={() => actions.openSession(c)}
                          onFork={() => actions.fork(c)}
                          onMenu={(e) =>
                            openMenu(e, sessionMenu(c, procForSession(ws, c.path)), c.name || c.firstMessage)
                          }
                        />
                      ))}
                    </div>
                  ))}
                  {hidden > 0 && (
                    <button
                      type="button"
                      onClick={() => setMore((m) => ({ ...m, [f]: true }))}
                      className="h-6 px-2 text-left text-xs text-ink-3 hover:text-ink"
                    >
                      Show {hidden} more
                    </button>
                  )}
                  {more[f] && list.length > SHOW && (
                    <button
                      type="button"
                      onClick={() => setMore((m) => ({ ...m, [f]: false }))}
                      className="h-6 px-2 text-left text-xs text-ink-3 hover:text-ink"
                    >
                      Show less
                    </button>
                  )}
                  {list.length === 0 && unsaved.length === 0 && (
                    <div className="h-6 px-2 text-xs text-ink-3 flex items-center">
                      {filter ? "No matches" : "No sessions"}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
        {orderedFolders.length === 0 && (
          <div className="px-3 py-2 text-xs text-ink-3">Open a folder to begin.</div>
        )}
      </div>

      <div className="shrink-0 mx-3 mt-2 pt-2 pb-2 border-t border-line flex flex-col gap-px text-[12.5px]">
        <button
          type="button"
          onClick={() => actions.openFolder("")}
          className="h-7 px-2 rounded-lg flex items-center text-ink-3 hover:text-ink hover:bg-paper-3"
        >
          <span className="flex-1 text-left">Open folder…</span>
        </button>
        {(
          [
            ["skills", "Skills"],
            ["mcp", "MCP"],
            ["extensions", "Extensions"],
            ["settings", "Settings"],
          ] as [Page, string][]
        ).map(([id, label]) => (
          <button
            type="button"
            key={id}
            onClick={() => onPage(id)}
            className={`h-7 px-2 rounded-lg flex items-center hover:bg-paper-3 ${page === id ? "text-ink bg-paper-3" : "text-ink-3 hover:text-ink"}`}
          >
            <span className="flex-1 text-left">{label}</span>
          </button>
        ))}
      </div>

      {menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          items={menu.items}
          header={menu.header}
          onClose={() => setMenu(undefined)}
        />
      )}
    </aside>
  );
}

function metaFor(s: SessionSummary, live?: Proc): string {
  if (!live) return ago(s.modified);
  const st = procStatus(live);
  if (st === "running") return "now";
  if (st === "needs-you") return "needs you";
  if (st === "exited") return "exited";
  return "idle";
}

function userText(p: Proc): string {
  const m = p.conv.messages.find((x) => x.role === "user");
  if (!m || m.role !== "user") return "New session";
  return typeof m.content === "string"
    ? m.content
    : m.content.map((c) => (c.type === "text" ? c.text : "")).join(" ");
}

function placeholder(p: Proc): SessionSummary {
  return {
    path: "",
    id: p.piState.sessionId,
    cwd: p.cwd,
    created: new Date().toISOString(),
    modified: new Date().toISOString(),
    messageCount: p.conv.messages.length,
    firstMessage: userText(p),
  };
}

function SessionRow({
  title,
  meta,
  status,
  active,
  nested,
  onActivate,
  onFork,
  onMenu,
}: {
  title: string;
  meta: string;
  status: SessionStatus;
  active: boolean;
  nested?: boolean;
  onActivate: () => void;
  onFork?: () => void;
  onMenu?: (e: MouseEvent) => void;
}) {
  const metaTone = status === "needs-you" ? "text-warn" : "text-ink-3";
  return (
    <section
      aria-label={title}
      className={`group h-[30px] rounded-lg flex items-center gap-2 pr-1 ${nested ? "pl-5" : "pl-2"} ${
        active ? "bg-paper-3 text-ink" : "text-ink-2 hover:bg-paper-3 hover:text-ink"
      }`}
      onContextMenu={onMenu}
    >
      {nested && <span className="text-line-2 -ml-1">└</span>}
      <Dot status={status} />
      <button
        type="button"
        onClick={onActivate}
        title={title}
        className="flex-1 min-w-0 h-full text-left truncate"
      >
        {title}
      </button>
      <span className={`text-xs ${metaTone} group-hover:hidden`}>{meta}</span>
      <span className="hidden group-hover:flex items-center gap-0.5">
        {onFork && (
          <button
            type="button"
            onClick={onFork}
            title="Fork from…"
            className="w-5 h-5 rounded text-ink-3 hover:text-ink flex items-center justify-center"
          >
            <ForkIcon />
          </button>
        )}
        {onMenu && (
          <button
            type="button"
            onClick={(e) => onMenu(e)}
            title="More"
            className="w-5 h-5 rounded text-ink-3 hover:text-ink flex items-center justify-center"
          >
            <Dots />
          </button>
        )}
      </span>
    </section>
  );
}

function Dot({ status }: { status: SessionStatus }) {
  const cls = {
    running: "bg-accent animate-pulse",
    "needs-you": "bg-warn",
    idle: "bg-ok",
    error: "bg-danger",
    exited: "bg-danger/50",
    closed: "border border-line-2",
  }[status];
  return <span title={status} className={`w-1.5 h-1.5 rounded-full shrink-0 ${cls}`} />;
}

function FolderIcon({ open }: { open: boolean }) {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <title>{open ? "open folder" : "folder"}</title>
      <path d="M2 5.5A1.5 1.5 0 0 1 3.5 4H6l1.5 1.5H12.5A1.5 1.5 0 0 1 14 7v4.5A1.5 1.5 0 0 1 12.5 13h-9A1.5 1.5 0 0 1 2 11.5z" />
      {open && <path d="M2 8h12" />}
    </svg>
  );
}

export function ForkIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <title>fork</title>
      <path d="M5 3v4a3 3 0 0 0 3 3h0a3 3 0 0 0 3-3V3M8 10v3" />
    </svg>
  );
}

function Dots() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
      <title>more</title>
      <circle cx="4" cy="8" r="1" />
      <circle cx="8" cy="8" r="1" />
      <circle cx="12" cy="8" r="1" />
    </svg>
  );
}
