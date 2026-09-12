import type { SessionMessage, SessionSummary } from "@shared/sessions";

/**
 * Explicit $session reference. The referenced content becomes visible prompt text,
 * never hidden context. Scope and size are shown to the user before sending.
 */
export interface SessionReference {
  token: string; // e.g. "$a1b2c3d4"
  session: SessionSummary;
  messages: SessionMessage[]; // full active branch
}

export const MAX_MESSAGES = 20;
export const MAX_MESSAGE_CHARS = 2000;
export const MAX_TOTAL_CHARS = 16000;

export function refToken(s: SessionSummary): string {
  return `$${s.id.slice(0, 8)}`;
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

/** Replace each $token in the prompt with its rendered reference block. Unknown $words are left alone. */
export function expandReferences(
  prompt: string,
  refs: SessionReference[],
): { text: string; used: SessionReference[] } {
  const used: SessionReference[] = [];
  let text = prompt;
  for (const ref of refs) {
    if (!text.includes(ref.token)) continue;
    used.push(ref);
    const label = ref.session.name || ref.session.firstMessage.slice(0, 60) || ref.session.id;
    text = text.split(ref.token).join(`${ref.token} ("${label}")`);
  }
  if (used.length === 0) return { text, used };
  const blocks = used.map((r) => renderReference(r).text).join("\n\n");
  return { text: `${text}\n\nReferenced sessions (explicitly attached by the user):\n${blocks}`, used };
}

export function estimateTokens(chars: number): number {
  return Math.ceil(chars / 3.5);
}
