/**
 * Raw provider payloads → the three-bucket `UsageWindow` shape the bar renders.
 *
 * Each provider names its windows differently and answers with a different envelope; the field
 * names below are the real ones, taken from the payloads pi-x-footer parses. Everything is read
 * defensively: a quota reading is a nicety, and a provider changing a key should dim one row of
 * the footer rather than throw inside the main process.
 */

import {
  type ProviderUsage,
  stateForPercent,
  type UsageErrorCode,
  type UsageWindow,
  type UsageWindowId,
} from "@shared/usage";

/** A fetch that could not produce windows. The code decides whether the row hides or goes stale. */
export class UsageFailure extends Error {
  constructor(
    readonly code: UsageErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "UsageFailure";
  }
}

/**
 * Codex answers with `rate_limit.primary_window` (the short rolling allowance) and
 * `secondary_window` (the weekly one). It can also carry `additional_rate_limits`, which are
 * further buckets with no stable meaning across plans — PID shows the two named windows and
 * leaves the rest, rather than inventing a label for a bucket it cannot describe.
 */
export function normalizeCodex(payload: unknown, now: number): UsageWindow[] {
  const root = record(payload);
  const limits = root && record(root.rate_limit);
  if (!limits) throw new UsageFailure("invalid-response", "Codex usage response had no rate_limit.");
  const windows: UsageWindow[] = [];
  for (const [key, id] of [
    ["primary_window", "5h"],
    ["secondary_window", "week"],
  ] as const) {
    const w = record(limits[key]);
    if (!w) continue;
    const percent = nonNegative(w.used_percent);
    if (percent === undefined) continue;
    windows.push(window(id, percent, epochMs(w.reset_at), now));
  }
  if (windows.length === 0)
    throw new UsageFailure("invalid-response", "Codex usage response had no usage windows.");
  return windows;
}

/**
 * OpenCode Go reports a `status` per window alongside the percentage. `rate-limited` is the
 * provider saying it is already throttling you, which outranks whatever the percentage claims.
 */
export function normalizeOpenCodeGo(payload: unknown, now: number): UsageWindow[] {
  const root = record(payload);
  const usage = root && record(root.usage);
  if (!usage) throw new UsageFailure("invalid-response", "OpenCode Go response had no usage.");
  const windows: UsageWindow[] = [];
  for (const [key, id] of [
    ["rolling", "5h"],
    ["weekly", "week"],
    ["monthly", "month"],
  ] as const) {
    const w = record(usage[key]);
    if (!w) continue;
    const status = text(w.status);
    if (status !== "ok" && status !== "rate-limited") continue;
    const percent = nonNegative(w.percent);
    if (percent === undefined) continue;
    const next = window(id, percent, epochMs(w.resetsAt), now);
    if (status === "rate-limited" && next.state === "normal") next.state = "warning";
    windows.push(next);
  }
  if (windows.length === 0)
    throw new UsageFailure("invalid-response", "OpenCode Go response had no usage windows.");
  return windows;
}

/**
 * Both Ark plans come back through the same CLI with the same envelope: a list of products, one
 * of which is subscribed, each carrying periods keyed by a label. The coding plan calls its short
 * window a session rather than a duration, and reports only a percentage — no absolute allowance
 * exists upstream to show.
 */
export function normalizeArkPlan(
  payload: unknown,
  product: "agent-plan" | "coding-plan",
  now: number,
): UsageWindow[] {
  const root = record(payload);
  if (!root || !Array.isArray(root.items))
    throw new UsageFailure("invalid-response", `Ark ${product} response had no items.`);
  const item = root.items.map(record).find((c) => c?.subscribed === true);
  if (!item) throw new UsageFailure("no-subscription", `No active ${product} subscription.`);
  const periods = Array.isArray(item.periods) ? item.periods.map(record) : [];
  const shortWindow = product === "coding-plan" ? "session" : "5h";
  const windows: UsageWindow[] = [];
  for (const [label, id] of [
    [shortWindow, "5h"],
    ["weekly", "week"],
    ["monthly", "month"],
  ] as const) {
    const period = periods.find((p) => p?.label === label);
    if (!period) continue;
    const percent = nonNegative(period.percent);
    if (percent === undefined) continue;
    windows.push(window(id, percent, epochMs(period.reset_at), now));
  }
  if (windows.length === 0)
    throw new UsageFailure("invalid-response", `Ark ${product} response had no usage windows.`);
  return windows;
}

/**
 * Re-date a cached reading. Windows are stored with an absolute reset moment, so a snapshot that
 * outlived one of its resets has to say so rather than keep showing yesterday's percentage as if
 * it still applied.
 */
export function restate(usage: ProviderUsage, now: number): ProviderUsage {
  return {
    ...usage,
    windows: usage.windows.map((w) =>
      w.resetAt !== undefined && w.resetAt <= now ? { ...w, state: "expired" } : w,
    ),
  };
}

function window(id: UsageWindowId, percent: number, resetAt: number | undefined, now: number): UsageWindow {
  return {
    id,
    usedPercent: Math.min(100, percent),
    state: stateForPercent(percent, resetAt, now),
    ...(resetAt === undefined ? {} : { resetAt }),
  };
}

function record(v: unknown): Record<string, unknown> | undefined {
  return typeof v === "object" && v !== null && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : undefined;
}

function text(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}

function nonNegative(v: unknown): number | undefined {
  const n = typeof v === "string" && v.trim() ? Number(v) : v;
  return typeof n === "number" && Number.isFinite(n) && n >= 0 ? n : undefined;
}

/**
 * Providers date their resets three ways: an ISO string, epoch seconds, or epoch milliseconds.
 * The 1e12 line splits seconds from milliseconds — any plausible reset in seconds is far below it
 * and any in milliseconds is far above.
 */
function epochMs(v: unknown): number | undefined {
  if (typeof v === "string" && v.trim()) {
    const parsed = Date.parse(v);
    if (!Number.isNaN(parsed)) return parsed;
  }
  const n = nonNegative(v);
  if (n === undefined) return undefined;
  return n < 1e12 ? n * 1000 : n;
}
