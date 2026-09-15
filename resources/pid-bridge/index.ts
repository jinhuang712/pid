/**
 * PID bridge: a tiny Pi extension PID loads into every session worker it starts.
 *
 * It exists to forward machine-readable state that other extensions publish on Pi's event bus
 * (today: the MCP extension's status snapshots and OAuth outcomes) onto the widget channel, under
 * `<ns>:<kind>/v<n>` keys — the same contract any third-party extension uses to reach PID, so the
 * core has no private channel for its own bridge. See src/shared/extension-widgets.ts.
 *
 * Nothing here talks to MCP servers or reads config. It relays what the MCP extension emits, plus
 * one synchronous follow-up question per server: was this one registered at runtime by an
 * extension, or read from an mcp.json? The MCP page needs the answer to show servers that have no
 * config entry — they are exactly the ones no page could list before.
 *
 * Contract: pid-mcp (bundled with PID) publishes on "pid-mcp/status/v1" and answers
 * "pid-mcp:runtime-snapshot:v1"; it also mirrors both on pi-mcp-adapter's channel names, and the
 * bridge listens on both sets so a user-installed pi-mcp-adapter ≥ 2.33 works unchanged.
 */
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

export const MCP_STATUS_EVENTS = ["pid-mcp/status/v1", "pi-mcp-adapter/status/v1"] as const;
export const MCP_RUNTIME_SNAPSHOT_EVENTS = ["pid-mcp:runtime-snapshot:v1", "pi-mcp-adapter:runtime-snapshot:v1"] as const;
export const MCP_RUNTIME_SNAPSHOT_VERSION = 1;
export const MCP_OAUTH_EVENT = "mcp-oauth-status";
export const WIDGET_MCP_STATUS = "pid:mcp-status/v1";
export const WIDGET_MCP_OAUTH = "pid:mcp-oauth/v1";

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
 * Attach `runtime` to every server the MCP extension answers for.
 *
 * The extension answers only for runtime registrations — "not registered or has been disposed" is
 * its reply for anything that came out of an mcp.json — so an absent answer is what marks a server
 * as configured. Pure so the relay stays testable without a live extension.
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
  // pid-mcp mirrors each snapshot on both channels; relay each distinct payload once.
  let lastPayload: unknown;

  const relay = (key: string, payload: unknown) => {
    // Only meaningful inside PID; in a terminal this would print JSON above the editor.
    if (!ctx || ctx.mode === "tui") return;
    ctx.ui.setWidget(key, payload === undefined ? undefined : [JSON.stringify(payload)]);
  };

  /** Synchronous request/response: the extension fills `result` before `emit` returns. */
  const runtimeDefinition = (name: string): McpRuntimeDefinition | undefined => {
    for (const event of MCP_RUNTIME_SNAPSHOT_EVENTS) {
      const request: RuntimeSnapshotRequest = { version: MCP_RUNTIME_SNAPSHOT_VERSION, name };
      pi.events.emit(event, request);
      if (request.result) return request.result.ok ? request.result.snapshot.definition : undefined;
    }
    return undefined;
  };

  for (const event of MCP_STATUS_EVENTS) {
    pi.events.on(event, (snapshot: unknown) => {
      if (snapshot === lastPayload) return;
      lastPayload = snapshot;
      status = withRuntimeDefinitions(snapshot, runtimeDefinition);
      relay(WIDGET_MCP_STATUS, status);
    });
  }
  pi.events.on(MCP_OAUTH_EVENT, (outcome: unknown) => relay(WIDGET_MCP_OAUTH, outcome));

  // Pi handles `/reload` only in its TUI; over RPC the literal text would reach the model as a
  // prompt. Registering the command here makes `/reload` real in PID's children as well.
  pi.registerCommand("reload", {
    description: "Reload extensions, skills, prompts, themes, and context files",
    handler: async (_args, c) => {
      await c.reload();
    },
  });

  pi.on("session_start", (_ev, c) => {
    ctx = c;
    // The MCP extension may have published before we had a context; replay the latest snapshot.
    if (status !== undefined) relay(WIDGET_MCP_STATUS, status);
  });
  pi.on("session_shutdown", () => {
    ctx = undefined;
    status = undefined;
    lastPayload = undefined;
  });
}
