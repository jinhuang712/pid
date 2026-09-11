import { stat } from "node:fs/promises";
import type { SearchHit, SearchScope } from "@shared/sessions";

/**
 * Session search over Pi session files. The in-memory index is derived from
 * SessionManager.listAll and is rebuilt whenever a session directory changes.
 * Deleting it costs nothing; the JSONL files remain the only source of truth.
 */
const sdk = () => import("@earendil-works/pi-coding-agent");

interface Doc {
  path: string;
  id: string;
  cwd: string;
  name?: string;
  parentSessionPath?: string;
  created: string;
  modified: string;
  messageCount: number;
  firstMessage: string;
  text: string; // lowercased haystack
  raw: string; // original allMessagesText for snippets
}

let docs: Doc[] | undefined;
let builtAt = 0;
let building: Promise<Doc[]> | undefined;

async function sessionsDirMtime(): Promise<number> {
  try {
    const { SessionManager } = await sdk();
    // list() on an arbitrary cwd is cheap; we only need the sessions root, which listAll derives itself.
    void SessionManager;
    const home = process.env.HOME ?? "";
    const s = await stat(`${home}/.pi/agent/sessions`);
    return s.mtimeMs;
  } catch {
    return 0;
  }
}

async function build(): Promise<Doc[]> {
  const { SessionManager } = await sdk();
  const list = await SessionManager.listAll();
  return list.map((s) => ({
    path: s.path,
    id: s.id,
    cwd: s.cwd,
    name: s.name,
    parentSessionPath: s.parentSessionPath,
    created: s.created.toISOString(),
    modified: s.modified.toISOString(),
    messageCount: s.messageCount,
    firstMessage: s.firstMessage,
    text: `${s.name ?? ""}\n${s.cwd}\n${s.allMessagesText}`.toLowerCase(),
    raw: s.allMessagesText,
  }));
}

export async function ensureIndex(force = false): Promise<Doc[]> {
  if (building) return building;
  const mtime = await sessionsDirMtime();
  if (docs && !force && mtime <= builtAt) return docs;
  building = build().then((d) => {
    docs = d;
    builtAt = Date.now();
    building = undefined;
    return d;
  });
  return building;
}

export function dropIndex() {
  docs = undefined;
  builtAt = 0;
}

function snippet(raw: string, terms: string[]): string {
  const lower = raw.toLowerCase();
  let pos = -1;
  for (const t of terms) {
    pos = lower.indexOf(t);
    if (pos >= 0) break;
  }
  if (pos < 0) return raw.slice(0, 160);
  const start = Math.max(0, pos - 60);
  const end = Math.min(raw.length, pos + 120);
  return `${start > 0 ? "…" : ""}${raw.slice(start, end).replace(/\s+/g, " ")}${end < raw.length ? "…" : ""}`;
}

export async function searchSessions(query: string, scope: SearchScope, limit = 50): Promise<SearchHit[]> {
  const all = await ensureIndex();
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  const pool = scope.cwd ? all.filter((d) => d.cwd === scope.cwd) : all;
  const hits: SearchHit[] = [];
  for (const d of pool) {
    if (terms.length > 0 && !terms.every((t) => d.text.includes(t))) continue;
    let score = 0;
    for (const t of terms) {
      if (d.name?.toLowerCase().includes(t)) score += 10;
      if (d.firstMessage.toLowerCase().includes(t)) score += 5;
      score += Math.min(5, countOccurrences(d.text, t));
    }
    hits.push({
      session: {
        path: d.path,
        id: d.id,
        cwd: d.cwd,
        name: d.name,
        parentSessionPath: d.parentSessionPath,
        created: d.created,
        modified: d.modified,
        messageCount: d.messageCount,
        firstMessage: d.firstMessage,
      },
      snippet: snippet(d.raw, terms),
      score,
    });
  }
  hits.sort((a, b) => b.score - a.score || b.session.modified.localeCompare(a.session.modified));
  return hits.slice(0, limit);
}

function countOccurrences(hay: string, needle: string): number {
  let n = 0;
  let i = hay.indexOf(needle);
  while (i >= 0 && n < 50) {
    n++;
    i = hay.indexOf(needle, i + needle.length);
  }
  return n;
}
