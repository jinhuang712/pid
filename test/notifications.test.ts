import { describe, expect, it } from "vitest";
import { notificationGate } from "../src/shared/notifications";
import { DEFAULT_SETTINGS } from "../src/shared/settings";

const prefs = (over: Partial<(typeof DEFAULT_SETTINGS)["notifications"]> = {}) => ({
  ...DEFAULT_SETTINGS.notifications,
  ...over,
});

/**
 * Git and shell test the machine; this tests PID. The system's answer is invisible from here, so
 * what is worth locking down is which of them PID is allowed to ask.
 */
describe("notificationGate", () => {
  it("sends the kinds the user left on", () => {
    expect(notificationGate(prefs(), "runCompleted", false)).toBe("send");
    expect(notificationGate(prefs(), "inputRequired", false)).toBe("send");
    expect(notificationGate(prefs(), "error", false)).toBe("send");
  });

  it("stays quiet about a kind the user turned off", () => {
    expect(notificationGate(prefs({ runCompleted: false }), "runCompleted", false)).toBe("off");
    // one toggle off is not the others off
    expect(notificationGate(prefs({ runCompleted: false }), "error", false)).toBe("send");
  });

  it("skips a banner the window in front of the user would have covered anyway", () => {
    expect(notificationGate(prefs(), "runCompleted", true)).toBe("focused");
  });

  it("sends while unfocused even though the default is to skip the focused case", () => {
    expect(notificationGate(prefs({ onlyWhenUnfocused: true }), "runCompleted", false)).toBe("send");
  });

  it("sends whether or not the window is focused once the user asks for that", () => {
    const always = prefs({ onlyWhenUnfocused: false });
    expect(notificationGate(always, "runCompleted", true)).toBe("send");
    expect(notificationGate(always, "runCompleted", false)).toBe("send");
  });

  it("reports the toggle rather than the focus when both would hold it back", () => {
    expect(notificationGate(prefs({ error: false }), "error", true)).toBe("off");
  });
});
