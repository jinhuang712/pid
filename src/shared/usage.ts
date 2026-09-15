/**
 * Account-level plan usage: how much of the current provider's quota this account has spent.
 *
 * This is a different number from the per-session token and cost totals PID already sums out of
 * `message.usage`. Those say what this conversation cost; this says how close the account is to
 * being cut off, which is the thing you want to know before starting a long run.
 *
 * Pi carries no quota data — the only quota awareness in the coding agent is a friendlier error
 * message on a 429 — so an extension fetches it. PID used to do the same work again in its main
 * process, which was one job done twice. Now there is one fetcher: the extension publishes what it
 * computed on the widget channel and PID draws it.
 *
 * Which providers exist, which windows they report and what to call them are the extension's to
 * know. PID's part is the picture: order as given, labels as given, thresholds as the user set them
 * here.
 */

/**
 * `expired` means the reset moment has already passed and the extension has not refetched yet;
 * `unknown` is a window it knows exists but has no number for. Both render muted rather than green,
 * because a stale zero reads as "plenty left".
 */
export type UsageWindowState = "normal" | "warning" | "error" | "expired" | "unknown";

export interface UsageWindow {
  /** The publisher's own id. PID uses it as a key, never interprets it. */
  id: string;
  /** What to call this window, e.g. "5h", "wk". Travels with the data so PID needs no vocabulary. */
  label: string;
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

export interface ProviderUsage {
  provider: string;
  /** Short name for the bar. Falls back to `provider` when the publisher sends none. */
  providerLabel?: string;
  state: UsageSnapshotState;
  /** Epoch ms of the reading the windows came from. Reset countdowns are relative to this. */
  fetchedAt?: number;
  errorCode?: string;
  windows: UsageWindow[];
}

const SNAPSHOT_STATES: UsageSnapshotState[] = ["fresh", "loading", "stale", "error", "unavailable"];
const WINDOW_STATES: UsageWindowState[] = ["normal", "warning", "error", "expired", "unknown"];

/**
 * Parse the publisher's one-line JSON payload; undefined when the widget was cleared or malformed.
 *
 * Every field is checked rather than trusted: this crosses a process boundary from code PID does
 * not own, and a bad reading must read as "no quota" instead of painting nonsense.
 */
export function parseProviderUsage(lines: string[] | undefined): ProviderUsage | undefined {
  if (!lines || lines.length === 0) return undefined;
  try {
    const v = JSON.parse(lines.join("")) as Partial<ProviderUsage>;
    if (!v || typeof v.provider !== "string" || !Array.isArray(v.windows)) return undefined;
    const state = SNAPSHOT_STATES.includes(v.state as UsageSnapshotState)
      ? (v.state as UsageSnapshotState)
      : "unavailable";
    return {
      provider: v.provider,
      ...(typeof v.providerLabel === "string" ? { providerLabel: v.providerLabel } : {}),
      state,
      ...(typeof v.fetchedAt === "number" ? { fetchedAt: v.fetchedAt } : {}),
      ...(typeof v.errorCode === "string" ? { errorCode: v.errorCode } : {}),
      windows: v.windows.filter(isWindow).map(cleanWindow),
    };
  } catch {
    return undefined;
  }
}

function isWindow(w: unknown): w is UsageWindow {
  return !!w && typeof (w as UsageWindow).id === "string";
}

function cleanWindow(w: UsageWindow): UsageWindow {
  return {
    id: w.id,
    label: typeof w.label === "string" && w.label ? w.label : w.id,
    ...(typeof w.usedPercent === "number" ? { usedPercent: w.usedPercent } : {}),
    ...(typeof w.resetAt === "number" ? { resetAt: w.resetAt } : {}),
    state: WINDOW_STATES.includes(w.state) ? w.state : "unknown",
  };
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
 * Colour for one window. A state the publisher flagged wins over the percentage: when an API says
 * it is rate-limiting you, that is not a number to re-evaluate against your own slider.
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

/**
 * How long until this window rolls over: "45m", "2h 13m", "6d 14h".
 *
 * Counted from the reading rather than from now — a clock that ticked between fetches would imply
 * a precision the refresh interval does not have.
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
