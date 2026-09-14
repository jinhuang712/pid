/**
 * Live MCP state as published by the MCP extension on Pi's event bus ("pid-mcp/status/v1", mirrored
 * on "pi-mcp-adapter/status/v1" for compatibility) and relayed into the RPC stream by
 * resources/pid-bridge as a `pid:mcp-status` widget.
 *
 * The first block of fields is the snapshot shape both pid-mcp and pi-mcp-adapter publish; the
 * pid-mcp-only fields are optional so a user-installed adapter still parses. Unknown fields are
 * kept as-is.
 */
export type McpServerRuntimeStatus =
  | "connected"
  | "cached"
  | "failed"
  | "needs-auth"
  | "not-connected"
  | "disabled"
  | (string & {});

/**
 * Where a runtime-registered server is started from, as reported by the MCP extension.
 * Mirrors McpRuntimeDefinition in resources/pid-bridge/index.ts.
 */
export interface McpRuntimeDefinition {
  command?: string;
  args?: string[];
  url?: string;
}

export interface McpServerStatus {
  name: string;
  status: McpServerRuntimeStatus;
  toolCount: number;
  /** Tools registered directly with Pi and visible to the model right now. */
  directToolCount?: number;
  resourceCount?: number;
  disabled: boolean;
  /** Only present while a failure is current. */
  failedAgoSeconds?: number;
  /**
   * Present only for servers an extension registered at runtime: no mcp.json defines them, so
   * nothing on disk plays back where they come from. Absent for configured servers.
   */
  runtime?: McpRuntimeDefinition;
  // ---- pid-mcp only ----
  /** Pi tool names from this server the model can see right now. */
  activeToolNames?: string[];
  activeToolCount?: number;
  /** Tools active from session start because the config pins them (`directTools: true` or a list). */
  pinnedToolCount?: number;
  /** Message of the last connection or call failure, while one is current. */
  lastError?: string;
  runtimeRegistered?: boolean;
  transport?: "stdio" | "http" | "unknown";
  /** When the tool list was last fetched from the server. */
  cachedAt?: number;
}

export interface McpStatusSnapshot {
  version: number;
  servers: McpServerStatus[];
  totalTools: number;
  totalResources: number;
  connectedCount: number;
  disabledCount: number;
  // ---- pid-mcp only ----
  /** "pid-mcp" when pid-mcp published it; absent for pi-mcp-adapter. */
  source?: string;
  pidMcpVersion?: string;
  /** MCP tools the model can see right now, across servers. */
  activeToolCount?: number;
}

/** The outcome of an OAuth flow, relayed as a `pid:mcp-oauth` widget. */
export interface McpOAuthOutcome {
  server: string;
  status: "authenticated" | "failed";
  message: string;
}

/** Widget keys the bridge uses. Anything under this prefix is data for PID, never UI. */
export const PID_WIDGET_PREFIX = "pid:";
export const WIDGET_MCP_STATUS = "pid:mcp-status";
export const WIDGET_MCP_OAUTH = "pid:mcp-oauth";

export const isPidWidget = (key: string) => key.startsWith(PID_WIDGET_PREFIX);

/**
 * Servers the MCP extension is running that no config layer defines — the runtime registrations.
 * The MCP page merges these into its list; without them a package-registered server (ACME's
 * engine/flashcat/grafana, say) is invisible even though Pi is calling it.
 */
export function runtimeOnly(
  servers: McpServerStatus[] | undefined,
  configured: Iterable<string>,
): McpServerStatus[] {
  const known = new Set(configured);
  return (servers ?? []).filter((s) => !known.has(s.name));
}

/** Parse the bridge's one-line JSON payload; undefined when the widget was cleared or malformed. */
export function parseMcpStatus(lines: string[] | undefined): McpStatusSnapshot | undefined {
  if (!lines || lines.length === 0) return undefined;
  try {
    const v = JSON.parse(lines.join("")) as Partial<McpStatusSnapshot>;
    if (!v || typeof v !== "object" || !Array.isArray(v.servers)) return undefined;
    return {
      ...v,
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

/** Parse the bridge's OAuth outcome payload; undefined when cleared or malformed. */
export function parseMcpOAuth(lines: string[] | undefined): McpOAuthOutcome | undefined {
  if (!lines || lines.length === 0) return undefined;
  try {
    const v = JSON.parse(lines.join("")) as Partial<McpOAuthOutcome>;
    if (!v || typeof v.server !== "string" || (v.status !== "authenticated" && v.status !== "failed"))
      return undefined;
    return { server: v.server, status: v.status, message: typeof v.message === "string" ? v.message : "" };
  } catch {
    return undefined;
  }
}
