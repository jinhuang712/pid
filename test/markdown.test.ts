import { describe, expect, it } from "vitest";
import { marked } from "../src/renderer/marked-setup";

describe("strikethrough", () => {
  it("keeps a single tilde as text", () => {
    expect(marked.parse("17~24 条/批 ≈ 70~94 条/秒")).toBe("<p>17~24 条/批 ≈ 70~94 条/秒</p>\n");
  });
  it("still strikes double tildes", () => {
    expect(marked.parse("a ~~gone~~ b")).toBe("<p>a <del>gone</del> b</p>\n");
  });
  it("leaves an unbalanced double tilde alone", () => {
    expect(marked.parse("a ~~x~ b")).toBe("<p>a ~~x~ b</p>\n");
  });
});

describe("fenced code", () => {
  it("wraps json tokens in highlight.js spans", () => {
    const html = marked.parse('```json\n{ "a": 1, "b": "x" }\n```') as string;
    expect(html).toContain('<code class="language-json hljs">');
    expect(html).toContain('<span class="hljs-attr">&quot;a&quot;</span>');
    expect(html).toContain('<span class="hljs-number">1</span>');
    expect(html).toContain('<span class="hljs-string">&quot;x&quot;</span>');
  });
  it("resolves aliases such as ts and sh", () => {
    expect(marked.parse("```ts\nconst a = 1\n```")).toContain('class="language-typescript hljs"');
    expect(marked.parse("```sh\nls -la\n```")).toContain('class="language-bash hljs"');
  });
  it("falls back to escaped plain text for unknown or missing languages", () => {
    expect(marked.parse("```brainfuck\n<b>\n```")).toBe("<pre><code>&lt;b&gt;\n</code></pre>\n");
    expect(marked.parse("```\n<b>\n```")).toBe("<pre><code>&lt;b&gt;\n</code></pre>\n");
  });
});
