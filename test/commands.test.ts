import type { PiHandle, RpcSessionState } from "@shared/protocol";
import { describe, expect, it } from "vitest";
import { commandEnd, commandStart, emptyConversation } from "../src/renderer/state/conversation";
import { emptyWorkspace, workspaceReducer } from "../src/renderer/state/workspace";

describe("conversation: PID-issued commands", () => {
  it("a running command is a live row; settling it leaves one marker after the last message", () => {
    let s = emptyConversation();
    s = { ...s, messages: [{ role: "user", content: "hi", timestamp: 1 } as never] };
    s = commandStart(s, 7, "reloading…");
    expect(s.commands).toEqual([{ id: 7, text: "reloading…" }]);
    expect(s.markers).toEqual([]);

    s = commandEnd(s, 7, { ok: true, text: "reloaded · 6 skills" });
    expect(s.commands).toEqual([]);
    expect(s.markers).toEqual([{ afterIndex: 0, kind: "command", text: "reloaded · 6 skills" }]);
  });

  it("a failed command settles as a command-failed marker", () => {
    let s = commandStart(emptyConversation(), 1, "aborting…");
    s = commandEnd(s, 1, { ok: false, text: "abort failed · no run" });
    expect(s.markers).toEqual([{ afterIndex: -1, kind: "command-failed", text: "abort failed · no run" }]);
  });

  it("settling without text leaves no marker (pi reports the outcome itself)", () => {
    let s = commandStart(emptyConversation(), 1, "compacting…");
    s = commandEnd(s, 1, { ok: true });
    expect(s.commands).toEqual([]);
    expect(s.markers).toEqual([]);
  });

  it("only the settled command is removed; others keep running", () => {
    let s = commandStart(emptyConversation(), 1, "a…");
    s = commandStart(s, 2, "b…");
    s = commandEnd(s, 1, { ok: true, text: "a" });
    expect(s.commands).toEqual([{ id: 2, text: "b…" }]);
  });
});

describe("workspace: command-start / command-end reach the session's conversation", () => {
  const handle: PiHandle = {
    key: "k",
    cwd: "/repo",
    state: { sessionFile: null } as unknown as RpcSessionState,
    earlyEvents: [],
  };
  it("routes by key", () => {
    let ws = workspaceReducer(emptyWorkspace(), { type: "add", handle });
    ws = workspaceReducer(ws, { type: "command-start", key: "k", id: 1, text: "reloading…" });
    expect(ws.procs.k?.conv.commands).toEqual([{ id: 1, text: "reloading…" }]);
    ws = workspaceReducer(ws, { type: "command-end", key: "k", id: 1, outcome: { ok: true, text: "reloaded" } });
    expect(ws.procs.k?.conv.commands).toEqual([]);
    expect(ws.procs.k?.conv.markers.map((m) => m.kind)).toEqual(["command"]);
  });
});
