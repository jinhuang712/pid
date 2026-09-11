import { execFile } from "node:child_process";
import { resolve } from "node:path";
import { promisify } from "node:util";
import type {
  AddWorktreeOptions,
  RemoveWorktreeOptions,
  RepoInfo,
  WorktreeInfo,
  WorktreeSafety,
} from "@shared/git";

const run = promisify(execFile);

/** Thin wrapper over the git CLI. Every answer here comes from git; PID keeps no worktree model. */
async function git(cwd: string, args: string[]): Promise<string> {
  const { stdout } = await run("git", args, { cwd, maxBuffer: 16 * 1024 * 1024 });
  return stdout;
}

export async function repoInfo(cwd: string): Promise<RepoInfo | undefined> {
  let root: string;
  let commonDir: string;
  try {
    root = (await git(cwd, ["rev-parse", "--show-toplevel"])).trim();
    commonDir = resolve(root, (await git(cwd, ["rev-parse", "--git-common-dir"])).trim());
  } catch {
    return undefined; // not a git repository
  }
  const branch = (await git(cwd, ["rev-parse", "--abbrev-ref", "HEAD"])).trim();
  const worktrees = parseWorktrees(await git(cwd, ["worktree", "list", "--porcelain"]), root);
  const branches = (await git(cwd, ["for-each-ref", "--format=%(refname:short)", "refs/heads"]))
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
  return { root, commonDir, branch: branch === "HEAD" ? undefined : branch, worktrees, branches };
}

function parseWorktrees(porcelain: string, currentRoot: string): WorktreeInfo[] {
  const out: WorktreeInfo[] = [];
  let cur: Partial<WorktreeInfo> | undefined;
  const flush = () => {
    if (cur?.path) {
      out.push({
        path: cur.path,
        branch: cur.branch,
        head: cur.head ?? "",
        isMain: out.length === 0,
        isCurrent: cur.path === currentRoot,
        locked: cur.locked,
        prunable: cur.prunable,
      });
    }
    cur = undefined;
  };
  for (const line of porcelain.split("\n")) {
    if (line.startsWith("worktree ")) {
      flush();
      cur = { path: line.slice("worktree ".length) };
    } else if (line.startsWith("HEAD ")) {
      if (cur) cur.head = line.slice(5);
    } else if (line.startsWith("branch ")) {
      if (cur) cur.branch = line.slice(7).replace(/^refs\/heads\//, "");
    } else if (line.startsWith("locked")) {
      if (cur) cur.locked = true;
    } else if (line.startsWith("prunable")) {
      if (cur) cur.prunable = true;
    } else if (line === "") {
      flush();
    }
  }
  flush();
  return out;
}

export async function addWorktree(o: AddWorktreeOptions): Promise<string> {
  const args = ["worktree", "add"];
  if (o.createBranch) args.push("-b", o.branch, o.path, o.from ?? "HEAD");
  else args.push(o.path, o.branch);
  await git(o.cwd, args);
  return resolve(o.cwd, o.path);
}

export async function worktreeSafety(cwd: string, path: string): Promise<WorktreeSafety> {
  const info = await repoInfo(cwd);
  const isMain = info?.worktrees.find((w) => w.path === path)?.isMain ?? false;
  let changes: string[] = [];
  try {
    changes = (await git(path, ["status", "--porcelain"])).split("\n").filter(Boolean).slice(0, 50);
  } catch {
    // unreadable worktree: report as unclean so the UI asks before forcing
    changes = ["(could not read status)"];
  }
  return { clean: changes.length === 0, changes, isMain };
}

export async function removeWorktree(o: RemoveWorktreeOptions): Promise<void> {
  const args = ["worktree", "remove"];
  if (o.force) args.push("--force");
  args.push(o.path);
  await git(o.cwd, args);
}
