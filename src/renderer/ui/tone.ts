/**
 * The five meanings a piece of interface can carry, and the classes that say each one.
 *
 * Every surface that colours something — a badge, a meter, a button, a dot — reaches for the same
 * five words, so the words live here once. Before this file the same map existed four times over,
 * twice character for character, and the fourth copy had already drifted.
 *
 * `muted` is the odd one: it is not a hue but the absence of one, so it resolves to the ink and
 * paper ramps rather than to a named colour.
 */

export type Tone = "ok" | "warn" | "danger" | "muted" | "accent";

/** Foreground only, for text and icons that sit on the page's own ground. */
export const TEXT: Record<Tone, string> = {
  ok: "text-ok",
  warn: "text-warn",
  danger: "text-danger",
  muted: "text-ink-3",
  accent: "text-accent",
};

/** Solid fill, for meters and dots — shapes that are the colour rather than wear it. */
export const FILL: Record<Tone, string> = {
  ok: "bg-ok",
  warn: "bg-warn",
  danger: "bg-danger",
  muted: "bg-ink-3",
  accent: "bg-accent",
};

/** A tinted ground with matching text, for badges and inline highlights. */
export const SOFT: Record<Tone, string> = {
  ok: "bg-ok-soft text-ok",
  warn: "bg-warn-soft text-warn",
  danger: "bg-danger-soft text-danger",
  muted: "bg-paper-3 text-ink-2",
  accent: "bg-accent-soft text-accent",
};
