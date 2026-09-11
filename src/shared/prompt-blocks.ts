/**
 * PID appends two kinds of visible blocks to a message before it reaches Pi: `$session` reference
 * blocks and an `<attachments>` path list. Titles and previews want the words the user typed.
 */
const REF_INTRO = "\n\nReferenced sessions (explicitly attached by the user):\n";

export function stripPromptBlocks(text: string): string {
  let t = text;
  const at = t.indexOf(REF_INTRO);
  if (at >= 0 && t.includes("<session-reference ", at)) t = t.slice(0, at);
  t = t.replace(/\n?<attachments>[\s\S]*?<\/attachments>/g, "");
  return t.trim();
}
