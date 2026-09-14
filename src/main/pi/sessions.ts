import { stripPromptBlocks } from "@shared/prompt-blocks";
import type { SessionSummary } from "@shared/sessions";

/** Lazy import: the SDK is ~1s to load and only needed for read-only discovery. */
const sdk = () => import("@earendil-works/pi-coding-agent");

type Info = Awaited<ReturnType<Awaited<ReturnType<typeof sdk>>["SessionManager"]["list"]>>[number];

function toSummary(s: Info): SessionSummary {
  return {
    path: s.path,
    id: s.id,
    cwd: s.cwd,
    name: s.name,
    created: s.created.toISOString(),
    modified: s.modified.toISOString(),
    messageCount: s.messageCount,
    // the words only: PID's attachment and $session blocks are shown as chips, never as a title
    firstMessage: stripPromptBlocks(s.firstMessage),
  };
}

export async function listSessions(cwd: string): Promise<SessionSummary[]> {
  const { SessionManager } = await sdk();
  const list = await SessionManager.list(cwd);
  return list.map(toSummary).sort((a, b) => b.modified.localeCompare(a.modified));
}

export async function listAllSessions(): Promise<SessionSummary[]> {
  const { SessionManager } = await sdk();
  const list = await SessionManager.listAll();
  return list.map(toSummary).sort((a, b) => b.modified.localeCompare(a.modified));
}
