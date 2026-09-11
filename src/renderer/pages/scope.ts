import type { ToggleScope } from "@shared/ecosystem";
import { useEffect, useState } from "react";

/**
 * Which settings layer the ecosystem pages write to, and which project directory the project
 * layer means. Shared across the Skills / MCP / Extensions pages through sessionStorage so the
 * choice survives switching pages; it resets when PID restarts.
 */
const KEY = "pid.ecoScope";

interface Stored {
  scope: ToggleScope;
  projectDir?: string;
}

function read(): Stored {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (raw) return JSON.parse(raw) as Stored;
  } catch {
    // no stored choice
  }
  return { scope: "global" };
}

export function useEcoScope(folder?: string) {
  const [stored, setStored] = useState<Stored>(read);
  useEffect(() => {
    try {
      sessionStorage.setItem(KEY, JSON.stringify(stored));
    } catch {
      // storage unavailable: the choice just does not persist
    }
  }, [stored]);
  // The active folder is the default project; an explicit choice sticks until cleared.
  const projectDir = stored.projectDir ?? folder;
  return {
    scope: stored.scope,
    projectDir,
    /** Directory passed to discovery so project-level items show up in both scopes. */
    cwd: projectDir,
    setScope: (scope: ToggleScope) => setStored((s) => ({ ...s, scope })),
    setProjectDir: (projectDir?: string) => setStored((s) => ({ ...s, projectDir })),
    explicitProject: stored.projectDir !== undefined,
  };
}
