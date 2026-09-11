/** Git facts as reported by git itself. PID stores none of this. */
export interface WorktreeInfo {
  path: string;
  branch?: string; // undefined when detached
  head: string;
  isMain: boolean;
  isCurrent: boolean;
  locked?: boolean;
  prunable?: boolean;
}

export interface RepoInfo {
  /** Top-level directory of the worktree that contains `cwd`. */
  root: string;
  /** Common .git directory shared by all worktrees of this repository. */
  commonDir: string;
  branch?: string;
  worktrees: WorktreeInfo[];
  branches: string[];
}

export interface AddWorktreeOptions {
  cwd: string;
  path: string;
  /** Existing branch to check out, or the name of a new branch when createBranch is true. */
  branch: string;
  createBranch: boolean;
  /** Start point for a new branch; defaults to HEAD. */
  from?: string;
}

export interface RemoveWorktreeOptions {
  cwd: string;
  path: string;
  /** Remove even when the worktree has local modifications. */
  force: boolean;
}

export interface WorktreeSafety {
  clean: boolean;
  /** `git status --porcelain` lines, capped. */
  changes: string[];
  isMain: boolean;
}
