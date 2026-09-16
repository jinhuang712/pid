import { describe, expect, it } from "vitest";
import type { Registered } from "../src/renderer/plugins/api";
import { pageId, pluginPages, surfaces } from "../src/renderer/surfaces";

/**
 * PID must not know which plugin contributes which page — only that one registered a page. These
 * tests fail if a surface starts depending on a particular extension being installed.
 */

const reg = (id: string, over: Partial<Registered> = {}): Registered => ({ id, ...over });
const page = (label?: string) => ({ label, render: () => null });

describe("surfaces", () => {
  it("keeps PID's own pages whatever is installed", () => {
    expect(surfaces([]).map((s) => s.id)).toEqual(["skills", "extensions"]);
  });

  it("adds a page a plugin registered, labelled as the plugin named it", () => {
    const list = surfaces([reg("some-ext", { page: page("Servers") })]);
    expect(list.map((s) => s.id)).toEqual(["skills", "extensions", pageId("some-ext")]);
    expect(list.at(-1)?.label).toBe("Servers");
    expect(list.at(-1)?.plugin?.id).toBe("some-ext");
  });

  it("falls back to the plugin's own id when it named no label", () => {
    expect(pluginPages([reg("bare", { page: page() })])[0]?.label).toBe("bare");
  });

  it("gives every plugin with a page its own entry, in load order", () => {
    const list = pluginPages([reg("a", { page: page("A") }), reg("b", { page: page("B") })]);
    expect(list.map((s) => s.label)).toEqual(["A", "B"]);
  });

  it("ignores a plugin that registered no page", () => {
    expect(pluginPages([reg("quiet"), reg("striponly", { strip: { render: () => null } })])).toEqual([]);
  });

  it("keeps a plugin that failed to load out of the navigation", () => {
    expect(pluginPages([reg("broken", { error: "no default export function" })])).toEqual([]);
  });
});
