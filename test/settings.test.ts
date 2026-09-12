import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, stepScale, UI_SCALES, withDefaults } from "../src/shared/settings";

describe("withDefaults", () => {
  it("returns defaults for missing or garbage input", () => {
    expect(withDefaults(undefined)).toEqual(DEFAULT_SETTINGS);
    expect(withDefaults("nope")).toEqual(DEFAULT_SETTINGS);
  });
  it("keeps stored values of the right type and drops unknown or mistyped keys", () => {
    const s = withDefaults({
      appearance: { theme: "dark", fontSize: "big", bogus: 1 },
      advanced: { piBinary: "/x/pi" },
    });
    expect(s.appearance.theme).toBe("dark");
    expect(s.appearance.fontSize).toBe(DEFAULT_SETTINGS.appearance.fontSize);
    expect("bogus" in s.appearance).toBe(false);
    expect(s.advanced.piBinary).toBe("/x/pi");
    expect(s.notifications).toEqual(DEFAULT_SETTINGS.notifications);
  });
  it("clamps sizes a hand-edited file could make unusable", () => {
    const s = withDefaults({
      appearance: { interfaceScale: 12, fontSize: 2, sidebarWidth: 9000, messageFontSize: Number.NaN },
    });
    expect(s.appearance.interfaceScale).toBe(1.6);
    expect(s.appearance.fontSize).toBe(11);
    expect(s.appearance.sidebarWidth).toBe(460);
    expect(s.appearance.messageFontSize).toBe(DEFAULT_SETTINGS.appearance.messageFontSize);
  });
  it("rejects values outside a documented choice list", () => {
    const s = withDefaults({
      appearance: { theme: "solarized", density: "spacious", accent: "hotpink", contentWidth: "wide" },
      files: { ignorePatterns: [1, 2] },
    });
    expect(s.appearance.theme).toBe("system");
    expect(s.appearance.density).toBe("spacious");
    expect(s.appearance.accent).toBe("amber");
    expect(s.appearance.contentWidth).toBe("wide");
    expect(s.files.ignorePatterns).toEqual([]);
  });
});

describe("stepScale", () => {
  it("walks the stops and clamps at both ends", () => {
    expect(stepScale(1, 1)).toBe(1.1);
    expect(stepScale(1, -1)).toBe(0.9);
    expect(stepScale(0.9, -1)).toBe(0.9);
    expect(stepScale(1.5, 1)).toBe(1.5);
  });
  it("moves in the asked-for direction from a value between stops, and 0 means 100%", () => {
    expect(stepScale(1.2, 1)).toBe(1.25);
    expect(stepScale(1.2, -1)).toBe(1.1);
    expect(stepScale(1.42, 0)).toBe(1);
    expect(UI_SCALES).toContain(stepScale(1.37, -1));
  });
});
