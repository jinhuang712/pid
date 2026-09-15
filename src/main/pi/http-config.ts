import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import type { SettingsManager } from "@earendil-works/pi-coding-agent";

/**
 * Apply Pi's own HTTP settings (`httpProxy`, `httpIdleTimeoutMs`) to this process.
 *
 * `pi --mode rpc` does this at startup so a proxy configured with `pi /config` applies to
 * provider calls. The two functions live in `dist/core/http-dispatcher.js`, which the package's
 * `exports` map does not expose, so they are reached by resolving the public entry and walking
 * to the file. Running Pi's own code keeps PID's proxy behavior identical to the terminal's
 * instead of PID growing a second HTTP configuration.
 *
 * A layout change upstream makes the import throw rather than silently skip: the caller turns
 * that into a visible diagnostic. Re-check this path whenever the pinned Pi version moves.
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
