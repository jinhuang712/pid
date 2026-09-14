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
 * draft and the sent text: "$" + the session's label + "(" + the first 8 id chars + ")", readable
 * at a glance. A pasted token is rewritten to its display form as soon as the session is known.
 */
export const TOKEN_RE = /\$[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}/;
/** Display form; group 1 is the short id. The label may hold spaces but never "$", "(", ")" or a newline. */
export const DISPLAY_RE = /\$[^\n$()]{1,60}\(([0-9a-f]{8})\)/;

export const MAX_MESSAGES = 20;
export const MAX_MESSAGE_CHARS = 2000;
export const MAX_TOTAL_CHARS = 16000;

export function refToken(s: SessionSummary): string {
  return `$${s.id}`;
}

export function shortId(s: SessionSummary): string {
  return s.id.slice(0, 8);
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
  return s.id === id || (id.length === 8 && s.id.startsWith(id));
}

export interface RenderedReference {
  text: string;
  included: number;
  total: number;
  chars: number;
}

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
    `<session-reference token="${ref.token}" title="${label.replace(/"/g, "'")}" folder="${ref.session.cwd}" ` +
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
