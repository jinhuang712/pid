import { DEFAULT_SETTINGS, type PidSettings } from "@shared/settings";
import { createContext, type ReactNode, useCallback, useContext, useEffect, useState } from "react";
import { bridge } from "./bridge";

interface Ctx {
  settings: PidSettings;
  update: <S extends keyof PidSettings>(section: S, patch: Partial<PidSettings[S]>) => void;
  loaded: boolean;
}

const SettingsContext = createContext<Ctx>({ settings: DEFAULT_SETTINGS, update: () => {}, loaded: false });

/** Tailwind's spacing unit, which every p-/gap-/h-/w- utility multiplies. Density moves it. */
const SPACING: Record<PidSettings["appearance"]["density"], string> = {
  compact: "0.225rem",
  comfortable: "0.25rem",
  spacious: "0.29rem",
};

/** Measure of the conversation column. `full` lets it use the window. */
const MEASURE: Record<PidSettings["appearance"]["contentWidth"], string> = {
  narrow: "40rem",
  medium: "48rem",
  wide: "60rem",
  full: "100%",
};

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<PidSettings>(DEFAULT_SETTINGS);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    // A settings read that fails still has to end: the window restores its sessions from these
    // values, and the defaults are a usable answer — never a state the window waits on forever.
    void bridge.settings.get().then(
      (s) => {
        setSettings(s);
        setLoaded(true);
      },
      () => setLoaded(true),
    );
    // The menu's zoom items write settings in the main process; adopt them without a round trip.
    return bridge.settings.onChange(setSettings);
  }, []);

  // Appearance settings that are pure CSS live on the root element. Interface scale is not
  // among them: it is window zoom, applied in the main process where the settings are saved.
  useEffect(() => {
    const a = settings.appearance;
    const root = document.documentElement;
    root.style.setProperty("--pid-font-size", `${a.fontSize}px`);
    root.style.setProperty("--pid-prose-size", `${a.messageFontSize}px`);
    root.style.setProperty("--pid-code-font", a.codeFont || "var(--font-mono)");
    root.style.setProperty("--pid-code-size", `${a.codeFontSize}px`);
    root.style.setProperty("--pid-measure", MEASURE[a.contentWidth]);
    root.style.setProperty("--spacing", SPACING[a.density]);
    root.dataset.density = a.density;
    root.dataset.accent = a.accent;
    root.dataset.motion = a.reduceMotion ? "reduced" : "full";
  }, [settings.appearance]);

  const update = useCallback<Ctx["update"]>((section, patch) => {
    setSettings((prev) => {
      const next = { ...prev, [section]: { ...prev[section], ...patch } };
      void bridge.settings.set(next);
      return next;
    });
  }, []);

  return <SettingsContext.Provider value={{ settings, update, loaded }}>{children}</SettingsContext.Provider>;
}

export const useSettings = () => useContext(SettingsContext);
