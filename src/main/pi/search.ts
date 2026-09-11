import type { SearchHit, SearchScope, SessionSummary } from "@shared/sessions";
import { readSessionMessages } from "./session-read";

/**
 * BM25 over Pi session files: one document per message plus one per session title.
 * The index is a derived in-memory structure, kept per file and refreshed when a file's
 * mtime or size changes. Deleting it costs nothing; the JSONL files stay the only source of truth.
 *
 * This module is pure Node: it runs inside the search utility process (see search-worker.ts)
 * so building the index never blocks the main process, and in-process as a fallback and in tests.
 */
const sdk = () => import("@earendil-works/pi-coding-agent");

interface Doc {
  session: SessionSummary;
  kind: "title" | "message";
  role?: "user" | "assistant";
  text: string;
  tf: Map<string, number>;
  len: number;
}

interface FileDocs {
  modified: number;
  size: number;
  docs: Doc[];
}

interface Index {
  docs: Doc[];
  df: Map<string, number>;
  avgLen: number;
  builtAt: number;
}

let index: Index | undefined;
let building: Promise<Index> | undefined;
/** Per-file documents, keyed by session path; only changed files are re-read. */
const files = new Map<string, FileDocs>();
/** A refresh checks every session file's mtime; do that at most this often. */
const RECHECK_MS = 2000;

/** Words for Latin script; character bigrams for CJK so Chinese queries match without segmentation. */
export function tokenize(text: string, opts: { parts?: boolean } = { parts: true }): string[] {
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
      if (opts.parts) for (const part of t.split(/[/\-.]/)) if (part && part !== t) out.push(part);
    }
  }
  return out;
}

type Info = {
  path: string;
  id: string;
  cwd: string;
  name?: string;
  parentSessionPath?: string;
  created: Date;
  modified: Date;
  messageCount: number;
  firstMessage: string;
};

function toSummary(s: Info): SessionSummary {
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

function makeDoc(
  session: SessionSummary,
  kind: Doc["kind"],
  text: string,
  role?: Doc["role"],
): Doc | undefined {
  const tokens = tokenize(text);
  if (tokens.length === 0) return undefined;
  const tf = new Map<string, number>();
  for (const t of tokens) tf.set(t, (tf.get(t) ?? 0) + 1);
  return { session, kind, role, text, tf, len: tokens.length };
}

async function docsFor(s: Info): Promise<Doc[]> {
  const session = toSummary(s);
  const docs: Doc[] = [];
  const title = makeDoc(session, "title", `${s.name ?? ""} ${s.firstMessage}`);
  if (title) docs.push(title);
  try {
    for (const m of await readSessionMessages(s.path)) {
      const d = makeDoc(session, "message", m.text.slice(0, 4000), m.role);
      if (d) docs.push(d);
    }
  } catch {
    // unreadable file: title only
  }
  return docs;
}

async function build(): Promise<Index> {
  const { SessionManager } = await sdk();
  const { stat } = await import("node:fs/promises");
  const list = (await SessionManager.listAll()) as Info[];
  const seen = new Set<string>();
  for (const s of list) {
    seen.add(s.path);
    // listAll reports the header's modified time; the file's own stat catches appended turns.
    let modified = s.modified.getTime();
    let size = -1;
    try {
      const st = await stat(s.path);
      modified = Math.max(modified, st.mtimeMs);
      size = st.size;
    } catch {
      // vanished between list and stat; keep whatever we had
    }
    const cur = files.get(s.path);
    if (cur && cur.modified === modified && cur.size === size) continue;
    files.set(s.path, { modified, size, docs: await docsFor(s) });
  }
  for (const p of files.keys()) if (!seen.has(p)) files.delete(p);
  const docs: Doc[] = [];
  for (const f of files.values()) docs.push(...f.docs);
  const df = new Map<string, number>();
  for (const d of docs) for (const t of d.tf.keys()) df.set(t, (df.get(t) ?? 0) + 1);
  const avgLen = docs.reduce((n, d) => n + d.len, 0) / Math.max(1, docs.length);
  return { docs, df, avgLen, builtAt: Date.now() };
}

export async function ensureIndex(force = false): Promise<Index> {
  if (building) return building;
  if (index && !force && Date.now() - index.builtAt < RECHECK_MS) return index;
  building = build().then(
    (i) => {
      index = i;
      building = undefined;
      return i;
    },
    (e) => {
      building = undefined;
      throw e;
    },
  );
  return building;
}

export function dropIndex() {
  index = undefined;
  files.clear();
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
  // Query terms stay whole (no part-splitting): "no-such-term" must not match every doc containing "no".
  const terms = [...new Set(tokenize(query, { parts: false }))];
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
    const covered = terms.filter((t) => d.tf.has(t)).length;
    if (covered === 0) continue;
    // docs matching more of the query outrank docs matching one term many times
    const score = bm25(idx, d, terms) * (1 + covered / terms.length);
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
