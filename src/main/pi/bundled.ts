import { existsSync } from "node:fs";
import { join } from "node:path";

/**
 * PID's own bridge extension, loaded into every session worker.
 *
 * It is not part of the Pi ecosystem: it is how PID hears what extensions publish on Pi's event bus
 * (`resources/pid-bridge/index.ts`). PID ships nothing else. There is one PID, and the extensions —
 * MCP, the footer, anything else — are installed into Pi, after which they apply to the terminal
 * and to PID alike.
 *
 * Nothing is written to Pi's settings. The path is passed per worker, as `-e` did per process, and
 * leaves the user's setup alone.
 */
export interface BundledPi {
  /** Absolute path to pid-bridge's entry, or undefined when it cannot be found. */
  bridge?: string;
}

/**
 * @param appRoot directory that holds `resources/` (Electron's app path in dev; the unpacked
 *   resources dir when packaged).
 */
export function locateBundled(appRoot: string, env: NodeJS.ProcessEnv = process.env): BundledPi {
  const bridge = firstExisting([
    env.PID_BRIDGE_PATH,
    join(appRoot, "resources", "pid-bridge", "index.ts"),
    join(appRoot, "..", "resources", "pid-bridge", "index.ts"),
  ]);
  return { bridge };
}

/** Extension paths to load into a session worker, on top of everything Pi resolves for itself. */
export function bundledExtensionPaths(bundled: BundledPi): string[] {
  return bundled.bridge ? [bundled.bridge] : [];
}

let current: BundledPi = {};

/** Called once at startup with Electron's app path; everything else reads the cached result. */
export function configureBundled(appRoot: string): BundledPi {
  current = locateBundled(appRoot);
  return current;
}

export const currentBundled = (): BundledPi => current;

function firstExisting(paths: (string | undefined)[]): string | undefined {
  return paths.find((p): p is string => !!p && existsSync(p));
}
