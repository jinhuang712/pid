import type { AgentMessage } from "@earendil-works/pi-agent-core";
import {
  isPidWidget,
  type McpOAuthOutcome,
  type McpStatusSnapshot,
  parseMcpOAuth,
  parseMcpStatus,
  WIDGET_MCP_OAUTH,
  WIDGET_MCP_STATUS,
} from "@shared/mcp-status";
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
  /** setWidget lines by widget key, e.g. pi-worktree's "🌲 branch → main · ↑2 · 1 dirty". */
  widgets: Record<string, string>;
  dialogs: DialogRequest[];
  /** Live MCP server status from the MCP extension (pid-mcp), via pid-bridge. Undefined until the first snapshot. */
  mcp?: McpStatusSnapshot;
  /** The most recent OAuth outcome the MCP extension reported, via pid-bridge. */
  mcpOAuth?: McpOAuthOutcome;
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
  | { type: "state"; key: string; piState: RpcSessionState }
  | { type: "messages"; key: string; conv: ConversationState }
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
        piState: { sessionFile: a.sessionPath } as RpcSessionState,
        conv: a.messages ? fromMessages(a.messages) : emptyConversation(),
        statuses: {},
        widgets: {},
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
            case "setWidget":
              // `pid:*` widgets are data from PID's own bridge extension, never something to render.
              if (isPidWidget(ev.widgetKey)) {
                if (ev.widgetKey === WIDGET_MCP_STATUS) return { ...p, mcp: parseMcpStatus(ev.widgetLines) };
                if (ev.widgetKey === WIDGET_MCP_OAUTH)
                  return { ...p, mcpOAuth: parseMcpOAuth(ev.widgetLines) };
                return p;
              }
              return { ...p, widgets: { ...p.widgets, [ev.widgetKey]: (ev.widgetLines ?? []).join(" ") } };
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
