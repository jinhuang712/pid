import type { McpServerView, McpToolSummary, McpView } from "@shared/ecosystem";
import { type McpServerStatus, type McpStatusSnapshot, runtimeOnly } from "@shared/mcp-status";
import { useEffect, useState } from "react";
import { bridge } from "../bridge";
import { Badge, PageShell, PathLink, ScopeBar, Toggle, tilde } from "./PageShell";
import { useEcoScope } from "./scope";

/**
 * MCP servers as configured for pi-mcp-adapter, the MCP integration in this Pi install.
 * Switches write the adapter's `disabled` flag: globally in ~/.pi/agent/mcp.json, per project as a
 * disabled-only override in .pi/mcp.json.
 *
 * Two sources of truth are shown side by side and never conflated:
 * - config + the adapter's tool cache (what is *configured*, what was *once* discovered), from disk;
 * - live status (what is *connected right now*), from the adapter running inside the active
 *   session's Pi, relayed by pid-bridge. Absent when no session is open.
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

  /** Adapter commands go through the session that owns the live status, as `/mcp …` would. */
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
              No MCP adapter available. Install pi-mcp-adapter into Pi with{" "}
              <span className="font-mono">pi install npm:pi-mcp-adapter</span>, or run PID from a build that
              bundles it.
            </>
          ) : (
            <>
              {view.servers.length + runtimeRows.length} servers · {toolCount + runtimeToolCount} cached tools
              {runtimeRows.length > 0 ? ` · ${runtimeRows.length} registered at runtime` : ""}
              {offCount > 0 ? ` · ${offCount} off` : ""} · via{" "}
              {view.adapterSource === "user"
                ? "pi-mcp-adapter from your Pi packages"
                : `pi-mcp-adapter ${view.adapterVersion ?? ""} bundled with PID`}
              . Switches write the adapter's <span className="font-mono">disabled</span> flag, like{" "}
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
                ? `live status from ${liveSession ?? "the active session"}: ${live.connectedCount} connected · ${live.totalTools} tools`
                : "live status appears here while a session is open"}
            </div>
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
                      {s.directTools === false && <Badge tone="muted">prompt tools</Badge>}
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
                      {s.cachedTools && s.cachedTools.length > 0 && (
                        <ul className="mt-1 grid gap-1 grid-cols-[repeat(auto-fill,minmax(260px,1fr))]">
                          {s.cachedTools.map((t) => (
                            <li
                              key={t.name}
                              className="rounded-md bg-paper-3 px-2 py-1 min-w-0"
                              title={t.description}
                            >
                              <div className="font-mono text-ink truncate">{t.name}</div>
                              {t.description && (
                                <div className="text-ink-3 line-clamp-2">{t.description}</div>
                              )}
                            </li>
                          ))}
                        </ul>
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

/**
 * A server an extension registered at runtime: live status, its definition as the adapter reports
 * it, and the tools the adapter once discovered. Read-only by nature — there is no config entry to
 * flip, only Pi's own `/mcp reconnect` to fall back on.
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
            {startedFrom || "the adapter reported no definition for this server"}
          </div>
          <div className="text-ink-3">registered by an extension at session start · no mcp.json</div>
          {tools && tools.length > 0 && (
            <ul className="mt-1 grid gap-1 grid-cols-[repeat(auto-fill,minmax(260px,1fr))]">
              {tools.map((t) => (
                <li key={t.name} className="rounded-md bg-paper-3 px-2 py-1 min-w-0" title={t.description}>
                  <div className="font-mono text-ink truncate">{t.name}</div>
                  {t.description && <div className="text-ink-3 line-clamp-2">{t.description}</div>}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </article>
  );
}

/** The adapter's runtime status for one server, worded as a state, not a health promise. */
function LiveBadge({ s }: { s: McpServerStatus }) {
  switch (s.status) {
    case "connected":
      return <Badge tone="ok">connected · {s.toolCount} tools</Badge>;
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
