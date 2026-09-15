import { DEFAULT_SETTINGS, withDefaults } from "@shared/settings";
import {
  formatResetAt,
  formatResetIn,
  formatUsedPercent,
  snapshotTone,
  stateForPercent,
  windowTone,
} from "@shared/usage";
import { describe, expect, it } from "vitest";
import {
  normalizeArkPlan,
  normalizeCodex,
  normalizeOpenCodeGo,
  restate,
  UsageFailure,
} from "../src/main/usage/normalize";

const NOW = Date.parse("2026-09-15T12:00:00Z");
const inHours = (h: number) => NOW + h * 3_600_000;

describe("reset as a countdown", () => {
  it("counts minutes, then hours and minutes, then days and hours", () => {
    expect(formatResetIn(45 * 60_000)).toBe("45m");
    expect(formatResetIn((2 * 60 + 13) * 60_000)).toBe("2h 13m");
    expect(formatResetIn(2 * 3_600_000)).toBe("2h");
    expect(formatResetIn(6 * 24 * 3_600_000 + 14 * 3_600_000)).toBe("6d 14h");
    expect(formatResetIn(7 * 24 * 3_600_000)).toBe("7d");
  });

  it("says now for a window that has already rolled over", () => {
    expect(formatResetIn(0)).toBe("now");
    expect(formatResetIn(-5000)).toBe("now");
  });
});

describe("reset as a moment", () => {
  it("drops the date while the time alone is unambiguous", () => {
    // Later the same local day: the clock is enough.
    const later = NOW + 2 * 3_600_000;
    expect(formatResetAt(later, NOW)).toMatch(/^\d{2}:\d{2}$/);
  });

  it("names the weekday once the reset is on another day", () => {
    const threeDays = NOW + 3 * 24 * 3_600_000;
    expect(formatResetAt(threeDays, NOW)).toMatch(/^\w+ \d{2}:\d{2}$/);
  });

  it("falls back to a date beyond a week, where a weekday would be ambiguous", () => {
    const threeWeeks = NOW + 21 * 24 * 3_600_000;
    const out = formatResetAt(threeWeeks, NOW);
    expect(out).not.toMatch(/\d{2}:\d{2}/);
    expect(out).toMatch(/\d/);
  });

  it("says now for a moment already past", () => {
    expect(formatResetAt(NOW - 1000, NOW)).toBe("now");
  });
});

describe("tone", () => {
  const t = { warning: 70, danger: 90 };

  it("follows the thresholds", () => {
    expect(windowTone({ id: "5h", usedPercent: 69, state: "normal" }, t)).toBe("ok");
    expect(windowTone({ id: "5h", usedPercent: 70, state: "normal" }, t)).toBe("warn");
    expect(windowTone({ id: "5h", usedPercent: 90, state: "normal" }, t)).toBe("danger");
  });

  it("lets the provider's own verdict outrank the percentage", () => {
    // The provider says it is already throttling; a green 12% would be a lie.
    expect(windowTone({ id: "5h", usedPercent: 12, state: "warning" }, t)).toBe("warn");
    expect(windowTone({ id: "5h", usedPercent: 12, state: "expired" }, t)).toBe("danger");
  });

  it("stays muted when there is no number", () => {
    expect(windowTone({ id: "5h", state: "unknown" }, t)).toBe("muted");
    expect(windowTone({ id: "5h", state: "normal" }, t)).toBe("muted");
    expect(formatUsedPercent(undefined)).toBe("—");
  });

  it("takes the worst window for the row as a whole", () => {
    const usage = {
      provider: "openai-codex" as const,
      state: "fresh" as const,
      windows: [
        { id: "5h" as const, usedPercent: 10, state: "normal" as const },
        { id: "week" as const, usedPercent: 95, state: "error" as const },
      ],
    };
    expect(snapshotTone(usage, t)).toBe("danger");
    expect(snapshotTone(undefined, t)).toBe("muted");
    expect(snapshotTone({ ...usage, state: "loading" }, t)).toBe("muted");
  });

  it("calls a window expired once its reset moment has passed", () => {
    expect(stateForPercent(50, inHours(-1), NOW)).toBe("expired");
    expect(stateForPercent(50, inHours(1), NOW)).toBe("normal");
    expect(stateForPercent(undefined, undefined, NOW)).toBe("unknown");
  });
});

describe("codex payloads", () => {
  it("reads the primary and secondary windows", () => {
    const windows = normalizeCodex(
      {
        rate_limit: {
          primary_window: {
            used_percent: 59,
            limit_window_seconds: 18000,
            reset_at: inHours(2) / 1000, // Codex dates in epoch seconds
          },
          secondary_window: { used_percent: 61, limit_window_seconds: 604800 },
        },
      },
      NOW,
    );
    expect(windows).toEqual([
      { id: "5h", usedPercent: 59, state: "normal", resetAt: inHours(2) },
      { id: "week", usedPercent: 61, state: "normal" },
    ]);
  });

  it("refuses a response with no windows in it", () => {
    expect(() => normalizeCodex({ rate_limit: {} }, NOW)).toThrow(UsageFailure);
    expect(() => normalizeCodex({}, NOW)).toThrow(/no rate_limit/);
  });
});

describe("opencode go payloads", () => {
  it("reads all three windows and dates an ISO reset", () => {
    const windows = normalizeOpenCodeGo(
      {
        usage: {
          rolling: { status: "ok", percent: 12, resetsAt: "2026-09-15T16:00:00Z" },
          weekly: { status: "ok", percent: 40 },
          monthly: { status: "ok", percent: 73 },
        },
      },
      NOW,
    );
    expect(windows.map((w) => w.id)).toEqual(["5h", "week", "month"]);
    expect(windows[0].resetAt).toBe(inHours(4));
    expect(windows[2].state).toBe("warning"); // 73% crosses the 70 default
  });

  it("warns on a window the provider is already throttling", () => {
    const [w] = normalizeOpenCodeGo(
      { usage: { rolling: { status: "rate-limited", percent: 12 } } },
      NOW,
    );
    expect(w.state).toBe("warning");
  });

  it("skips a window whose status it does not recognise", () => {
    expect(() =>
      normalizeOpenCodeGo({ usage: { rolling: { status: "who-knows", percent: 12 } } }, NOW),
    ).toThrow(/no usage windows/);
  });
});

describe("ark plan payloads", () => {
  const payload = (shortLabel: string) => ({
    items: [
      { subscribed: false, periods: [{ label: shortLabel, percent: 99 }] },
      {
        subscribed: true,
        periods: [
          { label: shortLabel, percent: 22, reset_at: "2026-09-15T15:40:00Z" },
          { label: "weekly", percent: 48 },
          { label: "monthly", percent: 73 },
        ],
      },
    ],
  });

  it("takes the subscribed product, not the first one listed", () => {
    const windows = normalizeArkPlan(payload("5h"), "agent-plan", NOW);
    expect(windows[0]).toEqual({ id: "5h", usedPercent: 22, state: "normal", resetAt: inHours(3.666666666666667) });
  });

  it("maps the coding plan's session bucket onto the short window", () => {
    const windows = normalizeArkPlan(payload("session"), "coding-plan", NOW);
    expect(windows.map((w) => w.id)).toEqual(["5h", "week", "month"]);
  });

  it("does not mistake the agent plan's labels for the coding plan's", () => {
    // A coding-plan payload parsed as agent-plan loses the short window rather than inventing one.
    const windows = normalizeArkPlan(payload("session"), "agent-plan", NOW);
    expect(windows.map((w) => w.id)).toEqual(["week", "month"]);
  });

  it("reports an unsubscribed account as its own kind of failure", () => {
    const e = (() => {
      try {
        normalizeArkPlan({ items: [{ subscribed: false }] }, "coding-plan", NOW);
      } catch (err) {
        return err as UsageFailure;
      }
    })();
    expect(e?.code).toBe("no-subscription");
  });
});

describe("restating a cached reading", () => {
  it("expires a window the cache outlived, and leaves the others alone", () => {
    const usage = {
      provider: "openai-codex" as const,
      state: "fresh" as const,
      fetchedAt: inHours(-3),
      windows: [
        { id: "5h" as const, usedPercent: 59, state: "normal" as const, resetAt: inHours(-1) },
        { id: "week" as const, usedPercent: 61, state: "normal" as const, resetAt: inHours(48) },
      ],
    };
    const out = restate(usage, NOW);
    expect(out.windows[0].state).toBe("expired");
    expect(out.windows[1].state).toBe("normal");
    expect(out.windows[0].usedPercent).toBe(59); // the number is kept, only its standing changes
  });
});

describe("usage bar settings", () => {
  it("defaults to the short and weekly windows", () => {
    expect(DEFAULT_SETTINGS.usageBar.windows).toEqual(["5h", "week"]);
  });

  it("keeps a hand-edited window list only when every member is a real window", () => {
    expect(withDefaults({ usageBar: { windows: ["month"] } }).usageBar.windows).toEqual(["month"]);
    expect(withDefaults({ usageBar: { windows: ["month", "fortnight"] } }).usageBar.windows).toEqual(
      DEFAULT_SETTINGS.usageBar.windows,
    );
  });

  it("clamps a hand-edited refresh interval and rejects an unknown countdown", () => {
    expect(withDefaults({ usageBar: { refreshSeconds: 1 } }).usageBar.refreshSeconds).toBe(15);
    expect(withDefaults({ usageBar: { refreshSeconds: 99999 } }).usageBar.refreshSeconds).toBe(900);
    expect(withDefaults({ usageBar: { resetDisplay: "someday" } }).usageBar.resetDisplay).toBe(
      "countdown",
    );
  });

  it("gives an older settings file the whole section", () => {
    expect(withDefaults({ appearance: { fontSize: 15 } }).usageBar).toEqual(
      DEFAULT_SETTINGS.usageBar,
    );
  });
});
