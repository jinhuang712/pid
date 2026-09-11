import type { ToolCall } from "@earendil-works/pi-ai";
import { describe, expect, it } from "vitest";
import { label, shortMcpName } from "../src/renderer/tool-label";

const call = (name: string, args: Record<string, unknown>): ToolCall => ({ type: "toolCall", id: "t", name, arguments: args });

describe("tool line labels", () => {
  it("names MCP calls by server and short tool name", () => {
    const l = label(call("mcp__Meegle", { tool: "Meegle_get_workitem_brief", args: {} }));
    expect(l.running).toBe("Calling MCP");
    expect(l.done).toBe("Called MCP");
    expect(l.detail).toBe("Meegle › get_workitem_brief");
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
