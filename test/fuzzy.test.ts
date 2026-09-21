import { describe, expect, it } from "vitest";
import { fuzzyFilter, fuzzyScore } from "../src/renderer/fuzzy";

const long = (lead: string) => `${lead}${"x".repeat(600)}`;

describe("fuzzyScore", () => {
  it("calls no match what it is, instead of using a score that means two things", () => {
    expect(fuzzyScore("zzz", "abc")).toBeUndefined();
    // A match on a long text scores below zero: the length tie-breaker is not a rejection.
    expect(fuzzyScore("p", long("p"))).toBeLessThan(0);
  });
});

describe("fuzzyFilter", () => {
  it("keeps a match in a long description, which the length penalty must not erase", () => {
    const skill = { name: "pdf", description: long("p") };
    expect(fuzzyFilter([skill], "p", (s) => `${s.name} ${s.description}`)).toEqual([skill]);
  });

  it("still ranks the shorter text first", () => {
    const near = "pdf";
    const far = long("pdf");
    expect(fuzzyFilter([far, near], "pdf", (t) => t)).toEqual([near, far]);
  });

  it("drops what does not match, and returns everything for an empty query", () => {
    expect(fuzzyFilter(["alpha", "beta"], "zz", (t) => t)).toEqual([]);
    expect(fuzzyFilter(["alpha", "beta"], "", (t) => t)).toEqual(["alpha", "beta"]);
  });
});
