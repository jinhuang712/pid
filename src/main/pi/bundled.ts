import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

/**
 * Extensions PID ships and loads into its own `pi --mode rpc` children with `-e`.
 *
 * - pid-bridge: relays adapter status/OAuth events to PID (resources/pid-bridge/index.ts).
 * - pi-mcp-adapter: MCP for Pi, pinned in package.json. Loaded only when the user has not
 *   installed it themselves; a user-installed copy always wins so the terminal and PID agree.
 *
 * Nothing is written to Pi's settings. `-e` is per process and leaves the user's setup alone.
 */
export interface BundledPi {
  /** Absolute path to pid-bridge's entry, or undefined when it cannot be found. */
  bridge?: string;
  /** Absolute path to the bundled adapter's entry, or undefined when it is not available. */
  adapter?: string;
  adapterVersion?: string;
}

export type McpAdapterSource = "user" | "bundled" | "none";

/**
 * @param appRoot directory that holds `resources/` and `node_modules/` (Electron's app path in
 *   dev; the unpacked resources dir when packaged).
 */
export function locateBundled(appRoot: string, env: NodeJS.ProcessEnv = process.env): BundledPi {
  const bridge = firstExisting([
    env.PID_BRIDGE_PATH,
    join(appRoot, "resources", "pid-bridge", "index.ts"),
    join(appRoot, "..", "resources", "pid-bridge", "index.ts"),
  ]);
  let adapter =
    env.PID_MCP_ADAPTER_PATH && existsSync(env.PID_MCP_ADAPTER_PATH) ? env.PID_MCP_ADAPTER_PATH : undefined;
  if (!adapter) {
    try {
      const pkg = createRequire(join(appRoot, "package.json")).resolve("pi-mcp-adapter/package.json");
      adapter = join(dirname(pkg), "index.ts");
      if (!existsSync(adapter)) adapter = undefined;
    } catch {
      adapter = undefined;
    }
  }
  return { bridge, adapter, adapterVersion: adapter ? readVersion(adapter) : undefined };
}

/** Which MCP adapter a PID-started Pi will have: the user's package, PID's bundled copy, or none. */
export function adapterSource(userPackages: string[], bundled: BundledPi): McpAdapterSource {
  if (userPackages.some((p) => p.includes("pi-mcp-adapter"))) return "user";
  return bundled.adapter ? "bundled" : "none";
}

/** The `-e` arguments to append to `pi --mode rpc`. */
export function bundledExtensionArgs(userPackages: string[], bundled: BundledPi): string[] {
  const args: string[] = [];
  if (adapterSource(userPackages, bundled) === "bundled" && bundled.adapter) args.push("-e", bundled.adapter);
  if (bundled.bridge) args.push("-e", bundled.bridge);
  return args;
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

function readVersion(entry: string): string | undefined {
  try {
    return (JSON.parse(readFileSync(join(dirname(entry), "package.json"), "utf8")) as { version?: string })
      .version;
  } catch {
    return undefined;
  }
}
