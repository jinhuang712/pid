import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { DEFAULT_SETTINGS, type PidSettings, withDefaults } from "@shared/settings";
import { app, nativeTheme } from "electron";

/** PID settings live in userData/pid-settings.json. Pi's own settings.json is never touched. */
const file = () => join(app.getPath("userData"), "pid-settings.json");

let cached: PidSettings | undefined;

export function loadSettings(): PidSettings {
  if (cached) return cached;
  try {
    cached = withDefaults(JSON.parse(readFileSync(file(), "utf8")));
  } catch {
    cached = structuredClone(DEFAULT_SETTINGS);
  }
  return cached;
}

export function saveSettings(next: PidSettings): PidSettings {
  cached = withDefaults(next);
  mkdirSync(app.getPath("userData"), { recursive: true });
  writeFileSync(file(), JSON.stringify(cached, null, 2));
  applyTheme(cached);
  return cached;
}

export function applyTheme(s: PidSettings = loadSettings()) {
  nativeTheme.themeSource = s.appearance.theme;
}
