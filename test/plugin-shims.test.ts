import { describe, expect, it } from "vitest";
import { JSX_SHIM, reactShim, uiShim } from "../src/main/pi/plugins";

/**
 * The two modules a plugin is allowed to import, generated from what the window actually exports.
 *
 * They are strings of JavaScript that the window imports as a module, so a name that cannot be an
 * export leaves the whole file unparseable and the plugin reports a syntax error pointing at
 * nothing. `import * as react` really does hand back a `default` key, which is how that happened.
 */

const names = (shim: string) => [...shim.matchAll(/export const (\w+) =/g)].map((m) => m[1]);

describe("the shims a plugin imports", () => {
  it("re-exports every primitive the window reported", () => {
    expect(names(uiShim(["Badge", "Say", "Disclosure"]))).toEqual(["Badge", "Say", "Disclosure"]);
  });

  it("re-exports the window's own React, hooks included", () => {
    expect(names(reactShim(["useState", "useMemo", "createElement"]))).toContain("useState");
  });

  it("drops a reserved word rather than emitting a file that will not parse", () => {
    // `export const default = r.default` is a syntax error, and a module namespace object has one.
    const shim = reactShim(["useState", "default", "class", "version"]);
    expect(names(shim)).toEqual(["useState", "version"]);
    // Nothing is lost: the default comes back through the trailing re-export.
    expect(shim).toContain("export default r;");
  });

  it("drops a name that is not an identifier at all", () => {
    expect(names(uiShim(["Say", "not-an-identifier", "2bad", ""]))).toEqual(["Say"]);
  });

  it("reads one global, so the window installs the runtime in one place", () => {
    for (const shim of [JSX_SHIM, uiShim(["Say"]), reactShim(["useState"])]) {
      expect(shim).toContain("globalThis.__pidPlugin");
    }
  });
});
