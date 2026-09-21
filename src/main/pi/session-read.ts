import { readFile } from "node:fs/promises";
import type { AgentMessage } from "@earendil-works/pi-agent-core";
import {
  buildContextEntries,
  parseSessionEntries,
  type SessionEntry,
  sessionEntryToContextMessages,
} from "@earendil-works/pi-coding-agent";
import type { SessionMessage } from "@shared/sessions";

/**
 * Read-only views of a Pi session file's active branch. Parses the JSONL directly; never writes.
 * The file remains the source of truth.
 *
 * Two questions get two answers, because they disagree: what would Pi resume (the timeline's
 * preview), and what did anyone ever say here (search). Pi's own reader answers the first — the
 * branch is the leaf's ancestry, and a compaction stands in for everything before it — and it
 * exports no walker for the second, which is the one thing below that is PID's own.
 */

/** The file's entries, header removed. `undefined` when the file is not there yet. */
async function fileEntries(path: string): Promise<SessionEntry[] | undefined> {
  let raw: string;
  try {
    raw = await readFile(path, "utf8");
  } catch (e) {
    // a session pi has not written yet has no file; the timeline just starts empty
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw e;
  }
  // The header line names the session; everything after it is the tree.
  return parseSessionEntries(raw).filter((e): e is SessionEntry => e.type !== "session");
}

/** The active branch as full agent messages — what `get_messages` would return once pi is up. */
export async function readSessionBranch(path: string): Promise<AgentMessage[]> {
  const entries = await fileEntries(path);
  if (!entries) return [];
  return buildContextEntries(entries).flatMap((entry) => sessionEntryToContextMessages(entry));
}

/**
 * Every user/assistant message on the active branch, whether or not the branch's own context still
 * carries it.
 *
 * Search wants recall: "that thing I remember typing" is often exactly what a compaction folded
 * away, and the file still holds it. That is why this is not `readSessionMessages` — the two reads
 * answer different questions on purpose.
 */
export async function readSessionTranscript(path: string): Promise<SessionMessage[]> {
  const entries = await fileEntries(path);
  if (!entries) return [];
  const byId = new Map(entries.filter((e) => e.id).map((e) => [e.id, e] as const));
  const branch: SessionEntry[] = [];
  // The last entry appended is the leaf; a parent is the entry it names. A file whose chain loops
  // back on itself — hand-edited, or written by something that went wrong — must not walk forever:
  // a branch is never longer than the file it came from.
  let cur = entries.at(-1);
  while (cur && branch.length < entries.length) {
    branch.push(cur);
    cur = cur.parentId ? byId.get(cur.parentId) : undefined;
  }
  return textOfEntries(branch.reverse());
}

/**
 * User/assistant text only, and only what Pi's context still carries. This is the read for explicit
 * $session references: a compaction's summary and an extension's custom message have a role of
 * their own and none of their own text to report here.
 */
export async function readSessionMessages(path: string): Promise<SessionMessage[]> {
  const entries = await fileEntries(path);
  if (!entries) return [];
  return textOfEntries(buildContextEntries(entries));
}

/** The user/assistant text of the given entries, in order. */
function textOfEntries(entries: SessionEntry[]): SessionMessage[] {
  const out: SessionMessage[] = [];
  for (const entry of entries) {
    if (entry.type !== "message") continue;
    const { role, content } = entry.message as { role: string; content: unknown };
    if (role !== "user" && role !== "assistant") continue;
    const text = textOf(content);
    if (text.trim()) out.push({ role, text });
  }
  return out;
}

function textOf(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .map((c) =>
      c && typeof c === "object" && "type" in c && (c as { type: string }).type === "text"
        ? (c as { text: string }).text
        : "",
    )
    .filter(Boolean)
    .join("\n");
}
