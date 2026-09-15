import type { PiSessionState } from "@shared/protocol";
import { describe, expect, it } from "vitest";
import type { Proc, Workspace } from "../src/renderer/state/workspace";
import { extensionPages, pageId, surfaces } from "../src/renderer/surfaces";

/**
 * PID must not know which extension contributes which page — only that one described a page. These
 * tests fail if a surface starts depending on a particular extension being installed.
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

const page = (title: string) => ({ title, sections: [{ rows: [{ id: "a", title: "A" }] }] });

describe("surfaces", () => {
  it("keeps PID's own pages whatever is installed", () => {
    expect(surfaces(ws()).map((s) => s.id)).toEqual(["skills", "extensions"]);
  });

  it("adds a page an extension described, labelled as the extension named it", () => {
    const list = surfaces(ws(proc({ published: { page: { "some-ext": page("Servers") } } })));
    expect(list.map((s) => s.id)).toEqual(["skills", "extensions", pageId("some-ext")]);
    expect(list.at(-1)?.label).toBe("Servers");
    expect(list.at(-1)?.sessionKey).toBe("k");
  });

  it("gives every publisher its own page", () => {
    const p = proc({ published: { page: { a: page("A"), b: page("B") } } });
    expect(extensionPages(ws(p)).map((s) => s.label)).toEqual(["A", "B"]);
  });

  it("ignores a session that is starting or gone", () => {
    const published = { page: { x: page("X") } };
    expect(extensionPages(ws(proc({ published, pending: true })))).toEqual([]);
    expect(extensionPages(ws(proc({ published, exit: "pi exited" })))).toEqual([]);
  });

  it("shows one page when two sessions publish the same one", () => {
    const published = { page: { x: page("X") } };
    expect(extensionPages(ws(proc({ published }), proc({ published })))).toHaveLength(1);
  });
});
