import type { AssistantMessage } from "@earendil-works/pi-ai";

export type Usage = AssistantMessage["usage"];

export const emptyUsage = (): Usage => ({
  input: 0,
  output: 0,
  cacheRead: 0,
  cacheWrite: 0,
  totalTokens: 0,
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
});

/** Sums two usage records field by field; optional fields stay absent unless present on either side. */
export function addUsage(a: Usage, b: Usage): Usage {
  const sum: Usage = {
    input: a.input + b.input,
    output: a.output + b.output,
    cacheRead: a.cacheRead + b.cacheRead,
    cacheWrite: a.cacheWrite + b.cacheWrite,
    totalTokens: a.totalTokens + b.totalTokens,
    cost: {
      input: a.cost.input + b.cost.input,
      output: a.cost.output + b.cost.output,
      cacheRead: a.cost.cacheRead + b.cost.cacheRead,
      cacheWrite: a.cost.cacheWrite + b.cost.cacheWrite,
      total: a.cost.total + b.cost.total,
    },
  };
  if (a.reasoning !== undefined || b.reasoning !== undefined)
    sum.reasoning = (a.reasoning ?? 0) + (b.reasoning ?? 0);
  return sum;
}

/** `12s`, `1m 53s`, `1h 04m`. Sub-second runs read as `<1s`. */
export function fmtDuration(ms: number): string {
  const s = Math.round(ms / 1000);
  if (s < 1) return "<1s";
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${String(s % 60).padStart(2, "0")}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${String(m % 60).padStart(2, "0")}m`;
}

/** `842`, `24.2k`, `1.3M`. */
export function fmtTokens(n: number): string {
  if (n < 1000) return String(n);
  if (n < 1_000_000) return `${trim(n / 1000)}k`;
  return `${trim(n / 1_000_000)}M`;
}

const trim = (x: number) => (x >= 100 ? String(Math.round(x)) : x.toFixed(1).replace(/\.0$/, ""));

/** `$0.42`, `$1.20`, `<$0.01`. Zero cost renders nothing. */
export function fmtCost(usd: number): string | undefined {
  if (usd <= 0) return undefined;
  if (usd < 0.01) return "<$0.01";
  return `$${usd.toFixed(2)}`;
}

export interface TurnSummary {
  /** One quiet line: `1m 53s · 24.2k tokens · $0.42`. Duration is omitted when unknown. */
  text: string;
  /** Hover detail: `12.1k in · 4.2k out · 50.3k cached`. */
  detail: string;
}

export function summarizeTurn(usage: Usage, durationMs?: number): TurnSummary | undefined {
  const tokens = usage.input + usage.output + usage.cacheRead + usage.cacheWrite;
  const parts: string[] = [];
  if (durationMs !== undefined) parts.push(fmtDuration(durationMs));
  if (tokens > 0) parts.push(`${fmtTokens(tokens)} tokens`);
  const cost = fmtCost(usage.cost.total);
  if (cost) parts.push(cost);
  if (parts.length === 0) return undefined;
  const detail = [
    `${fmtTokens(usage.input)} in`,
    `${fmtTokens(usage.output)} out`,
    `${fmtTokens(usage.cacheRead + usage.cacheWrite)} cached`,
  ].join(" · ");
  return { text: parts.join(" · "), detail };
}
