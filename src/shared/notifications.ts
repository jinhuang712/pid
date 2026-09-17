import type { PidSettings } from "./settings";

/**
 * What the window tells the shell about a finished turn, a blocked extension, or an error.
 *
 * The window sends facts and the main process decides whether the OS hears them. Notification
 * permission, focus and the platform's own habits are shell questions; a renderer that answered
 * them itself would be guessing at a terminal it cannot see.
 */
export type NotificationKind = "runCompleted" | "inputRequired" | "error";

export interface NotifyRequest {
  kind: NotificationKind;
  /** Headline. macOS prints the app name above it, so this is the session, never "PID". */
  title: string;
  /** Second line: the folder the session belongs to. */
  subtitle?: string;
  body?: string;
  /**
   * Pi's session file. It is the identity for replace-and-group — a session that finishes three
   * turns replaces its own banner instead of stacking three — and how a click finds its way back.
   */
  sessionFile?: string;
  cwd?: string;
}

/** `refused` is the one the user has to act on: the system has this app turned off. */
export type NotifyResult =
  /**
   * `confirmed` is the platform's own word for it. macOS says nothing at all when a banner was
   * posted while the app is frontmost, or when it simply stayed quiet, and calling that a success
   * would be the window guessing at a screen it cannot see.
   */
  | { shown: true; confirmed: boolean }
  | { shown: false; reason: "off" | "focused" | "unsupported" | "refused"; error?: string };

/**
 * Whether to bother the OS at all, before anything is attempted. This is the whole of PID's
 * policy: the two toggles are the user's, and the focus check is what a banner earns when the
 * window that raised it is already in front of them.
 */
export function notificationGate(
  prefs: PidSettings["notifications"],
  kind: NotificationKind,
  focused: boolean,
): "send" | "off" | "focused" {
  if (!prefs[kind]) return "off";
  if (prefs.onlyWhenUnfocused && focused) return "focused";
  return "send";
}
