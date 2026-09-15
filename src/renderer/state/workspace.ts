import type { AgentMessage } from "@earendil-works/pi-agent-core";
import { type Published, readKind } from "@shared/extension-kinds";
import type { PiEvent, PiHandle, PiSessionState } from "@shared/protocol";
import type { DialogRequest } from "../components/ExtensionUI";
import {
  type ConversationState,
  commandEnd,
  commandStart,
  emptyConversation,
  fromMessages,
  reduce,
} from "./conversation";

/**
 * Every open pi process the window owns. Pi owns the sessions; this is only the
 * renderer-side projection of their events, one entry per live process.
 */
export interface Proc {
  key: string;
  cwd: string;
  piState: PiSessionState;
  conv: ConversationState;
  /** setStatus text by key, from any extension. */
  statuses: Record<string, string>;
  /** setWidget lines by key, from any extension; PID shows them all. */
  widgets: Record<string, string[]>;
  dialogs: DialogRequest[];
  /**
   * Structured widgets this session's extensions have published, by kind. A kind that is absent is
   * one no extension filled, which is how PID decides a surface does not exist.
   */
  published: Published;
  /** Set when the process exited; the entry stays until dismissed so the user sees why. */
  exit?: string;
  /**
   * True while pi is still starting for this session: the conversation is a read-only snapshot
   * of the file, and the key is a placeholder no command can be sent to yet.
   */
  pending?: boolean;
}

export interface Workspace {
  procs: Record<string, Proc>;
  activeKey?: string;
}

export type SessionStatus = "running" | "needs-you" | "idle" | "error" | "closed" | "exited";

export type WorkspaceAction =
  /** `replaces` names the pending placeholder this live process takes over from. */
  | { type: "add"; handle: PiHandle; replaces?: string }
  /** A session being resumed: shows the file's snapshot at once, ahead of its process. */
  | {
      type: "pending";
      key: string;
      cwd: string;
      sessionPath: string;
      messages?: AgentMessage[];
      /** Restoring several sessions at launch: keep the current tab instead of jumping to each one. */
      background?: boolean;
    }
  | { type: "remove"; key: string }
  | { type: "activate"; key?: string }
  | { type: "event"; key: string; event: PiEvent }
  | { type: "state"; key: string; piState: PiSessionState }
  | { type: "messages"; key: string; conv: ConversationState }
  | { type: "command-start"; key: string; id: number; text: string }
  | {
      type: "command-end";
      key: string;
      id: number;
      outcome: { ok: true; text?: string } | { ok: false; text: string };
    }
  | { type: "dialog-done"; key: string; id: string }
  | { type: "exit"; key: string; message: string };

export const emptyWorkspace = (): Workspace => ({ procs: {} });

export function workspaceReducer(ws: Workspace, a: WorkspaceAction): Workspace {
  switch (a.type) {
    case "add": {
      const placeholder = a.replaces ? ws.procs[a.replaces] : undefined;
      const proc: Proc = {
        key: a.handle.key,
        cwd: a.handle.cwd,
        piState: a.handle.state,
        // keep the snapshot on screen until get_messages replaces it
        conv: placeholder?.conv ?? emptyConversation(),
        statuses: {},
        widgets: {},
        published: {},
        dialogs: [],
      };
      const { [a.replaces ?? ""]: _placeholder, ...rest } = ws.procs;
      // the placeholder was active when the user clicked; the real process inherits that, but a
      // later click elsewhere wins
      const wasActive = !a.replaces || ws.activeKey === a.replaces;
      let next: Workspace = {
        ...ws,
        procs: { ...rest, [proc.key]: proc },
        activeKey: wasActive ? proc.key : ws.activeKey,
      };
      for (const ev of a.handle.earlyEvents)
        next = workspaceReducer(next, { type: "event", key: proc.key, event: ev });
      return next;
    }
    case "pending": {
      const proc: Proc = {
        key: a.key,
        cwd: a.cwd,
        piState: { sessionFile: a.sessionPath } as PiSessionState,
        conv: a.messages ? fromMessages(a.messages) : emptyConversation(),
        statuses: {},
        widgets: {},
        published: {},
        dialogs: [],
        pending: true,
      };
      return {
        ...ws,
        procs: { ...ws.procs, [proc.key]: proc },
        activeKey: a.background && ws.activeKey ? ws.activeKey : proc.key,
      };
    }
    case "remove": {
      const { [a.key]: _gone, ...procs } = ws.procs;
      const activeKey = ws.activeKey === a.key ? Object.keys(procs).at(-1) : ws.activeKey;
      return { procs, activeKey };
    }
    case "activate":
      return { ...ws, activeKey: a.key };
    case "state":
      return patch(ws, a.key, (p) => ({ ...p, piState: a.piState }));
    case "messages":
      return patch(ws, a.key, (p) => ({ ...p, conv: a.conv }));
    case "command-start":
      return patch(ws, a.key, (p) => ({ ...p, conv: commandStart(p.conv, a.id, a.text) }));
    case "command-end":
      return patch(ws, a.key, (p) => ({ ...p, conv: commandEnd(p.conv, a.id, a.outcome) }));
    case "dialog-done":
      return patch(ws, a.key, (p) => ({ ...p, dialogs: p.dialogs.filter((d) => d.id !== a.id) }));
    case "exit":
      return patch(ws, a.key, (p) => ({ ...p, exit: a.message }));
    case "event": {
      const ev = a.event;
      return patch(ws, a.key, (p) => {
        if (ev.type === "dialog") {
          switch (ev.method) {
            case "select":
            case "confirm":
            case "input":
            case "editor":
              return { ...p, dialogs: [...p.dialogs, ev] };
            case "setStatus":
              return { ...p, statuses: setOrClear(p.statuses, ev.statusKey, ev.statusText || undefined) };
            case "setWidget": {
              // A `<ns>:<kind>/v<n>` key PID has a kind for becomes that kind. Everything else —
              // plain keys, and structured keys for kinds PID does not know — reaches the strip,
              // which is what the terminal does with a widget too.
              const read = readKind(ev.widgetKey, ev.widgetLines);
              if (read) {
                const byNs = setOrClear(
                  (p.published[read.kind] ?? {}) as Record<string, unknown>,
                  read.ns,
                  read.data,
                );
                const published = setOrClear(
                  p.published as Record<string, unknown>,
                  read.kind,
                  Object.keys(byNs).length > 0 ? byNs : undefined,
                ) as Published;
                return { ...p, published };
              }
              return { ...p, widgets: setOrClear(p.widgets, ev.widgetKey, ev.widgetLines) };
            }
            default:
              return p;
          }
        }
        // An extension throwing is about the extension, not about the conversation: App shows it
        // as a toast and the timeline stays a record of what the model and the user did.
        if (ev.type === "extension_error") return p;
        return { ...p, conv: reduce(p.conv, ev) };
      });
    }
    default:
      return ws;
  }
}

/** Pi clears a status or a widget by setting it to undefined, so the key goes away rather than empty. */
function setOrClear<T>(map: Record<string, T>, key: string, value: T | undefined): Record<string, T> {
  if (value === undefined) {
    if (!(key in map)) return map;
    const { [key]: _gone, ...rest } = map;
    return rest;
  }
  return { ...map, [key]: value };
}

function patch(ws: Workspace, key: string, f: (p: Proc) => Proc): Workspace {
  const p = ws.procs[key];
  if (!p) return ws;
  return { ...ws, procs: { ...ws.procs, [key]: f(p) } };
}

export function procStatus(p: Proc): SessionStatus {
  if (p.exit) return "exited";
  if (p.pending) return "running";
  if (p.dialogs.length > 0) return "needs-you";
  if (p.conv.isStreaming || p.conv.compacting) return "running";
  // walk from the end without copying: the tree calls this for every row on every event
  for (let i = p.conv.messages.length - 1; i >= 0; i--) {
    const m = p.conv.messages[i];
    if (m.role !== "assistant") continue;
    return m.stopReason === "error" ? "error" : "idle";
  }
  return "idle";
}

/** The live process for a session file, if any. */
export function procForSession(ws: Workspace, sessionPath: string): Proc | undefined {
  return Object.values(ws.procs).find((p) => p.piState.sessionFile === sessionPath);
}

export { fromMessages };
