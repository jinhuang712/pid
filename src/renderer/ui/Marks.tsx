import type { ReactNode } from "react";
import { FILL, SOFT, type Tone } from "./tone";

/** Small things that carry a meaning rather than an action. */

/** A tinted pill. The tone is the point; the text explains it. */
export function Badge({
  tone = "muted",
  title,
  children,
}: {
  tone?: Tone;
  title?: string;
  children: ReactNode;
}) {
  return (
    <span title={title} className={`inline-flex items-center h-5 px-1.5 rounded text-xs ${SOFT[tone]}`}>
      {children}
    </span>
  );
}

/**
 * A 6px status dot.
 *
 * Most callers mean one of the five tones. A caller with its own vocabulary — session status, say,
 * which has more states than tones — passes `className` and keeps its own map; it still gets the
 * shape from here, so the dots stay the same size across the window.
 */
export function Dot({ tone, title, className = "" }: { tone?: Tone; title?: string; className?: string }) {
  return (
    <span
      title={title}
      className={`w-1.5 h-1.5 rounded-full shrink-0 ${tone ? FILL[tone] : ""} ${className}`}
    />
  );
}

/**
 * Figures that must not jitter as they count.
 *
 * Token counts, costs and elapsed times update in place, so they use tabular figures; without them
 * a `1` is narrower than a `7` and the whole row twitches on every frame.
 */
export function Num({
  className = "",
  title,
  children,
}: {
  className?: string;
  title?: string;
  children: ReactNode;
}) {
  return (
    <span title={title} className={`font-mono tabular-nums ${className}`}>
      {children}
    </span>
  );
}

/**
 * The small caps label above a group of settings, or before a number.
 *
 * It existed at two sizes and two letter-spacings, one in the usage row and one in the settings
 * page. This is the settings page's, which is the one anchored to the type scale.
 */
export function Eyebrow({ className = "", children }: { className?: string; children: ReactNode }) {
  return <span className={`text-2xs uppercase tracking-[0.08em] text-ink-3 ${className}`}>{children}</span>;
}
