/**
 * The only schemes a click inside the app may hand to the OS. The renderer decides with it which
 * anchors go to the browser, and the main process re-checks it before calling `shell.openExternal`;
 * both sides read this one definition so the safety net can never drift from the front-end rule.
 */
export const isWebUrl = (url: string): boolean => /^(?:https?:|mailto:)/i.test(url);

/** Extensions the OS would run or launch rather than open in a viewer or editor. */
const PROGRAMS = new Set([
  ".app",
  ".command",
  ".terminal",
  ".workflow",
  ".scpt",
  ".applescript",
  ".sh",
  ".bash",
  ".zsh",
  ".fish",
  ".tool",
]);

/**
 * What a click must not hand to the OS to launch.
 *
 * The same rule as `isWebUrl`, one step further: a transcript is untrusted text, and
 * `shell.openPath` gives the path to LaunchServices, which starts an app or runs a script without
 * asking. A program is revealed in Finder instead — still reachable, but deliberately rather than
 * by a click. Pure so both processes can read it; the renderer must not pull in `node:path`.
 */
export const isProgramPath = (path: string): boolean => {
  if (/\.app\//i.test(path)) return true;
  const name = path.replace(/\/+$/, "");
  const dot = name.lastIndexOf(".");
  return dot > name.lastIndexOf("/") && PROGRAMS.has(name.slice(dot).toLowerCase());
};
