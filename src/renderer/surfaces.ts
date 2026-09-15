import { KINDS, type Kind } from "@shared/extension-kinds";
import type { Page } from "./components/NavRail";
import type { Workspace } from "./state/workspace";

/**
 * Which pages exist right now.
 *
 * Some of PID's pages are PID's own — Skills and Extensions read Pi's configuration and are there
 * whatever is installed. Others are a place for an extension to put something, and are only a page
 * while an extension is filling them: MCP without an MCP extension is an empty frame with a
 * heading, which is worse than no menu entry.
 *
 * The rule lives in this table so the window never asks whether one particular extension is
 * installed. A new surface is a row here; nothing branches on its name.
 */
export interface PageSurface {
  id: Page;
  label: string;
  /** The published kind that fills it. Absent means the page is PID's own and always there. */
  kind?: Kind;
}

export const PAGE_SURFACES: PageSurface[] = [
  { id: "skills", label: "Skills" },
  { id: "mcp", label: "MCP", kind: "mcp-status" },
  { id: "extensions", label: "Extensions" },
];

/** Kinds any live session has published. A closed or exited session contributes nothing. */
export function liveKinds(ws: Workspace): Set<Kind> {
  const out = new Set<Kind>();
  for (const p of Object.values(ws.procs)) {
    if (p.pending || p.exit) continue;
    for (const kind of KINDS) if (p.published[kind] !== undefined) out.add(kind);
  }
  return out;
}

export function availablePages(kinds: Set<Kind>): PageSurface[] {
  return PAGE_SURFACES.filter((s) => !s.kind || kinds.has(s.kind));
}
