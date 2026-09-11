import { describe, expect, it } from "vitest";
import { activeToken, replaceToken } from "../src/renderer/sigils";

describe("activeToken", () => {
  it("finds a sigil at start of text", () => {
    expect(activeToken("@src/a", 6)).toEqual({ sigil: "@", query: "src/a", start: 0, end: 6 });
  });
  it("finds a sigil after whitespace", () => {
    expect(activeToken("look at @rea", 12)).toMatchObject({ sigil: "@", query: "rea", start: 8 });
  });
  it("ignores sigils glued to a word (emails, prices)", () => {
    expect(activeToken("mail me@x", 9)).toBeUndefined();
    expect(activeToken("costs 5$", 8)).toBeUndefined();
  });
  it("recognises all four sigils", () => {
    for (const s of ["/", "@", "#", "$"]) expect(activeToken(`${s}q`, 2)?.sigil).toBe(s);
  });
  it("returns nothing when caret is past whitespace", () => {
    expect(activeToken("@a ", 3)).toBeUndefined();
  });
});

describe("replaceToken", () => {
  it("replaces the token and appends a space", () => {
    const t = activeToken("see @re please", 7);
    expect(t).toBeDefined();
    if (!t) return;
    expect(replaceToken("see @re please", t, "@readme.md")).toEqual({ text: "see @readme.md  please", caret: 15 });
  });
});
