import type { SessionMessage, SessionSummary } from "@shared/sessions";

/**
 * Explicit $session reference. The referenced content becomes visible prompt text,
 * never hidden context. Scope and size are shown to the user before sending.
 */
export interface SessionReference {
  token: string; // "$" + the full session id, e.g. "$01a08eb2-74e4-7740-a79d-92ddc4bcb638"
  session: SessionSummary;
  messages: SessionMessage[]; // full active branch
}

/**
 * Two spellings of one reference. The token is what gets copied and what the prompt block carries:
 * "$" + the full session id, unambiguous across machines. The display form is what sits in the
 * draft and the sent text: "$" + the session's label + "(" + the short id + ")", readable at a
 * glance. A pasted token is rewritten to its display form as soon as the session is known.
 */
export const SHORT_ID_CHARS = 8;

/**
 * The full token: "$" and the whole session id, in the charset Pi's `assertValidSessionId` allows
 * — `[A-Za-z0-9._-]`, starting and ending alphanumeric — rather than hex, which `pi --session-id`
 * can step outside.
 */
export const TOKEN_RE = /\$[A-Za-z0-9](?:[A-Za-z0-9._-]*[A-Za-z0-9])?/;
/**
 * A short id as it appears in the display form: never a "$", a ")" or a newline. The quote is
 * excluded so the legacy `$hex ("label")` form is not read as a display form whose short id is
 * `"label"` — Pi's ids are `[A-Za-z0-9._-]` and contain neither.
 */
export const SHORT_ID_PATTERN = '[^)\\n$"]{1,8}';
/**
 * The display form's shape, without a capture group — what a parser that merges it into its own
 * alternation needs, so the two cannot drift apart.
 */
export const DISPLAY_PATTERN = `\\$[^\\n$()]{1,60}\\(${SHORT_ID_PATTERN}\\)`;
/**
 * Display form; group 1 is the short id. The label may hold spaces but never "$", "(", ")" or a
 * newline.
 */
export const DISPLAY_RE = new RegExp(`\\$[^\\n$()]{1,60}\\((${SHORT_ID_PATTERN})\\)`);

export const MAX_MESSAGES = 20;
export const MAX_MESSAGE_CHARS = 2000;
export const MAX_TOTAL_CHARS = 16000;

export function refToken(s: SessionSummary): string {
  return `$${s.id}`;
}

/**
 * The short form of a session id: its last 8 characters.
 *
 * Pi's ids are UUIDv7, whose first 4 bytes are the creation time — two sessions made in the same
 * ~65 seconds share those, so the head cannot tell two sessions apart. The tail is random for a
 * UUIDv7 and stays distinct for a custom id (`pi --session-id`). An ambiguous short form is not
 * cosmetic: the draft resolves it to the first session that matches, block and all.
 */
export function shortId(s: SessionSummary): string {
  return s.id.slice(-SHORT_ID_CHARS);
}

/** Session name, else the first message, squeezed so it fits inside a display form. */
export function refLabel(s: SessionSummary): string {
  const raw = (s.name || s.firstMessage)
    .replace(/[\n$()]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return raw ? raw.slice(0, 40).trim() : "session";
}

export function refDisplay(s: SessionSummary): string {
  return `$${refLabel(s)}(${shortId(s)})`;
}

/** Does the session own this short id or full token? */
export function refMatches(s: SessionSummary, idOrToken: string): boolean {
  const id = idOrToken.startsWith("$") ? idOrToken.slice(1) : idOrToken;
  if (s.id === id) return true;
  // A short form names the tail of a longer id; an id that is already that short is itself, and
  // matched above.
  return id.length === SHORT_ID_CHARS && s.id.length > SHORT_ID_CHARS && s.id.endsWith(id);
}

export interface RenderedReference {
  text: string;
  included: number;
  total: number;
  chars: number;
}

/** Attribute-safe: the block is read back with a regex that stops at the closing quote. */
const quote = (s: string) => s.replace(/"/g, "'");

/**
 * Last MAX_MESSAGES messages, each clipped, total clipped. Deterministic and inspectable.
 * The character budget is filled newest-first so the most recent messages always survive;
 * the result is rendered in chronological order.
 */
export function renderReference(ref: SessionReference): RenderedReference {
  const total = ref.messages.length;
  const tail = ref.messages.slice(-MAX_MESSAGES);
  const lines: string[] = [];
  let chars = 0;
  for (let i = tail.length - 1; i >= 0; i--) {
    const m = tail[i];
    const body =
      m.text.length > MAX_MESSAGE_CHARS ? `${m.text.slice(0, MAX_MESSAGE_CHARS)}…[clipped]` : m.text;
    const line = `[${m.role}] ${body}`;
    if (chars + line.length > MAX_TOTAL_CHARS) break;
    lines.unshift(line);
    chars += line.length;
  }
  const included = lines.length;
  const label = ref.session.name || ref.session.firstMessage || ref.session.id;
  const header =
    `<session-reference token="${ref.token}" title="${quote(label)}" folder="${quote(ref.session.cwd)}" ` +
    `scope="last ${included} of ${total} messages, tool calls and thinking omitted">`;
  const text = `${header}\n${lines.join("\n")}\n</session-reference>`;
  return { text, included, total, chars: text.length };
}

/**
 * Append the rendered block of every referenced session. A raw $token still in the prompt is
 * spelled out in its display form first. Unknown $words are left alone.
 */
export function expandReferences(
  prompt: string,
  refs: SessionReference[],
): { text: string; used: SessionReference[] } {
  const used: SessionReference[] = [];
  let text = prompt;
  for (const ref of refs) {
    const display = refDisplay(ref.session);
    if (!text.includes(ref.token) && !text.includes(display)) continue;
    used.push(ref);
    text = text.split(ref.token).join(display);
  }
  if (used.length === 0) return { text, used };
  const blocks = used.map((r) => renderReference(r).text).join("\n\n");
  return { text: `${text}\n\nReferenced sessions (explicitly attached by the user):\n${blocks}`, used };
}

export function estimateTokens(chars: number): number {
  return Math.ceil(chars / 3.5);
}
