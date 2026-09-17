import { describe, expect, it } from "vitest";
import {
  emptyOpenSessions,
  type OpenEntry,
  type OpenSessionsAction,
  openSessionsReducer,
} from "../src/renderer/state/openSessions";

const entry = (path: string, cwd = "/repo"): OpenEntry => ({ cwd, path });
const run = (...actions: OpenSessionsAction[]) =>
  actions.reduce(openSessionsReducer, emptyOpenSessions());

describe("open sessions: what leaves the list", () => {
  it("keeps an entry whose resume failed, and carries the reason", () => {
    const s = run(
      { type: "open", entries: [entry("/s/a.jsonl"), entry("/s/b.jsonl")] },
      { type: "fail", entry: entry("/s/b.jsonl"), reason: "the session file is gone" },
    );
    expect(s.entries.map((e) => e.path)).toEqual(["/s/a.jsonl", "/s/b.jsonl"]);
    expect(s.failures["/s/b.jsonl"]).toBe("the session file is gone");
  });

  it("records a failure for a session that was never in the list", () => {
    const s = run({ type: "fail", entry: entry("/s/a.jsonl"), reason: "worker exited (1)" });
    expect(s.entries.map((e) => e.path)).toEqual(["/s/a.jsonl"]);
  });

  it("only the user's close removes an entry, and it clears the reason with it", () => {
    const s = run(
      { type: "open", entries: [entry("/s/a.jsonl"), entry("/s/b.jsonl")] },
      { type: "fail", entry: entry("/s/b.jsonl"), reason: "nope" },
      { type: "close", paths: ["/s/b.jsonl"] },
    );
    expect(s.entries.map((e) => e.path)).toEqual(["/s/a.jsonl"]);
    expect(s.failures).toEqual({});
  });

  it("does not resurrect a session the user closed while it was restarting", () => {
    // The restore pass holds a snapshot; the close lands while it is still starting.
    let s = run({ type: "open", entries: [entry("/s/a.jsonl")] });
    s = openSessionsReducer(s, { type: "close", paths: ["/s/a.jsonl"] });
    s = openSessionsReducer(s, { type: "ok", path: "/s/a.jsonl" });
    expect(s.entries).toEqual([]);
  });

  it("clears a reason once the session is up", () => {
    const s = run(
      { type: "open", entries: [entry("/s/a.jsonl")] },
      { type: "fail", entry: entry("/s/a.jsonl"), reason: "nope" },
      { type: "ok", path: "/s/a.jsonl" },
    );
    expect(s.entries.map((e) => e.path)).toEqual(["/s/a.jsonl"]);
    expect(s.failures).toEqual({});
  });
});

describe("open sessions: the list itself", () => {
  it("dedupes by file and keeps the order sessions were opened in", () => {
    const s = run(
      { type: "open", entries: [entry("/s/a.jsonl"), entry("/s/b.jsonl")] },
      { type: "open", entries: [entry("/s/a.jsonl"), entry("/s/c.jsonl")] },
    );
    expect(s.entries.map((e) => e.path)).toEqual(["/s/a.jsonl", "/s/b.jsonl", "/s/c.jsonl"]);
  });

  it("still says the same object when an action changes nothing, so no save is queued", () => {
    const s = run({ type: "open", entries: [entry("/s/a.jsonl")] });
    expect(openSessionsReducer(s, { type: "open", entries: [entry("/s/a.jsonl")] })).toBe(s);
    expect(openSessionsReducer(s, { type: "close", paths: ["/s/zzz.jsonl"] })).toBe(s);
    expect(openSessionsReducer(s, { type: "ok", path: "/s/a.jsonl" })).toBe(s);
  });

  it("a fork or /switch keeps the tab's place and its cwd", () => {
    const s = run(
      { type: "open", entries: [entry("/s/a.jsonl"), entry("/s/b.jsonl")] },
      { type: "move", from: "/s/a.jsonl", to: entry("/s/a-fork.jsonl", "/repo/other") },
    );
    expect(s.entries).toEqual([entry("/s/a-fork.jsonl", "/repo/other"), entry("/s/b.jsonl")]);
  });

  it("a move onto a path already in the list leaves one entry", () => {
    const s = run(
      { type: "open", entries: [entry("/s/a.jsonl"), entry("/s/b.jsonl")] },
      { type: "move", from: "/s/a.jsonl", to: entry("/s/b.jsonl") },
    );
    expect(s.entries).toEqual([entry("/s/b.jsonl")]);
  });

  it("a move for an entry the list never had is an open, not a loss", () => {
    const s = run(
      { type: "open", entries: [entry("/s/a.jsonl")] },
      { type: "move", from: "/s/gone.jsonl", to: entry("/s/new.jsonl") },
    );
    expect(s.entries.map((e) => e.path)).toEqual(["/s/a.jsonl", "/s/new.jsonl"]);
  });
});
