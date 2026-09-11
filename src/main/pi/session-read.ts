import { readFile } from "node:fs/promises";
import type { SessionMessage } from "@shared/sessions";

/**
 * Read-only view of a Pi session file's active branch, for explicit $session references.
 * Parses the JSONL directly; never writes. The file remains the source of truth.
 */
export async function readSessionMessages(path: string): Promise<SessionMessage[]> {
  const raw = await readFile(path, "utf8");
  type Entry = {
    type: string;
    id?: string;
    parentId?: string | null;
    message?: { role: string; content: unknown };
  };
  const entries: Entry[] = [];
  for (const line of raw.split("\n")) {
    if (!line.trim()) continue;
    try {
      entries.push(JSON.parse(line));
    } catch {
      // skip a torn trailing line
    }
  }
  const byId = new Map<string, Entry>();
  let leaf: Entry | undefined;
  for (const e of entries) {
    if (e.type === "session" || !e.id) continue;
    byId.set(e.id, e);
    leaf = e; // last appended entry is the leaf
  }
  // Walk leaf → root, then reverse: this is the active branch Pi would resume.
  const branch: Entry[] = [];
  for (let cur = leaf; cur; cur = cur.parentId ? byId.get(cur.parentId) : undefined) branch.push(cur);
  branch.reverse();
  const out: SessionMessage[] = [];
  for (const e of branch) {
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
