/** Tiny subsequence fuzzy match. Returns a score (higher is better) or -1 for no match. */
export function fuzzyScore(query: string, text: string): number {
  if (!query) return 0;
  const q = query.toLowerCase();
  const t = text.toLowerCase();
  let qi = 0;
  let score = 0;
  let streak = 0;
  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) {
      qi++;
      streak++;
      score += streak * 2 + (ti === 0 || /[\s/_\-.]/.test(t[ti - 1]) ? 3 : 0);
    } else {
      streak = 0;
    }
  }
  if (qi < q.length) return -1;
  return score - t.length * 0.01;
}

export function fuzzyFilter<T>(items: T[], query: string, text: (item: T) => string): T[] {
  if (!query) return items;
  return items
    .map((item) => ({ item, s: fuzzyScore(query, text(item)) }))
    .filter((x) => x.s >= 0)
    .sort((a, b) => b.s - a.s)
    .map((x) => x.item);
}
