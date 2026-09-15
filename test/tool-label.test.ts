import type { ToolCall } from "@earendil-works/pi-ai";
import { describe, expect, it } from "vitest";
import { humanize, label } from "../src/renderer/tool-label";

const call = (name: string, args: Record<string, unknown>): ToolCall => ({ type: "toolCall", id: "t", name, arguments: args });

describe("tool line labels", () => {
  it("falls back to the raw name for a tool it has no line for", () => {
    expect(label(call("klook-engine_lookup_mysql_catalog", {})).done).toBe("Called klook-engine_lookup_mysql_catalog");
  });
  it("uses tense for built-ins and web tools", () => {
    expect(label(call("read", { path: "a.ts" }))).toEqual({ running: "Reading", done: "Read", detail: "a.ts" });
    expect(label(call("websearch", { query: "pi rpc" })).detail).toBe("pi rpc");
    expect(label(call("fetch", { url: "https://x" })).running).toBe("Fetching");
  });
});
