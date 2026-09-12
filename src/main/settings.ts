import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { DEFAULT_SETTINGS, type PidSettings, stepScale, withDefaults } from "@shared/settings";
import { app, type BrowserWindow, nativeTheme } from "electron";

/** PID settings live in userData/pid-settings.json. Pi's own settings.json is never touched. */
const file = () => join(app.getPath("userData"), "pid-settings.json");

/** Traffic-light inset at 100%. The buttons are drawn by macOS and do not zoom with the page. */
const TRAFFIC_LIGHT = { x: 18, y: 20 };

let cached: PidSettings | undefined;
let pendingWrite: NodeJS.Timeout | undefined;

export function loadSettings(): PidSettings {
  if (cached) return cached;
  try {
    cached = withDefaults(JSON.parse(readFileSync(file(), "utf8")));
  } catch {
    cached = structuredClone(DEFAULT_SETTINGS);
  }
  return cached;
}

/**
 * The in-memory copy is authoritative straight away; the file catches up. A slider sends a value
 * per tick, and none of them are worth a synchronous write of their own.
 */
export function saveSettings(next: PidSettings): PidSettings {
  cached = withDefaults(next);
  applyTheme(cached);
  if (pendingWrite) clearTimeout(pendingWrite);
  pendingWrite = setTimeout(flushSettings, 200);
  return cached;
}

/** Write a pending change now. Called on quit, where a lost preference would be a real bug. */
export function flushSettings() {
  if (!pendingWrite) return;
  clearTimeout(pendingWrite);
  pendingWrite = undefined;
  if (!cached) return;
  try {
    mkdirSync(app.getPath("userData"), { recursive: true });
    writeFileSync(file(), JSON.stringify(cached, null, 2));
  } catch {
    // a settings file we cannot write is not worth taking the window down for
  }
}

export function applyTheme(s: PidSettings = loadSettings()) {
  nativeTheme.themeSource = s.appearance.theme;
}

/**
 * Interface scale is window zoom, not a CSS variable: it has to carry hairlines, icons and the
 * hand-set pixel sizes too, and the renderer cannot zoom itself. The traffic lights keep their
 * physical size, so their inset is scaled to stay centred in the title row that grew around them.
 */
export function applyAppearance(win: BrowserWindow | undefined, s: PidSettings = loadSettings()) {
  applyTheme(s);
  if (!win || win.isDestroyed()) return;
  const scale = s.appearance.interfaceScale;
  win.webContents.setZoomFactor(scale);
  if (process.platform !== "darwin") return;
  try {
    win.setWindowButtonPosition({
      x: Math.round(TRAFFIC_LIGHT.x * scale),
      y: Math.round(TRAFFIC_LIGHT.y * scale),
    });
  } catch {
    // frameless-only API; a plain window keeps the system position
  }
}

/** ⌘+ / ⌘- / ⌘0. `steps` 0 returns to 100%. Returns the saved settings for broadcasting. */
export function nudgeScale(steps: number): PidSettings {
  const s = loadSettings();
  const interfaceScale = stepScale(s.appearance.interfaceScale, steps);
  if (interfaceScale === s.appearance.interfaceScale) return s;
  return saveSettings({ ...s, appearance: { ...s.appearance, interfaceScale } });
}
