import type { SessionSummary } from "@shared/sessions";
import { type MouseEvent, useEffect, useState } from "react";
import { ContextMenu, Dot, IconButton, Keys, Logo, type MenuItem, Scroll } from "@/ui";
import { useSettings } from "../settings";
import {
  type Proc,
  procForSession,
  procStatus,
  type SessionStatus,
  type Workspace,
} from "../state/workspace";
import type { Surface } from "../surfaces";
import type { Page } from "./NavRail";

const base = (p: string) => p.split("/").filter(Boolean).pop() ?? p;
/** Pi's generated names (pi-session-<timestamp>_<uuid>) are not titles. */
const titleOf = (s: SessionSummary) =>
  (s.name && !/^pi-session-\d{4}-/.test(s.name) ? s.name : "") || s.firstMessage || "(empty session)";
const ago = (iso: string) => {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return "now";
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
};
const displayName = (f: string, all: string[]) => {
  const b = base(f);
  const dup = all.filter((x) => base(x) === b).length > 1;
  const parent = f.split("/").filter(Boolean).slice(-2, -1)[0];
  return dup && parent ? `${parent}/${b}` : b;
};
const CLOSED_PREVIEW = 0; // closed sessions stay folded; only live ones are rows
const PAGE = 10; // how many more each click reveals

export interface SessionActions {
  openFolder: (dir: string) => void;
  newSession: (dir: string) => void;
  openSession: (s: SessionSummary) => void;
  fork: (s: SessionSummary) => void;
  copyReference: (s: SessionSummary) => void;
  rename: (s: SessionSummary) => void;
  exportHtml: (s: SessionSummary) => void;
  closeProcess: (s: SessionSummary) => void;
  reveal: (path: string) => void;
  forgetFolder: (dir: string) => void;
}

/**
 * Folder → Sessions tree. Folders are real directories (recent ones plus sibling worktrees
 * of any git repository among them). Session status comes from the live pi process.
 */
export function SessionTree({
  folders,
  sessionsByFolder,
  ws,
  activeFolder,
  onSearch,
  actions,
  page,
  pages,
  onPage,
}: {
  page: Page;
  /** Ecosystem pages that exist right now; see src/renderer/surfaces.ts. */
  pages: Surface[];
  onPage: (p: Page) => void;
  folders: string[];
  sessionsByFolder: Record<string, SessionSummary[]>;
  ws: Workspace;
  activeFolder?: string;
  onSearch: () => void;
  actions: SessionActions;
}) {
  const { settings } = useSettings();
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [revealed, setRevealed] = useState<Record<string, number>>({});
  // When a session closes (or opens) the folded set changes; fold closed sessions back so the tree
  // shows live rows only again.
  const liveKey = Object.values(ws.procs)
    .map((p) => p.piState.sessionFile ?? p.key)
    .sort()
    .join("|");
  // biome-ignore lint/correctness/useExhaustiveDependencies: liveKey is the trigger, not a value the effect reads
  useEffect(() => {
    setRevealed({});
  }, [liveKey]);
  const [menu, setMenu] = useState<{ x: number; y: number; items: (MenuItem | "sep")[]; header?: string }>();

  const orderedFolders = folders;

  const activeProc = ws.activeKey ? ws.procs[ws.activeKey] : undefined;
  const activePath = activeProc?.piState.sessionFile;
  const activeCwd = activeProc?.cwd;

  const isOpen = (f: string) => expanded[f] ?? f === activeFolder;
  const toggle = (f: string) => setExpanded((e) => ({ ...e, [f]: !isOpen(f) }));
  // The folder of the session you switched to unfolds so the highlighted row is in view; folding it
  // again afterwards is respected until the next switch.
  // biome-ignore lint/correctness/useExhaustiveDependencies: activeKey is the trigger — switching sessions within one folder must unfold it too
  useEffect(() => {
    if (activeCwd) setExpanded((e) => (e[activeCwd] === true ? e : { ...e, [activeCwd]: true }));
  }, [activeCwd, ws.activeKey]);

  const visible = (f: string) => sessionsByFolder[f] ?? [];

  const openMenu = (e: MouseEvent, items: (MenuItem | "sep")[], header?: string) => {
    e.preventDefault();
    e.stopPropagation();
    setMenu({ x: e.clientX, y: e.clientY, items, header });
  };

  const sessionMenu = (s: SessionSummary, live?: Proc): (MenuItem | "sep")[] => [
    { label: "Fork from…", hint: "⌘⇧F", onClick: () => actions.fork(s) },
    { label: "Copy session reference", hint: "$", onClick: () => actions.copyReference(s) },
    { label: "Rename", onClick: () => actions.rename(s) },
    { label: "Export HTML", onClick: () => actions.exportHtml(s) },
    "sep",
    { label: "Reveal session file", onClick: () => actions.reveal(s.path) },
    { label: "Close process", danger: true, disabled: !live, onClick: () => actions.closeProcess(s) },
  ];

  const folderMenu = (f: string): (MenuItem | "sep")[] => {
    return [
      { label: "New session", hint: "⌘N", onClick: () => actions.newSession(f) },
      { label: "Reveal in Finder", onClick: () => actions.reveal(f) },
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
        <button
          type="button"
          onClick={onSearch}
          className="w-full h-[30px] px-2.5 rounded-lg bg-paper-3 flex items-center gap-2 text-left hover:bg-paper-4"
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            className="text-ink-3"
          >
            <title>search</title>
            <circle cx="7" cy="7" r="4.5" />
            <path d="m10.5 10.5 3 3" />
          </svg>
          <span className="flex-1 text-[12.5px] text-ink-3">Search</span>
          <Keys keys={["⌘", "K"]} />
        </button>
      </div>

      <Scroll className="px-3 pb-2 flex flex-col gap-px">
        {orderedFolders.map((f) => {
          const list = visible(f);
          const open = isOpen(f);
          const liveHere = Object.values(ws.procs).filter((p) => p.cwd === f);
          const liveStatus = liveHere.map(procStatus);
          const isActive = f === activeFolder;
          // Live processes are the rows that always show, whether or not the disk listing has caught
          // up with their file yet (a fresh session is unlisted until the folder reloads at agent_end).
          const byPath = new Map(list.map((s) => [s.path, s]));
          const liveFiles = new Set(liveHere.map((p) => p.piState.sessionFile));
          const live = liveHere.flatMap((p) =>
            p.piState.sessionFile ? (byPath.get(p.piState.sessionFile) ?? []) : [],
          );
          const unlisted = liveHere.filter(
            (p) => !p.piState.sessionFile || !byPath.has(p.piState.sessionFile),
          );
          // closed sessions stay folded except the most recent few
          const closed = list.filter((x) => !liveFiles.has(x.path));
          const limit = CLOSED_PREVIEW + (revealed[f] ?? 0);
          const shown = [...live, ...closed.slice(0, limit)];
          const hidden = closed.length - Math.min(closed.length, limit);
          const total = list.length + unlisted.length;

          return (
            <div key={f}>
              <section
                aria-label={`Folder ${base(f)}`}
                className={`group h-[30px] rounded-lg flex items-center gap-2 pr-1 pl-2 ${
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
                    // The name folds and unfolds like the icon; unfolding also makes the folder current.
                    toggle(f);
                    if (!open) actions.openFolder(f);
                  }}
                  title={f}
                  className={`flex-1 min-w-0 text-left truncate ${isActive ? "font-medium" : ""}`}
                >
                  {displayName(f, orderedFolders)}
                </button>
                {/* Trailing column mirrors SessionRow: resting meta swaps in place for actions on hover,
                    so nothing invisible reserves width and the right edge lines up with the rows below. */}
                {!open && (
                  <span className="flex items-center gap-2 group-hover:hidden">
                    {liveStatus.includes("running") && <StatusDot status="running" />}
                    {liveStatus.includes("needs-you") && <StatusDot status="needs-you" />}
                    <span className="text-xs text-ink-3 tabular-nums">{total}</span>
                  </span>
                )}
                <span className="hidden group-hover:flex items-center gap-0.5">
                  <IconButton
                    size="sm"
                    ground={false}
                    onClick={(e) => openMenu(e, folderMenu(f), f)}
                    title="Folder actions"
                  >
                    <Dots />
                  </IconButton>
                </span>
                {open && (
                  <IconButton
                    size="sm"
                    ground={false}
                    onClick={() => actions.newSession(f)}
                    title="New session"
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
                  </IconButton>
                )}
              </section>

              {open && (
                <div className="pl-3.5 flex flex-col gap-px mb-1">
                  {unlisted.map((p) => (
                    <SessionRow
                      key={p.key}
                      title={p.conv.messages.length === 0 ? "New session" : userText(p)}
                      meta={metaFor(placeholder(p), p)}
                      status={procStatus(p)}
                      active={p.key === ws.activeKey}
                      onActivate={() => actions.openSession({ ...placeholder(p), path: `proc:${p.key}` })}
                    />
                  ))}
                  {shown.map((s) => (
                    <div key={s.path}>
                      <SessionRow
                        title={titleOf(s)}
                        meta={metaFor(s, procForSession(ws, s.path))}
                        status={
                          procForSession(ws, s.path)
                            ? procStatus(procForSession(ws, s.path) as Proc)
                            : "closed"
                        }
                        active={s.path === activePath}
                        onActivate={() => actions.openSession(s)}
                        onFork={() => actions.fork(s)}
                        onMenu={(e) => openMenu(e, sessionMenu(s, procForSession(ws, s.path)), titleOf(s))}
                      />
                    </div>
                  ))}
                  {hidden > 0 && (
                    <button
                      type="button"
                      onClick={() => setRevealed((m) => ({ ...m, [f]: (m[f] ?? 0) + PAGE }))}
                      className="h-6 px-2 text-left text-xs text-ink-3 hover:text-ink"
                    >
                      {hidden} closed session{hidden === 1 ? "" : "s"} · show {Math.min(PAGE, hidden)}
                    </button>
                  )}
                  {(revealed[f] ?? 0) > 0 && closed.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setRevealed((m) => ({ ...m, [f]: 0 }))}
                      className="h-6 px-2 text-left text-xs text-ink-3 hover:text-ink"
                    >
                      Fold closed sessions
                    </button>
                  )}
                  {shown.length === 0 && unlisted.length === 0 && hidden === 0 && (
                    <div className="h-6 px-2 text-xs text-ink-3 flex items-center">No sessions</div>
                  )}
                </div>
              )}
            </div>
          );
        })}
        {orderedFolders.length === 0 && (
          <div className="px-3 py-2 text-xs text-ink-3">Open a folder to begin.</div>
        )}
      </Scroll>

      <div className="shrink-0 mx-3 mt-2 pt-2 pb-2 border-t border-line flex flex-col text-[12.5px]">
        {/* Pi's ecosystem: pages. A page nothing fills is not a page. */}
        <div className="flex flex-col gap-px">
          {pages.map(({ id, label }) => (
            <button
              type="button"
              key={id}
              onClick={() => onPage(id)}
              className={`h-7 px-2 rounded-lg flex items-center hover:bg-paper-3 ${
                page === id ? "text-ink bg-paper-3" : "text-ink-3 hover:text-ink"
              }`}
            >
              <span className="flex-1 text-left">{label}</span>
            </button>
          ))}
        </div>
        {/* PID itself: actions, with their shortcuts */}
        <div className="flex flex-col gap-px mt-3">
          <button
            type="button"
            onClick={() => actions.openFolder("")}
            className="h-7 px-2 rounded-lg flex items-center text-ink-3 hover:text-ink hover:bg-paper-3"
          >
            <span className="flex-1 text-left">Open folder…</span>
            <Keys keys={["⌘", "O"]} />
          </button>
          <button
            type="button"
            onClick={() => onPage("settings")}
            className={`h-7 px-2 rounded-lg flex items-center hover:bg-paper-3 ${
              page === "settings" ? "text-ink bg-paper-3" : "text-ink-3 hover:text-ink"
            }`}
          >
            <span className="flex-1 text-left">Settings</span>
            <Keys keys={["⌘", ","]} />
          </button>
        </div>
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
  onActivate,
  onFork,
  onMenu,
}: {
  title: string;
  meta: string;
  status: SessionStatus;
  active: boolean;
  onActivate: () => void;
  onFork?: () => void;
  onMenu?: (e: MouseEvent) => void;
}) {
  const metaTone = status === "needs-you" ? "text-warn" : "text-ink-3";
  return (
    <section
      aria-label={title}
      className={`group h-[30px] rounded-lg flex items-center gap-2 pr-1 pl-2 ${
        active ? "bg-paper-3 text-ink" : "text-ink-2 hover:bg-paper-3 hover:text-ink"
      }`}
      onContextMenu={onMenu}
    >
      <StatusDot status={status} />
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
          <IconButton size="sm" ground={false} onClick={onFork} title="Fork from…">
            <ForkIcon />
          </IconButton>
        )}
        {onMenu && (
          <IconButton size="sm" ground={false} onClick={(e) => onMenu(e)} title="More">
            <Dots />
          </IconButton>
        )}
      </span>
    </section>
  );
}

/**
 * A session has more states than the window has tones, so this keeps its own map and takes only the
 * shape from the primitive — every dot in the window is then the same size.
 */
function StatusDot({ status }: { status: SessionStatus }) {
  const cls = {
    running: "bg-accent animate-pulse",
    "needs-you": "bg-warn",
    idle: "bg-ok",
    error: "bg-danger",
    exited: "bg-danger/50",
    closed: "border border-line-2",
  }[status];
  return <Dot title={status} className={cls} />;
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
