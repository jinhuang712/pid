/**
 * PID appends two kinds of visible blocks to a message before it reaches Pi: `$session` reference
 * blocks and an `<attachments>` path list. Pi itself replaces a leading `/skill-name` with the
 * skill's whole SKILL.md wrapped in `<skill>`. Titles and previews want the words the user typed.
 */
const REF_INTRO = "\n\nReferenced sessions (explicitly attached by the user):\n";

/** Mirrors Pi's `parseSkillBlock`: name, location, body, then optional trailing user text. */
export const SKILL_BLOCK_RE =
  /^<skill name="([^"]+)" location="([^"]+)">\n([\s\S]*?)\n<\/skill>(?:\n\n([\s\S]*))?$/;

export function stripPromptBlocks(text: string): string {
  let t = text.replace(SKILL_BLOCK_RE, (_, name: string, _loc, _body, args?: string) =>
    args?.trim() ? `/${name} ${args.trim()}` : `/${name}`,
  );
  const at = t.indexOf(REF_INTRO);
  if (at >= 0 && t.includes("<session-reference ", at)) t = t.slice(0, at);
  t = t.replace(/\n?<attachments>[\s\S]*?<\/attachments>/g, "");
  return t.trim();
}
