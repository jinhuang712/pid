import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import type { SettingsManager } from "@earendil-works/pi-coding-agent";

/**
 * UPSTREAM API GAP — Pi compatibility shim. Lives here so every dependency on
 * Pi's private package layout is visible in one place.
 *
 * `applyHttpProxySettings` / `configureHttpDispatcher` exist in Pi's
 * `dist/core/http-dispatcher.js` but the package `exports` map does not expose
 * them, and the pinned 0.85.1 runtime offers no public HTTP-configuration API.
 * They are reached by resolving the public entry and walking to the file.
 * Running Pi's own code keeps PID's proxy behavior identical to the terminal's
 * instead of PID growing a second HTTP configuration.
 *
 * Removable the day upstream exposes something like
 * `applyHttpSettings(settingsManager)` publicly; until then, re-check this
 * path whenever the pinned Pi version moves.
 *
 * Failure is visible, never silent: a layout change upstream makes the import
 * throw, and the caller turns that into a diagnostic. A configured proxy that
 * is not in effect must never be swallowed.
 */
export async function applyPiHttpSettings(settings: SettingsManager): Promise<string | undefined> {
  const { httpProxy } = settings.getGlobalSettings();
  const idleTimeoutMs = settings.getHttpIdleTimeoutMs();
  try {
    const entry = fileURLToPath(import.meta.resolve("@earendil-works/pi-coding-agent"));
    const mod = join(dirname(entry), "core", "http-dispatcher.js");
    const { applyHttpProxySettings, configureHttpDispatcher } = (await import(pathToFileURL(mod).href)) as {
      applyHttpProxySettings: (proxy: string | undefined) => void;
      configureHttpDispatcher: (timeoutMs?: number) => void;
    };
    applyHttpProxySettings(httpProxy);
    configureHttpDispatcher(idleTimeoutMs);
    return undefined;
  } catch (err) {
    return `Pi's HTTP settings were not applied (${(err as Error).message}). ${
      httpProxy ? `The configured proxy ${httpProxy} is not in effect.` : ""
    }`.trim();
  }
}
