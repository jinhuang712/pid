/**
 * Local file paths in assistant output. A desktop client should treat "/Users/…/report.html" the
 * way Finder does: one click opens it, the folder is a hint, the full path lives in the tooltip.
 * This module only decides what is a path and how the token looks; opening happens in Markdown.tsx
 * through the shell bridge.
 */

/**
 * An absolute path: "~/…", "file://…", or a "/"-rooted run of at least two segments so that a lone
 * "/" or "a/b" in prose is left alone. Anchored: the marked tokenizer runs it at a candidate
 * position found by FILE_PATH_START_RE and trims TRAILING_PUNCT_RE off the match.
 */
const SEG = `[^\\s<>()"'\`\\[\\]{}]`;
export const FILE_PATH_RE = new RegExp(`^(?:~|file://|/${SEG}+)(?:/${SEG}+)+`);
/** Where a path may begin in prose: start of text, or after whitespace / an opening quote or bracket. */
export const FILE_PATH_START_RE = /(?:^|[\s("'「【（])(?=~\/|\/|file:\/\/)/;
/** Sentence punctuation glued to the end of a path is not part of it. */
export const TRAILING_PUNCT_RE = /[.,;:!?]+$/;

/** Whole-string test for hrefs and code spans. */
export function isFilePath(s: string): boolean {
  if (s.startsWith("file://")) return s.length > 7;
  if (s === "~" || s.startsWith("~/")) return true;
  return /^\/[^/\s]+\/[^\s]*$/.test(s) && !/^\/\//.test(s);
}

/** `file:///Users/a%20b` → `/Users/a b`; everything else unchanged. */
export function fromFileUrl(s: string): string {
  if (!s.startsWith("file://")) return s;
  try {
    return decodeURIComponent(s.slice(7).replace(/^\/\/[^/]*/, ""));
  } catch {
    return s.slice(7);
  }
}

export interface PathParts {
  /** Directory as shown: home collapsed to "~", at most the last two segments, "…/" when cut. */
  dir: string;
  name: string;
}

const KEEP_DIRS = 2;

/** "/Users/jin/dev/docs/html/x.html" → { dir: "…/docs/html/", name: "x.html" }. */
export function splitPath(path: string): PathParts {
  const clean = fromFileUrl(path).replace(/^\/Users\/[^/]+(?=\/|$)/, "~");
  const parts = clean.split("/");
  const name = parts.pop() ?? "";
  if (parts.length === 0) return { dir: "", name };
  if (parts.length <= KEEP_DIRS) return { dir: `${parts.join("/")}/`, name };
  return { dir: `…/${parts.slice(-KEEP_DIRS).join("/")}/`, name };
}

const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/**
 * The token: an anchor carrying the real path in `data-path` and the tooltip. `labelHtml`, already
 * rendered, replaces the shortened display when a markdown link supplied its own text.
 */
export function filePathHtml(path: string, labelHtml?: string): string {
  const full = fromFileUrl(path);
  const { dir, name } = splitPath(full);
  const body =
    labelHtml !== undefined && labelHtml !== "" && labelHtml !== path
      ? `<span class="file-name">${labelHtml}</span>`
      : `<span class="file-dir">${escapeHtml(dir)}</span><span class="file-name">${escapeHtml(name)}</span>`;
  return `<a class="file-link" href="#" data-path="${escapeHtml(full)}" title="${escapeHtml(full)}">${body}</a>`;
}
