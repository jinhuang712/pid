import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { addWorktree, removeWorktree, repoInfo, worktreeSafety } from "../src/main/git";

const sh = (cwd: string, ...args: string[]) => execFileSync("git", args, { cwd, stdio: "pipe" }).toString();

describe("git worktrees (temp repo)", () => {
  it("lists, adds, checks safety, and removes worktrees through git", async () => {
    const dir = mkdtempSync(join(tmpdir(), "pid-git-"));
    const repo = join(dir, "repo");
    sh(dir, "init", "-q", "-b", "main", repo);
    sh(repo, "-c", "user.name=t", "-c", "user.email=t@t", "commit", "-q", "--allow-empty", "-m", "init");
    const info = await repoInfo(repo);
    expect(info?.branch).toBe("main");
    expect(info?.worktrees).toHaveLength(1);
    expect(info?.worktrees[0].isMain).toBe(true);

    const wt = await addWorktree({ cwd: repo, path: join(dir, "repo-feature"), branch: "feature", createBranch: true });
    const after = await repoInfo(repo);
    expect(after?.worktrees.map((w) => w.branch).sort()).toEqual(["feature", "main"]);
    expect(after?.branches).toContain("feature");

    expect((await worktreeSafety(repo, wt)).clean).toBe(true);
    writeFileSync(join(wt, "dirty.txt"), "x");
    const s = await worktreeSafety(repo, wt);
    expect(s.clean).toBe(false);
    expect(s.changes[0]).toContain("dirty.txt");

    await expect(removeWorktree({ cwd: repo, path: wt, force: false })).rejects.toThrow();
    await removeWorktree({ cwd: repo, path: wt, force: true });
    expect((await repoInfo(repo))?.worktrees).toHaveLength(1);
    expect(await repoInfo(dir)).toBeUndefined();
  });
});
