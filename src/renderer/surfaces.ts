import type { Page } from "./components/NavRail";
import type { Registered } from "./plugins/api";

/**
 * What the navigation offers right now.
 *
 * Skills and Extensions are PID's own: they read Pi's configuration and are there whatever is
 * installed. Everything else was put there by a plugin that registered a page, and is there only
 * while one is. Nothing is predicted — PID has no list of pages that might exist.
 */
export interface Surface {
  /** `page:<plugin id>` for a plugin's page; PID's own pages keep their fixed ids. */
  id: Page;
  label: string;
  /** The plugin behind it, for the page body. Absent on PID's own. */
  plugin?: Registered;
}

/** PID's own pages, in the order they appear above anything a plugin adds. */
const OWN: Surface[] = [
  { id: "skills", label: "Skills" },
  { id: "extensions", label: "Extensions" },
];

export const pageId = (id: string): Page => `page:${id}`;

/** Pages registered by loaded plugins, in load order. A plugin that registered none adds none. */
export function pluginPages(plugins: Registered[]): Surface[] {
  return plugins
    .filter((p) => p.page)
    .map((p) => ({ id: pageId(p.id), label: p.page?.label ?? p.id, plugin: p }));
}

export function surfaces(plugins: Registered[]): Surface[] {
  return [...OWN, ...pluginPages(plugins)];
}
