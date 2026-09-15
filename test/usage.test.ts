import { DEFAULT_SETTINGS, withDefaults } from "@shared/settings";
import {
  formatResetAt,
  formatResetIn,
  formatUsedPercent,
  parseProviderUsage,
  windowTone,
} from "@shared/usage";
import { describe, expect, it } from "vitest";

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
    expect(windowTone({ id: "5h", label: "5H", usedPercent: 69, state: "normal" }, t)).toBe("ok");
    expect(windowTone({ id: "5h", label: "5H", usedPercent: 70, state: "normal" }, t)).toBe("warn");
    expect(windowTone({ id: "5h", label: "5H", usedPercent: 90, state: "normal" }, t)).toBe("danger");
  });

  it("lets the provider's own verdict outrank the percentage", () => {
    // The provider says it is already throttling; a green 12% would be a lie.
    expect(windowTone({ id: "5h", label: "5H", usedPercent: 12, state: "warning" }, t)).toBe("warn");
    expect(windowTone({ id: "5h", label: "5H", usedPercent: 12, state: "expired" }, t)).toBe("danger");
  });

  it("stays muted when there is no number", () => {
    expect(windowTone({ id: "5h", label: "5H", state: "unknown" }, t)).toBe("muted");
    expect(windowTone({ id: "5h", label: "5H", state: "normal" }, t)).toBe("muted");
    expect(formatUsedPercent(undefined)).toBe("—");
  });

  it("calls an expired window dangerous however small its number", () => {
    expect(windowTone({ id: "5h", label: "5H", usedPercent: 2, state: "expired" }, t)).toBe("danger");
  });
});

describe("the usage widget", () => {
  it("reads a reading", () => {
    const usage = parseProviderUsage([
      JSON.stringify({
        provider: "opencode-go",
        providerLabel: "OpenCode Go",
        state: "fresh",
        fetchedAt: NOW,
        windows: [{ id: "go:5h", label: "5H", usedPercent: 6, resetAt: inHours(2), state: "normal" }],
      }),
    ]);
    expect(usage?.providerLabel).toBe("OpenCode Go");
    expect(usage?.windows[0]).toEqual({
      id: "go:5h",
      label: "5H",
      usedPercent: 6,
      resetAt: inHours(2),
      state: "normal",
    });
  });

  it("names a window after its id when the publisher sends no label", () => {
    const usage = parseProviderUsage([
      JSON.stringify({ provider: "x", state: "fresh", windows: [{ id: "codex:primary" }] }),
    ]);
    expect(usage?.windows[0].label).toBe("codex:primary");
    expect(usage?.windows[0].state).toBe("unknown");
  });

  it("reads nonsense as no quota rather than painting it", () => {
    // This crosses a process boundary from code PID does not own.
    expect(parseProviderUsage(undefined)).toBeUndefined();
    expect(parseProviderUsage([])).toBeUndefined();
    expect(parseProviderUsage(["not json"])).toBeUndefined();
    expect(parseProviderUsage(['{"provider":"x"}'])).toBeUndefined();
    expect(parseProviderUsage(['{"windows":[]}'])).toBeUndefined();
    const odd = parseProviderUsage(['{"provider":"x","state":"weird","windows":[{"id":"a"},null,7]}']);
    expect(odd?.state).toBe("unavailable");
    expect(odd?.windows).toHaveLength(1);
  });
});
