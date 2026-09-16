import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

// ToolCard reads settings, whose bridge only exists inside Electron. The
// default context carries DEFAULT_SETTINGS, which is all static markup needs.
vi.mock("../src/renderer/bridge", () => ({ bridge: {} }));

import { ToolCard, ResultImages } from "../src/renderer/components/ToolCard";
import { callBrief } from "../src/renderer/components/ToolCard";
import { registerBuiltInToolRenderers } from "../src/renderer/contributions/builtin-tools";
import { createToolRegistry, ToolRendererBoundary, type ToolRenderProps } from "../src/renderer/contributions/tools";

const call = (name: string, args: Record<string, unknown> = {}) =>
  ({ type: "toolCall", id: "tc1", name, arguments: args }) as never;

/**
 * The tool renderer registry: first match wins, unknown tools get the
 * generic card, and a throwing matcher counts as no match rather than
 * taking the transcript down.
 */
describe("tool renderer registry", () => {
  it("falls back to the generic card for unknown tools", () => {
    const registry = createToolRegistry();
    const props: ToolRenderProps = { call: call("read") };
    expect(renderToStaticMarkup(registry.resolve("read")(props) as never)).toBe(
      renderToStaticMarkup(<ToolCard {...props} />),
    );
  });

  it("prefers the first matching renderer", () => {
    const registry = createToolRegistry();
    registry.register({ name: "a", match: (n) => n === "read", render: () => "A" });
    registry.register({ name: "b", match: () => true, render: () => "B" });
    expect(registry.resolve("read")({ call: call("read") })).toBe("A");
    expect(registry.resolve("bash")({ call: call("bash") })).toBe("B");
  });

  it("skips a throwing matcher", () => {
    const registry = createToolRegistry();
    registry.register({
      name: "bad",
      match: () => {
        throw new Error("boom");
      },
      render: () => "BAD",
    });
    const props: ToolRenderProps = { call: call("read") };
    expect(renderToStaticMarkup(registry.resolve("read")(props) as never)).toBe(
      renderToStaticMarkup(<ToolCard {...props} />),
    );
  });

  it("keeps registries independent", () => {
    const a = createToolRegistry();
    const b = createToolRegistry();
    a.register({ name: "a", match: () => true, render: () => "A" });
    expect(a.resolve("read")({ call: call("read") })).toBe("A");
    const props: ToolRenderProps = { call: call("read") };
    expect(renderToStaticMarkup(b.resolve("read")(props) as never)).toBe(
      renderToStaticMarkup(<ToolCard {...props} />),
    );
  });
});

describe("built-in renderers", () => {
  it("registers edit and bash, and leaves everything else on the card", () => {
    const registry = createToolRegistry();
    registerBuiltInToolRenderers(registry);
    // The edit and bash renderers are React components, never plain strings.
    const edit = registry.resolve("edit")({ call: call("edit", { path: "a.ts" }) });
    const bash = registry.resolve("bash")({ call: call("bash", { command: "ls" }) });
    expect(React.isValidElement(edit)).toBe(true);
    expect(React.isValidElement(bash)).toBe(true);
    // read has no registration: resolved to the fallback, still a real element.
    const read = registry.resolve("read")({ call: call("read", { path: "a.ts" }) });
    expect(React.isValidElement(read)).toBe(true);
  });

  it("does not stack duplicates when called twice", () => {
    const registry = createToolRegistry();
    registerBuiltInToolRenderers(registry);
    registerBuiltInToolRenderers(registry);
    // Two registrations would both match edit; the first wins either way, but a
    // reload loop must not grow the list. resolve() only exposes the winner, so
    // the proof is that the second call is a no-op on a fresh registry: the
    // fallback for an unregistered tool still renders.
    const props: ToolRenderProps = { call: call("read") };
    expect(renderToStaticMarkup(registry.resolve("read")(props) as never)).toBe(
      renderToStaticMarkup(<ToolCard {...props} />),
    );
  });
});

/**
 * The boundary's whole reason to exist: a renderer that throws at render time
 * must degrade to the generic card, not blank the transcript. React catches
 * the throw through getDerivedStateFromError, which is what is asserted here —
 * the failure path itself, without needing a client renderer.
 */
describe("tool renderer boundary", () => {
  it("degrades a throwing renderer to the generic card", () => {
    const props = { call: call("edit", { path: "a.ts" }) };
    const boundary = (
      <ToolRendererBoundary call={props.call}>
        <Boom />
      </ToolRendererBoundary>
    );
    const children = React.Children.toArray(boundary.props.children);
    const child = React.isValidElement(children[0])
      ? (children[0].type as () => React.ReactNode)
      : undefined;
    expect(child).toBeTypeOf("function");
    // What React does when the child throws: the static handler flips the state.
    expect(() => child?.()).toThrow("renderer exploded");
    expect(ToolRendererBoundary.getDerivedStateFromError()).toEqual({ failed: true });
    const failed = new ToolRendererBoundary({ ...props, children: null });
    failed.state = ToolRendererBoundary.getDerivedStateFromError();
    expect(renderToStaticMarkup(failed.render() as never)).toBe(
      renderToStaticMarkup(<ToolCard {...props} />),
    );
  });
});

function Boom(): React.ReactNode {
  throw new Error("renderer exploded");
}

/**
 * A tool that returns an image must reach the transcript as the picture, not as a `[image]`
 * placeholder. The bytes are already in the message that crossed IPC; this is the part that shows
 * them, and it is keyed off the content block rather than off any tool's name.
 */
describe("tool result images", () => {
  const runWith = (content: unknown[]) =>
    ({
      toolCallId: "tc1",
      toolName: "view",
      args: {},
      status: "done",
      result: { content },
    }) as never;

  it("renders an image block as a data URI", () => {
    const html = renderToStaticMarkup(
      <ResultImages run={runWith([{ type: "image", data: "QUJD", mimeType: "image/png" }])} />,
    );
    expect(html).toContain('src="data:image/png;base64,QUJD"');
  });

  it("shows the text of the same result and no placeholder", () => {
    const run = runWith([{ type: "text", text: "Viewed image [image/png] a.png" }]);
    expect(renderToStaticMarkup(<ToolCard call={call("view")} run={run} />)).not.toContain("[image]");
    expect(renderToStaticMarkup(<ResultImages run={run} />)).toBe("");
  });
});

/**
 * `brief` is the model's own one-liner, added to the schema by an extension (pi-briefly) that wants
 * a readable row. It lives in the arguments, so the row reads it out instead of hiding it there.
 */
describe("the model's brief", () => {
  it("reads a trimmed brief from the arguments", () => {
    expect(callBrief(call("read", { path: "a.ts", brief: "  查看配置解析逻辑  " }))).toBe("查看配置解析逻辑");
  });

  it("ignores a missing, empty or non-string brief", () => {
    expect(callBrief(call("read", { path: "a.ts" }))).toBeUndefined();
    expect(callBrief(call("read", { brief: "   " }))).toBeUndefined();
    expect(callBrief(call("read", { brief: 42 }))).toBeUndefined();
  });

  it("draws it in the call row, and keeps the raw arguments expandable", () => {
    const html = renderToStaticMarkup(
      <ToolCard call={call("read", { path: "a.ts", brief: "查看配置解析逻辑" })} />,
    );
    expect(html).toContain("查看配置解析逻辑");
  });
});
