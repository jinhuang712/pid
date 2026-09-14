import type { ToolCall } from "@earendil-works/pi-ai";
import { describe, expect, it } from "vitest";
import { humanize, label, shortMcpName, splitMcpToolName } from "../src/renderer/tool-label";

const call = (name: string, args: Record<string, unknown>): ToolCall => ({ type: "toolCall", id: "t", name, arguments: args });

describe("tool line labels", () => {
  it("names gateway MCP calls by server and short tool name", () => {
    const l = label(call("mcp__Meegle", { tool: "Meegle_get_workitem_brief", args: {} }));
    expect(l.running).toBe("Calling MCP");
    expect(l.done).toBe("Called MCP");
    expect(l.detail).toBe("Meegle › get_workitem_brief");
  });
  it("names pid-mcp native tools as MCP calls when the session reports the server", () => {
    const servers = ["acme-engine", "acme", "serena"];
    const l = label(call("acme-engine_lookup_mysql_catalog", { service: "x" }), servers);
    expect(l.running).toBe("Calling MCP");
    expect(l.done).toBe("Called MCP");
    expect(l.detail).toBe("acme-engine · lookup mysql catalog");
    expect(label(call("serena_find_symbol", {}), servers).detail).toBe("serena · find symbol");
  });
  it("falls back to the raw name without a live server list", () => {
    expect(label(call("acme-engine_lookup_mysql_catalog", {})).done).toBe("Called acme-engine_lookup_mysql_catalog");
  });
  it("labels mcp_search by its query", () => {
    expect(label(call("mcp_search", { query: "mysql catalog" }))).toEqual({
      running: "Searching MCP tools",
      done: "Searched MCP tools",
      detail: "mysql catalog",
    });
  });
  it("splits on the longest matching server prefix", () => {
    expect(splitMcpToolName("acme-engine_query_log", ["acme", "acme-engine"])).toEqual({
      server: "acme-engine",
      tool: "query_log",
    });
    expect(splitMcpToolName("read", ["acme-engine"])).toBeUndefined();
    expect(humanize("lookup_mysql_catalog")).toBe("lookup mysql catalog");
  });
  it("strips dashed/underscored server prefixes", () => {
    expect(shortMcpName("acme_engine", "acme-engine_query_log")).toBe("query_log");
    expect(shortMcpName("serena", "find_symbol")).toBe("find_symbol");
  });
  it("uses tense for built-ins and web tools", () => {
    expect(label(call("read", { path: "a.ts" }))).toEqual({ running: "Reading", done: "Read", detail: "a.ts" });
    expect(label(call("websearch", { query: "pi rpc" })).detail).toBe("pi rpc");
    expect(label(call("fetch", { url: "https://x" })).running).toBe("Fetching");
  });
});
