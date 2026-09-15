import type { McpServerView, McpToolSummary, McpView } from "@shared/ecosystem";
import {
  type McpOAuthOutcome,
  type McpServerStatus,
  type McpStatusSnapshot,
  runtimeOnly,
} from "@shared/mcp-status";
import { type ReactNode, useEffect, useState } from "react";
import { bridge } from "../bridge";
import { Badge, PageShell, PathLink, ScopeBar, Toggle, tilde } from "./PageShell";
import { useEcoScope } from "./scope";

/**
 * Two questions, in this order:
 *
 * 1. **Activated** — which MCP tool calls sit in the model's context right now, across servers.
 *    Each can be removed; a whole server's or everything at once. This is the list that costs
 *    tokens and decides what the model can reach without `mcp_search`.
 * 2. **MCP Servers** — every server the MCP extension knows, configured or registered by an
 *    extension at runtime, in one list. A row says whether it is connected, ready, needs a sign-in
 *    or failed, and how many of its tools are activated. Opening it lists every tool with an
 *    Activate / Remove action and an Activate-all.
 *
 * Data comes from three places and is merged per server: config + tool cache on disk (names,
 * descriptions, switches), the live snapshot the extension publishes into the active session
 * (status, active tool names), and OAuth outcomes. Servers without a config entry (runtime
 * registrations) have no switch; everything else works the same for them.
 *
 * Activation changes run as `/mcp activate|deactivate` in the session that owns the live status.
 */
/** A running session that has reported MCP status. */
export interface McpLiveSource {
  key: string;
  cwd: string;
  active: boolean;
  mcp: McpStatusSnapshot;
  /** Last OAuth outcome the session reported, if any. */
  oauth?: McpOAuthOutcome;
}

/** One row of the servers list: config (if any) merged with live status (if any). */
interface ServerRow {
  name: string;
  config?: McpServerView;
  live?: McpServerStatus;
  tools: McpToolSummary[];
}

export function McpPage({
  folder,
  sources = [],
  runCommand,
}: {
  folder?: string;
  sources?: McpLiveSource[];
  /** Run a slash command in a session; Pi executes it without a model turn. */
  runCommand?: (sessionKey: string, command: string) => Promise<unknown>;
}) {
  const [view, setView] = useState<McpView>();
  const [open, setOpen] = useState<string>();
  const [showAll, setShowAll] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string>();
  const sc = useEcoScope(folder);
  // Live status belongs to a process, and MCP config is per folder: prefer a session in the
  // folder being looked at, then the active session, so the numbers match the list below.
  const source =
    sources.find((s) => s.cwd === sc.cwd && s.active) ??
    sources.find((s) => s.cwd === sc.cwd) ??
    sources.find((s) => s.active) ??
    sources[0];
  const live = source?.mcp;
  const liveSession = source ? (source.cwd.split("/").filter(Boolean).pop() ?? source.cwd) : undefined;

  const load = () => void bridge.eco.mcp(sc.cwd).then(setView);
  useEffect(load, [sc.cwd]);

  const toggle = (s: McpServerView, on: boolean) => {
    setError(undefined);
    bridge.eco
      .setMcp({ name: s.name, scope: sc.scope, cwd: sc.cwd, disabled: !on })
      .then(load, (e: unknown) => setError(String(e instanceof Error ? e.message : e)));
  };

  /** MCP commands go through the session that owns the live status, as `/mcp …` would. */
  const act =
    source && runCommand
      ? (command: string) => {
          setError(undefined);
          runCommand(source.key, command).catch((e: unknown) =>
            setError(String(e instanceof Error ? e.message : e)),
          );
        }
      : undefined;

  const liveByName = new Map((live?.servers ?? []).map((s) => [s.name, s]));
  const runtimeRows = runtimeOnly(
    live?.servers,
    (view?.servers ?? []).map((s) => s.name),
  );
  const rows: ServerRow[] = [
    ...(view?.servers ?? []).map((c) => ({
      name: c.name,
      config: c,
      live: liveByName.get(c.name),
      tools: c.cachedTools ?? view?.cacheTools?.[c.name] ?? [],
    })),
    ...runtimeRows.map((l) => ({ name: l.name, live: l, tools: view?.cacheTools?.[l.name] ?? [] })),
  ];
  const activatedGroups = rows
    .map((r) => ({
      row: r,
      tools: (r.live?.activeToolNames ?? []).map((pi) => describe(pi, r.tools)),
    }))
    .filter((g) => g.tools.length > 0);
  const activatedCount = activatedGroups.reduce((n, g) => n + g.tools.length, 0);
  const indexedCount = rows.reduce((n, r) => n + (r.live?.toolCount ?? r.tools.length), 0);
  const globalPath = view?.configPaths[0];

  return (
    <PageShell
      title="MCP"
      note={
        view ? (
          live ? (
            <>
              live from session <span className="font-mono">{liveSession}</span>
              {/* The snapshot names its own publisher; PID does not keep a list of them. */}
              {live.source ? ` · ${live.source}${live.pidMcpVersion ? ` ${live.pidMcpVersion}` : ""}` : ""}
            </>
          ) : (
            "The list below is what is configured. Open a session to see what the model can actually call — MCP reaches Pi through an extension, and the running one reports it."
          )
        ) : (
          "Loading…"
        )
      }
      toolbar={
        <ScopeBar
          scope={sc.scope}
          projectDir={sc.projectDir}
          explicitProject={sc.explicitProject}
          onScope={sc.setScope}
          onProjectDir={sc.setProjectDir}
          globalFile="~/.pi/agent/mcp.json"
          projectFile=".pi/mcp.json"
        />
      }
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
      {source?.oauth && (
        <div className={`mb-3 text-xs ${source.oauth.status === "failed" ? "text-danger" : "text-ok"}`}>
          {source.oauth.message}
        </div>
      )}
      {view && (
        <div className="flex flex-col gap-7">
          {/* ---- Activated ---- */}
          <section className="flex flex-col gap-2">
            <SectionHead
              title="Activated"
              note={
                live
                  ? activatedCount === 0
                    ? "nothing in the model's context yet · mcp_search or Activate below puts a tool call here"
                    : `${activatedCount} tool call${activatedCount === 1 ? "" : "s"} in the model's context right now`
                  : "appears while a session is open"
              }
              action={
                act && activatedCount > 0 ? (
                  <ActButton
                    title="/mcp deactivate: take every MCP tool out of the model's view"
                    onClick={() => act("/mcp deactivate")}
                  >
                    Remove all
                  </ActButton>
                ) : undefined
              }
            />
            {activatedGroups.length > 0 && (
              <div className="rounded-lg border border-line bg-paper-2 px-3 pt-1.5 pb-2 flex flex-col">
                {activatedGroups.map((g, i) => {
                  const key = `act:${g.row.name}`;
                  const expanded = showAll[key] || g.tools.length <= 8;
                  const shown = expanded ? g.tools : g.tools.slice(0, 3);
                  return (
                    <div key={g.row.name} className={i > 0 ? "mt-1 pt-2 border-t border-line" : ""}>
                      <div className="flex items-center gap-2 py-1.5 text-xs text-ink-3">
                        <span className="text-ink-2 font-medium">{g.row.name}</span>
                        <span>· {g.tools.length}</span>
                        {g.row.live?.pinnedToolCount ? (
                          <span>· {g.row.live.pinnedToolCount} by config</span>
                        ) : null}
                        <span className="flex-1" />
                        {act && (
                          <ActButton
                            title={`/mcp deactivate ${g.row.name}`}
                            onClick={() => act(`/mcp deactivate ${g.row.name}`)}
                          >
                            Remove {g.tools.length}
                          </ActButton>
                        )}
                      </div>
                      {shown.map((t) => (
                        <ToolLine
                          key={t.piName}
                          tool={t}
                          action={
                            act ? (
                              <ActButton
                                title={`/mcp deactivate ${g.row.name} ${t.piName}`}
                                onClick={() => act(`/mcp deactivate ${g.row.name} ${t.piName}`)}
                              >
                                Remove
                              </ActButton>
                            ) : undefined
                          }
                        />
                      ))}
                      {!expanded && (
                        <button
                          type="button"
                          className="py-1 text-xs text-ink-3 hover:text-ink"
                          onClick={() => setShowAll((m) => ({ ...m, [key]: true }))}
                        >
                          {g.tools.length - shown.length} more · show
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {/* ---- MCP Servers ---- */}
          <section className="flex flex-col gap-2">
            <SectionHead
              title="MCP Servers"
              note={`${rows.length} server${rows.length === 1 ? "" : "s"} · ${indexedCount} tool calls indexed`}
              action={
                view.cachePath ? (
                  <span className="text-xs text-ink-3">
                    cache <PathLink path={view.cachePath} />
                  </span>
                ) : undefined
              }
            />
            {rows.length === 0 && (
              <div className="text-xs text-ink-3">No mcp.json found in ~/.pi/agent or this folder.</div>
            )}
            {rows.map((r) => {
              const isOpen = open === r.name;
              const c = r.config;
              const now = r.live;
              const inGlobal = c ? c.globalDisabled !== undefined || c.configPath === globalPath : false;
              const projectOnly = sc.scope === "global" && c !== undefined && !inGlobal;
              const needsDir = sc.scope === "project" && !sc.cwd;
              const off = c?.disabled ?? false;
              const activeCount = now?.activeToolNames?.length ?? now?.activeToolCount;
              const total = now?.toolCount ?? r.tools.length;
              const oauth = c?.auth !== undefined || now?.status === "needs-auth";
              const frame =
                now?.status === "failed"
                  ? "border-danger/40"
                  : now?.status === "needs-auth"
                    ? "border-warn/40"
                    : "border-line";
              return (
                <article
                  key={r.name}
                  className={`rounded-lg border ${frame} bg-paper-2 ${off ? "opacity-60" : ""}`}
                >
                  <div className="px-3 py-2.5 grid grid-cols-[36px_minmax(0,1fr)_290px_140px_24px] gap-3 items-center">
                    {c ? (
                      <Toggle
                        value={!c.disabled}
                        disabled={projectOnly || needsDir}
                        title={
                          projectOnly
                            ? `Defined in ${tilde(c.configPath)}: switch to Project scope to change it`
                            : needsDir
                              ? "Choose a project directory first"
                              : c.disabled
                                ? "Turn on"
                                : "Turn off"
                        }
                        onChange={(v) => toggle(c, v)}
                      />
                    ) : (
                      <span
                        className="inline-flex items-center justify-center w-9 h-5 rounded text-2xs bg-paper-3 text-ink-3"
                        title="Registered by a Pi extension at session start; no config entry, so no switch"
                      >
                        ext
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => setOpen(isOpen ? undefined : r.name)}
                      className="min-w-0 text-left flex items-center gap-2"
                    >
                      <span className="font-medium text-ink truncate">{r.name}</span>
                      <Badge tone="muted">{c?.transport ?? now?.transport ?? "runtime"}</Badge>
                      {c?.auth && <Badge tone="muted">{c.auth}</Badge>}
                      {sc.scope === "project" && c?.projectDisabled !== undefined && (
                        <Badge tone={c.projectDisabled ? "warn" : "ok"}>
                          project {c.projectDisabled ? "off" : "on"}
                        </Badge>
                      )}
                    </button>
                    <StatusText
                      s={now}
                      off={off}
                      hasSession={live !== undefined}
                      action={
                        act && !off && now?.status === "needs-auth" ? (
                          <ActButton
                            tone="warn"
                            title={`/mcp-auth ${r.name}: the browser flow opens once`}
                            onClick={() => act(`/mcp-auth ${r.name}`)}
                          >
                            Sign in
                          </ActButton>
                        ) : act && !off && now?.status === "failed" ? (
                          <ActButton
                            tone="danger"
                            title={`/mcp reconnect ${r.name}`}
                            onClick={() => act(`/mcp reconnect ${r.name}`)}
                          >
                            Retry
                          </ActButton>
                        ) : undefined
                      }
                    />
                    <span className="text-xs text-ink-2">
                      {activeCount !== undefined
                        ? `${activeCount} of ${total} activated`
                        : `${total} tool${total === 1 ? "" : "s"}`}
                    </span>
                    <button
                      type="button"
                      onClick={() => setOpen(isOpen ? undefined : r.name)}
                      className="justify-self-end text-ink-3 hover:text-ink"
                      title={isOpen ? "Collapse" : "Show tool calls"}
                    >
                      <Chevron open={isOpen} />
                    </button>
                  </div>
                  {isOpen && (
                    <ServerDetail
                      row={r}
                      act={act}
                      oauth={oauth}
                      showAll={showAll[r.name] ?? false}
                      onShowAll={() => setShowAll((m) => ({ ...m, [r.name]: true }))}
                    />
                  )}
                </article>
              );
            })}
            <div className="text-xs text-ink-3">
              The switch writes <span className="font-mono">disabled: true</span> to the config file; running
              sessions apply it after <span className="font-mono">/reload</span>.{" "}
              <span className="font-mono">ext</span> servers come from an extension and have no switch here.
            </div>
          </section>
        </div>
      )}
    </PageShell>
  );
}

/** A tool as shown in a list: its Pi name, the server's own name, and the cached description. */
interface ToolInfo {
  piName: string;
  name: string;
  description?: string;
  active: boolean;
}

/** Match a Pi tool name (`<server>_<tool>`) back to the cache entry for its description. */
function describe(piName: string, cache: McpToolSummary[]): ToolInfo {
  const hit = cache.find((t) => piName === t.name || piName.endsWith(`_${t.name.replace(/\./g, "_")}`));
  return { piName, name: hit?.name ?? piName, description: hit?.description, active: true };
}

/** Every cached tool of a server with its activation state; active names come as Pi names. */
function serverTools(row: ServerRow): ToolInfo[] {
  const active = row.live?.activeToolNames ?? [];
  const isActive = (name: string) =>
    active.some((n) => n === name || n.endsWith(`_${name.replace(/\./g, "_")}`));
  return row.tools.map((t) => {
    const pi = active.find((n) => n === t.name || n.endsWith(`_${t.name.replace(/\./g, "_")}`));
    return { piName: pi ?? t.name, name: t.name, description: t.description, active: isActive(t.name) };
  });
}

function ServerDetail({
  row,
  act,
  oauth,
  showAll,
  onShowAll,
}: {
  row: ServerRow;
  act?: (command: string) => void;
  oauth: boolean;
  showAll: boolean;
  onShowAll: () => void;
}) {
  const c = row.config;
  const now = row.live;
  const tools = serverTools(row);
  const shown = showAll || tools.length <= 12 ? tools : tools.slice(0, 8);
  const startedFrom = c
    ? c.transport === "http"
      ? c.url
      : [c.command, ...(c.args ?? [])].join(" ")
    : (now?.runtime?.url ?? [now?.runtime?.command, ...(now?.runtime?.args ?? [])].filter(Boolean).join(" "));
  const canActivate = act !== undefined && now !== undefined && !(c?.disabled ?? false);
  return (
    <div className="pl-[60px] pr-3 pt-2 pb-3 border-t border-line flex flex-col text-xs">
      <div className="flex items-center gap-2 py-1 text-ink-3 min-w-0">
        <span className="font-mono text-ink-2 truncate" title={startedFrom}>
          {startedFrom || "the MCP extension reported no definition for this server"}
        </span>
        {c && (
          <span className="flex items-center gap-x-2 shrink-0">
            from
            {c.definedIn.map((p) => (
              <PathLink key={p} path={p} />
            ))}
          </span>
        )}
        {!c && <span className="shrink-0">· registered by an extension at session start</span>}
        <span className="flex-1" />
        {act && now && (
          <ActButton title={`/mcp reconnect ${row.name}`} onClick={() => act(`/mcp reconnect ${row.name}`)}>
            Reconnect
          </ActButton>
        )}
        {act && oauth && now?.status !== "needs-auth" && (
          <ActButton
            title={`/mcp logout ${row.name}: forget the stored OAuth token`}
            onClick={() => act(`/mcp logout ${row.name}`)}
          >
            Sign out
          </ActButton>
        )}
        {act && oauth && now?.status === "needs-auth" && (
          <ActButton tone="warn" title={`/mcp-auth ${row.name}`} onClick={() => act(`/mcp-auth ${row.name}`)}>
            Sign in
          </ActButton>
        )}
        {canActivate && tools.length > 0 && (
          <ActButton
            tone="accent"
            title={`/mcp activate ${row.name}: every tool call of this server`}
            onClick={() => act(`/mcp activate ${row.name}`)}
          >
            Activate all
          </ActButton>
        )}
      </div>
      {now?.lastError && <div className="py-1 text-danger break-all">last error: {now.lastError}</div>}
      {now?.status === "needs-auth" && (
        <div className="py-1 text-ink-3">
          {tools.length} tool calls stay indexed; calling one fails until you sign in again.
        </div>
      )}
      {tools.length === 0 && (
        <div className="py-1 text-ink-3">
          No tool list yet{now ? " — Reconnect fetches it" : " — open a session and connect once"}.
        </div>
      )}
      {shown.map((t) => (
        <ToolLine
          key={t.name}
          tool={t}
          tag={t.active ? <Badge tone="accent">activated</Badge> : undefined}
          action={
            canActivate ? (
              t.active ? (
                <ActButton
                  title={`/mcp deactivate ${row.name} ${t.name}`}
                  onClick={() => act(`/mcp deactivate ${row.name} ${t.name}`)}
                >
                  Remove
                </ActButton>
              ) : (
                <ActButton
                  tone="accent"
                  title={`/mcp activate ${row.name} ${t.name}`}
                  onClick={() => act(`/mcp activate ${row.name} ${t.name}`)}
                >
                  Activate
                </ActButton>
              )
            ) : undefined
          }
        />
      ))}
      {shown.length < tools.length && (
        <button type="button" className="py-1 text-left text-ink-3 hover:text-ink" onClick={onShowAll}>
          {tools.length - shown.length} more · show all
        </button>
      )}
    </div>
  );
}

function ToolLine({ tool, tag, action }: { tool: ToolInfo; tag?: ReactNode; action?: ReactNode }) {
  return (
    <div className="grid grid-cols-[190px_minmax(0,1fr)_96px] gap-3 items-center py-[5px] text-xs">
      <span className="font-mono text-ink truncate flex items-center gap-1.5" title={tool.piName}>
        <span className="truncate">{tool.name}</span>
        {tag}
      </span>
      <span className="text-ink-2 truncate" title={tool.description}>
        {tool.description}
      </span>
      <span className="justify-self-end">{action}</span>
    </div>
  );
}

/**
 * One word per state, one dot per word. "Ready" is the normal resting state: the tool list is
 * indexed and the process starts on the first call — the old "cached · not connected" read like a
 * failure and was not one.
 */
function StatusText({
  s,
  off,
  hasSession,
  action,
}: {
  s?: McpServerStatus;
  off: boolean;
  hasSession: boolean;
  action?: ReactNode;
}) {
  const dot = (cls: string) => <span className={`w-2 h-2 rounded-full shrink-0 ${cls}`} />;
  const ring = <span className="w-2 h-2 rounded-full shrink-0 border-[1.5px] border-ink-2 box-border" />;
  let body: ReactNode;
  if (off)
    body = (
      <>
        {dot("bg-paper-4")}
        <span className="text-ink-3">Off</span>
      </>
    );
  else if (!s)
    body = hasSession ? (
      <>
        {ring}
        <span className="text-ink-3">Not in this session</span>
      </>
    ) : (
      <>
        {ring}
        <span className="text-ink-3">No session open</span>
      </>
    );
  else
    switch (s.status) {
      case "connected":
        body = (
          <>
            {dot("bg-ok")}
            <span>
              <span className="text-ok">Connected</span>
            </span>
          </>
        );
        break;
      case "cached":
        body = (
          <>
            {ring}
            <span>
              <span className="text-ink">Ready</span> · starts on first call
            </span>
          </>
        );
        break;
      case "not-connected":
        body = (
          <>
            {ring}
            <span>
              <span className="text-ink">Not indexed yet</span> · connect once
            </span>
          </>
        );
        break;
      case "needs-auth":
        body = (
          <>
            {dot("bg-warn")}
            <span className="whitespace-nowrap">
              <span className="text-warn">Needs sign-in</span>
            </span>
          </>
        );
        break;
      case "failed":
        body = (
          <>
            {dot("bg-danger")}
            <span className="whitespace-nowrap">
              <span className="text-danger">Failed</span>
              {s.failedAgoSeconds !== undefined ? ` · ${ago(s.failedAgoSeconds)}` : ""}
            </span>
          </>
        );
        break;
      case "disabled":
        body = (
          <>
            {dot("bg-paper-4")}
            <span className="text-ink-3">Off</span>
          </>
        );
        break;
      default:
        body = (
          <>
            {ring}
            <span className="text-ink-2">{s.status}</span>
          </>
        );
    }
  return (
    <div className="flex items-center gap-2 text-xs text-ink-2 min-w-0">
      {body}
      {action}
    </div>
  );
}

function ago(seconds: number): string {
  if (seconds < 60) return `${seconds} s ago`;
  if (seconds < 3600) return `${Math.round(seconds / 60)} min ago`;
  return `${Math.round(seconds / 3600)} h ago`;
}

function SectionHead({ title, note, action }: { title: string; note: string; action?: ReactNode }) {
  return (
    <div className="flex items-baseline gap-2.5">
      <span className="text-lg font-semibold text-ink">{title}</span>
      <span className="text-xs text-ink-2">{note}</span>
      <span className="flex-1" />
      {action}
    </div>
  );
}

function ActButton({
  children,
  onClick,
  title,
  tone = "muted",
}: {
  children: ReactNode;
  onClick: () => void;
  title?: string;
  tone?: "muted" | "accent" | "warn" | "danger";
}) {
  const cls = {
    muted: "text-ink-3 hover:bg-paper-3 hover:text-ink",
    accent: "text-accent bg-accent-soft hover:brightness-110",
    warn: "text-warn bg-warn-soft hover:brightness-110",
    danger: "text-danger bg-danger-soft hover:brightness-110",
  }[tone];
  return (
    <button
      type="button"
      title={title}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className={`h-6 px-2 rounded-md text-xs whitespace-nowrap shrink-0 ${cls}`}
    >
      {children}
    </button>
  );
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {open ? <path d="M4 6l4 4 4-4" /> : <path d="M6 4l4 4-4 4" />}
    </svg>
  );
}
