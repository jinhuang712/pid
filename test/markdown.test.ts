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
