/** Serializable view of a Pi session file, derived from SessionManager.list. Never authoritative. */
export interface SessionSummary {
  path: string;
  id: string;
  cwd: string;
  name?: string;
  parentSessionPath?: string;
  created: string;
  modified: string;
  messageCount: number;
  firstMessage: string;
}

/** One user/assistant text message from a session's active branch (tool traffic and thinking omitted). */
export interface SessionMessage {
  role: "user" | "assistant";
  text: string;
}
