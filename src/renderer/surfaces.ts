import { each } from "@shared/extension-kinds";
import type { ExtensionPage } from "@shared/extension-page";
import type { Page } from "./components/NavRail";
import type { Workspace } from "./state/workspace";

/**
 * What the navigation offers right now.
 *
 * Skills and Extensions are PID's own: they read Pi's configuration and are there whatever is
 * installed. Everything else in that list was put there by an extension describing a page, and is
 * there only while one is. Nothing is predicted — PID has no list of pages that might exist.
 */
export interface Surface {
  /** `page:<namespace>` for an extension's page; PID's own pages keep their fixed ids. */
  id: Page;
  label: string;
  /** The page to draw, when an extension described one. */
  page?: ExtensionPage;
  /** The session that published it, so its commands run where they mean something. */
  sessionKey?: string;
}

/** PID's own pages, in the order they appear above anything an extension adds. */
const OWN: Surface[] = [
  { id: "skills", label: "Skills" },
  { id: "extensions", label: "Extensions" },
];

export const pageId = (ns: string): Page => `page:${ns}`;

/**
 * Pages described by live sessions, one per publisher.
 *
 * A pending or exited session contributes nothing: its extensions are not running, so neither are
 * the commands its page's buttons would send.
 */
export function extensionPages(ws: Workspace): Surface[] {
  const out = new Map<string, Surface>();
  for (const p of Object.values(ws.procs)) {
    if (p.pending || p.exit) continue;
    for (const [ns, page] of each(p.published, "page")) {
      // Two sessions in different folders can publish the same page; the first live one answers.
      if (!out.has(ns)) out.set(ns, { id: pageId(ns), label: page.title, page, sessionKey: p.key });
    }
  }
  return [...out.values()];
}

export function surfaces(ws: Workspace): Surface[] {
  return [...OWN, ...extensionPages(ws)];
}
