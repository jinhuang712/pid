import type { ToolCall } from "@earendil-works/pi-ai";

/**
 * One readable line per tool call. Verbs are progressive while running and past tense when done,
 * so the list reads like a log: "Reading src/App.tsx" → "Read src/App.tsx".
 */
export interface Label {
  running: string;
  done: string;
  detail: string;
}

/**
 * A tool PID has no line for keeps its own name.
 *
 * The list below is Pi's own tools and stops there — `bash`, `edit`, `find`, `grep`, `ls`, `read`,
 * `write`. Everything else came from an extension, and reading its name back is the honest thing to
 * show: PID reverse-engineering one extension's naming to prettify it was PID knowing that
 * extension. An extension that wants better draws its own row, which is the whole point of the
 * `tool` mount.
 */
export function label(call: ToolCall): Label {
  const a = (call.arguments ?? {}) as Record<string, unknown>;
  const str = (k: string) => (typeof a[k] === "string" ? (a[k] as string) : "");
  switch (call.name) {
    case "read":
      return { running: "Reading", done: "Read", detail: str("path") };
    case "write":
      return { running: "Writing", done: "Wrote", detail: str("path") };
    case "edit":
      return { running: "Editing", done: "Edited", detail: str("path") };
    case "bash":
      return { running: "Running", done: "Ran", detail: str("command") };
    case "grep":
      return { running: "Searching", done: "Searched", detail: str("pattern") };
    case "find":
      return { running: "Finding", done: "Found", detail: str("pattern") };
    case "ls":
      return { running: "Listing", done: "Listed", detail: str("path") || "." };
    default: {
      const first = Object.values(a).find((v) => typeof v === "string") as string | undefined;
      return { running: `Calling ${call.name}`, done: `Called ${call.name}`, detail: first ?? "" };
    }
  }
}

/** "lookup_mysql_catalog" → "lookup mysql catalog". */
export function humanize(tool: string): string {
  return tool.replace(/_/g, " ").trim();
}
