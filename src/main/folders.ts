import { existsSync, readdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import type { FolderSuggestion } from "@shared/sessions";

const SKIP = new Set(["node_modules", ".git", "Library", ".Trash", ".cache", ".npm", ".pnpm-store"]);

function isDir(p: string): boolean {
  try {
    return statSync(p).isDirectory();
  } catch {
    return false;
  }
}
const isRepo = (p: string) => existsSync(join(p, ".git"));

function children(dir: string, limit = 200): string[] {
  try {
    return readdirSync(dir, { withFileTypes: true })
      .filter((e) => e.isDirectory() && !e.name.startsWith(".") && !SKIP.has(e.name))
      .slice(0, limit)
      .map((e) => join(dir, e.name));
  } catch {
    return [];
  }
}

/** Subsequence match with a bonus for prefix / segment starts; -1 when no match. */
function score(query: string, text: string): number {
  if (!query) return 0;
  const q = query.toLowerCase();
  const t = text.toLowerCase();
  if (t === q) return 1000;
  if (t.startsWith(q)) return 500 - t.length;
  let qi = 0;
  let s = 0;
  let streak = 0;
  for (let i = 0; i < t.length && qi < q.length; i++) {
    if (t[i] === q[qi]) {
      qi++;
      streak++;
      s += streak * 2 + (i === 0 || /[\s/_\-.]/.test(t[i - 1]) ? 3 : 0);
    } else streak = 0;
  }
  return qi === q.length ? s - t.length * 0.01 : -1;
}

/**
 * Folders worth offering for a query: the typed path itself when it exists, recent folders,
 * and the neighbourhood of recent folders (their siblings and direct children).
 */
export function suggestFolders(query: string, recent: string[], limit = 12): FolderSuggestion[] {
  const out = new Map<string, FolderSuggestion>();
  const q = query.trim();

  // 1. a path the user typed: ~/x, /abs, or a path relative to a recent folder's parent
  if (q.startsWith("~") || q.startsWith("/")) {
    const abs = resolve(q.startsWith("~") ? q.replace(/^~/, homedir()) : q);
    if (isDir(abs)) out.set(abs, { path: abs, source: "typed", isRepo: isRepo(abs) });
    // complete the last segment against its parent directory
    const parent = existsSync(abs) ? abs : dirname(abs);
    const partial = existsSync(abs) ? "" : basename(abs).toLowerCase();
    for (const c of children(parent)) {
      if (basename(c).toLowerCase().startsWith(partial) && !out.has(c))
        out.set(c, { path: c, source: "typed", isRepo: isRepo(c) });
    }
  }

  // 2. recent folders and their neighbourhood
  const nearby = new Set<string>();
  for (const r of recent) {
    for (const c of children(dirname(r))) nearby.add(c);
    for (const c of children(r, 60)) nearby.add(c);
  }
  const scored: { s: FolderSuggestion; score: number }[] = [];
  for (const r of recent) {
    const sc = q ? Math.max(score(q, basename(r)), score(q, r.replace(homedir(), "~"))) : 100;
    if (sc >= 0) scored.push({ s: { path: r, source: "recent", isRepo: isRepo(r) }, score: sc + 50 });
  }
  if (q) {
    for (const n of nearby) {
      if (recent.includes(n)) continue;
      const sc = score(q, basename(n));
      if (sc >= 0) scored.push({ s: { path: n, source: "nearby", isRepo: isRepo(n) }, score: sc });
    }
  }
  scored.sort((a, b) => b.score - a.score);
  for (const { s } of scored) if (!out.has(s.path)) out.set(s.path, s);
  return [...out.values()].slice(0, limit);
}
