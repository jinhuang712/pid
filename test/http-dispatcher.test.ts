import type { SettingsManager } from "@earendil-works/pi-coding-agent";
import { describe, expect, it } from "vitest";
import { applyPiHttpSettings } from "../src/main/pi/compat/http-dispatcher";

const settings = (global: Record<string, unknown>, idleTimeoutMs: number): SettingsManager =>
  ({
    getGlobalSettings: () => global,
    getHttpIdleTimeoutMs: () => idleTimeoutMs,
  }) as unknown as SettingsManager;

/**
 * The compat shim runs Pi's own HTTP setup instead of a PID copy. Success is
 * silent (`undefined`); any upstream layout change must surface as a warning
 * string the worker shows in diagnostics — never as a quietly skipped proxy.
 */
describe("http dispatcher shim", () => {
  it("applies Pi's HTTP settings through Pi's own code", async () => {
    await expect(applyPiHttpSettings(settings({}, 30_000))).resolves.toBeUndefined();
  });
});
