/**
 * Where this session's work is isolated, when an extension has isolated it.
 *
 * Git is authoritative for worktrees and PID reads it directly for the folder tree. This is a
 * different fact: which worktree an *extension* has bound this session to, and how far it has
 * diverged from where it will land. Only the extension that made the binding knows that.
 *
 * It arrives on the widget channel as `<ns>:binding/v1`. The terminal gets the same numbers painted
 * into a status line; PID gets them as numbers, because a window cannot read escape codes.
 */

export interface BoundWorktree {
  branch: string;
  /** Where landing would merge to. */
  dest: string;
  ahead: number;
  behind: number;
  /** Working-tree entries `git status --porcelain` reports. */
  dirty: number;
  task?: string;
  worktreePath: string;
  originPath: string;
  /** The session is running inside the worktree, rather than owning one from its origin. */
  inside: boolean;
}

export interface ChildWorktree {
  branch: string;
  worktreePath: string;
}

/** A session is either in a worktree, or an origin with worktrees hanging off it. */
export interface WorktreeBinding {
  binding?: BoundWorktree;
  children?: ChildWorktree[];
}

/**
 * Parse the publisher's one-line JSON payload; undefined when cleared or malformed.
 *
 * Checked rather than trusted: this comes from code PID does not own, and a bad reading must read
 * as "no binding" rather than as a branch that does not exist.
 */
export function parseWorktree(lines: string[] | undefined): WorktreeBinding | undefined {
  if (!lines || lines.length === 0) return undefined;
  try {
    const v = JSON.parse(lines.join("")) as Partial<WorktreeBinding>;
    if (!v || typeof v !== "object") return undefined;
    const binding = cleanBinding(v.binding);
    const children = Array.isArray(v.children)
      ? v.children.filter(isChild).map((c) => ({ branch: c.branch, worktreePath: c.worktreePath }))
      : undefined;
    if (!binding && !children?.length) return undefined;
    return { ...(binding ? { binding } : {}), ...(children?.length ? { children } : {}) };
  } catch {
    return undefined;
  }
}

function isChild(c: unknown): c is ChildWorktree {
  const v = c as ChildWorktree | null;
  return !!v && typeof v.branch === "string" && typeof v.worktreePath === "string";
}

function cleanBinding(b: BoundWorktree | undefined): BoundWorktree | undefined {
  if (!b || typeof b.branch !== "string" || !b.branch) return undefined;
  const count = (n: unknown) => (typeof n === "number" && n >= 0 ? Math.trunc(n) : 0);
  return {
    branch: b.branch,
    dest: typeof b.dest === "string" ? b.dest : "",
    ahead: count(b.ahead),
    behind: count(b.behind),
    dirty: count(b.dirty),
    ...(typeof b.task === "string" && b.task ? { task: b.task } : {}),
    worktreePath: typeof b.worktreePath === "string" ? b.worktreePath : "",
    originPath: typeof b.originPath === "string" ? b.originPath : "",
    inside: b.inside === true,
  };
}

/** The header line: `wt-fix-login → main · ↑3 · 2 dirty`. */
export function worktreeSummary(w: WorktreeBinding | undefined): string | undefined {
  if (w?.binding) {
    const b = w.binding;
    const bits = [
      b.ahead ? `↑${b.ahead}` : undefined,
      b.behind ? `↓${b.behind}` : undefined,
      b.dirty ? `${b.dirty} dirty` : undefined,
    ].filter((x): x is string => x !== undefined);
    const head = b.dest ? `${b.branch} → ${b.dest}` : b.branch;
    return bits.length ? `${head} · ${bits.join(" · ")}` : head;
  }
  const kids = w?.children ?? [];
  if (kids.length === 0) return undefined;
  const shown = kids
    .slice(0, 3)
    .map((k) => k.branch)
    .join(" · ");
  return kids.length > 3 ? `${shown} +${kids.length - 3}` : shown;
}
