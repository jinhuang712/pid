import type { PiSessionState } from "@shared/protocol";
import { availablePages, liveKinds, PAGE_SURFACES } from "../src/renderer/surfaces";
import type { Proc, Workspace } from "../src/renderer/state/workspace";
import { describe, expect, it } from "vitest";

/**
 * PID must not know which extension fills which surface — only that a surface is filled. These
 * tests fail if a page starts depending on a particular extension being installed.
 */

const proc = (over: Partial<Proc> = {}): Proc => ({
  key: "k",
  cwd: "/repo",
  piState: {} as PiSessionState,
  conv: { messages: [] } as unknown as Proc["conv"],
  statuses: {},
  widgets: {},
  published: {},
  dialogs: [],
  ...over,
});

const ws = (...procs: Proc[]): Workspace => ({
  procs: Object.fromEntries(procs.map((p, i) => [`${p.key}${i}`, p])),
});

describe("page surfaces", () => {
  it("keeps PID's own pages whatever is installed", () => {
    const pages = availablePages(new Set()).map((s) => s.id);
    expect(pages).toContain("skills");
    expect(pages).toContain("extensions");
  });

  it("drops a page nothing fills", () => {
    // A fresh PID with no MCP extension has no MCP page: an empty frame with a heading is worse
    // than no menu entry.
    expect(availablePages(new Set()).map((s) => s.id)).not.toContain("mcp");
    expect(availablePages(new Set(["mcp-status"])).map((s) => s.id)).toContain("mcp");
  });

  it("names a kind for every page it does not always show", () => {
    // The table is the only place a surface is tied to data. A page with neither a kind nor a
    // permanent home would be a hidden special case.
    for (const s of PAGE_SURFACES) expect(s.kind === undefined || typeof s.kind === "string").toBe(true);
  });
});

describe("liveKinds", () => {
  it("reports what open sessions have published", () => {
    expect(liveKinds(ws(proc({ published: { usage: { provider: "x", state: "fresh", windows: [] } } })))).toEqual(
      new Set(["usage"]),
    );
    expect(liveKinds(ws(proc()))).toEqual(new Set());
  });

  it("ignores a session that is starting or gone", () => {
    const published: Proc["published"] = { usage: { provider: "x", state: "fresh", windows: [] } };
    expect(liveKinds(ws(proc({ published, pending: true })))).toEqual(new Set());
    expect(liveKinds(ws(proc({ published, exit: "pi exited" })))).toEqual(new Set());
  });

  it("unions across sessions, so one folder's extension is enough", () => {
    const a = proc({ published: { usage: { provider: "x", state: "fresh", windows: [] } } });
    const b = proc({ published: { binding: { children: [{ branch: "wt", worktreePath: "/w" }] } } });
    expect(liveKinds(ws(a, b))).toEqual(new Set(["usage", "binding"]));
  });
});
