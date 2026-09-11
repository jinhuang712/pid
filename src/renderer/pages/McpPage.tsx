import type { McpView } from "@shared/ecosystem";
import { useEffect, useState } from "react";
import { bridge } from "../bridge";
import { Badge, PageShell, PathLink } from "./PageShell";

/**
 * MCP servers as configured for pi-mcp-adapter, the MCP integration in this Pi install.
 * Tools listed here come from the adapter's cache; they reach the agent as ordinary Pi tools.
 */
export function McpPage({ folder }: { folder?: string }) {
  const [view, setView] = useState<McpView>();
  const [open, setOpen] = useState<string>();

  const load = () => void bridge.eco.mcp(folder).then(setView);
  // biome-ignore lint/correctness/useExhaustiveDependencies: reload when the folder changes
  useEffect(load, [folder]);

  const toolCount = view?.servers.reduce((n, s) => n + (s.cachedTools?.length ?? 0), 0) ?? 0;

  return (
    <PageShell
      title="MCP"
      note={
        view ? (
          view.adapterInstalled ? (
            <>
              {view.servers.length} servers · {toolCount} cached tools · via pi-mcp-adapter. MCP tools flow
              through Pi's normal tool path and render as ordinary tool cards.
            </>
          ) : (
            <>
              pi-mcp-adapter is not in Pi's packages. Install it with{" "}
              <span className="font-mono">pi install npm:pi-mcp-adapter</span>; PID does not add a second MCP
              runtime.
            </>
          )
        ) : (
          "Loading…"
        )
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
          </div>
          <div className="flex flex-col gap-2">
            {view.servers.map((s) => {
              const key = `${s.configPath}:${s.name}`;
              const isOpen = open === key;
              return (
                <article key={key} className="rounded-lg border border-line bg-paper-2">
                  <button
                    type="button"
                    onClick={() => setOpen(isOpen ? undefined : key)}
                    className="w-full text-left px-3 py-2 flex items-center gap-2"
                  >
                    <span className="font-medium text-ink">{s.name}</span>
                    <Badge tone="muted">{s.transport}</Badge>
                    {s.auth && <Badge tone="accent">{s.auth}</Badge>}
                    {s.directTools === false && <Badge tone="muted">prompt tools</Badge>}
                    <span className="flex-1" />
                    {s.cachedTools ? (
                      <Badge tone="ok">{s.cachedTools.length} tools cached</Badge>
                    ) : (
                      <Badge tone="warn">never connected</Badge>
                    )}
                    <span className="text-ink-3 text-xs">{isOpen ? "▾" : "▸"}</span>
                  </button>
                  {isOpen && (
                    <div className="px-3 pb-3 text-xs flex flex-col gap-1.5 border-t border-line pt-2">
                      <div className="font-mono text-ink-2 break-all">
                        {s.transport === "http" ? s.url : [s.command, ...(s.args ?? [])].join(" ")}
                      </div>
                      <div className="text-ink-3">
                        from <PathLink path={s.configPath} />
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
        </>
      )}
    </PageShell>
  );
}
