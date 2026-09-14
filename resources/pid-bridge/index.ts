/**
 * PID bridge: a tiny Pi extension that PID loads into its own `pi --mode rpc` children with `-e`.
 *
 * It exists to forward machine-readable state that other extensions publish on Pi's event bus
 * (today: pi-mcp-adapter's status snapshots and OAuth outcomes) to PID over the RPC stream. Pi's
 * RPC mode already turns `ctx.ui.setWidget` into an `extension_ui_request` line, so a widget whose
 * key starts with `pid:` is the channel: PID parses those and never renders them as widgets.
 *
 * Nothing here talks to MCP servers or reads config. It relays what the adapter emits, plus one
 * synchronous follow-up question per server: was this one registered at runtime by an extension, or
 * read from an mcp.json? The MCP page needs the answer to show servers that have no config entry —
 * they are exactly the ones no page could list before.
 *
 * Contract: pi-mcp-adapter ≥ 2.33, events "pi-mcp-adapter/status/v1" and
 * "pi-mcp-adapter:runtime-snapshot:v1" (both versioned by the adapter's author).
 */
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

export const MCP_STATUS_EVENT = "pi-mcp-adapter/status/v1";
export const MCP_RUNTIME_SNAPSHOT_EVENT = "pi-mcp-adapter:runtime-snapshot:v1";
export const MCP_RUNTIME_SNAPSHOT_VERSION = 1;
export const MCP_OAUTH_EVENT = "mcp-oauth-status";
export const WIDGET_MCP_STATUS = "pid:mcp-status";
export const WIDGET_MCP_OAUTH = "pid:mcp-oauth";

/** Where a runtime-registered server is started from. Mirrors McpRuntimeDefinition in shared/mcp-status.ts. */
export interface McpRuntimeDefinition {
  command?: string;
  args?: string[];
  url?: string;
}

interface RuntimeSnapshot {
  name: string;
  definition: McpRuntimeDefinition;
}

interface RuntimeSnapshotRequest {
  version: number;
  name: string;
  result?: { ok: true; snapshot: RuntimeSnapshot } | { ok: false; error: Error };
}

/**
 * Attach `runtime` to every server the adapter answers for.
 *
 * The adapter answers only for runtime registrations — "not registered or has been disposed" is
 * its reply for anything that came out of an mcp.json — so an absent answer is what marks a server
 * as configured. Pure so the relay stays testable without a live adapter.
 */
export function withRuntimeDefinitions(
  snapshot: unknown,
  definition: (name: string) => McpRuntimeDefinition | undefined,
): unknown {
  if (!snapshot || typeof snapshot !== "object") return snapshot;
  const servers = (snapshot as { servers?: unknown }).servers;
  if (!Array.isArray(servers)) return snapshot;
  return {
    ...(snapshot as object),
    servers: servers.map((server) => {
      const name = (server as { name?: unknown } | null)?.name;
      if (typeof name !== "string") return server;
      const runtime = definition(name);
      return runtime ? { ...(server as object), runtime } : server;
    }),
  };
}

export default function pidBridge(pi: ExtensionAPI) {
  let ctx: ExtensionContext | undefined;
  let status: unknown;

  const relay = (key: string, payload: unknown) => {
    // Only meaningful inside PID; in a terminal this would print JSON above the editor.
    if (!ctx || ctx.mode === "tui") return;
    ctx.ui.setWidget(key, payload === undefined ? undefined : [JSON.stringify(payload)]);
  };

  /** Synchronous request/response: the adapter fills `result` before `emit` returns. */
  const runtimeDefinition = (name: string): McpRuntimeDefinition | undefined => {
    const request: RuntimeSnapshotRequest = { version: MCP_RUNTIME_SNAPSHOT_VERSION, name };
    pi.events.emit(MCP_RUNTIME_SNAPSHOT_EVENT, request);
    return request.result?.ok ? request.result.snapshot.definition : undefined;
  };

  pi.events.on(MCP_STATUS_EVENT, (snapshot: unknown) => {
    status = withRuntimeDefinitions(snapshot, runtimeDefinition);
    relay(WIDGET_MCP_STATUS, status);
  });
  pi.events.on(MCP_OAUTH_EVENT, (outcome: unknown) => relay(WIDGET_MCP_OAUTH, outcome));

  pi.on("session_start", (_ev, c) => {
    ctx = c;
    // The adapter may have published before we had a context; replay the latest snapshot.
    if (status !== undefined) relay(WIDGET_MCP_STATUS, status);
  });
  pi.on("session_shutdown", () => {
    ctx = undefined;
    status = undefined;
  });
}
