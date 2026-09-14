import type { ToolCall } from "@earendil-works/pi-ai";

/**
 * One readable line per tool call. Verbs are progressive while running and past tense when done,
 * so the list reads like a log: "Reading src/App.tsx" → "Read src/App.tsx".
 */
export interface Label {
  running: string;
  done: string;
  detail: string;
}

export const MCP_PREFIX = "mcp__";

/**
 * @param mcpServers names of the MCP servers the live session reports, so pid-mcp's native tools
 *   (`<server>_<tool>`) can be recognised and shown as "MCP acme-engine · lookup mysql catalog".
 */
export function label(call: ToolCall, mcpServers: readonly string[] = []): Label {
  const a = (call.arguments ?? {}) as Record<string, unknown>;
  const str = (k: string) => (typeof a[k] === "string" ? (a[k] as string) : "");
  // pi-mcp-adapter's gateway tool: mcp__<server> with { tool, args }.
  if (call.name.startsWith(MCP_PREFIX)) {
    const server = call.name.slice(MCP_PREFIX.length);
    const tool = str("tool") || str("name");
    const short = shortMcpName(server, tool);
    const detail = tool ? `${server} › ${short}` : server;
    return { running: "Calling MCP", done: "Called MCP", detail };
  }
  // pid-mcp registers each MCP tool under its own name: <server>_<tool>.
  const native = splitMcpToolName(call.name, mcpServers);
  if (native) {
    return {
      running: "Calling MCP",
      done: "Called MCP",
      detail: `${native.server} · ${humanize(native.tool)}`,
    };
  }
  switch (call.name) {
    case "read":
      return { running: "Reading", done: "Read", detail: str("path") };
    case "write":
      return { running: "Writing", done: "Wrote", detail: str("path") };
    case "edit":
      return { running: "Editing", done: "Edited", detail: str("path") };
    case "bash":
      return { running: "Running", done: "Ran", detail: str("command") };
    case "grep":
      return { running: "Searching", done: "Searched", detail: str("pattern") };
    case "find":
      return { running: "Finding", done: "Found", detail: str("pattern") };
    case "ls":
      return { running: "Listing", done: "Listed", detail: str("path") || "." };
    case "mcp_search":
      return { running: "Searching MCP tools", done: "Searched MCP tools", detail: str("query") };
    case "websearch":
    case "web_search":
    case "search":
      return { running: "Searching the web", done: "Searched the web", detail: str("query") };
    case "fetch":
    case "webfetch":
    case "web_fetch":
      return { running: "Fetching", done: "Fetched", detail: str("url") };
    default: {
      const first = Object.values(a).find((v) => typeof v === "string") as string | undefined;
      return { running: `Calling ${call.name}`, done: `Called ${call.name}`, detail: first ?? "" };
    }
  }
}

/** "Meegle_get_workitem_brief" under server "Meegle" → "get_workitem_brief"; otherwise the full name. */
export function shortMcpName(server: string, tool: string): string {
  const variants = [server, server.replace(/_/g, "-"), server.replace(/-/g, "_")].map((v) => v.toLowerCase());
  const lower = tool.toLowerCase();
  for (const v of variants) if (v && lower.startsWith(`${v}_`)) return tool.slice(v.length + 1);
  return tool;
}

/**
 * Split a pid-mcp tool name into its server and original tool name, given the servers the live
 * session knows. The longest matching server prefix wins ("acme-engine" over "acme").
 */
export function splitMcpToolName(
  name: string,
  mcpServers: readonly string[],
): { server: string; tool: string } | undefined {
  let best: { server: string; tool: string } | undefined;
  for (const server of mcpServers) {
    const prefix = `${sanitizeServer(server)}_`;
    if (name.startsWith(prefix) && name.length > prefix.length) {
      if (!best || prefix.length > best.server.length + 1) best = { server, tool: name.slice(prefix.length) };
    }
  }
  return best;
}

/** pid-mcp's server-name sanitisation: anything outside [A-Za-z0-9_-] becomes _<hex>_. */
function sanitizeServer(server: string): string {
  return Array.from(server, (ch) =>
    /^[A-Za-z0-9_-]$/.test(ch) ? ch : `_${ch.codePointAt(0)!.toString(16)}_`,
  ).join("");
}

/** "lookup_mysql_catalog" → "lookup mysql catalog". */
export function humanize(tool: string): string {
  return tool.replace(/_/g, " ").trim();
}
