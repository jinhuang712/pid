/**
 * PID-owned settings. Only things that belong to a desktop frontend live here.
 * Nothing in this file is agent state; deleting the file resets the GUI and nothing else.
 */
export interface PidSettings {
  appearance: {
    theme: "system" | "light" | "dark";
    fontSize: number; // px, base UI size
    codeFont: string;
    density: "comfortable" | "compact";
    toolCardsCollapsed: boolean;
    thinkingCollapsed: boolean;
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
    fontSize: 13,
    codeFont: "",
    density: "comfortable",
    toolCardsCollapsed: true,
    thinkingCollapsed: true,
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

/** Deep-merge stored values over defaults so new keys always have a value. */
export function withDefaults(stored: unknown): PidSettings {
  const s = (stored ?? {}) as Partial<Record<keyof PidSettings, Record<string, unknown>>>;
  const out = structuredClone(DEFAULT_SETTINGS) as unknown as Record<string, Record<string, unknown>>;
  for (const section of Object.keys(out)) {
    const stored = s[section as keyof PidSettings];
    if (!stored || typeof stored !== "object") continue;
    for (const [k, v] of Object.entries(stored)) {
      if (k in out[section] && typeof v === typeof out[section][k]) out[section][k] = v;
    }
  }
  return out as unknown as PidSettings;
}
