/**
 * PID bridge: a tiny Pi extension that PID loads into its own `pi --mode rpc` children with `-e`.
 *
 * It exists to forward machine-readable state that other extensions publish on Pi's event bus
 * (today: pi-mcp-adapter's status snapshots and OAuth outcomes) to PID over the RPC stream. Pi's
 * RPC mode already turns `ctx.ui.setWidget` into an `extension_ui_request` line, so a widget whose
 * key starts with `pid:` is the channel: PID parses those and never renders them as widgets.
 *
 * Nothing here talks to MCP servers or reads config. It only relays what the adapter emits.
 * Contract: pi-mcp-adapter ≥ 2.33, event "pi-mcp-adapter/status/v1" (versioned by its author).
 */
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

export const MCP_STATUS_EVENT = "pi-mcp-adapter/status/v1";
export const MCP_OAUTH_EVENT = "mcp-oauth-status";
export const WIDGET_MCP_STATUS = "pid:mcp-status";
export const WIDGET_MCP_OAUTH = "pid:mcp-oauth";

export default function pidBridge(pi: ExtensionAPI) {
  let ctx: ExtensionContext | undefined;
  let status: unknown;

  const relay = (key: string, payload: unknown) => {
    // Only meaningful inside PID; in a terminal this would print JSON above the editor.
    if (!ctx || ctx.mode === "tui") return;
    ctx.ui.setWidget(key, payload === undefined ? undefined : [JSON.stringify(payload)]);
  };

  pi.events.on(MCP_STATUS_EVENT, (snapshot: unknown) => {
    status = snapshot;
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
