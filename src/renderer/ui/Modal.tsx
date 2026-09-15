import type { ReactNode } from "react";

/**
 * A dimmed window with one panel on top.
 *
 * The three modals the window already had agreed on the idea and disagreed on every number: two
 * scrim opacities, two radii, two borders, three shadows, and two different distances from the top.
 * They are one shape here, and what genuinely differs between them — how wide, how tall, where it
 * sits, how high it stacks — is a prop.
 */
export function Modal({
  label,
  align = "center",
  width = 520,
  maxHeight,
  z = 40,
  onClose,
  children,
}: {
  label: string;
  /** `top` is for a surface you summon and type into; `center` for one that interrupts you. */
  align?: "center" | "top";
  width?: number;
  /** A CSS length. Omitted, the panel is as tall as its content. */
  maxHeight?: string;
  /** Raise a modal that must sit above another one. */
  z?: 40 | 50;
  /** Given, the scrim closes on click. Escape is the caller's, since only it knows what to cancel. */
  onClose?: () => void;
  children: ReactNode;
}) {
  return (
    <div
      className={`absolute inset-0 ${z === 50 ? "z-50" : "z-40"} bg-black/30 flex justify-center ${
        align === "top" ? "items-start pt-[15vh]" : "items-center"
      }`}
    >
      {onClose && (
        <button
          type="button"
          aria-label="Close"
          className="absolute inset-0 cursor-default"
          onMouseDown={onClose}
        />
      )}
      <dialog
        open
        aria-label={label}
        style={{ width, maxHeight }}
        className="relative m-0 p-0 max-w-[92vw] rounded-xl border border-line bg-paper-2 shadow-2xl text-ink flex flex-col overflow-hidden"
      >
        {children}
      </dialog>
    </div>
  );
}
