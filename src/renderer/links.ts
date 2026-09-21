/**
 * Links in the draft. A pasted or typed URL is folded into a short display form the moment it is
 * complete, so the composer shows "🔗host/…/page" instead of a line-long address. The full href
 * stays in the composer state and is put back into the text on send; Pi and the timeline only
 * ever see the real URL.
 */
export interface LinkRef {
  /** What sits in the draft: "🔗" + host + a squeezed path. Never contains whitespace. */
  display: string;
  href: string;
}

export const LINK_SIGIL = "🔗";

/** A raw URL: scheme, then anything but whitespace and delimiters; trailing punctuation is left out. */
export const URL_RE = /https?:\/\/[^\s<>()"']+[^\s<>()"'.,;:!?]/;
/** Display form: the sigil at start-of-text or after whitespace, then a run of non-space characters. */
export const LINK_DISPLAY_RE = new RegExp(`${LINK_SIGIL}[^\\s${LINK_SIGIL}]+`);

const MAX_PATH = 24;

/** "🔗project.larksuite.com/…/homepage": host without www, path whole if short, else "/…/last". */
export function linkDisplay(href: string): string {
  try {
    const u = new URL(href);
    const host = u.host.replace(/^www\./, "");
    let path = u.pathname.replace(/\/+$/, "");
    if (path.length > MAX_PATH) {
      const last = path.split("/").filter(Boolean).pop() ?? "";
      path = `/…/${last.length > MAX_PATH ? `${last.slice(0, MAX_PATH - 1)}…` : last}`;
    }
    return `${LINK_SIGIL}${host}${path}`;
  } catch {
    return `${LINK_SIGIL}${href}`;
  }
}

export interface Collapsed {
  text: string;
  /** Caret after the rewrite, when one was given. */
  caret?: number;
  /** Links not already known; the caller adds them to the draft's list. */
  added: LinkRef[];
}

/**
 * Fold the URLs in `text` into display forms. By default only a URL that is already followed by
 * whitespace (or the end of a paste) is folded, so a URL still being typed keeps its characters
 * until the user leaves it. A display form that already stands for a different href stays a raw
 * URL rather than becoming ambiguous.
 */
export function collapseLinks(
  text: string,
  known: LinkRef[],
  opts: { caret?: number; all?: boolean } = {},
): Collapsed {
  const byDisplay = new Map(known.map((l) => [l.display, l.href]));
  const added: LinkRef[] = [];
  let out = "";
  let last = 0;
  let caret = opts.caret;
  for (const m of text.matchAll(new RegExp(URL_RE.source, "g"))) {
    const at = m.index ?? 0;
    const href = m[0];
    const end = at + href.length;
    const followed = opts.all || (end < text.length && /\s/.test(text[end]));
    if (!followed) continue;
    const display = linkDisplay(href);
    const owner = byDisplay.get(display);
    if (owner !== undefined && owner !== href) continue;
    if (owner === undefined) {
      byDisplay.set(display, href);
      added.push({ display, href });
    }
    out += text.slice(last, at) + display;
    last = end;
    if (caret !== undefined && caret >= end) caret -= href.length - display.length;
    else if (caret !== undefined && caret > at) caret = out.length;
  }
  out += text.slice(last);
  return { text: out, caret, added };
}

/** Put the real URLs back. Unknown "🔗words" are left alone. */
export function expandLinks(text: string, links: LinkRef[]): { text: string; used: LinkRef[] } {
  const used: LinkRef[] = [];
  let out = text;
  for (const l of links) {
    // Whole token only: "🔗a.dev/x" must not eat the front of "🔗a.dev/xy".
    const re = new RegExp(`${escapeRe(l.display)}(?=\\s|$)`, "g");
    if (!re.test(out)) continue;
    used.push(l);
    // A function, not a replacement string: a URL may carry "$&", "$$" or "$'", which a string
    // replacement would expand instead of inserting.
    out = out.replace(re, () => l.href);
  }
  return { text: out, used };
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
