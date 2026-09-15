import { parseWorktree, worktreeSummary } from "@shared/worktree";
import { describe, expect, it } from "vitest";

const BOUND = {
  branch: "wt-fix-login",
  dest: "main",
  ahead: 3,
  behind: 1,
  dirty: 2,
  task: "fix the login redirect",
  worktreePath: "/repo/.worktrees/fix-login",
  originPath: "/repo",
  inside: true,
};

const payload = (v: unknown) => [JSON.stringify(v)];

describe("the binding widget", () => {
  it("reads a binding", () => {
    expect(parseWorktree(payload({ binding: BOUND }))?.binding).toEqual(BOUND);
  });

  it("reads the worktrees hanging off an origin", () => {
    const w = parseWorktree(payload({ children: [{ branch: "wt-a", worktreePath: "/w/a" }] }));
    expect(w?.children).toEqual([{ branch: "wt-a", worktreePath: "/w/a" }]);
  });

  it("reads nonsense as no binding rather than as a branch that does not exist", () => {
    expect(parseWorktree(undefined)).toBeUndefined();
    expect(parseWorktree(["{"])).toBeUndefined();
    expect(parseWorktree(payload({}))).toBeUndefined();
    expect(parseWorktree(payload({ children: [] }))).toBeUndefined();
    expect(parseWorktree(payload({ binding: { dest: "main" } }))).toBeUndefined();
    // Counts that are not counts read as zero, not as NaN in the header.
    const odd = parseWorktree(payload({ binding: { branch: "b", ahead: "lots", dirty: -4 } }));
    expect(odd?.binding).toMatchObject({ branch: "b", ahead: 0, dirty: 0, dest: "", inside: false });
  });
});

describe("worktreeSummary", () => {
  it("leads with where the work lands", () => {
    expect(worktreeSummary({ binding: BOUND })).toBe("wt-fix-login → main · ↑3 · ↓1 · 2 dirty");
  });

  it("drops the counts that are zero", () => {
    expect(worktreeSummary({ binding: { ...BOUND, ahead: 0, behind: 0, dirty: 0 } })).toBe(
      "wt-fix-login → main",
    );
  });

  it("lists an origin's worktrees, three then a count", () => {
    const children = ["a", "b", "c", "d"].map((b) => ({ branch: b, worktreePath: `/w/${b}` }));
    expect(worktreeSummary({ children })).toBe("a · b · c +1");
  });

  it("is undefined when there is nothing to say", () => {
    expect(worktreeSummary(undefined)).toBeUndefined();
    expect(worktreeSummary({ children: [] })).toBeUndefined();
  });
});
