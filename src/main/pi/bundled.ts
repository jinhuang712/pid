import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

/**
 * Extensions PID ships and loads into its own session workers.
 *
 * - pid-bridge: relays MCP status/OAuth events to PID (resources/pid-bridge/index.ts).
 * - pid-mcp: MCP for Pi, pinned in package.json. Loaded only when the user has not installed an
 *   MCP extension themselves (pid-mcp or pi-mcp-adapter); a user-installed one always wins so the
 *   terminal and PID agree.
 *
 * Nothing is written to Pi's settings. These paths are passed per worker, as `-e` did per
 * process, and leave the user's setup alone.
 */
export interface BundledPi {
  /** Absolute path to pid-bridge's entry, or undefined when it cannot be found. */
  bridge?: string;
  /** Absolute path to the bundled pid-mcp entry, or undefined when it is not available. */
  adapter?: string;
  adapterVersion?: string;
}

export type McpAdapterSource = "user" | "bundled" | "none";

/** MCP extensions PID recognises in the user's Pi packages. First match wins for display. */
export const KNOWN_MCP_EXTENSIONS = ["pid-mcp", "pi-mcp-adapter"] as const;
export type McpExtensionName = (typeof KNOWN_MCP_EXTENSIONS)[number];

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
  let adapter = env.PID_MCP_PATH && existsSync(env.PID_MCP_PATH) ? env.PID_MCP_PATH : undefined;
  if (!adapter) {
    try {
      const pkg = createRequire(join(appRoot, "package.json")).resolve("pid-mcp/package.json");
      adapter = join(dirname(pkg), "src", "index.ts");
      if (!existsSync(adapter)) adapter = undefined;
    } catch {
      adapter = undefined;
    }
  }
  return { bridge, adapter, adapterVersion: adapter ? readVersion(adapter) : undefined };
}

/** The MCP extension the user installed into Pi themselves, if any. */
export function userMcpExtension(userPackages: string[]): McpExtensionName | undefined {
  for (const name of KNOWN_MCP_EXTENSIONS) if (userPackages.some((p) => p.includes(name))) return name;
  return undefined;
}

/** Which MCP extension a PID-started Pi will have: the user's package, PID's bundled pid-mcp, or none. */
export function adapterSource(userPackages: string[], bundled: BundledPi): McpAdapterSource {
  if (userMcpExtension(userPackages)) return "user";
  return bundled.adapter ? "bundled" : "none";
}

/** Extension paths to load into a session worker, in the order Pi should see them. */
export function bundledExtensionPaths(userPackages: string[], bundled: BundledPi): string[] {
  const paths: string[] = [];
  if (adapterSource(userPackages, bundled) === "bundled" && bundled.adapter) paths.push(bundled.adapter);
  if (bundled.bridge) paths.push(bundled.bridge);
  return paths;
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

/** pid-mcp's entry is `src/index.ts`; its package.json is one directory up from `src/`. */
function readVersion(entry: string): string | undefined {
  for (const dir of [dirname(entry), dirname(dirname(entry))]) {
    try {
      const v = (JSON.parse(readFileSync(join(dir, "package.json"), "utf8")) as { version?: string }).version;
      if (v) return v;
    } catch {
      // try the parent
    }
  }
  return undefined;
}
