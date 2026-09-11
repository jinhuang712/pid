import type { PiEvent, PiHandle, RpcSessionState } from "@shared/protocol";
import type { DialogRequest } from "../components/ExtensionUI";
import { type ConversationState, emptyConversation, fromMessages, reduce } from "./conversation";

/**
 * Every open pi process the window owns. Pi owns the sessions; this is only the
 * renderer-side projection of their events, one entry per live process.
 */
export interface Proc {
  key: string;
  cwd: string;
  piState: RpcSessionState;
  conv: ConversationState;
  statuses: Record<string, string>;
  dialogs: DialogRequest[];
  /** Set when the process exited; the entry stays until dismissed so the user sees why. */
  exit?: string;
}

export interface Workspace {
  procs: Record<string, Proc>;
  activeKey?: string;
}

export type SessionStatus = "running" | "needs-you" | "idle" | "error" | "closed" | "exited";

export type WorkspaceAction =
  | { type: "add"; handle: PiHandle }
  | { type: "remove"; key: string }
  | { type: "activate"; key?: string }
  | { type: "event"; key: string; event: PiEvent }
  | { type: "state"; key: string; piState: RpcSessionState }
  | { type: "messages"; key: string; conv: ConversationState }
  | { type: "dialog-done"; key: string; id: string }
  | { type: "exit"; key: string; message: string };

export const emptyWorkspace = (): Workspace => ({ procs: {} });

export function workspaceReducer(ws: Workspace, a: WorkspaceAction): Workspace {
  switch (a.type) {
    case "add": {
      const proc: Proc = {
        key: a.handle.key,
        cwd: a.handle.cwd,
        piState: a.handle.state,
        conv: emptyConversation(),
        statuses: {},
        dialogs: [],
      };
      let next: Workspace = { ...ws, procs: { ...ws.procs, [proc.key]: proc }, activeKey: proc.key };
      for (const ev of a.handle.earlyEvents)
        next = workspaceReducer(next, { type: "event", key: proc.key, event: ev });
      return next;
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
    case "dialog-done":
      return patch(ws, a.key, (p) => ({ ...p, dialogs: p.dialogs.filter((d) => d.id !== a.id) }));
    case "exit":
      return patch(ws, a.key, (p) => ({ ...p, exit: a.message }));
    case "event": {
      const ev = a.event;
      return patch(ws, a.key, (p) => {
        if (ev.type === "extension_ui_request") {
          switch (ev.method) {
            case "select":
            case "confirm":
            case "input":
            case "editor":
              return { ...p, dialogs: [...p.dialogs, ev] };
            case "setStatus":
              return { ...p, statuses: { ...p.statuses, [ev.statusKey]: ev.statusText ?? "" } };
            default:
              return p;
          }
        }
        return { ...p, conv: reduce(p.conv, ev) };
      });
    }
    default:
      return ws;
  }
}

function patch(ws: Workspace, key: string, f: (p: Proc) => Proc): Workspace {
  const p = ws.procs[key];
  if (!p) return ws;
  return { ...ws, procs: { ...ws.procs, [key]: f(p) } };
}

export function procStatus(p: Proc): SessionStatus {
  if (p.exit) return "exited";
  if (p.dialogs.length > 0) return "needs-you";
  if (p.conv.isStreaming || p.conv.compacting) return "running";
  const last = [...p.conv.messages].reverse().find((m) => m.role === "assistant");
  if (last && last.role === "assistant" && last.stopReason === "error") return "error";
  return "idle";
}

/** The live process for a session file, if any. */
export function procForSession(ws: Workspace, sessionPath: string): Proc | undefined {
  return Object.values(ws.procs).find((p) => p.piState.sessionFile === sessionPath);
}

export { fromMessages };
