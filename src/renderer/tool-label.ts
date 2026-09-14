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

export function label(call: ToolCall): Label {
  const a = (call.arguments ?? {}) as Record<string, unknown>;
  const str = (k: string) => (typeof a[k] === "string" ? (a[k] as string) : "");
  // pi-mcp-adapter's gateway tool: mcp__<server> with { tool, args }. pid-mcp registers each MCP
  // tool under its own name (<server>_<tool>), so those fall through to the default label.
  if (call.name.startsWith(MCP_PREFIX)) {
    const server = call.name.slice(MCP_PREFIX.length);
    const tool = str("tool") || str("name");
    const short = shortMcpName(server, tool);
    const detail = tool ? `${server} › ${short}` : server;
    return { running: "Calling MCP", done: "Called MCP", detail };
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
