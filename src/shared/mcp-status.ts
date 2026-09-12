/**
 * Live MCP state as published by pi-mcp-adapter on Pi's event bus ("pi-mcp-adapter/status/v1")
 * and relayed into the RPC stream by resources/pid-bridge as a `pid:mcp-status` widget.
 * Shape follows the adapter's documented McpStatusSnapshot; unknown fields are kept as-is.
 */
export type McpServerRuntimeStatus =
  | "connected"
  | "cached"
  | "failed"
  | "needs-auth"
  | "not-connected"
  | "disabled"
  | (string & {});

export interface McpServerStatus {
  name: string;
  status: McpServerRuntimeStatus;
  toolCount: number;
  directToolCount?: number;
  resourceCount?: number;
  disabled: boolean;
  /** Only present while a failure is current. */
  failedAgoSeconds?: number;
}

export interface McpStatusSnapshot {
  version: number;
  servers: McpServerStatus[];
  totalTools: number;
  totalResources: number;
  connectedCount: number;
  disabledCount: number;
}

/** Widget keys the bridge uses. Anything under this prefix is data for PID, never UI. */
export const PID_WIDGET_PREFIX = "pid:";
export const WIDGET_MCP_STATUS = "pid:mcp-status";
export const WIDGET_MCP_OAUTH = "pid:mcp-oauth";

export const isPidWidget = (key: string) => key.startsWith(PID_WIDGET_PREFIX);

/** Parse the bridge's one-line JSON payload; undefined when the widget was cleared or malformed. */
export function parseMcpStatus(lines: string[] | undefined): McpStatusSnapshot | undefined {
  if (!lines || lines.length === 0) return undefined;
  try {
    const v = JSON.parse(lines.join("")) as Partial<McpStatusSnapshot>;
    if (!v || typeof v !== "object" || !Array.isArray(v.servers)) return undefined;
    return {
      version: typeof v.version === "number" ? v.version : 0,
      servers: v.servers.filter((s): s is McpServerStatus => !!s && typeof s.name === "string"),
      totalTools: v.totalTools ?? 0,
      totalResources: v.totalResources ?? 0,
      connectedCount: v.connectedCount ?? 0,
      disabledCount: v.disabledCount ?? 0,
    };
  } catch {
    return undefined;
  }
}
