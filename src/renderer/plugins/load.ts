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

/** Installed before the first import; the shims the main process serves read exactly this. */
function installRuntime(): void {
  (globalThis as unknown as { __pidPlugin?: unknown }).__pidPlugin = { jsx, jsxs, Fragment, ui };
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

/**
 * Load every plugin for a folder.
 *
 * One plugin failing is one plugin failing: its error is recorded against its id and the rest load.
 * A plugin that registers nothing is kept too, so the Extensions page can say it loaded and drew
 * nothing rather than leaving the author guessing.
 */
export async function loadPlugins(cwd: string | undefined): Promise<Registered[]> {
  installRuntime();
  const ids = await bridge.plugins.list(cwd, Object.keys(ui));
  const out: Registered[] = [];
  for (const id of ids) {
    const { api, out: reg } = register(id);
    try {
      const mod = (await import(/* @vite-ignore */ `pid://app/plugin/${id}.js`)) as {
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
