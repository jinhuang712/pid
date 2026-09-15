/**
 * The matching layer behind the `@` file list. One rule set shared by the directory walker and
 * the git listing, so the two cannot drift apart on what "ignored" means.
 *
 * Patterns: `*` and `?` cross `/` (a user typing `*.log` means every log, not only root ones),
 * a trailing `/` marks a directory, and matching happens on the relative posix path so a single
 * pattern also covers everything under it. Blank lines and `#` comments are not patterns.
 */

/** Build output and VCS metadata: never in the list, even with an empty settings file. */
export const HARD_IGNORED = new Set([
  ".git",
  "node_modules",
  "dist",
  "out",
  "release",
  ".next",
  ".venv",
  "__pycache__",
]);

export interface ListOptions {
  /** Extra globs from Settings, on top of `.gitignore` and HARD_IGNORED. */
  ignorePatterns?: string[];
  /** Include dot-files. Off by default: `.DS_Store` next to a photo is noise, not a choice. */
  showHidden?: boolean;
}

function toRegExp(pattern: string): RegExp {
  // `*` and `?` cross `/` on purpose: a person typing `*.log` means every log in the tree, and
  // narrowing to the name alone would silently ignore the pattern for anything nested.
  const source = pattern
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*\*/g, "*")
    .replace(/\*/g, ".*")
    .replace(/\?/g, ".");
  return new RegExp(`^${source}$`);
}

/** One glob against one relative posix path. A pattern that cannot compile never matches. */
export function globMatch(pattern: string, path: string): boolean {
  try {
    return toRegExp(pattern.endsWith("/") ? pattern.slice(0, -1) : pattern).test(path);
  } catch {
    return false;
  }
}

/** `*.log`, a bare `build`, `tmp/` narrow the list; blank lines and `#` comments do not. */
export function activePatterns(ignorePatterns: string[] | undefined): string[] {
  const out: string[] = [];
  for (const raw of ignorePatterns ?? []) {
    const p = raw.trim();
    if (p && !p.startsWith("#")) out.push(p);
  }
  return out;
}

/** True when any segment is a dot-file: `a/.DS_Store` hides, `a/b.txt` does not. */
export function hasHiddenSegment(relativePath: string): boolean {
  return relativePath.split("/").some((s) => s.startsWith(".") && s.length > 1 && s !== "..");
}

function matchesAny(patterns: string[], relativePath: string): boolean {
  const name = relativePath.split("/").pop() ?? relativePath;
  return patterns.some((p) => globMatch(p, relativePath) || globMatch(p, name));
}

/** What a walker asks before descending. Hardcoded noise wins over any setting. */
export function ignoredDir(relativePath: string, opts: ListOptions): boolean {
  const name = relativePath.split("/").pop() ?? relativePath;
  if (HARD_IGNORED.has(name)) return true;
  return matchesAny(activePatterns(opts.ignorePatterns), relativePath);
}

/** What a walker asks before emitting a file. */
export function ignoredFile(relativePath: string, opts: ListOptions): boolean {
  if (!opts.showHidden && hasHiddenSegment(relativePath)) return true;
  return matchesAny(activePatterns(opts.ignorePatterns), relativePath);
}

/**
 * `git ls-files` answers in paths relative to the repo root. A caller listing `packages/a` of that
 * repo can only open paths under it, so entries beneath the queried folder are re-rooted. When a
 * repo has nothing there — an empty subdirectory of a repo — the answer is an empty list, not the
 * repo's files.
 */
export function gitRootRelative(prefix: string, files: string[]): string[] {
  if (prefix === "") return files;
  const under = `${prefix}/`;
  return files
    .filter((f) => f.startsWith(under))
    .map((f) => f.slice(under.length))
    .filter(Boolean);
}
