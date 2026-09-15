/**
 * The widget channel, read as a contract rather than a list of names PID happens to know.
 *
 * `ctx.ui.setWidget(key, lines)` already works in every Pi host, so an extension that wants a
 * graphical presentation in PID does not need PID to load any of its code. It names its widget
 * `<ns>:<kind>/v<n>` and puts JSON in the lines. PID parses the key, hands the payload to whatever
 * renderer claims that kind, and shows the rest as text — which is what the terminal shows too.
 *
 * So one extension serves both hosts:
 *
 *     ctx.mode === "tui"
 *       ? ctx.ui.setWidget("usage", [`quota ${used}/${limit}`])
 *       : ctx.ui.setWidget("x-usage:quota/v1", [JSON.stringify({ used, limit })]);
 *
 * PID's own bridge uses the same keys as anyone else's extension. Nothing here is private.
 */

export interface WidgetKey {
  /** Whoever owns the key. PID's bundled bridge uses `pid`. */
  ns: string;
  /** What the payload is. A renderer claims a kind; an unclaimed kind falls back to text. */
  kind: string;
  version: number;
}

const KEY = /^([a-z0-9][a-z0-9-]*):([a-z0-9][a-z0-9-]*)\/v(\d+)$/;

/** Undefined for a plain widget key, which is a line of text to show as-is. */
export function parseWidgetKey(key: string): WidgetKey | undefined {
  const m = KEY.exec(key);
  return m ? { ns: m[1], kind: m[2], version: Number(m[3]) } : undefined;
}

export const widgetKey = (k: WidgetKey) => `${k.ns}:${k.kind}/v${k.version}`;
