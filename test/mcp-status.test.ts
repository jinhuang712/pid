import { parseMcpStatus, runtimeOnly, WIDGET_MCP_STATUS } from "@shared/mcp-status";
import type { PiHandle, PiSessionState } from "@shared/protocol";
import { describe, expect, it } from "vitest";
import { withRuntimeDefinitions } from "../resources/pid-bridge/index";
import { bundledExtensionPaths, locateBundled } from "../src/main/pi/bundled";
import { emptyWorkspace, workspaceReducer } from "../src/renderer/state/workspace";

// Real snapshot captured from pi-mcp-adapter 2.33.0 via pid-bridge (see resources/pid-bridge).
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

describe("runtime-registered servers", () => {
  const live = (name: string) => ({
    name,
    status: "cached",
    toolCount: 3,
    disabled: false,
  });
  const STATUS =
    '{"version":1,"servers":[{"name":"serena","status":"cached","toolCount":17,"disabled":false},' +
    '{"name":"klook-engine","status":"connected","toolCount":65,"disabled":false,"runtime":{"command":"node","args":["/pkg/dist/server.js","--no-flashcat"]}}],' +
    '"totalTools":82,"totalResources":0,"connectedCount":1,"disabledCount":0}';

  it("keeps the adapter's definition through parsing", () => {
    const s = parseMcpStatus([STATUS]);
    expect(s?.servers[1].runtime).toEqual({ command: "node", args: ["/pkg/dist/server.js", "--no-flashcat"] });
    expect(s?.servers[0].runtime).toBeUndefined();
  });

  it("lists only servers no config layer defines", () => {
    const s = parseMcpStatus([STATUS]);
    expect(runtimeOnly(s?.servers, ["serena", "Meegle"]).map((x) => x.name)).toEqual(["klook-engine"]);
    expect(runtimeOnly(s?.servers, ["serena", "Meegle", "klook-engine"])).toEqual([]);
    expect(runtimeOnly(undefined, ["serena"])).toEqual([]);
  });

  it("marks only the servers the adapter answers a snapshot for", () => {
    const definition = (name: string) =>
      name === "klook-engine" ? { command: "node", args: ["/pkg/dist/server.js"] } : undefined;
    const snapshot = { version: 1, servers: [live("serena"), live("klook-engine")], totalTools: 6 };
    const enriched = withRuntimeDefinitions(snapshot, definition) as typeof snapshot & {
      servers: { name: string; runtime?: unknown }[];
    };
    expect(enriched.servers[0]).toEqual(live("serena"));
    expect(enriched.servers[1].runtime).toEqual({ command: "node", args: ["/pkg/dist/server.js"] });
    // Totals and version are the adapter's; only the server array is touched.
    expect({ ...enriched, servers: undefined }).toEqual({ ...snapshot, servers: undefined });
  });

  it("passes anything that is not a snapshot through untouched", () => {
    expect(withRuntimeDefinitions(undefined, () => undefined)).toBeUndefined();
    expect(withRuntimeDefinitions({ servers: "nope" }, () => undefined)).toEqual({ servers: "nope" });
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
        widgetKey: WIDGET_MCP_STATUS,
        widgetLines: [SNAPSHOT],
      },
    });
    expect(ws.procs.k.published["mcp-status"]?.servers[0].name).toBe("fs");
    expect(ws.procs.k.widgets[WIDGET_MCP_STATUS]).toBeUndefined();
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

describe("PID's bridge extension", () => {
  it("is the only thing PID loads on top of the user's own Pi setup", () => {
    // Every other extension — MCP, the footer, anything else — is installed into Pi by the user.
    // There is one PID; it ships no ecosystem.
    expect(bundledExtensionPaths({ bridge: "/app/resources/pid-bridge/index.ts" })).toEqual([
      "/app/resources/pid-bridge/index.ts",
    ]);
    expect(bundledExtensionPaths({})).toEqual([]);
  });
  it("finds the bridge shipped in this repo", () => {
    expect(locateBundled(process.cwd(), {}).bridge).toMatch(/resources\/pid-bridge\/index\.ts$/);
  });
  it("takes an override for it", () => {
    const b = locateBundled("/nowhere", { PID_BRIDGE_PATH: process.cwd() });
    expect(b.bridge).toBe(process.cwd());
  });
});
