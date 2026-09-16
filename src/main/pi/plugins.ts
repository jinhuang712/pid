/**
 * Desktop presentation an extension brings with it.
 *
 * A Pi extension is behaviour: tools, commands, hooks. It runs identically wherever Pi runs. Its
 * interface does not, and the terminal's answer — hand pi-tui a factory that builds a `Component`
 * out of pi-tui's own widgets — has no meaning in a window. So an extension that wants to be drawn
 * here ships a second entry point beside the first:
 *
 *     "pi":  { "extensions": ["./src/index.ts"] }    the half Pi loads
 *     "pid": { "ui": "./src/ui.tsx" }                the half this loads
 *
 * The second half is real code, not a description. It is handed PID's own primitives and composes
 * them, exactly as the terminal half composes pi-tui's — a host that accepts only a description
 * caps every extension at what the host author thought of first.
 *
 * Nothing is bundled and nothing is installed on the user's behalf: the list here is derived from
 * what Pi already resolved for the directory, so one install serves both hosts.
 */

import { existsSync, readFileSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { build } from "esbuild";
import { listExtensions } from "./ecosystem";

export interface PluginEntry {
  /** The extension's name, and the namespace its own half publishes under. */
  id: string;
  /** Absolute path to the module PID loads into the window. */
  entry: string;
}

/** `pid.ui` from a package manifest, resolved against the package. Absent for most extensions. */
function uiEntry(baseDir: string): string | undefined {
  const manifest = join(baseDir, "package.json");
  if (!existsSync(manifest)) return undefined;
  try {
    const pkg = JSON.parse(readFileSync(manifest, "utf8")) as { pid?: { ui?: unknown } };
    const ui = pkg.pid?.ui;
    if (typeof ui !== "string" || ui.length === 0) return undefined;
    const path = isAbsolute(ui) ? ui : resolve(baseDir, ui);
    return existsSync(path) ? path : undefined;
  } catch {
    // A manifest PID cannot read is a manifest with no desktop half.
    return undefined;
  }
}

/**
 * Every enabled extension that brought a desktop half.
 *
 * Disabled extensions are skipped: the switch on the Extensions page means "do not load this", and
 * a host that kept drawing the page of a disabled extension would be lying about what is running.
 */
export async function discoverPlugins(cwd?: string): Promise<PluginEntry[]> {
  const out: PluginEntry[] = [];
  for (const ext of await listExtensions(cwd)) {
    if (!ext.enabled) continue;
    const entry = uiEntry(ext.baseDir);
    if (entry) out.push({ id: ext.name, entry });
  }
  return out;
}

/**
 * The two modules a plugin is allowed to import, served from the same origin as the plugin itself.
 *
 * Both read a global the window puts in place before the first import. That keeps one React and one
 * component library in the process: a plugin that bundled its own copy of either would render into
 * a second reconciler and see none of the host's context.
 */
export const JSX_SHIM = [
  "const r = globalThis.__pidPlugin;",
  "export const jsx = r.jsx;",
  "export const jsxs = r.jsxs;",
  "export const jsxDEV = r.jsx;",
  "export const Fragment = r.Fragment;",
].join("\n");

/**
 * The shim for `@pid/ui`, one named export per primitive the window hands out.
 *
 * Generated from the live object rather than a second list, so the shim cannot drift from the
 * library. A name that is not a plain identifier is dropped instead of being interpolated.
 */
export function uiShim(names: readonly string[]): string {
  const safe = names.filter((n) => /^[A-Za-z_$][\w$]*$/.test(n));
  return [
    "const r = globalThis.__pidPlugin.ui;",
    ...safe.map((n) => `export const ${n} = r.${n};`),
    "export default r;",
  ].join("\n");
}

/**
 * Bundle one plugin to ESM the window can import.
 *
 * `@pid/*` stays external and resolves to the shims above. Everything else the plugin imports —
 * its own modules, its own npm dependencies — is bundled in, so the window fetches one file and the
 * plugin author needs no build step of their own.
 */
export async function bundlePlugin(entry: string): Promise<string> {
  const result = await build({
    entryPoints: [entry],
    absWorkingDir: dirname(entry),
    bundle: true,
    write: false,
    format: "esm",
    platform: "browser",
    target: "es2022",
    jsx: "automatic",
    jsxImportSource: "@pid",
    plugins: [
      {
        // Left external so the window supplies them, and rewritten to the paths it serves them
        // at — same origin as the page, which is the only way a module import resolves at all.
        name: "pid-host",
        setup(b) {
          b.onResolve({ filter: /^@pid\/(ui|jsx-runtime)$/ }, (args) => ({
            path: `/plugin/${args.path.slice("@pid/".length)}`,
            external: true,
          }));
        },
      },
    ],
    logLevel: "silent",
  });
  const file = result.outputFiles?.[0];
  if (!file) throw new Error("bundled to nothing");
  return file.text;
}
