import { stat } from "node:fs/promises";
import type { SearchHit, SearchScope, SessionSummary } from "@shared/sessions";
import { readSessionMessages } from "./session-read";

/**
 * BM25 over Pi session files: one document per message plus one per session title.
 * The index is a derived in-memory structure, rebuilt when the sessions directory changes.
 * Deleting it costs nothing; the JSONL files stay the only source of truth.
 */
const sdk = () => import("@earendil-works/pi-coding-agent");

interface Doc {
  session: SessionSummary;
  kind: "title" | "message";
  role?: "user" | "assistant";
  text: string;
  tokens: string[];
  tf: Map<string, number>;
  len: number;
}

interface Index {
  docs: Doc[];
  df: Map<string, number>;
  avgLen: number;
  builtAt: number;
}

let index: Index | undefined;
let building: Promise<Index> | undefined;

/** Words for Latin script; character bigrams for CJK so Chinese queries match without segmentation. */
export function tokenize(text: string): string[] {
  const out: string[] = [];
  const lower = text.toLowerCase();
  for (const m of lower.matchAll(/[a-z0-9_][a-z0-9_.\-/]*|[぀-ヿ㐀-鿿]+/g)) {
    const t = m[0];
    if (/^[぀-ヿ㐀-鿿]/.test(t)) {
      if (t.length === 1) out.push(t);
      for (let i = 0; i + 1 < t.length; i++) out.push(t.slice(i, i + 2));
    } else {
      out.push(t);
      // also index path/identifier parts: "src/renderer/App.tsx" → src, renderer, app.tsx
      for (const part of t.split(/[/\-.]/)) if (part && part !== t) out.push(part);
    }
  }
  return out;
}

async function sessionsDirMtime(): Promise<number> {
  try {
    const s = await stat(`${process.env.HOME ?? ""}/.pi/agent/sessions`);
    return s.mtimeMs;
  } catch {
    return 0;
  }
}

function toSummary(s: {
  path: string;
  id: string;
  cwd: string;
  name?: string;
  parentSessionPath?: string;
  created: Date;
  modified: Date;
  messageCount: number;
  firstMessage: string;
}): SessionSummary {
  return {
    path: s.path,
    id: s.id,
    cwd: s.cwd,
    name: s.name,
    parentSessionPath: s.parentSessionPath,
    created: s.created.toISOString(),
    modified: s.modified.toISOString(),
    messageCount: s.messageCount,
    firstMessage: s.firstMessage,
  };
}

async function build(): Promise<Index> {
  const { SessionManager } = await sdk();
  const list = await SessionManager.listAll();
  const docs: Doc[] = [];
  const add = (session: SessionSummary, kind: Doc["kind"], text: string, role?: Doc["role"]) => {
    const tokens = tokenize(text);
    if (tokens.length === 0) return;
    const tf = new Map<string, number>();
    for (const t of tokens) tf.set(t, (tf.get(t) ?? 0) + 1);
    docs.push({ session, kind, role, text, tokens, tf, len: tokens.length });
  };
  for (const s of list) {
    const session = toSummary(s);
    add(session, "title", `${s.name ?? ""} ${s.firstMessage}`);
    try {
      for (const m of await readSessionMessages(s.path))
        add(session, "message", m.text.slice(0, 4000), m.role);
    } catch {
      // unreadable file: title only
    }
  }
  const df = new Map<string, number>();
  for (const d of docs) for (const t of d.tf.keys()) df.set(t, (df.get(t) ?? 0) + 1);
  const avgLen = docs.reduce((n, d) => n + d.len, 0) / Math.max(1, docs.length);
  return { docs, df, avgLen, builtAt: Date.now() };
}

export async function ensureIndex(force = false): Promise<Index> {
  if (building) return building;
  const mtime = await sessionsDirMtime();
  if (index && !force && mtime <= index.builtAt) return index;
  building = build().then((i) => {
    index = i;
    building = undefined;
    return i;
  });
  return building;
}

export function dropIndex() {
  index = undefined;
}

const K1 = 1.2;
const B = 0.75;

function bm25(idx: Index, d: Doc, terms: string[]): number {
  const N = idx.docs.length;
  let score = 0;
  for (const t of terms) {
    const f = d.tf.get(t);
    if (!f) continue;
    const n = idx.df.get(t) ?? 0;
    const idf = Math.log(1 + (N - n + 0.5) / (n + 0.5));
    score += idf * ((f * (K1 + 1)) / (f + K1 * (1 - B + (B * d.len) / idx.avgLen)));
  }
  return score;
}

function snippet(text: string, terms: string[]): string {
  const lower = text.toLowerCase();
  let pos = -1;
  for (const t of terms) {
    pos = lower.indexOf(t);
    if (pos >= 0) break;
  }
  if (pos < 0) return text.slice(0, 140).replace(/\s+/g, " ");
  const start = Math.max(0, pos - 50);
  const end = Math.min(text.length, pos + 110);
  return `${start > 0 ? "…" : ""}${text.slice(start, end).replace(/\s+/g, " ")}${end < text.length ? "…" : ""}`;
}

/** Best hit per session: title matches rank as sessions, message matches carry the matching message. */
export async function searchSessions(query: string, scope: SearchScope, limit = 30): Promise<SearchHit[]> {
  const idx = await ensureIndex();
  const terms = [...new Set(tokenize(query))];
  const bySession = new Map<string, SearchHit>();
  const pool = scope.cwd ? idx.docs.filter((d) => d.session.cwd === scope.cwd) : idx.docs;
  if (terms.length === 0) {
    // empty query: most recent sessions
    for (const d of pool) {
      if (d.kind !== "title" || bySession.has(d.session.path)) continue;
      bySession.set(d.session.path, { session: d.session, snippet: "", score: 0, kind: "title" });
    }
    return [...bySession.values()]
      .sort((a, b) => b.session.modified.localeCompare(a.session.modified))
      .slice(0, limit);
  }
  for (const d of pool) {
    const score = bm25(idx, d, terms);
    if (score <= 0) continue;
    const boosted = d.kind === "title" ? score * 1.5 : score;
    const cur = bySession.get(d.session.path);
    if (!cur || boosted > cur.score) {
      bySession.set(d.session.path, {
        session: d.session,
        snippet: d.kind === "message" ? snippet(d.text, terms) : "",
        score: boosted,
        kind: d.kind,
        role: d.role,
      });
    }
  }
  return [...bySession.values()]
    .sort((a, b) => b.score - a.score || b.session.modified.localeCompare(a.session.modified))
    .slice(0, limit);
}
