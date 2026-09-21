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
 * Read-only view of a Pi session file's active branch. Parses the JSONL directly; never writes.
 * The file remains the source of truth.
 *
 * Pi's own reader walks the tree, and it is the one to ask. The branch is the leaf's ancestry, and
 * a compaction stands in for everything before it. PID filtered the raw entries itself, which
 * showed messages the session had already summarized away and hid what Pi's context carries — a
 * compaction summary, an extension's custom message — so the preview disagreed with `get_messages`
 * a moment later, once the process reported its own messages.
 */

/** The active branch as full agent messages — what `get_messages` would return once pi is up. */
export async function readSessionBranch(path: string): Promise<AgentMessage[]> {
  let raw: string;
  try {
    raw = await readFile(path, "utf8");
  } catch (e) {
    // a session pi has not written yet has no file; the timeline just starts empty
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw e;
  }
  // The header line names the session; everything after it is the tree.
  const entries = parseSessionEntries(raw).filter((e): e is SessionEntry => e.type !== "session");
  return buildContextEntries(entries).flatMap((entry) => sessionEntryToContextMessages(entry));
}

/**
 * User/assistant text only, for explicit $session references and search. The same branch as
 * `readSessionBranch`, minus what a person did not type or read: a compaction's summary and an
 * extension's custom message have a role of their own and none of their own text to report here.
 */
export async function readSessionMessages(path: string): Promise<SessionMessage[]> {
  const out: SessionMessage[] = [];
  for (const m of await readSessionBranch(path)) {
    if (m.role !== "user" && m.role !== "assistant") continue;
    const text = textOf(m.content);
    if (text.trim()) out.push({ role: m.role, text });
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
