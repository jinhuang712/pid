import { DEFAULT_SETTINGS, type PidSettings } from "@shared/settings";
import { createContext, type ReactNode, useCallback, useContext, useEffect, useState } from "react";
import { bridge } from "./bridge";

interface Ctx {
  settings: PidSettings;
  update: <S extends keyof PidSettings>(section: S, patch: Partial<PidSettings[S]>) => void;
  loaded: boolean;
}

const SettingsContext = createContext<Ctx>({ settings: DEFAULT_SETTINGS, update: () => {}, loaded: false });

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<PidSettings>(DEFAULT_SETTINGS);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    void bridge.settings.get().then((s) => {
      setSettings(s);
      setLoaded(true);
    });
  }, []);

  // Appearance settings that are pure CSS live on the root element.
  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty("--pid-font-size", `${settings.appearance.fontSize}px`);
    root.style.setProperty("--pid-code-font", settings.appearance.codeFont || "var(--font-mono)");
    root.dataset.density = settings.appearance.density;
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
