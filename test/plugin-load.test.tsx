import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeAll, describe, expect, it, vi } from "vitest";

// The frame a plugin composes reads settings, whose bridge only exists inside Electron. The
// default context carries DEFAULT_SETTINGS, which is all static markup needs.
vi.mock("../src/renderer/bridge", () => ({ bridge: {} }));

import * as react from "react";
import { bundlePlugin, JSX_SHIM, reactShim, uiShim } from "../src/main/pi/plugins";
import type { PluginApi, Registered } from "../src/renderer/plugins/api";
import { pluginToolResolver } from "../src/renderer/plugins/tools";
import * as ui from "../src/renderer/ui";

/**
 * The whole loading chain, on a fixture extension nobody has to install.
 *
 * What is exercised here is what breaks in practice: the bundler rewriting `@pid/*` to the paths
 * the window serves, the shims handing back the host's own React and component library, a default
 * export registering through the real API, and the row coming out of the host's own frame. The one
 * link left out is Electron's protocol handler, which has no meaning outside a window.
 */

const FIXTURE = join(__dirname, "fixtures", "desktop-half", "ui.tsx");

let registered: Registered;

/** Rewrites the served paths to real modules, so the bundle can be imported here as it is there. */
async function loadFixture(): Promise<Registered> {
  const dir = mkdtempSync(join(tmpdir(), "pid-plugin-"));
  writeFileSync(join(dir, "jsx-runtime.mjs"), JSX_SHIM);
  writeFileSync(join(dir, "ui.mjs"), uiShim(Object.keys(ui)));
  writeFileSync(join(dir, "react.mjs"), reactShim(Object.keys(react)));
  const js = (await bundlePlugin(FIXTURE))
    .replaceAll('"/plugin/jsx-runtime"', '"./jsx-runtime.mjs"')
    .replaceAll('"/plugin/ui"', '"./ui.mjs"')
    .replaceAll('"/plugin/react"', '"./react.mjs"');
  const file = join(dir, "plugin.mjs");
  writeFileSync(file, js);

  // Exactly what the window installs before the first import; the shims read this and nothing else.
  const runtime = await import("react/jsx-runtime");
  (globalThis as unknown as { __pidPlugin?: unknown }).__pidPlugin = {
    jsx: runtime.jsx,
    jsxs: runtime.jsxs,
    Fragment: runtime.Fragment,
    ui,
    react,
  };

  const mod = (await import(/* @vite-ignore */ file)) as { default?: (api: PluginApi) => void };
  expect(mod.default).toBeTypeOf("function");
  const out: Registered = { id: "desktop-half-fixture" };
  mod.default?.({
    id: out.id,
    page: (s) => {
      out.page = s;
    },
    header: (s) => {
      out.header = s;
    },
    strip: (s) => {
      out.strip = s;
    },
    tool: (s) => {
      out.tools = [...(out.tools ?? []), s];
    },
  });
  return out;
}

const call = (name: string, args: Record<string, unknown>) =>
  ({ type: "toolCall", id: "c1", name, arguments: args }) as never;

describe("a bundled desktop half", () => {
  beforeAll(async () => {
    registered = await loadFixture();
  }, 60000);

  const ctx = (query = "", state: unknown = { note: "from the agent half" }) => ({
    state,
    run: async () => undefined,
    cwd: "/repo",
    query,
  });

  it("registers what it asked for and nothing else", () => {
    expect(registered.page?.label).toBe("Fixture");
    expect(registered.page?.search).toBe("Search rows…");
    expect(registered.tools?.flatMap((t) => t.names)).toEqual(["fixture_tool"]);
    expect(registered.header).toBeUndefined();
    expect(registered.strip).toBeUndefined();
    expect(registered.error).toBeUndefined();
  });

  it("writes its own note from its own published state", () => {
    const html = renderToStaticMarkup(registered.page?.note?.(ctx()) as never);
    expect(html).toContain("from the agent half");
    // `Say tone="faint"` is a host class, so the class reaching the markup proves the shim resolved
    // to the host's library rather than to a copy the plugin bundled.
    expect(html).toContain("text-ink-3");
  });

  /**
   * The hook is the point: a page that cannot hold state cannot remember which rows are open, and a
   * plugin that bundled its own React would throw `Invalid hook call` on this line rather than
   * render. Reaching the markup at all is the proof that `react` resolved to the host's.
   */
  it("holds state through the host's React", () => {
    const html = renderToStaticMarkup(registered.page?.render(ctx()) as never);
    expect(html).toContain("3 rows");
    // The disclosure's own slots, which exist so a switch beside the chevron stays clickable.
    expect(html).toContain("lead");
    expect(html).toContain("trail");
  });

  it("filters on what the host's search box holds", () => {
    const html = renderToStaticMarkup(registered.page?.render(ctx("al")) as never);
    expect(html).toContain("1 rows");
    expect(html).toContain("alpha");
    expect(html).not.toContain("gamma");
  });

  it("draws its tool row in the host's own frame, with a module it imported itself", () => {
    const resolve = pluginToolResolver([registered], {}, "/repo", async () => undefined);
    const tool = resolve("fixture_tool");
    expect(tool?.render).toBeTypeOf("function");
    const html = renderToStaticMarkup(
      tool?.render({
        call: call("fixture_tool", { q: "a question" }),
        run: { status: "done", result: { content: [], details: { provider: "exa" } } } as never,
      }) as never,
    );
    expect(html).toContain("Fixtured");
    expect(html).toContain("a question");
    // `via exa` comes from the plugin's own module, so the bundle carried the plugin's imports.
    expect(html).toContain("via exa");
  });

  it("claims no tool it did not name", () => {
    expect(pluginToolResolver([registered], {}, "/repo", async () => undefined)("read")).toBeUndefined();
  });
});
