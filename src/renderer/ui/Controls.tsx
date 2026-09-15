import type { MouseEvent, ReactNode } from "react";

/** Things you click. */

const ICON_SIZE = {
  sm: "w-5 h-5 rounded",
  md: "w-[26px] h-[26px] rounded-full",
  lg: "w-[30px] h-[30px] rounded-full",
} as const;

/**
 * A square button whose whole content is an icon.
 *
 * The window had four of these at four different pixel sizes with no shared source. Three sizes
 * cover every one of them; `className` is appended last so a caller that needs a different ground
 * (the stop button turns red on hover) can say so without leaving the primitive.
 */
export function IconButton({
  size = "md",
  ground = true,
  title,
  disabled,
  onClick,
  className = "",
  children,
  ...rest
}: {
  size?: keyof typeof ICON_SIZE;
  /** False for a button that brightens on hover without taking a ground of its own. */
  ground?: boolean;
  title?: string;
  disabled?: boolean;
  onClick?: (e: MouseEvent<HTMLButtonElement>) => void;
  className?: string;
  children: ReactNode;
} & Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "onClick" | "title" | "disabled" | "className">) {
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onClick={onClick}
      className={`${ICON_SIZE[size]} shrink-0 flex items-center justify-center text-ink-3 hover:text-ink transition-colors disabled:opacity-40 ${
        ground ? "hover:bg-paper-3" : ""
      } ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}

/**
 * A full-width row in a list.
 *
 * `active` is the row the keyboard is on; `hover` is whether the pointer highlights rows at all.
 * A list driven by a cursor turns hover off, so moving the mouse across it does not light up a
 * second row while the keyboard owns a different one.
 */
export function Row({
  active,
  hover = true,
  disabled,
  title,
  onClick,
  className = "",
  children,
  ...rest
}: {
  active?: boolean;
  hover?: boolean;
  disabled?: boolean;
  title?: string;
  onClick?: (e: MouseEvent<HTMLButtonElement>) => void;
  className?: string;
  children: ReactNode;
} & Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "onClick" | "title" | "disabled" | "className">) {
  return (
    <button
      type="button"
      disabled={disabled}
      title={title}
      onClick={onClick}
      className={`w-full h-7 px-3 flex items-center gap-2 text-left disabled:opacity-40 ${
        active ? "bg-paper-3" : ""
      } ${hover ? "hover:bg-paper-3" : ""} ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}

function Chevron() {
  return (
    <svg
      width="10"
      height="10"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      className="ml-1 inline-block opacity-70"
    >
      <title>open</title>
      <path d="m5 6 3 3 3-3" />
    </svg>
  );
}

/**
 * The button that opens a picker: current value, then a chevron.
 *
 * `placement` is where the popover will go, which the trigger has to know because the toolbar and
 * the composer card give it different room. The two pickers that use this had the class string
 * character for character in both files.
 */
export function Trigger({
  placement = "down",
  title,
  onClick,
  children,
}: {
  placement?: "up" | "down";
  title?: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={`no-drag h-6.5 px-2 rounded-md text-xs text-ink-2 hover:text-ink hover:bg-paper-3 inline-flex items-center whitespace-nowrap ${
        placement === "up" ? "h-[26px] rounded-full text-[12.5px]" : ""
      }`}
    >
      {children}
      <Chevron />
    </button>
  );
}

/** A switch. Off is the paper ramp, on is the accent — the window's only saturated state. */
export function Toggle({
  value,
  onChange,
  disabled,
  title,
}: {
  value: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  title?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={value}
      disabled={disabled}
      title={title}
      onClick={(e) => {
        e.stopPropagation();
        onChange(!value);
      }}
      className={`relative shrink-0 w-9 h-5 rounded-full transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${value ? "bg-accent" : "bg-paper-4"}`}
    >
      <span
        className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${value ? "left-4.5" : "left-0.5"}`}
      />
    </button>
  );
}

/**
 * A row of pills, one of them lit.
 *
 * The window had this three times: twice by name in the settings page, and once more unnamed, two
 * files away from a copy it could have imported. `labels` exists because the options are nearly
 * always a string union whose own members read well enough to be the pills.
 */
export function Segmented<T extends string>({
  options,
  labels,
  value,
  onChange,
  label,
}: {
  options: readonly T[];
  /** Display text for options whose value is not what should appear on the pill. */
  labels?: Partial<Record<T, string>>;
  value: T;
  onChange: (value: T) => void;
  /** Names the group for a pointer that lands on the frame rather than on a pill. */
  label?: string;
}) {
  return (
    // Buttons that stay pressed, rather than a radiogroup: every pill is reachable by Tab, which is
    // what someone expects of a strip of three or four options in a settings row.
    <div title={label} className="inline-flex rounded-md border border-line bg-paper-2 p-0.5">
      {options.map((o) => (
        <button
          type="button"
          key={o}
          aria-pressed={o === value}
          onClick={() => onChange(o)}
          className={`h-6 px-2.5 rounded text-xs ${o === value ? "bg-paper-4 text-ink" : "text-ink-2 hover:text-ink"}`}
        >
          {labels?.[o] ?? o}
        </button>
      ))}
    </div>
  );
}
