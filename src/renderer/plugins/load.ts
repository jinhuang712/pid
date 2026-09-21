import * as react from "react";
import { Fragment, jsx, jsxs } from "react/jsx-runtime";
import { bridge } from "../bridge";
import * as ui from "../ui";
import type { PluginApi, PluginModule, Registered } from "./api";

/**
 * Loading a plugin's desktop half.
 *
 * The module is fetched over `pid-plugin://`, which the main process serves by bundling the
 * extension's `pid.ui` entry on demand. Its imports of `@pid/ui` and the JSX runtime resolve to
 * shims that read the object installed here, so the plugin renders into this React and composes
 * these primitives rather than shipping duplicates of either.
 *
 * Nothing about this is a sandbox, and it is not pretending to be one. Pi states its own boundary
 * plainly: an extension runs with the user's full permissions, and installing one is the trust
 * decision. The half that draws is the same package as the half that already has the filesystem.
 */

/**
 * Installed before the first import; the shims the main process serves read exactly this.
 *
 * React is here for the same reason the JSX runtime is: one reconciler in the process. A plugin
 * that bundled its own would throw on its first `useState` inside a host element, and a page that
 * cannot hold state cannot remember which of its rows are open.
 */
function installRuntime(): void {
  (globalThis as unknown as { __pidPlugin?: unknown }).__pidPlugin = { jsx, jsxs, Fragment, ui, react };
}

function register(id: string): { api: PluginApi; out: Registered } {
  const out: Registered = { id };
  const api: PluginApi = {
    id,
    page: (spec) => {
      out.page = spec;
    },
    header: (spec) => {
      out.header = spec;
    },
    strip: (spec) => {
      out.strip = spec;
    },
    tool: (spec) => {
      out.tools = [...(out.tools ?? []), spec];
    },
  };
  return { api, out };
}

/** Counts loads, so each one asks for a URL the document has not already got a module for. */
let loads = 0;

/**
 * Load every plugin for a folder.
 *
 * One plugin failing is one plugin failing: its error is recorded against its id and the rest load.
 * A plugin that registers nothing is kept too, so the Extensions page can say it loaded and drew
 * nothing rather than leaving the author guessing.
 *
 * Each load carries a token in the URL. A dynamic import is cached for the life of the document,
 * so without it a folder switch re-imported the same address and drew the previous folder's
 * bundle, and an edit to a desktop half only appeared after a window reload.
 */
export async function loadPlugins(cwd: string | undefined): Promise<Registered[]> {
  installRuntime();
  const ids = await bridge.plugins.list(cwd, { ui: Object.keys(ui), react: Object.keys(react) });
  const stamp = ++loads;
  const out: Registered[] = [];
  for (const id of ids) {
    const { api, out: reg } = register(id);
    try {
      const mod = (await import(/* @vite-ignore */ `pid://app/plugin/${id}.js?load=${stamp}`)) as {
        default?: PluginModule;
      };
      if (typeof mod.default !== "function") throw new Error("no default export function");
      mod.default(api);
    } catch (e) {
      reg.error = e instanceof Error ? e.message : String(e);
    }
    out.push(reg);
  }
  return out;
}
