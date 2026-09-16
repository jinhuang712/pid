import type { CSSProperties, ReactNode, Ref } from "react";

/**
 * The three grounds the window draws on.
 *
 * `Floating` lifts off the page and casts a shadow — menus, popovers, the autocomplete. `Panel` is
 * flat and bordered, part of the page rather than above it. `Divider` is the hairline between two
 * things that share a ground.
 *
 * Positioning is the caller's: a menu is `fixed` at a point, a popover is `absolute` against its
 * trigger, the autocomplete spans its composer. So these take a `className` and own only the look.
 */

/** Lifted surface: radius, border, ground, shadow. Nothing about where it sits. */
export function Floating({
  className = "",
  style,
  ref,
  children,
}: {
  className?: string;
  style?: CSSProperties;
  ref?: Ref<HTMLDivElement>;
  children: ReactNode;
}) {
  return (
    <div
      ref={ref}
      style={style}
      className={`rounded-xl border border-line-2 bg-paper-2 shadow-[0_10px_40px_rgba(0,0,0,0.3)] ${className}`}
    >
      {children}
    </div>
  );
}

/** Flat bordered surface, level with the page. */
export function Panel({ className = "", children }: { className?: string; children: ReactNode }) {
  return <div className={`rounded-lg border border-line bg-paper-2 ${className}`}>{children}</div>;
}

/** A hairline. `inset` is the breathing room a menu wants around its separators. */
export function Divider({ inset = false, className = "" }: { inset?: boolean; className?: string }) {
  return <div className={`border-t border-line ${inset ? "my-1" : ""} ${className}`} />;
}

/** The scrolling region of a column that has a fixed header above it. */
export function Scroll({ className = "", children }: { className?: string; children: ReactNode }) {
  return <div className={`flex-1 min-h-0 overflow-y-auto ${className}`}>{children}</div>;
}

/**
 * A horizontal run of things, with the window's own spacing.
 *
 * This exists because a plugin cannot reach for a utility class: the stylesheet is built from
 * PID's own sources, so a class no PID file uses is not in it. Layout therefore has to be a
 * primitive like everything else — `gap` and `pad` are the two decisions a caller actually makes.
 */
export function Line({
  gap = "normal",
  pad = true,
  className = "",
  title,
  children,
}: {
  gap?: "tight" | "normal" | "wide";
  /** False for a line nested inside something that already has padding. */
  pad?: boolean;
  className?: string;
  title?: string;
  children: ReactNode;
}) {
  const g = gap === "tight" ? "gap-1.5" : gap === "wide" ? "gap-4" : "gap-3";
  return (
    <div title={title} className={`flex items-center min-w-0 ${g} ${pad ? "px-6 py-1" : ""} ${className}`}>
      {children}
    </div>
  );
}

/** Pushes whatever follows it to the far end of a `Line`. */
export function Spread() {
  return <span className="flex-1" />;
}

/** A vertical run, for a page body or a list of cards. */
export function Stack({
  gap = "normal",
  pad = true,
  className = "",
  children,
}: {
  gap?: "tight" | "normal" | "wide";
  pad?: boolean;
  className?: string;
  children: ReactNode;
}) {
  const g = gap === "tight" ? "gap-1" : gap === "wide" ? "gap-5" : "gap-2";
  return (
    <div className={`flex flex-col min-w-0 ${g} ${pad ? "px-6 py-4" : ""} ${className}`}>{children}</div>
  );
}

/** The same run, inline, for something that sits inside a line of text. */
export function Inline({
  gap = "tight",
  className = "",
  title,
  children,
}: {
  gap?: "tight" | "normal";
  className?: string;
  title?: string;
  children: ReactNode;
}) {
  return (
    <span
      title={title}
      className={`inline-flex items-center min-w-0 ${gap === "tight" ? "gap-1.5" : "gap-3"} ${className}`}
    >
      {children}
    </span>
  );
}

/** Body text in one of the window's three weights. Plugins have no other way to say "dim". */
export function Say({
  tone = "normal",
  mono,
  truncate,
  className = "",
  title,
  children,
}: {
  tone?: "normal" | "soft" | "faint" | "warn" | "danger" | "ok" | "accent";
  mono?: boolean;
  truncate?: boolean;
  className?: string;
  title?: string;
  children: ReactNode;
}) {
  const t = {
    normal: "text-ink",
    soft: "text-ink-2",
    faint: "text-ink-3",
    warn: "text-warn",
    danger: "text-danger",
    ok: "text-ok",
    accent: "text-accent",
  }[tone];
  return (
    <span
      title={title}
      className={`text-xs ${t} ${mono ? "font-mono" : ""} ${truncate ? "truncate" : ""} ${className}`}
    >
      {children}
    </span>
  );
}
