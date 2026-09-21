import React, { type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { PluginContext } from "../src/renderer/plugins/api";

/**
 * A plugin's drawing is contained, and the containment has to start one level down.
 *
 * React consults a boundary only for errors raised in its *descendants*, so a render function
 * called inline in the slot's body throws above PluginBoundary and unmounts the window — the
 * outcome the boundary exists to prevent. These assertions pin the shape that keeps the boundary
 * reachable: the plugin's function is the boundary's child, exactly as the tool mount wraps its
 * renderers.
 */

vi.mock("../src/renderer/plugins/usePlugins", () => ({
  usePluginContext: () => ({ state: undefined, run: async () => {}, cwd: undefined, query: "" }),
}));

import { PluginBoundary } from "../src/renderer/plugins/Boundary";
import { PluginRender, PluginSlot } from "../src/renderer/plugins/PluginSlot";

const ctx: PluginContext = { state: undefined, run: async () => {}, cwd: undefined, query: "" };

const slot = (render: (ctx: PluginContext) => unknown) =>
  PluginSlot({
    plugin: { id: "boom", header: { render } },
    where: "header",
    proc: undefined,
    run: async () => {},
  }) as ReactElement<{ children: ReactElement<{ render: (ctx: PluginContext) => unknown }> }>;

describe("a plugin's render", () => {
  it("is the boundary's child, so a throw is caught instead of blanking the window", () => {
    const el = slot(() => {
      throw new Error("plugin exploded");
    });

    // What React does one level down: the failure is raised inside a descendant of the boundary.
    expect(el.props.children.type).toBe(PluginRender);
    expect(() => el.props.children.props.render(ctx)).toThrow("plugin exploded");
    expect(PluginBoundary.getDerivedStateFromError(new Error("plugin exploded"))).toEqual({
      error: "plugin exploded",
    });
  });

  it("draws a line that does not throw", () => {
    const html = renderToStaticMarkup(slot(() => <span>hello</span>) as never);
    expect(html).toContain("hello");
  });

  /**
   * A failure belongs to the drawing that failed. When the plugin's own code is replaced — a folder
   * switch reloads the desktop half — the slot gets a fresh attempt instead of the old error line.
   */
  it("forgets a failure when the plugin's code is replaced, and only then", () => {
    const spec = { render: () => null };
    const boundary = new PluginBoundary({ id: "p", resetKey: spec, children: null });
    boundary.state = { error: "boom" };
    let cleared: boolean | undefined;
    boundary.setState = (s) => {
      cleared = (s as { error?: string }).error === undefined;
    };

    boundary.componentDidUpdate({ id: "p", resetKey: spec, children: null });
    expect(cleared).toBeUndefined(); // the same drawing: the error stays visible

    boundary.componentDidUpdate({ id: "p", resetKey: { render: () => null }, children: null });
    expect(cleared).toBe(true);
  });
});
