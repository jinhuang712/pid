/** First-level pages. Sessions is the conversation view; the rest render in the main column. */
/**
 * A place the window can be. `page:<namespace>` is an extension's page — PID does not know their
 * names, so this half of the union is open.
 */
export type Page = "sessions" | "skills" | "extensions" | "settings" | `page:${string}`;
