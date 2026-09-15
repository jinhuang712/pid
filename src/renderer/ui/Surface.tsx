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
