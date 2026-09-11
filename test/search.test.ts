import { describe, expect, it } from "vitest";
import { tokenize } from "../src/main/pi/search";

describe("tokenize", () => {
  it("lowercases words and splits identifiers into parts", () => {
    expect(tokenize("Read src/renderer/App.tsx now")).toEqual(
      expect.arrayContaining(["read", "src/renderer/app.tsx", "src", "renderer", "app", "tsx", "now"]),
    );
  });
  it("uses character bigrams for CJK", () => {
    expect(tokenize("缓存失效")).toEqual(["缓存", "存失", "失效"]);
    expect(tokenize("好")).toEqual(["好"]);
  });
  it("ignores punctuation", () => {
    expect(tokenize("a, b; c!")).toEqual(["a", "b", "c"]);
  });
});
