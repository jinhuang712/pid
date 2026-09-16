import type { ToolCall } from "@earendil-works/pi-ai";
import { describe, expect, it } from "vitest";
import { humanize, label } from "../src/renderer/tool-label";

const call = (name: string, args: Record<string, unknown>): ToolCall => ({ type: "toolCall", id: "t", name, arguments: args });

describe("tool line labels", () => {
  it("falls back to the raw name for a tool it has no line for", () => {
    expect(label(call("acme-engine_lookup_mysql_catalog", {})).done).toBe("Called acme-engine_lookup_mysql_catalog");
  });

  it("uses tense for Pi's own tools", () => {
    expect(label(call("read", { path: "a.ts" }))).toEqual({ running: "Reading", done: "Read", detail: "a.ts" });
    expect(label(call("bash", { command: "ls" }))).toEqual({ running: "Running", done: "Ran", detail: "ls" });
    expect(label(call("grep", { pattern: "foo" })).done).toBe("Searched");
  });

  /**
   * The list is Pi's built-ins and stops there. `search`, `fetch` and `websearch` are names
   * extensions chose, and PID prettifying them was PID knowing one extension by name — an
   * extension that wants a better row registers one through the `tool` mount.
   */
  it("keeps an extension's tool name instead of guessing at its naming", () => {
    expect(label(call("search", { query: "pi rpc" })).done).toBe("Called search");
    expect(label(call("fetch", { url: "https://x" })).running).toBe("Calling fetch");
    expect(label(call("websearch", { query: "pi rpc" })).detail).toBe("pi rpc");
    expect(label(call("view", { path: "shot.png" })).done).toBe("Called view");
  });

  it("humanises an underscored tool name", () => {
    expect(humanize("lookup_mysql_catalog")).toBe("lookup mysql catalog");
  });
});
