/**
 * Local file paths in assistant output. A desktop client should treat "/Users/…/report.html" the
 * way Finder does: one click opens it, the folder is a hint, the full path lives in the tooltip.
 * This module only decides what is a path and how the token looks; opening happens in Markdown.tsx
 * through the shell bridge.
 */

/**
 * An absolute path: "~/…", "file://…", or a "/"-rooted run of at least two segments so that a lone
 * "/" or "a/b" in prose is left alone. Anchored: the marked tokenizer matches it at the position it
 * has reached, once startsAtBoundary allows it, and trims TRAILING_PUNCT_RE off the match.
 */
const SEG = `[^\\s<>()"'\`\\[\\]{}]`;
export const FILE_PATH_RE = new RegExp(`^(?:~|file://|/${SEG}+)(?:/${SEG}+)+`);
/** Where the next candidate sits, so marked ends the text run there and offers the tokenizer a turn. */
export const FILE_PATH_START_RE = /(?:^|[\s("'「【（])(?=~\/|\/|file:\/\/)/;

/** What may sit right before a path: whitespace, or an opening quote or bracket. */
const BOUNDARY_BEFORE_RE = /[\s("'「【（]/;
/**
 * The same rule as the second half of FILE_PATH_START_RE, applied where it counts. marked offers the
 * tokenizer a position without saying what precedes it, and an enumeration written "C/D/E" carries a
 * "/D/E" that FILE_PATH_RE is happy to match. A path starts a word; `before` is the text so far.
 */
export function startsAtBoundary(before: string): boolean {
  return before === "" || BOUNDARY_BEFORE_RE.test(before.slice(-1));
}
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
/**
 * Extensions that name a folder even though they read as a file name. Not a filesystem check —
 * rendering is synchronous — but these spellings are unambiguous: nobody puts "PID.app" in a file.
 */
const DIRECTORY_RE =
  /(?:^|\.)(?:app|framework|bundle|kext|plugin|prefpane|xcodeproj|xcworkspace|playground)$/i;

/** True when the token points at a folder rather than a file: a trailing slash or a known bundle. */
export function isDirectoryPath(path: string): boolean {
  const clean = path.replace(/\/$/, "");
  return /\/$/.test(path) || DIRECTORY_RE.test(clean.split("/").pop() ?? "");
}

/** "/Users/jin/dev/docs/html/x.html" → { dir: "…/docs/html/", name: "x.html" }. */
export function splitPath(path: string): PathParts {
  const clean = fromFileUrl(path)
    .replace(/\/$/, "")
    .replace(/^\/Users\/[^/]+(?=\/|$)/, "~");
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
  // A folder token opens in Finder and a file token in its app. They are the same click path
  // (see Markdown.tsx), so only the glyph and the CSS differ — hence the data-kind.
  const kind = isDirectoryPath(full) ? "dir" : "file";
  const body =
    labelHtml !== undefined && labelHtml !== "" && labelHtml !== path
      ? `<span class="file-name">${labelHtml}</span>`
      : `<span class="file-dir">${escapeHtml(dir)}</span><span class="file-name">${escapeHtml(name)}</span>`;
  return `<a class="file-link" href="#" data-path="${escapeHtml(full)}" data-kind="${kind}" title="${escapeHtml(full)}">${body}</a>`;
}
