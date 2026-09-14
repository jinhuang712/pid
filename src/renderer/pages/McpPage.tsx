import type { McpServerView, McpToolSummary, McpView } from "@shared/ecosystem";
import {
  type McpOAuthOutcome,
  type McpServerStatus,
  type McpStatusSnapshot,
  runtimeOnly,
} from "@shared/mcp-status";
import { useEffect, useState } from "react";
import { bridge } from "../bridge";
import { Badge, PageShell, PathLink, ScopeBar, Toggle, tilde } from "./PageShell";
import { useEcoScope } from "./scope";

/**
 * MCP servers as configured for the MCP extension in this Pi install: pid-mcp, bundled with PID,
 * or a pi-mcp-adapter the user installed. Switches write the `disabled` flag both read: globally in
 * ~/.pi/agent/mcp.json, per project as a disabled-only override in .pi/mcp.json.
 *
 * Three states are shown side by side and never conflated:
 * - config + the tool cache (what is *configured*, what was *once* discovered), from disk;
 * - live status (what is *connected right now*), from the extension running inside the active
 *   session's Pi, relayed by pid-bridge. Absent when no session is open;
 * - active tools (what the *model can see right now*): pid-mcp registers every MCP tool as a Pi
 *   tool but keeps it out of the model's view until `mcp_search` activates it or the config pins it.
 *
 * Servers a Pi extension registered at runtime are the third case: Pi is running them, no config
 * file mentions them, so there is nothing to switch and nothing on disk to read. They come from the
 * live snapshot alone and render in a read-only section of their own.
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
  const liveSession = source
    ? `${source.cwd.split("/").filter(Boolean).pop() ?? source.cwd} session`
    : undefined;

  const load = () => void bridge.eco.mcp(sc.cwd).then(setView);
  useEffect(load, [sc.cwd]);

  const toggle = (s: McpServerView, on: boolean) => {
    setError(undefined);
    bridge.eco
      .setMcp({ name: s.name, scope: sc.scope, cwd: sc.cwd, disabled: !on })
      .then(load, (e: unknown) => setError(String(e instanceof Error ? e.message : e)));
  };

  /** MCP commands go through the session that owns the live status, as `/mcp …` would. */
  const act = (command: string) => {
    if (!source || !runCommand) return;
    setError(undefined);
    runCommand(source.key, command).catch((e: unknown) =>
      setError(String(e instanceof Error ? e.message : e)),
    );
  };
  const actBtn = "h-6 px-1.5 rounded-md text-xs text-ink-3 hover:bg-paper-3 hover:text-ink";

  const toolCount = view?.servers.reduce((n, s) => n + (s.cachedTools?.length ?? 0), 0) ?? 0;
  const offCount = view?.servers.filter((s) => s.disabled).length ?? 0;
  const globalPath = view?.configPaths[0];
  const liveByName = new Map((live?.servers ?? []).map((s) => [s.name, s]));
  const runtimeRows = runtimeOnly(
    live?.servers,
    (view?.servers ?? []).map((s) => s.name),
  );
  const runtimeToolCount = runtimeRows.reduce((n, s) => n + (view?.cacheTools?.[s.name]?.length ?? 0), 0);

  return (
    <PageShell
      title="MCP"
      note={
        view ? (
          view.adapterSource === "none" ? (
            <>
              No MCP extension available. This PID build does not bundle pid-mcp; install it into Pi with{" "}
              <span className="font-mono">pi install npm:pid-mcp</span>, or run PID from a build that bundles
              it.
            </>
          ) : (
            <>
              {view.servers.length + runtimeRows.length} servers · {toolCount + runtimeToolCount} cached tools
              {runtimeRows.length > 0 ? ` · ${runtimeRows.length} registered at runtime` : ""}
              {offCount > 0 ? ` · ${offCount} off` : ""}
              {live?.activeToolCount !== undefined ? ` · ${live.activeToolCount} visible to the model` : ""} ·
              via{" "}
              {view.adapterSource === "user"
                ? `${view.adapterName ?? "the MCP extension"} from your Pi packages`
                : `pid-mcp ${view.adapterVersion ?? ""} bundled with PID`}
              . Switches write the <span className="font-mono">disabled</span> flag, like{" "}
              <span className="font-mono">/mcp disable</span>; running sessions apply it after{" "}
              <span className="font-mono">/reload</span>.
            </>
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
      {view && (
        <>
          <div className="mb-4 text-xs text-ink-3 flex flex-col gap-0.5">
            {view.configPaths.map((p) => (
              <div key={p}>
                config <PathLink path={p} />
              </div>
            ))}
            {view.cachePath && (
              <div>
                tool cache <PathLink path={view.cachePath} />
              </div>
            )}
            {view.configPaths.length === 0 && <div>No mcp.json found in ~/.pi/agent or this folder.</div>}
            <div>
              {live
                ? `live status from ${liveSession ?? "the active session"}: ${live.connectedCount} connected · ${live.totalTools} tools${live.activeToolCount !== undefined ? ` · ${live.activeToolCount} active` : ""}${live.source ? ` · ${live.source}${live.pidMcpVersion ? ` ${live.pidMcpVersion}` : ""}` : ""}`
                : "live status appears here while a session is open"}
            </div>
            {source?.oauth && (
              <div className={source.oauth.status === "failed" ? "text-danger" : "text-ok"}>
                OAuth {source.oauth.server}: {source.oauth.status}
                {source.oauth.message ? ` — ${source.oauth.message}` : ""}
              </div>
            )}
          </div>
          <div className="flex flex-col gap-2">
            {view.servers.map((s) => {
              const key = s.name;
              const isOpen = open === key;
              const inGlobal = s.globalDisabled !== undefined || s.configPath === globalPath;
              const projectOnly = sc.scope === "global" && !inGlobal;
              const needsDir = sc.scope === "project" && !sc.cwd;
              const now = liveByName.get(s.name);
              return (
                <article
                  key={key}
                  className={`rounded-lg border border-line bg-paper-2 ${s.disabled ? "opacity-60" : ""}`}
                >
                  <div className="w-full px-3 py-2 flex items-center gap-2">
                    <Toggle
                      value={!s.disabled}
                      disabled={projectOnly || needsDir}
                      title={
                        projectOnly
                          ? `Defined in ${tilde(s.configPath)}: switch to Project scope to change it`
                          : needsDir
                            ? "Choose a project directory first"
                            : s.disabled
                              ? "Turn on"
                              : "Turn off"
                      }
                      onChange={(v) => toggle(s, v)}
                    />
                    <button
                      type="button"
                      onClick={() => setOpen(isOpen ? undefined : key)}
                      className="flex-1 min-w-0 text-left flex items-center gap-2"
                    >
                      <span className="font-medium text-ink">{s.name}</span>
                      <Badge tone="muted">{s.transport}</Badge>
                      {s.auth && <Badge tone="accent">{s.auth}</Badge>}
                      <ExposureBadge directTools={s.directTools} />
                      {now?.lastError && (
                        <span title={now.lastError}>
                          <Badge tone="danger">error</Badge>
                        </span>
                      )}
                      <span className="flex-1" />
                      {sc.scope === "project" && s.projectDisabled !== undefined && (
                        <Badge tone={s.projectDisabled ? "warn" : "ok"}>
                          project {s.projectDisabled ? "off" : "on"}
                        </Badge>
                      )}
                      {now ? <LiveBadge s={now} /> : live ? <Badge tone="muted">not in session</Badge> : null}
                      {s.cachedTools ? (
                        <Badge tone="muted">{s.cachedTools.length} tools cached</Badge>
                      ) : (
                        <Badge tone="muted">no tool cache</Badge>
                      )}
                      <span className="text-ink-3 text-xs">{isOpen ? "▾" : "▸"}</span>
                    </button>
                    {source && runCommand && !s.disabled && (
                      <>
                        {(now?.status === "needs-auth" || s.auth || s.transport === "http") && (
                          <button
                            type="button"
                            className={actBtn}
                            title={`/mcp-auth ${s.name} in the ${liveSession}; the browser flow shows up as a dialog here`}
                            onClick={() => act(`/mcp-auth ${s.name}`)}
                          >
                            Auth
                          </button>
                        )}
                        <button
                          type="button"
                          className={actBtn}
                          title={`/mcp reconnect ${s.name} in the ${liveSession}`}
                          onClick={() => act(`/mcp reconnect ${s.name}`)}
                        >
                          Reconnect
                        </button>
                        {(s.auth || s.transport === "http") && (
                          <button
                            type="button"
                            className={actBtn}
                            title={`/mcp logout ${s.name}: clear stored OAuth credentials and disconnect`}
                            onClick={() => act(`/mcp logout ${s.name}`)}
                          >
                            Logout
                          </button>
                        )}
                      </>
                    )}
                  </div>
                  {isOpen && (
                    <div className="px-3 pb-3 text-xs flex flex-col gap-1.5 border-t border-line pt-2">
                      <div className="font-mono text-ink-2 break-all">
                        {s.transport === "http" ? s.url : [s.command, ...(s.args ?? [])].join(" ")}
                      </div>
                      <div className="text-ink-3 flex flex-wrap gap-x-2">
                        from
                        {s.definedIn.map((p) => (
                          <PathLink key={p} path={p} />
                        ))}
                      </div>
                      {now?.lastError && (
                        <div className="text-danger break-all">last error: {now.lastError}</div>
                      )}
                      {now?.activeToolNames !== undefined && (
                        <div className="text-ink-3">
                          {now.activeToolNames.length} of {now.toolCount} tools visible to the model
                          {now.pinnedToolCount ? ` · ${now.pinnedToolCount} pinned by config` : ""}
                          {" · the rest wait for "}
                          <span className="font-mono">mcp_search</span>
                        </div>
                      )}
                      {s.cachedTools && s.cachedTools.length > 0 && (
                        <ToolGrid tools={s.cachedTools} activeNames={now?.activeToolNames} />
                      )}
                    </div>
                  )}
                </article>
              );
            })}
          </div>
          {runtimeRows.length > 0 && (
            <section className="mt-6">
              <div className="mb-2 text-xs text-ink-3">
                A Pi extension registered these in the active session. Nothing on disk defines them, so there
                is no switch to flip and no config path to show — they are listed from the live snapshot
                alone.
              </div>
              <div className="flex flex-col gap-2">
                {runtimeRows.map((s) => (
                  <RuntimeServerCard
                    key={s.name}
                    s={s}
                    tools={view.cacheTools?.[s.name]}
                    open={open === s.name}
                    onOpen={() => setOpen(open === s.name ? undefined : s.name)}
                    onReconnect={source && runCommand ? () => act(`/mcp reconnect ${s.name}`) : undefined}
                    session={liveSession}
                  />
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </PageShell>
  );
}

/** How a server's tools reach the model, from its `directTools` setting. */
function ExposureBadge({ directTools }: { directTools?: boolean | string[] | "search" }) {
  if (directTools === true) return <Badge tone="accent">always visible</Badge>;
  if (Array.isArray(directTools)) return <Badge tone="accent">{directTools.length} pinned</Badge>;
  return <Badge tone="muted">on search</Badge>;
}

/** Cached tools, with the ones the model can currently see marked. */
function ToolGrid({ tools, activeNames }: { tools: McpToolSummary[]; activeNames?: string[] }) {
  const isActive = (name: string) =>
    activeNames?.some((n) => n === name || n.endsWith(`_${name.replace(/\./g, "_")}`)) ?? false;
  return (
    <ul className="mt-1 grid gap-1 grid-cols-[repeat(auto-fill,minmax(260px,1fr))]">
      {tools.map((t) => {
        const active = isActive(t.name);
        return (
          <li
            key={t.name}
            className={`rounded-md px-2 py-1 min-w-0 ${active ? "bg-paper-3 ring-1 ring-accent/40" : "bg-paper-3"}`}
            title={t.description}
          >
            <div className="font-mono text-ink truncate flex items-center gap-1">
              {activeNames !== undefined && (
                <span
                  className={active ? "text-accent" : "text-ink-3"}
                  title={active ? "active" : "inactive"}
                >
                  {active ? "●" : "○"}
                </span>
              )}
              {t.name}
            </div>
            {t.description && <div className="text-ink-3 line-clamp-2">{t.description}</div>}
          </li>
        );
      })}
    </ul>
  );
}

/**
 * A server an extension registered at runtime: live status, its definition as the MCP extension
 * reports it, and the tools once discovered. Read-only by nature — there is no config entry to
 * flip, only `/mcp reconnect` to fall back on.
 */
function RuntimeServerCard({
  s,
  tools,
  open,
  onOpen,
  onReconnect,
  session,
}: {
  s: McpServerStatus;
  tools?: McpToolSummary[];
  open: boolean;
  onOpen: () => void;
  onReconnect?: () => void;
  session?: string;
}) {
  const startedFrom =
    s.runtime?.url ?? [s.runtime?.command, ...(s.runtime?.args ?? [])].filter(Boolean).join(" ");
  return (
    <article className="rounded-lg border border-line bg-paper-2">
      <div className="w-full px-3 py-2 flex items-center gap-2">
        <button type="button" onClick={onOpen} className="flex-1 min-w-0 text-left flex items-center gap-2">
          <span className="font-medium text-ink">{s.name}</span>
          <Badge tone="muted">runtime</Badge>
          <span className="flex-1" />
          <LiveBadge s={s} />
          {tools ? (
            <Badge tone="muted">{tools.length} tools cached</Badge>
          ) : (
            <Badge tone="muted">no tool cache</Badge>
          )}
          <span className="text-ink-3 text-xs">{open ? "▾" : "▸"}</span>
        </button>
        {onReconnect && (
          <button
            type="button"
            className="h-6 px-1.5 rounded-md text-xs text-ink-3 hover:bg-paper-3 hover:text-ink"
            title={`/mcp reconnect ${s.name} in the ${session ?? "session"}`}
            onClick={onReconnect}
          >
            Reconnect
          </button>
        )}
      </div>
      {open && (
        <div className="px-3 pb-3 text-xs flex flex-col gap-1.5 border-t border-line pt-2">
          <div className="font-mono text-ink-2 break-all">
            {startedFrom || "the MCP extension reported no definition for this server"}
          </div>
          <div className="text-ink-3">registered by an extension at session start · no mcp.json</div>
          {s.lastError && <div className="text-danger break-all">last error: {s.lastError}</div>}
          {s.activeToolNames !== undefined && (
            <div className="text-ink-3">
              {s.activeToolNames.length} of {s.toolCount} tools visible to the model · the rest wait for{" "}
              <span className="font-mono">mcp_search</span>
            </div>
          )}
          {tools && tools.length > 0 && <ToolGrid tools={tools} activeNames={s.activeToolNames} />}
        </div>
      )}
    </article>
  );
}

/** The MCP extension's runtime status for one server, worded as a state, not a health promise. */
function LiveBadge({ s }: { s: McpServerStatus }) {
  switch (s.status) {
    case "connected":
      return (
        <Badge tone="ok">
          connected ·{" "}
          {s.activeToolCount !== undefined
            ? `${s.activeToolCount}/${s.toolCount} active`
            : `${s.toolCount} tools`}
        </Badge>
      );
    case "needs-auth":
      return <Badge tone="warn">needs auth</Badge>;
    case "failed":
      return (
        <Badge tone="danger">
          failed{s.failedAgoSeconds !== undefined ? ` ${s.failedAgoSeconds}s ago` : ""}
        </Badge>
      );
    case "disabled":
      return <Badge tone="muted">disabled</Badge>;
    case "cached":
      return <Badge tone="muted">cached · not connected</Badge>;
    case "not-connected":
      return <Badge tone="muted">not connected</Badge>;
    default:
      return <Badge tone="muted">{s.status}</Badge>;
  }
}
