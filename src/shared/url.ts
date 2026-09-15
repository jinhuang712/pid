/**
 * The only schemes a click inside the app may hand to the OS. The renderer decides with it which
 * anchors go to the browser, and the main process re-checks it before calling `shell.openExternal`;
 * both sides read this one definition so the safety net can never drift from the front-end rule.
 */
export const isWebUrl = (url: string): boolean => /^(?:https?:|mailto:)/i.test(url);
