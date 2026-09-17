import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi, beforeEach } from "vitest";

/**
 * A confirmation body is markdown.
 *
 * An extension with a card to show — a tree, a table of files — writes it as a fenced block, and
 * the dialog has to hand the body over as the source it was written in. Rendered as one
 * proportional paragraph, the columns collapse and the card reads as noise; the whole point of the
 * fenced block is that the dialog stops being the place where shape goes to die.
 */
const { seen } = vi.hoisted(() => ({ seen: [] as string[] }));

// Static markup has no DOM for DOMPurify, and the assertion is about what reaches markdown,
// not about markdown's own parser (test/markdown.test.ts covers that).
vi.mock("../src/renderer/components/Markdown", () => ({
  Markdown: ({ source }: { source: string }) => {
    seen.push(source);
    return createElement("pre", null, source);
  },
}));

import type { DialogRequest } from "../src/renderer/components/ExtensionUI";
import { ExtensionDialog } from "../src/renderer/components/ExtensionUI";

const confirm = (message: string): DialogRequest => ({
  type: "dialog",
  id: "d1",
  method: "confirm",
  title: "🌲 New worktree?",
  message,
});

const render = (req: DialogRequest) =>
  renderToStaticMarkup(createElement(ExtensionDialog, { req, onRespond: () => {} }));

beforeEach(() => {
  seen.length = 0;
});

describe("a confirmation body", () => {
  it("reaches markdown as its own source, card and all", () => {
    const card = "```\n🌲 WORKTREE 【main -> wt-gate】\n   └─ carrying 2 of 5 files\n```";
    render(confirm(card));
    expect(seen).toEqual([card]);
  });

  it("keeps a plain message byte for byte, so prose keeps its line breaks", () => {
    const prose = "Trust this project?\n\n~/dev/pi — extensions here run with your permissions.";
    render(confirm(prose));
    // `.prose p` is `white-space: pre-wrap`: the newlines the extension wrote survive the parser.
    expect(seen).toEqual([prose]);
  });

  it("is the only body a confirm draws", () => {
    const html = render(confirm("```\ncard\n```"));
    expect(html).toContain("card");
    // The old bare div is gone: one body, not two.
    expect(html.match(/<pre/g)?.length).toBe(1);
  });
});

describe("the other dialog methods", () => {
  it("leave select and input alone", () => {
    const select: DialogRequest = {
      type: "dialog",
      id: "d2",
      method: "select",
      title: "How should /land merge from now on?",
      options: ["Rebase", "Squash", "Merge"],
    };
    const html = render(select);
    expect(seen).toEqual([]);
    expect(html).toContain("Squash");
  });
});
