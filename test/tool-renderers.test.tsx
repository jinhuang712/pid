import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

// ToolCard reads settings, whose bridge only exists inside Electron. The
// default context carries DEFAULT_SETTINGS, which is all static markup needs.
vi.mock("../src/renderer/bridge", () => ({ bridge: {} }));

import { createToolRegistry, type ToolRenderProps } from "../src/renderer/contributions/tools";
import { ToolCard } from "../src/renderer/components/ToolCard";

const call = { type: "toolCall", id: "tc1", name: "read", arguments: { path: "a.ts" } } as never;

/**
 * The tool renderer registry: first match wins, unknown tools get the
 * generic card, and a throwing matcher counts as no match rather than
 * taking the transcript down.
 */
describe("tool renderer registry", () => {
  it("falls back to the generic card for unknown tools", () => {
    const registry = createToolRegistry();
    const props: ToolRenderProps = { call };
    expect(renderToStaticMarkup(registry.resolve("read")(props) as never)).toBe(
      renderToStaticMarkup(<ToolCard {...props} />),
    );
  });

  it("prefers the first matching renderer", () => {
    const registry = createToolRegistry();
    registry.register({ name: "a", match: (n) => n === "read", render: () => "A" });
    registry.register({ name: "b", match: () => true, render: () => "B" });
    expect(registry.resolve("read")({ call })).toBe("A");
    expect(registry.resolve("bash")({ call })).toBe("B");
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
    const props: ToolRenderProps = { call };
    expect(renderToStaticMarkup(registry.resolve("read")(props) as never)).toBe(
      renderToStaticMarkup(<ToolCard {...props} />),
    );
  });

  it("keeps registries independent", () => {
    const a = createToolRegistry();
    const b = createToolRegistry();
    a.register({ name: "a", match: () => true, render: () => "A" });
    expect(a.resolve("read")({ call })).toBe("A");
    const props: ToolRenderProps = { call };
    expect(renderToStaticMarkup(b.resolve("read")(props) as never)).toBe(
      renderToStaticMarkup(<ToolCard {...props} />),
    );
  });
});
