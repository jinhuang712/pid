/**
 * What PID does with each member of Pi's `ExtensionUIContext`.
 *
 * The terminal is the reference host: it serves all of them. PID serves the ones whose payload is
 * plain data, and says so plainly about the rest. This table is the single answer to that question
 * — `session-worker.ts` implements it, the extension scanner reports against it, and the Extensions
 * page renders it, so the three cannot drift apart.
 *
 * `satisfies Record<keyof ExtensionUIContext, UiSupport>` is the lock: when Pi adds a UI member,
 * typecheck fails here until PID decides what it does with it.
 */

import type { ExtensionUIContext } from "@earendil-works/pi-coding-agent";

export type UiSupport =
  /** PID does the real thing and the extension sees the real answer. */
  | "served"
  /** PID accepts the call and nothing happens. The terminal would have done something. */
  | "inert"
  /** The signature carries a terminal: a `TUI`, a pi-tui `Component`, or raw input bytes. */
  | "terminal";

export const PID_UI_SUPPORT = {
  // Dialogs: the window asks, the user answers, the extension's await resolves.
  select: "served",
  confirm: "served",
  input: "served",
  editor: "served",
  notify: "served",

  // Line-based chrome: PID shows these in the extension strip under the transcript.
  // `setWidget`'s component-factory overload is dropped — only the string[] overload crosses.
  setStatus: "served",
  setWidget: "served",

  // Pi's themes are terminal palettes. They read back honestly; PID paints its own, so it does not
  // switch to one.
  theme: "served",
  getAllThemes: "served",
  getTheme: "served",
  setTheme: "inert",

  // A window is not a terminal tab, and one window holds many sessions: a background session
  // renaming the whole window would be wrong.
  setTitle: "inert",
  // The composer draft lives in the window. `getEditorText` is synchronous, so the worker cannot
  // ask for it, and setting it is not implemented rather than faked.
  setEditorText: "inert",
  pasteToEditor: "inert",
  getEditorText: "inert",
  // PID drives its own transcript, loader and completion.
  setWorkingMessage: "inert",
  setWorkingVisible: "inert",
  setWorkingIndicator: "inert",
  setHiddenThinkingLabel: "inert",
  getToolsExpanded: "inert",
  setToolsExpanded: "inert",
  addAutocompleteProvider: "inert",

  // These take a `TUI`, return a pi-tui `Component`, or read the terminal's own input stream.
  // Nothing PID can pass satisfies them.
  onTerminalInput: "terminal",
  setFooter: "terminal",
  setHeader: "terminal",
  custom: "terminal",
  setEditorComponent: "terminal",
  getEditorComponent: "terminal",
} as const satisfies Record<keyof ExtensionUIContext, UiSupport>;

export type UiMember = keyof typeof PID_UI_SUPPORT;

/**
 * Renderer registrations that live on `ExtensionAPI` rather than `ctx.ui`, and return a pi-tui
 * `Component`. An extension that draws its own messages or entries draws them for the terminal.
 */
export const TERMINAL_RENDERER_APIS = [
  "registerMessageRenderer",
  "registerEntryRenderer",
  "registerMarkdownTransformer",
] as const;

/** How much of an extension PID can run, once its `ctx.ui` usage is known. */
export type PidSupport =
  /** Everything it calls, PID serves. */
  | "full"
  /** PID serves or accepts every call, but some do nothing. */
  | "reduced"
  /** It needs a terminal somewhere, and a `ctx.mode` test lets it stand that part down. */
  | "guarded"
  /** It needs a terminal and does not check first. */
  | "terminal";

export interface UiUsage {
  served: UiMember[];
  inert: UiMember[];
  /** `ctx.ui` members plus any terminal renderer registrations. */
  terminal: string[];
  /**
   * The source tests `ctx.mode` against `"tui"`, so it can stand its terminal parts down here.
   * `ctx.hasUI` does not count: PID has a UI, so it is true here too.
   */
  guarded: boolean;
}

export function pidSupport(usage: UiUsage): PidSupport {
  if (usage.terminal.length > 0) return usage.guarded ? "guarded" : "terminal";
  return usage.inert.length > 0 ? "reduced" : "full";
}
