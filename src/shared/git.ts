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
