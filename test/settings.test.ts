import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, withDefaults } from "../src/shared/settings";

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
});
