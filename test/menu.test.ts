import { describe, expect, it, vi } from "vitest";

// menu.ts imports electron for Menu/shell/app; the template only needs `app.name`.
vi.mock("electron", () => ({
  app: { name: "pid" },
  Menu: { buildFromTemplate: (t: unknown) => t, setApplicationMenu: () => {} },
  shell: { openExternal: () => {} },
}));

import { type MenuCommand, menuTemplate } from "../src/main/menu";

/**
 * The menu is how ⌘N and ⌘T reach the window, and a wrong accelerator is invisible in every other
 * test: nothing type-checks against a key. `menuTemplate` exists so these assertions can read the
 * real template and fire the real handlers without an Electron app behind them.
 */
function entries(template: ReturnType<typeof menuTemplate>) {
  const out: { label: string; accelerator?: string; click?: () => void }[] = [];
  for (const top of template) {
    if (!Array.isArray(top.submenu)) continue;
    for (const item of top.submenu) {
      if (item.label || item.accelerator) out.push(item as (typeof out)[number]);
    }
  }
  return out;
}

describe("application menu", () => {
  it("binds Cmd+T to a new session and Cmd+N to Home", () => {
    const sent: MenuCommand[] = [];
    const items = entries(menuTemplate((cmd) => () => sent.push(cmd), () => {}));
    const find = (label: string) => items.find((i) => i.label === label);

    expect(find("New Session")?.accelerator).toBe("CmdOrCtrl+T");
    expect(find("Home")?.accelerator).toBe("CmdOrCtrl+N");

    find("New Session")?.click?.();
    find("Home")?.click?.();
    expect(sent).toEqual(["new-session", "home"]);
  });

  it("keeps Cmd+N off new-session, which is the whole point of the split", () => {
    const sent: MenuCommand[] = [];
    const items = entries(menuTemplate((cmd) => () => sent.push(cmd), () => {}));
    const withN = items.filter((i) => i.accelerator === "CmdOrCtrl+N");
    expect(withN).toHaveLength(1);
    expect(withN[0]?.label).toBe("Home");
  });

  it("routes zoom through the stored setting, not Electron's roles", () => {
    const steps: number[] = [];
    const items = entries(menuTemplate(() => () => {}, (s) => steps.push(s)));
    items.find((i) => i.label === "Bigger Interface" && i.accelerator === "CmdOrCtrl+Plus")?.click?.();
    items.find((i) => i.label === "Actual Size")?.click?.();
    expect(steps).toEqual([1, 0]);
  });
});
