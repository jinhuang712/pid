import type { PiHandle, RpcSessionState } from "@shared/protocol";
import { describe, expect, it } from "vitest";
import { emptyWorkspace, procForSession, workspaceReducer } from "../src/renderer/state/workspace";

const state = (sessionFile: string | null): RpcSessionState => ({ sessionFile }) as unknown as RpcSessionState;
const handle = (key: string, sessionFile: string | null = null): PiHandle => ({
  key,
  cwd: "/repo",
  state: state(sessionFile),
  earlyEvents: [],
});

describe("workspace: session lifecycle", () => {
  it("a background pending placeholder (launch restore) leaves the active tab alone", () => {
    let ws = workspaceReducer(emptyWorkspace(), {
      type: "pending",
      key: "pending:1",
      cwd: "/repo",
      sessionPath: "/s/a.jsonl",
      background: true,
    });
    // nothing was open yet: the first restored session becomes the tab
    expect(ws.activeKey).toBe("pending:1");
    ws = workspaceReducer(ws, {
      type: "pending",
      key: "pending:2",
      cwd: "/repo",
      sessionPath: "/s/b.jsonl",
      background: true,
    });
    expect(ws.activeKey).toBe("pending:1");
    ws = workspaceReducer(ws, { type: "add", handle: handle("live-b", "/s/b.jsonl"), replaces: "pending:2" });
    expect(ws.activeKey).toBe("pending:1");
  });

  it("pending placeholder shows first, then the live process takes its place and stays active", () => {
    let ws = workspaceReducer(emptyWorkspace(), {
      type: "pending",
      key: "pending:1",
      cwd: "/repo",
      sessionPath: "/s/a.jsonl",
    });
    expect(ws.activeKey).toBe("pending:1");
    expect(ws.procs["pending:1"].pending).toBe(true);
    expect(procForSession(ws, "/s/a.jsonl")?.key).toBe("pending:1");

    ws = workspaceReducer(ws, { type: "add", handle: handle("live-a", "/s/a.jsonl"), replaces: "pending:1" });
    expect(ws.procs["pending:1"]).toBeUndefined();
    expect(ws.procs["live-a"].pending).toBeUndefined();
    expect(ws.activeKey).toBe("live-a");
    expect(procForSession(ws, "/s/a.jsonl")?.key).toBe("live-a");
  });

  it("a click elsewhere during startup wins over the arriving process", () => {
    let ws = workspaceReducer(emptyWorkspace(), { type: "add", handle: handle("b") });
    ws = workspaceReducer(ws, { type: "pending", key: "pending:1", cwd: "/repo", sessionPath: "/s/a.jsonl" });
    ws = workspaceReducer(ws, { type: "activate", key: "b" });
    ws = workspaceReducer(ws, { type: "add", handle: handle("live-a", "/s/a.jsonl"), replaces: "pending:1" });
    expect(ws.activeKey).toBe("b");
    expect(Object.keys(ws.procs).sort()).toEqual(["b", "live-a"]);
  });

  it("removing a pending placeholder (cancelled start) leaves no trace", () => {
    let ws = workspaceReducer(emptyWorkspace(), { type: "pending", key: "pending:1", cwd: "/repo", sessionPath: "/s/a.jsonl" });
    ws = workspaceReducer(ws, { type: "remove", key: "pending:1" });
    expect(ws.procs).toEqual({});
    expect(ws.activeKey).toBeUndefined();
  });

  it("exit keeps the entry with its reason until dismissed, and it no longer counts as live", () => {
    let ws = workspaceReducer(emptyWorkspace(), { type: "add", handle: handle("a", "/s/a.jsonl") });
    ws = workspaceReducer(ws, { type: "exit", key: "a", message: "pi exited (1) boom" });
    expect(ws.procs.a.exit).toBe("pi exited (1) boom");
    expect(ws.activeKey).toBe("a");
    ws = workspaceReducer(ws, { type: "remove", key: "a" });
    expect(ws.procs.a).toBeUndefined();
  });

  it("removing the active session activates the most recently opened remaining one", () => {
    let ws = workspaceReducer(emptyWorkspace(), { type: "add", handle: handle("a") });
    ws = workspaceReducer(ws, { type: "add", handle: handle("b") });
    ws = workspaceReducer(ws, { type: "add", handle: handle("c") });
    ws = workspaceReducer(ws, { type: "remove", key: "c" });
    expect(ws.activeKey).toBe("b");
  });

  it("early events are replayed into the new process in order", () => {
    const h = handle("a");
    h.earlyEvents = [
      { type: "extension_ui_request", id: "1", method: "setStatus", statusKey: "mcp", statusText: "connecting" },
      { type: "extension_ui_request", id: "2", method: "setStatus", statusKey: "mcp", statusText: "1 connected" },
    ];
    const ws = workspaceReducer(emptyWorkspace(), { type: "add", handle: h });
    expect(ws.procs.a.statuses.mcp).toBe("1 connected");
  });
});
