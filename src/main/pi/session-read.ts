import { readFile } from "node:fs/promises";
import type { AgentMessage } from "@earendil-works/pi-agent-core";
import type { SessionMessage } from "@shared/sessions";

/**
 * Read-only view of a Pi session file's active branch.
 * Parses the JSONL directly; never writes. The file remains the source of truth.
 */
type Entry = {
  type: string;
  id?: string;
  parentId?: string | null;
  message?: { role: string; content: unknown };
};

/** Entries on the branch Pi would resume: leaf → root, returned root-first. */
async function readBranch(path: string): Promise<Entry[]> {
  const raw = await readFile(path, "utf8");
  const byId = new Map<string, Entry>();
  let leaf: Entry | undefined;
  for (const line of raw.split("\n")) {
    if (!line.trim()) continue;
    let e: Entry;
    try {
      e = JSON.parse(line);
    } catch {
      continue; // torn trailing line
    }
    if (e.type === "session" || !e.id) continue;
    byId.set(e.id, e);
    leaf = e; // last appended entry is the leaf
  }
  const branch: Entry[] = [];
  for (let cur = leaf; cur; cur = cur.parentId ? byId.get(cur.parentId) : undefined) branch.push(cur);
  branch.reverse();
  return branch;
}

/**
 * The active branch as full agent messages — what `get_messages` would return once pi is up.
 * Lets the timeline show a resumed session before its process has started.
 */
export async function readSessionBranch(path: string): Promise<AgentMessage[]> {
  const out: AgentMessage[] = [];
  let branch: Entry[];
  try {
    branch = await readBranch(path);
  } catch (e) {
    // a session pi has not written yet has no file; the timeline just starts empty
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return out;
    throw e;
  }
  for (const e of branch) {
    if (e.type === "message" && e.message) out.push(e.message as AgentMessage);
  }
  return out;
}

/** User/assistant text only, for explicit $session references and search. */
export async function readSessionMessages(path: string): Promise<SessionMessage[]> {
  const out: SessionMessage[] = [];
  for (const e of await readBranch(path)) {
    if (e.type !== "message" || !e.message) continue;
    const { role, content } = e.message as { role: string; content: unknown };
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
