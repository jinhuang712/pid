import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

// The frame a plugin composes reads settings, whose bridge only exists inside Electron. The
// default context carries DEFAULT_SETTINGS, which is all static markup needs.
vi.mock("../src/renderer/bridge", () => ({ bridge: {} }));

import type { Registered, ToolDraw, ToolSpec } from "../src/renderer/plugins/api";
import { pluginToolResolver } from "../src/renderer/plugins/tools";
import { Badge, Say } from "../src/renderer/ui";

/**
 * Who draws a tool call. PID must not know which extension owns which tool name — only that one
 * claimed it. These fail if resolution starts depending on a particular extension being installed.
 */

const run = async () => undefined;

const call = (name: string, args: Record<string, unknown> = {}) =>
  ({ type: "toolCall", id: "tc1", name, arguments: args }) as never;

const spec = (names: string[], render: ToolSpec["render"] = () => null): ToolSpec => ({ names, render });
const plugin = (id: string, tools?: ToolSpec[]): Registered => ({ id, tools });

const resolve = (plugins: Registered[], widgets?: Record<string, string[]>) =>
  pluginToolResolver(plugins, widgets, "/repo", run);

describe("plugin tool renderers", () => {
  it("claims nothing when no plugin registered a tool", () => {
    expect(resolve([])("search")).toBeUndefined();
    expect(resolve([plugin("quiet")])("search")).toBeUndefined();
  });

  it("claims only the names the plugin listed", () => {
    const r = resolve([plugin("some-ext", [spec(["search", "fetch"])])]);
    expect(r("search")?.render).toBeTypeOf("function");
    expect(r("fetch")?.render).toBeTypeOf("function");
    expect(r("read")).toBeUndefined();
  });

  it("gives a tie to the plugin that loaded first", () => {
    const seen: string[] = [];
    const r = resolve([
      plugin("first", [spec(["view"], () => (seen.push("first"), null))]),
      plugin("second", [spec(["view"], () => (seen.push("second"), null))]),
    ]);
    r("view")?.render({ call: call("view") });
    expect(seen).toEqual(["first"]);
  });

  it("hands the renderer the call, the run and its own published state", () => {
    let got: { draw?: ToolDraw; state?: unknown } = {};
    const r = resolve(
      [
        plugin("some-ext", [
          spec(["search"], (draw, ctx) => {
            got = { draw, state: ctx.state };
            return null;
          }),
        ]),
      ],
      { "some-ext": ['{"provider":"exa"}'] },
    );
    const c = call("search", { query: "pi rpc" });
    r("search")?.render({ call: c, run: { status: "done" } as never });
    expect(got.draw?.call).toBe(c);
    expect(got.draw?.run).toEqual({ status: "done" });
    expect(got.state).toEqual({ provider: "exa" });
  });

  it("draws a tool whose plugin published no state", () => {
    let state: unknown = "untouched";
    const r = resolve([plugin("some-ext", [spec(["view"], (_d, ctx) => ((state = ctx.state), null))])]);
    r("view")?.render({ call: call("view") });
    expect(state).toBeUndefined();
  });

  it("lets one plugin register more than one renderer", () => {
    const r = resolve([plugin("many", [spec(["a"]), spec(["b"])])]);
    expect(r("a")?.render).toBeTypeOf("function");
    expect(r("b")?.render).toBeTypeOf("function");
  });

  /**
   * The frame is the whole reason this mount is small: a plugin says what is different about its
   * tool and inherits the chevron, the status, the output and the images from the same row PID's
   * own tools are drawn in.
   */
  it("hands over PID's own row, with this call already in it", () => {
    const r = resolve([
      plugin("some-ext", [
        spec(["search"], ({ Frame }) => (
          <Frame verb="Searched the web" detail="pi rpc" meta="exa · 5 results" body="none" />
        )),
      ]),
    ]);
    const el = r("search")?.render({ call: call("search", { query: "pi rpc" }) });
    expect(React.isValidElement(el)).toBe(true);
    const html = renderToStaticMarkup(el as never);
    expect(html).toContain("Searched the web");
    expect(html).toContain("exa · 5 results");
    // `body="none"` means the arguments JSON is the plugin's call to make, not the frame's.
    expect(html).not.toContain("&quot;query&quot;");
  });

  it("falls back to PID's own label when the plugin overrides neither", () => {
    const r = resolve([plugin("some-ext", [spec(["read"], ({ Frame }) => <Frame />)])]);
    const html = renderToStaticMarkup(
      r("read")?.render({ call: call("read", { path: "a.ts" }) }) as never,
    );
    expect(html).toContain("Reading");
    expect(html).toContain("a.ts");
  });

  /**
   * The host has to ask before a row exists, to know whether a settled turn may fold its steps, so
   * this one call happens outside the boundary that contains a renderer.
   */
  it("answers `asks` from the plugin's own published state", () => {
    const gate = spec(["land"]);
    gate.asks = (_call, ctx) => (ctx.state as { ask?: string } | undefined)?.ask === "prompt";
    const published = resolve([plugin("gate", [gate])], { gate: ['{"ask":"prompt"}'] });
    const silent = resolve([plugin("gate", [gate])], {});
    expect(published("land")?.asks?.(call("land"))).toBe(true);
    expect(silent("land")?.asks?.(call("land"))).toBe(false);
  });

  it("leaves `asks` out for a plugin that never asks, and a throw counts as no question", () => {
    const throwing = spec(["view"]);
    throwing.asks = () => {
      throw new Error("the state I read has not arrived");
    };
    const r = resolve([plugin("plain", [spec(["read"])]), plugin("broken", [throwing])]);
    expect(r("read")?.asks).toBeUndefined();
    expect(r("view")?.asks?.(call("view"))).toBe(false);
  });

  /**
   * How an extension's row comes to read a little differently from `read` and `bash`: the end of
   * the line takes a node, so a call that went somewhere can say so with a mark instead of more
   * grey text. PID's own rows keep passing a string and are unchanged.
   */
  it("takes a node at the end of the line, not only a string", () => {
    const r = resolve([
      plugin("some-ext", [
        spec(["search"], ({ Frame }) => (
          <Frame
            meta={
              <>
                <Badge>exa</Badge>
                <Say tone="faint">5 results</Say>
              </>
            }
          />
        )),
      ]),
    ]);
    const html = renderToStaticMarkup(r("search")?.render({ call: call("search", { query: "q" }) }) as never);
    // A tinted pill, which no built-in row draws.
    expect(html).toMatch(/<span[^>]*rounded[^>]*>exa</);
    expect(html).toContain("5 results");
  });
});
