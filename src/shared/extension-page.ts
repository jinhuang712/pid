/**
 * A page an extension describes and PID draws.
 *
 * PID cannot load an extension's code — that would make it a plugin platform, and a window running
 * third-party code is a different product. But an extension can describe what it wants shown, and
 * PID can render a description. So the page's shape is data: rows, badges, switches, buttons. What
 * the rows *mean* stays with the extension, and PID never learns it.
 *
 * Every affordance resolves to a command string, which PID runs the way a typed slash command runs.
 * That is deliberate: the extension already has commands for everything it can do, they work in the
 * terminal too, and it means PID needs no second way to call back into an extension.
 *
 * The shape here was not invented. It is what the one built-in ecosystem page PID used to carry
 * already rendered, with its subject taken out: a list of things with a couple of badges each, a
 * switch, two or three buttons, an expanding list of sub-things with badges and buttons of their
 * own, and some key/value detail. Anything that page could do, a description can say.
 */

export type Tone = "ok" | "warn" | "danger" | "muted" | "accent";

export interface PageBadge {
  text: string;
  tone?: Tone;
}

/** A button. `command` is run as though the user had typed it. */
export interface PageAction {
  label: string;
  command: string;
  tone?: Tone;
  /** Shown on hover. Defaults to the command, so a user can always see what a button will run. */
  title?: string;
}

/** A switch. Two commands rather than a value to write: the extension owns its own config. */
export interface PageToggle {
  value: boolean;
  on: string;
  off: string;
  title?: string;
}

export interface PageRow {
  /** Stable across publishes: it keys the expanded state, so a refresh must not collapse the page. */
  id: string;
  title: string;
  subtitle?: string;
  badges?: PageBadge[];
  toggle?: PageToggle;
  actions?: PageAction[];
  details?: { label: string; value: string }[];
  /** One level of nesting — the tools under a server, say. Deeper is a different page. */
  rows?: PageRow[];
}

export interface PageSection {
  title?: string;
  note?: string;
  rows: PageRow[];
}

export interface ExtensionPage {
  /** The navigation entry and the heading. */
  title: string;
  note?: string;
  sections: PageSection[];
}

const TONES: Tone[] = ["ok", "warn", "danger", "muted", "accent"];
/** One level of nesting, and a page cannot ask PID to draw an unbounded tree. */
const MAX_DEPTH = 2;

/**
 * Parse a published page; undefined when cleared or malformed.
 *
 * Checked field by field rather than trusted: this describes what a window will draw and comes from
 * code PID does not own. A description PID cannot read is no page, not a broken one.
 */
export function parseExtensionPage(lines: string[] | undefined): ExtensionPage | undefined {
  if (!lines || lines.length === 0) return undefined;
  try {
    const v = JSON.parse(lines.join("")) as Partial<ExtensionPage>;
    if (!v || typeof v.title !== "string" || !v.title.trim()) return undefined;
    const sections = Array.isArray(v.sections) ? v.sections.map(section).filter(nonEmpty) : [];
    return {
      title: v.title.trim(),
      ...(str(v.note) ? { note: str(v.note) } : {}),
      sections,
    };
  } catch {
    return undefined;
  }
}

const str = (v: unknown): string | undefined => (typeof v === "string" && v.trim() ? v.trim() : undefined);

const tone = (v: unknown): Tone | undefined => (TONES.includes(v as Tone) ? (v as Tone) : undefined);

function nonEmpty(s: PageSection): boolean {
  return s.rows.length > 0;
}

function section(raw: unknown): PageSection {
  const v = (raw ?? {}) as Partial<PageSection>;
  return {
    ...(str(v.title) ? { title: str(v.title) } : {}),
    ...(str(v.note) ? { note: str(v.note) } : {}),
    rows: Array.isArray(v.rows) ? rows(v.rows, 1) : [],
  };
}

function rows(raw: unknown[], depth: number): PageRow[] {
  const seen = new Set<string>();
  const out: PageRow[] = [];
  for (const item of raw) {
    const v = (item ?? {}) as Partial<PageRow>;
    const id = str(v.id);
    const title = str(v.title);
    // A row with no id cannot keep its expanded state, and a duplicate id would share one.
    if (!id || !title || seen.has(id)) continue;
    seen.add(id);
    out.push({
      id,
      title,
      ...(str(v.subtitle) ? { subtitle: str(v.subtitle) } : {}),
      ...(Array.isArray(v.badges) ? { badges: v.badges.map(badge).filter(Boolean) as PageBadge[] } : {}),
      ...(toggle(v.toggle) ? { toggle: toggle(v.toggle) } : {}),
      ...(Array.isArray(v.actions) ? { actions: v.actions.map(action).filter(Boolean) as PageAction[] } : {}),
      ...(Array.isArray(v.details) ? { details: details(v.details) } : {}),
      ...(Array.isArray(v.rows) && depth < MAX_DEPTH ? { rows: rows(v.rows, depth + 1) } : {}),
    });
  }
  return out;
}

function badge(raw: unknown): PageBadge | undefined {
  const v = (raw ?? {}) as Partial<PageBadge>;
  const text = str(v.text);
  return text ? { text, ...(tone(v.tone) ? { tone: tone(v.tone) } : {}) } : undefined;
}

function action(raw: unknown): PageAction | undefined {
  const v = (raw ?? {}) as Partial<PageAction>;
  const label = str(v.label);
  const command = str(v.command);
  if (!label || !command) return undefined;
  return {
    label,
    command,
    ...(tone(v.tone) ? { tone: tone(v.tone) } : {}),
    title: str(v.title) ?? command,
  };
}

function toggle(raw: unknown): PageToggle | undefined {
  const v = (raw ?? {}) as Partial<PageToggle>;
  const on = str(v.on);
  const off = str(v.off);
  if (!on || !off) return undefined;
  return { value: v.value === true, on, off, ...(str(v.title) ? { title: str(v.title) } : {}) };
}

function details(raw: unknown[]): { label: string; value: string }[] {
  const out: { label: string; value: string }[] = [];
  for (const item of raw) {
    const v = (item ?? {}) as { label?: unknown; value?: unknown };
    const label = str(v.label);
    if (label) out.push({ label, value: str(v.value) ?? "" });
  }
  return out;
}
