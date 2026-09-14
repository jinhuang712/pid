/**
 * PID-owned settings. Only things that belong to a desktop frontend live here.
 * Nothing in this file is agent state; deleting the file resets the GUI and nothing else.
 */

export type ThemeMode = "system" | "light" | "dark";
export type Density = "compact" | "comfortable" | "spacious";
export type ContentWidth = "narrow" | "medium" | "wide" | "full";
/** Muted hues only: the accent is the single emphasis in the UI and must stay quiet. */
export type Accent = "grey" | "amber" | "sage" | "clay" | "indigo";

export const THEMES: readonly ThemeMode[] = ["system", "light", "dark"];
export const DENSITIES: readonly Density[] = ["compact", "comfortable", "spacious"];
export const CONTENT_WIDTHS: readonly ContentWidth[] = ["narrow", "medium", "wide", "full"];
export const ACCENTS: readonly Accent[] = ["grey", "amber", "sage", "clay", "indigo"];

/**
 * The stops the scale picker and ⌘+ / ⌘- step through. Whole-window zoom, so chrome,
 * icons, borders and text grow together — the one lever for "PID reads small on this display".
 */
export const UI_SCALES = [0.9, 1, 1.1, 1.25, 1.5] as const;

export interface PidSettings {
  appearance: {
    theme: ThemeMode;
    /** Window zoom factor. Everything scales; nothing reflows differently. */
    interfaceScale: number;
    fontSize: number; // px, anchors the whole UI type scale
    messageFontSize: number; // px, conversation text only — reading size, not chrome size
    codeFont: string;
    codeFontSize: number;
    density: Density;
    contentWidth: ContentWidth; // measure of the conversation column
    accent: Accent;
    reduceMotion: boolean;
    toolCardsCollapsed: boolean;
    thinkingCollapsed: boolean;
    /** Fold a finished turn's thinking and tool calls behind one "Worked for …" line. */
    stepsCollapsed: boolean;
    sidebarWidth: number;
  };
  conversation: {
    enterSends: boolean; // false → Enter inserts newline, Cmd+Enter sends
    autoScroll: boolean;
    referencePreviewOpen: boolean; // expand $reference inspector by default
  };
  sessions: {
    sort: "modified" | "created" | "name";
    previewLength: number;
    showForkLineage: boolean; // nest forks under their parent in the session tree
    restoreOnLaunch: boolean; // reopen the sessions that were open when PID last quit
    /** What to do on quit while a session is still running. Pi processes are children of PID and cannot outlive it. */
    onQuitWhileRunning: "ask" | "finish" | "quit";
  };
  files: {
    ignorePatterns: string[]; // extra globs excluded from @ search
    showHidden: boolean;
  };
  notifications: {
    runCompleted: boolean;
    inputRequired: boolean;
    error: boolean;
    onlyWhenUnfocused: boolean;
  };
  advanced: {
    piBinary: string; // "" → resolve `pi` from the login shell PATH
    piExtraArgs: string; // appended to `pi --mode rpc`
  };
}

export const DEFAULT_SETTINGS: PidSettings = {
  appearance: {
    theme: "system",
    interfaceScale: 1,
    fontSize: 13,
    messageFontSize: 14,
    codeFont: "",
    codeFontSize: 12.5,
    density: "comfortable",
    contentWidth: "medium",
    accent: "amber",
    reduceMotion: false,
    toolCardsCollapsed: true,
    thinkingCollapsed: true,
    stepsCollapsed: true,
    sidebarWidth: 272,
  },
  conversation: {
    enterSends: true,
    autoScroll: true,
    referencePreviewOpen: false,
  },
  sessions: {
    sort: "modified",
    previewLength: 160,
    showForkLineage: true,
    restoreOnLaunch: true,
    onQuitWhileRunning: "ask",
  },
  files: {
    ignorePatterns: [],
    showHidden: false,
  },
  notifications: {
    runCompleted: true,
    inputRequired: true,
    error: true,
    onlyWhenUnfocused: true,
  },
  advanced: {
    piBinary: "",
    piExtraArgs: "",
  },
};

/** Bounds the UI enforces anyway. A hand-edited file must not be able to make the window unusable. */
const NUMERIC: Record<string, [min: number, max: number]> = {
  "appearance.interfaceScale": [0.8, 1.6],
  "appearance.fontSize": [11, 18],
  "appearance.messageFontSize": [12, 20],
  "appearance.codeFontSize": [10, 18],
  "appearance.sidebarWidth": [200, 460],
  "sessions.previewLength": [40, 400],
};

const CHOICES: Record<string, readonly string[]> = {
  "appearance.theme": THEMES,
  "appearance.density": DENSITIES,
  "appearance.contentWidth": CONTENT_WIDTHS,
  "appearance.accent": ACCENTS,
  "sessions.sort": ["modified", "created", "name"],
  "sessions.onQuitWhileRunning": ["ask", "finish", "quit"],
};

/** True when `v` is a usable replacement for the default at `path`. */
function acceptable(path: string, v: unknown, fallback: unknown): boolean {
  if (typeof v !== typeof fallback) return false;
  if (Array.isArray(fallback)) return Array.isArray(v) && v.every((x) => typeof x === "string");
  if (Array.isArray(v)) return false;
  if (typeof v === "number" && !Number.isFinite(v)) return false;
  const choices = CHOICES[path];
  if (choices && !choices.includes(v as string)) return false;
  return true;
}

/** Deep-merge stored values over defaults so new keys always have a value. */
export function withDefaults(stored: unknown): PidSettings {
  const s = (stored ?? {}) as Partial<Record<keyof PidSettings, Record<string, unknown>>>;
  const out = structuredClone(DEFAULT_SETTINGS) as unknown as Record<string, Record<string, unknown>>;
  for (const section of Object.keys(out)) {
    const from = s[section as keyof PidSettings];
    if (!from || typeof from !== "object") continue;
    for (const [k, v] of Object.entries(from)) {
      if (!(k in out[section])) continue;
      const path = `${section}.${k}`;
      if (!acceptable(path, v, out[section][k])) continue;
      const range = NUMERIC[path];
      out[section][k] = range ? Math.min(range[1], Math.max(range[0], v as number)) : v;
    }
  }
  return out as unknown as PidSettings;
}

/**
 * One stop up (`steps` > 0), one stop down (`steps` < 0), or back to 100% (`steps` 0).
 * "Up" is the next stop strictly above the current value, so a scale that is between stops —
 * a hand-edited file — still moves in the direction asked for rather than jumping past it.
 */
export function stepScale(current: number, steps: number): number {
  const EPSILON = 1e-6;
  const last = UI_SCALES[UI_SCALES.length - 1];
  if (steps === 0) return 1;
  if (steps > 0) return UI_SCALES.find((s) => s > current + EPSILON) ?? last;
  return [...UI_SCALES].reverse().find((s) => s < current - EPSILON) ?? UI_SCALES[0];
}
