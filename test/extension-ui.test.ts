import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PID_UI_SUPPORT, pidSupport, type UiMember } from "@shared/extension-ui";
import { parseWidgetKey, widgetKey } from "@shared/extension-widgets";
import { describe, expect, it } from "vitest";

/**
 * The Extensions page tells a user how much of an extension PID will run. That promise is only
 * worth making if it comes from what the worker actually does, so both read `PID_UI_SUPPORT` and
 * these tests fail when the table and the implementation disagree.
 *
 * `satisfies Record<keyof ExtensionUIContext, UiSupport>` in extension-ui.ts already fails
 * typecheck when Pi adds a member. What it cannot see is a member classified `served` that the
 * worker quietly stubbed, which is exactly the shape of the bug this replaced: `setTitle` and
 * `setEditorText` were advertised as working and their events reached a reducer with no case
 * for them.
 */

const WORKER = readFileSync(
  join(import.meta.dirname, "..", "src", "main", "pi", "session-worker.ts"),
  "utf8",
);
const PROTOCOL = readFileSync(join(import.meta.dirname, "..", "src", "shared", "protocol.ts"), "utf8");
const REDUCER = readFileSync(
  join(import.meta.dirname, "..", "src", "renderer", "state", "workspace.ts"),
  "utf8",
);
const APP = readFileSync(join(import.meta.dirname, "..", "src", "renderer", "App.tsx"), "utf8");

const members = Object.keys(PID_UI_SUPPORT) as UiMember[];
const by = (support: string) => members.filter((m) => PID_UI_SUPPORT[m] === support);

/**
 * Served members the worker answers by itself, from Pi's own data, so nothing crosses to the
 * window. Every other served member has to travel, and the test below holds it to that.
 */
const ANSWERED_IN_WORKER: UiMember[] = ["theme", "getAllThemes", "getTheme"];
/** Served members the window reads outside the workspace reducer. */
const READ_IN_APP: UiMember[] = ["notify"];

describe("extension UI support table", () => {
  it("classifies every member of Pi's UI context", () => {
    // The `satisfies` clause proves completeness at compile time; this proves the table is not empty
    // and that the three groups partition it.
    expect(members.length).toBeGreaterThan(20);
    expect(by("served").length + by("inert").length + by("terminal").length).toBe(members.length);
  });

  it("gives every served member somewhere to arrive", () => {
    // A member PID claims to serve either gets its answer inside the worker, or reaches the window
    // and is read there. Anything else is the dead-event bug: traffic sent, nothing listening.
    const unread = by("served")
      .filter((m) => !ANSWERED_IN_WORKER.includes(m))
      .filter((m) => {
        const method = `method: "${m}"`;
        if (!PROTOCOL.includes(method)) return true;
        return READ_IN_APP.includes(m) ? !APP.includes(`"${m}"`) : !REDUCER.includes(`case "${m}"`);
      });
    expect(unread).toEqual([]);
  });

  it("sends nothing for a member it does not serve", () => {
    // An inert or terminal member must not appear in the protocol: the worker drops the call rather
    // than emitting an event the window ignores.
    const leaking = [...by("inert"), ...by("terminal")].filter((m) =>
      PROTOCOL.includes(`method: "${m}"`),
    );
    expect(leaking).toEqual([]);
  });

  it("implements every inert member as a stub in the worker", () => {
    // Each one must be spelled out. A member missing entirely would fail typecheck; a member
    // forwarding somewhere would fail the test above. This catches the third case: an inert member
    // that quietly grew a real implementation without the table being updated.
    const missing = by("inert").filter((m) => !new RegExp(`\\b${m}\\s*[:(]`).test(WORKER));
    expect(missing).toEqual([]);
  });

  it("reads a session's support from what it calls", () => {
    const usage = { served: [], inert: [], terminal: [], guarded: false };
    expect(pidSupport(usage)).toBe("full");
    expect(pidSupport({ ...usage, inert: ["setWorkingMessage"] })).toBe("reduced");
    expect(pidSupport({ ...usage, terminal: ["custom"] })).toBe("terminal");
    expect(pidSupport({ ...usage, terminal: ["custom"], guarded: true })).toBe("guarded");
  });
});

describe("widget keys", () => {
  it("reads a structured key and rejects a plain one", () => {
    expect(parseWidgetKey("pid:mcp-status/v1")).toEqual({ ns: "pid", kind: "mcp-status", version: 1 });
    expect(parseWidgetKey("x-usage:quota/v2")).toEqual({ ns: "x-usage", kind: "quota", version: 2 });
    // A plain key is a line of text, not a payload: the strip shows it as written.
    expect(parseWidgetKey("pi-worktree")).toBeUndefined();
    expect(parseWidgetKey("pid:mcp-status")).toBeUndefined();
    expect(parseWidgetKey("Pid:Mcp/v1")).toBeUndefined();
    expect(parseWidgetKey("pid:mcp-status/v")).toBeUndefined();
  });

  it("round-trips", () => {
    const k = { ns: "x-footer", kind: "quota", version: 1 };
    expect(parseWidgetKey(widgetKey(k))).toEqual(k);
  });
});
