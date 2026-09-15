import { mkdirSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { app, BrowserWindow, Menu, type MenuItem } from "electron";

/**
 * Development-only window dump, used by headless smoke runs.
 *
 * On macOS a terminal needs Assistive Access to click and Screen Recording to screenshot, so an
 * agent testing PID cannot drive the window the way a human does. This writes what the window
 * actually painted — plus the menu accelerators Electron actually installed — and lets the renderer
 * report produced data (e.g. the `@` list) through a tiny global hook.
 *
 * Off unless `PID_DUMP_DIR` is set.
 */
export function installDebugDump(): void {
  const dir = process.env.PID_DUMP_DIR;
  if (!dir) return;

  const menuLines = (items: MenuItem[]): string[] =>
    items.flatMap((i) => {
      const own = i.label || i.accelerator ? [`${i.label ?? "(role)"} :: ${i.accelerator ?? ""}`] : [];
      const sub = i.submenu?.items.map((s) =>
        s.label || s.accelerator ? `  ${s.label ?? "(role)"} :: ${s.accelerator ?? ""}` : "",
      );
      return [...own, ...(sub ?? [])];
    });

  const dump = async () => {
    try {
      mkdirSync(dir, { recursive: true });
      const win = BrowserWindow.getAllWindows()[0];
      if (!win) return;
      await writeFile(join(dir, "menu.txt"), `${menuLines(Menu.getApplicationMenu()?.items ?? []).join("\n")}\n`);
      const report = await win.webContents.executeJavaScript("JSON.stringify(window.__pidDump ?? null)");
      await writeFile(join(dir, "window.json"), String(report));
      const text = await win.webContents.executeJavaScript(
        "document.body.innerText.replace(/\\n{3,}/g, '\\n\\n').slice(0, 6000)",
      );
      await writeFile(join(dir, "window.txt"), String(text));
    } catch (e) {
      await writeFile(join(dir, "error.txt"), String(e)).catch(() => {});
    }
  };

  app.whenReady().then(() => {
    const win = BrowserWindow.getAllWindows()[0];
    win?.webContents.once("did-finish-load", () => {
      // Repeated on purpose: a resumed session keeps replaying while the window settles, and a
      // probe read only at the end is what a smoke run actually wants to assert on.
      for (const delay of [5000, 10000, 15000, 25000, 40000, 60000]) {
        setTimeout(() => void dump(), delay);
      }
    });
  });
}
