/**
 * Account-level plan usage: how much of the current provider's quota this account has spent.
 *
 * This is a different number from the per-session token and cost totals PID already sums out of
 * `message.usage`. Those say what this conversation cost; this says how close the account is to
 * being cut off, which is the thing you want to know before starting a long run.
 *
 * Pi's RPC surface carries no quota data at all — the only quota awareness in the coding agent is
 * a friendlier error message on a 429 — so PID's main process talks to the providers itself and
 * publishes the snapshot below. The shape follows pi-x-footer's `provider_usage` segment so both
 * read the same way: every window is a percentage ALREADY USED plus the moment it resets.
 */

export const USAGE_PROVIDERS = [
  "openai-codex",
  "opencode-go",
  "volcengine-agent-plan",
  "volcengine-coding-plan",
] as const;

export type UsageProviderId = (typeof USAGE_PROVIDERS)[number];

/** Short name shown in the bar. Long enough to recognise, short enough for one line. */
export const PROVIDER_LABEL: Record<UsageProviderId, string> = {
  "openai-codex": "Codex",
  "opencode-go": "OpenCode Go",
  "volcengine-agent-plan": "Agent Plan",
  "volcengine-coding-plan": "Coding Plan",
};

/**
 * The three buckets every provider is normalised onto. Upstream names differ — Codex calls them
 * primary and secondary, the Ark coding plan calls its short one a session — but they all answer
 * "how much of the short / medium / long allowance is gone".
 */
export const USAGE_WINDOWS = ["5h", "week", "month"] as const;
export type UsageWindowId = (typeof USAGE_WINDOWS)[number];

/** Written as the bar shows them: tracked small caps, so a duration not a word. */
export const WINDOW_LABEL: Record<UsageWindowId, string> = {
  "5h": "5H",
  week: "7D",
  month: "30D",
};

/**
 * `expired` means the reset moment has already passed and we have not refetched yet; `unknown` is
 * a window we know exists but have no number for, which is what the first fetch of a session looks
 * like. Both render muted rather than green, because a stale zero reads as "plenty left".
 */
export type UsageWindowState = "normal" | "warning" | "error" | "expired" | "unknown";

export interface UsageWindow {
  id: UsageWindowId;
  /** Percent of the allowance consumed, 0-100. Absent when the provider did not report one. */
  usedPercent?: number;
  /** Epoch ms when this window rolls over. Absent when the provider did not report one. */
  resetAt?: number;
  state: UsageWindowState;
}

/**
 * `stale` is the interesting one: a fetch failed but a previous reading exists, so the bar keeps
 * the old numbers and marks them rather than blinking out. `unavailable` means there is nothing to
 * show at all — no adapter for this model, a custom base URL, or no credential — and the bar hides
 * its provider half instead of rendering an apology.
 */
export type UsageSnapshotState = "fresh" | "loading" | "stale" | "error" | "unavailable";

export type UsageErrorCode =
  | "auth"
  | "network"
  | "timeout"
  | "unsupported"
  | "invalid-response"
  | "no-subscription";

export interface ProviderUsage {
  provider: UsageProviderId;
  state: UsageSnapshotState;
  /** Epoch ms of the reading the windows came from. Reset countdowns are relative to this. */
  fetchedAt?: number;
  errorCode?: UsageErrorCode;
  /** Human-readable detail for the settings page. Never rendered in the bar itself. */
  errorMessage?: string;
  windows: UsageWindow[];
}

/** What the main process publishes; `undefined` provider means no model is selected yet. */
export interface UsageSnapshot {
  usage?: ProviderUsage;
  /** Providers PID could reach if you switched to a model that uses them, for the settings page. */
  providers: ProviderHealth[];
}

/**
 * One row of the settings page's provider list.
 *
 * The states are deliberately narrow about what was actually checked. `ready` means a credential
 * was found on disk — that is a fact. `unknown` means the machinery is present but nothing has
 * been asked yet, which is all that can be said about a CLI-backed plan until a model on it
 * actually runs: proving an Ark login works means spending a real query.
 */
export interface ProviderHealth {
  provider: UsageProviderId;
  /** `active` is the provider behind the model running right now. */
  state: "active" | "ready" | "unknown" | "signed-out" | "unsupported";
  detail?: string;
}

// ---------------------------------------------------------------------------
// Pure helpers. Kept here rather than in the component so they can be tested
// without a renderer, and so the settings preview and the bar agree by
// construction instead of by two copies of the same rounding.
// ---------------------------------------------------------------------------

export interface UsageThresholds {
  warning: number;
  danger: number;
}

export const DEFAULT_THRESHOLDS: UsageThresholds = { warning: 70, danger: 90 };

export type UsageTone = "ok" | "warn" | "danger" | "muted";

/**
 * Colour for one window. A state the provider itself flagged wins over the percentage: when an API
 * says it is rate-limiting you, that is not a number to re-evaluate against your own slider.
 */
export function windowTone(w: UsageWindow, t: UsageThresholds = DEFAULT_THRESHOLDS): UsageTone {
  if (w.state === "expired") return "danger";
  if (w.state === "unknown") return "muted";
  if (w.state === "error") return "danger";
  if (w.state === "warning") return "warn";
  if (w.usedPercent === undefined) return "muted";
  if (w.usedPercent >= t.danger) return "danger";
  if (w.usedPercent >= t.warning) return "warn";
  return "ok";
}

/** The tone the row as a whole takes: the worst of its windows. */
export function snapshotTone(u: ProviderUsage | undefined, t?: UsageThresholds): UsageTone {
  if (!u || u.state === "loading" || u.state === "unavailable") return "muted";
  const order: UsageTone[] = ["muted", "ok", "warn", "danger"];
  let worst: UsageTone = "muted";
  for (const w of u.windows) {
    const tone = windowTone(w, t);
    if (order.indexOf(tone) > order.indexOf(worst)) worst = tone;
  }
  return worst;
}

/**
 * How long until this window rolls over: "45m", "2h 13m", "6d 14h".
 *
 * Counted from the reading rather than from now — a clock that ticked between fetches would imply
 * a precision the 30-second refresh does not have.
 */
export function formatResetIn(ms: number): string {
  if (ms <= 0) return "now";
  const minutes = Math.ceil(ms / 60_000);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const restMinutes = minutes % 60;
  if (hours < 24) return restMinutes > 0 ? `${hours}h ${restMinutes}m` : `${hours}h`;
  const days = Math.floor(hours / 24);
  const restHours = hours % 24;
  return restHours > 0 ? `${days}d ${restHours}h` : `${days}d`;
}

/**
 * The moment a window rolls over, in local time: "14:13" today, "Tue 14:13" later this week,
 * "22 Sep" beyond that. The date is dropped whenever the time alone is unambiguous, because on
 * one line every character has to earn its place.
 */
export function formatResetAt(at: number, now: number): string {
  const when = new Date(at);
  if (at <= now) return "now";
  const clock = when.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const sameDay = new Date(now).toDateString() === when.toDateString();
  if (sameDay) return clock;
  if (at - now < 7 * 24 * 3_600_000) {
    return `${when.toLocaleDateString(undefined, { weekday: "short" })} ${clock}`;
  }
  return when.toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

/** Whole percents. A quota reading is never precise enough for a decimal place. */
export function formatUsedPercent(percent: number | undefined): string {
  if (percent === undefined) return "—";
  return `${Math.round(percent)}%`;
}

/**
 * Derive a window's own state from its numbers. Used by the adapters at fetch time so a snapshot
 * that sat in the cache across a reset renders as expired rather than as its old percentage.
 */
export function stateForPercent(
  percent: number | undefined,
  resetAt: number | undefined,
  now: number,
  t: UsageThresholds = DEFAULT_THRESHOLDS,
): UsageWindowState {
  if (percent === undefined) return "unknown";
  if (resetAt !== undefined && resetAt <= now) return "expired";
  if (percent >= t.danger) return "error";
  if (percent >= t.warning) return "warning";
  return "normal";
}
