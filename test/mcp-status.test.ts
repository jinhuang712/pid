import { parseMcpStatus, runtimeOnly } from "@shared/mcp-status";
import type { PiHandle, PiSessionState } from "@shared/protocol";
import { describe, expect, it } from "vitest";
import { emptyWorkspace, workspaceReducer } from "../src/renderer/state/workspace";

// A real snapshot, as an MCP extension publishes it.
const SNAPSHOT =
  '{"version":1,"servers":[{"name":"fs","status":"connected","listenState":"legacy","toolCount":14,"directToolCount":0,"resourceCount":0,"disabled":false}],"totalTools":14,"totalResources":0,"connectedCount":1,"disabledCount":0}';

describe("parseMcpStatus", () => {
  it("reads the adapter's v1 snapshot", () => {
    const s = parseMcpStatus([SNAPSHOT]);
    expect(s?.version).toBe(1);
    expect(s?.servers[0]).toMatchObject({ name: "fs", status: "connected", toolCount: 14 });
    expect(s?.connectedCount).toBe(1);
  });
  it("keeps pid-mcp's extra fields", () => {
    const s = parseMcpStatus([
      '{"version":1,"source":"pid-mcp","pidMcpVersion":"0.1.0","activeToolCount":2,"servers":[{"name":"gh","status":"connected","toolCount":10,"directToolCount":2,"disabled":false,"activeToolNames":["gh_search_issues","gh_get_issue"],"activeToolCount":2,"pinnedToolCount":1,"lastError":"boom","transport":"http"}],"totalTools":10,"totalResources":0,"connectedCount":1,"disabledCount":0}',
    ]);
    expect(s?.source).toBe("pid-mcp");
    expect(s?.activeToolCount).toBe(2);
    expect(s?.servers[0]?.activeToolNames).toEqual(["gh_search_issues", "gh_get_issue"]);
    expect(s?.servers[0]?.lastError).toBe("boom");
  });
  it("treats a cleared or malformed widget as no status", () => {
    expect(parseMcpStatus(undefined)).toBeUndefined();
    expect(parseMcpStatus([])).toBeUndefined();
    expect(parseMcpStatus(["not json"])).toBeUndefined();
    expect(parseMcpStatus(['{"servers":"nope"}'])).toBeUndefined();
  });
});

describe("workspace widget channel", () => {
  const handle: PiHandle = {
    key: "k",
    cwd: "/repo",
    state: { sessionFile: null } as unknown as PiSessionState,
    earlyEvents: [],
  };
  const ws0 = workspaceReducer(emptyWorkspace(), { type: "add", handle });
  it("stores the MCP snapshot on the proc and keeps it out of rendered widgets", () => {
    const ws = workspaceReducer(ws0, {
      type: "event",
      key: "k",
      event: {
        type: "dialog",
        id: "1",
        method: "setWidget",
        widgetKey: "pid-mcp:mcp-status/v1",
        widgetLines: [SNAPSHOT],
      },
    });
    expect(ws.procs.k.published["mcp-status"]?.servers[0].name).toBe("fs");
    expect(ws.procs.k.widgets["pid-mcp:mcp-status/v1"]).toBeUndefined();
  });
  it("keeps any other extension's widget, whatever it is named", () => {
    const ws = workspaceReducer(ws0, {
      type: "event",
      key: "k",
      event: {
        type: "dialog",
        id: "2",
        method: "setWidget",
        widgetKey: "pi-worktree",
        widgetLines: ["🌲 main", "↑2"],
      },
    });
    expect(ws.procs.k.widgets["pi-worktree"]).toEqual(["🌲 main", "↑2"]);
    expect(ws.procs.k.published["mcp-status"]).toBeUndefined();
  });

  it("drops a widget the extension clears", () => {
    const set = workspaceReducer(ws0, {
      type: "event",
      key: "k",
      event: { type: "dialog", id: "3", method: "setWidget", widgetKey: "x", widgetLines: ["hi"] },
    });
    const cleared = workspaceReducer(set, {
      type: "event",
      key: "k",
      event: { type: "dialog", id: "4", method: "setWidget", widgetKey: "x", widgetLines: undefined },
    });
    expect("x" in cleared.procs.k.widgets).toBe(false);
  });
});

