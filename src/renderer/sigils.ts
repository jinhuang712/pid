/**
 * Composer sigils. Each one has a stable meaning:
 *   /  Skill            @  File            #  Pi Action        $  Session Reference
 */
export type Sigil = "/" | "@" | "#" | "$";
export const SIGILS: readonly Sigil[] = ["/", "@", "#", "$"];

export interface ActiveToken {
  sigil: Sigil;
  /** Query typed after the sigil. */
  query: string;
  /** Index of the sigil character in the text. */
  start: number;
  /** Caret position (end of the token). */
  end: number;
}

/** Find a sigil token ending at the caret: sigil at start-of-text or after whitespace, no whitespace inside. */
export function activeToken(text: string, caret: number): ActiveToken | undefined {
  let i = caret - 1;
  while (i >= 0 && !/\s/.test(text[i])) i--;
  const start = i + 1;
  const ch = text[start] as Sigil | undefined;
  if (!ch || !SIGILS.includes(ch)) return undefined;
  if (start > 0 && !/\s/.test(text[start - 1])) return undefined;
  return { sigil: ch, query: text.slice(start + 1, caret), start, end: caret };
}

export function replaceToken(
  text: string,
  token: ActiveToken,
  replacement: string,
): { text: string; caret: number } {
  const next = `${text.slice(0, token.start)}${replacement} ${text.slice(token.end)}`;
  return { text: next, caret: token.start + replacement.length + 1 };
}
