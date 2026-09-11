import { execFileSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { repoInfo } from "../src/main/git";

const sh = (cwd: string, ...args: string[]) => execFileSync("git", args, { cwd, stdio: "pipe" }).toString();

describe("repoInfo (temp repo)", () => {
  it("reports branch and worktrees straight from git", async () => {
    const dir = mkdtempSync(join(tmpdir(), "pid-git-"));
    const repo = join(dir, "repo");
    sh(dir, "init", "-q", "-b", "main", repo);
    sh(repo, "-c", "user.name=t", "-c", "user.email=t@t", "commit", "-q", "--allow-empty", "-m", "init");
    sh(repo, "worktree", "add", "-q", "-b", "feature", join(dir, "repo-feature"));
    const info = await repoInfo(repo);
    expect(info?.branch).toBe("main");
    expect(info?.worktrees.map((w) => w.branch).sort()).toEqual(["feature", "main"]);
    expect(info?.worktrees.find((w) => w.isMain)?.path).toBe(info?.root);
    expect(await repoInfo(dir)).toBeUndefined();
  });
});
