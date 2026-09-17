/**
 * The contract between PID's window, its main process, and its session workers.
 *
 * These types are PID's, not Pi's. They are shaped from `AgentSession` and `AgentSessionEvent` —
 * the layer Pi's own terminal UI is built on — so a field can never drift from what the agent
 * actually returns. What they deliberately do not touch is Pi's `modes/rpc` surface: that is the
 * wire format of `pi --mode rpc`, a second-class surface PID no longer speaks (its own docs
 * already lag its code), and upstream has a replacement protocol in development. PID's UI keeps
 * compiling and running the day that module changes or goes away.
 *
 * Only `src/main/pi/session-worker.ts` bridges these types to Pi's API. Everything else in PID —
 * renderer, preload, main — sees only what is declared here.
 */
import type { AgentSession, AgentSessionEvent, SourceInfo } from "@earendil-works/pi-coding-agent";

export type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

/** Image attachments, in the shape the agent accepts them. */
export type PiImage = NonNullable<Parameters<AgentSession["steer"]>[1]>[number];

// ---------------------------------------------------------------------------
// Session state
// ---------------------------------------------------------------------------

/** What the window shows about a session between events: the composer's whole world. */
export interface PiSessionState {
  model: AgentSession["model"];
  thinkingLevel: AgentSession["thinkingLevel"];
  isStreaming: boolean;
  isCompacting: boolean;
  steeringMode: AgentSession["steeringMode"];
  followUpMode: AgentSession["followUpMode"];
  sessionFile: string | undefined;
  sessionId: string;
  sessionName: string | undefined;
  autoCompactionEnabled: boolean;
  messageCount: number;
  pendingMessageCount: number;
}

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

type MessageUpdate = Extract<AgentSessionEvent, { type: "message_update" }>;
type Delta = MessageUpdate["assistantMessageEvent"];
type AssistantUsage = Extract<MessageUpdate["message"], { role: "assistant" }>["usage"];

/**
 * A delta with the whole partial message taken out.
 *
 * In-process every delta carries the full message so far, which is large, repeated on each token,
 * and full of things structured clone rejects. The window rebuilds the message from the deltas
 * instead, so only the increment crosses. A tool call's id and name ride along because they are
 * the one thing the delta alone does not carry.
 */
export type PiDelta =
  | (DistributiveOmit<Extract<Delta, { type: "toolcall_start" }>, "partial"> & {
      id: string;
      toolName: string;
    })
  | DistributiveOmit<Exclude<Delta, { type: "toolcall_start" }>, "partial">;

/** Every session event, with `message_update` reduced to what can cross a process boundary. */
export type PiAgentEvent =
  | Exclude<AgentSessionEvent, { type: "message_update" }>
  | { type: "message_update"; usage: AssistantUsage; assistantMessageEvent: PiDelta };

/**
 * An extension threw while handling an event.
 *
 * Pi reports these to its host rather than to the session, so this is not a session event; PID
 * carries it on the same channel and shows it as a toast.
 */
export interface PiExtensionErrorEvent {
  type: "extension_error";
  extensionPath: string;
  event: string;
  error: string;
  stack?: string;
}

// ---------------------------------------------------------------------------
// Dialogs an extension opens
// ---------------------------------------------------------------------------

/**
 * What an extension's `ctx.ui` call becomes on the way to the window.
 *
 * Only the members PID actually serves are here. `src/shared/extension-ui.ts` is the list of which
 * those are, and the worker keeps the rest inert rather than sending traffic nothing reads.
 */
export type PiDialogRequest =
  | { type: "dialog"; id: string; method: "select"; title: string; options: string[]; timeout?: number }
  | { type: "dialog"; id: string; method: "confirm"; title: string; message: string; timeout?: number }
  | { type: "dialog"; id: string; method: "input"; title: string; placeholder?: string; timeout?: number }
  | { type: "dialog"; id: string; method: "editor"; title: string; prefill?: string }
  | {
      type: "dialog";
      id: string;
      method: "notify";
      message: string;
      notifyType?: "info" | "warning" | "error";
    }
  | { type: "dialog"; id: string; method: "setStatus"; statusKey: string; statusText: string | undefined }
  | {
      type: "dialog";
      id: string;
      method: "setWidget";
      widgetKey: string;
      widgetLines: string[] | undefined;
      widgetPlacement?: "aboveEditor" | "belowEditor";
    };

/** The answer, correlated by the request's id. */
export type PiDialogResponse =
  | { id: string; value: string }
  | { id: string; confirmed: boolean }
  | { id: string; cancelled: true };

/** Anything a session worker emits that is not a command response. */
export type PiEvent = PiAgentEvent | PiDialogRequest | PiExtensionErrorEvent;

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

/** One entry of the slash-command list the composer completes against. */
export interface PiSlashCommand {
  name: string;
  description: string;
  source: "extension" | "prompt" | "skill";
  sourceInfo?: SourceInfo;
}

/** What PID asks a session to do. Adding one is a change here and in the worker, nowhere else. */
export type PiCommand =
  | { type: "prompt"; message: string; images?: PiImage[]; streamingBehavior?: "steer" | "followUp" }
  | { type: "steer"; message: string; images?: PiImage[] }
  | { type: "follow_up"; message: string; images?: PiImage[] }
  | { type: "abort" }
  | { type: "clear_queue" }
  | { type: "new_session"; parentSession?: string }
  | { type: "get_state" }
  | { type: "get_messages" }
  | { type: "set_model"; provider: string; modelId: string }
  | { type: "get_available_models" }
  | { type: "set_thinking_level"; level: AgentSession["thinkingLevel"] }
  | { type: "get_available_thinking_levels" }
  | { type: "compact"; customInstructions?: string }
  | { type: "export_html"; outputPath?: string }
  | { type: "switch_session"; sessionPath: string }
  | { type: "fork"; entryId: string }
  | { type: "get_fork_messages" }
  | { type: "get_last_assistant_text" }
  | { type: "get_commands" }
  /** Re-read extensions, skills, prompts, themes and context files. Pi's own `/reload`. */
  | { type: "reload" }
  | { type: "set_session_name"; name: string };

/** What each command answers with. `undefined` means the response carries no data. */
export interface PiCommandData {
  prompt: undefined;
  steer: undefined;
  follow_up: undefined;
  abort: undefined;
  clear_queue: ReturnType<AgentSession["clearQueue"]>;
  new_session: { cancelled: boolean };
  get_state: PiSessionState;
  get_messages: { messages: AgentSession["messages"] };
  set_model: NonNullable<AgentSession["model"]>;
  /** The snapshot is readonly on the agent; the window gets its own array. */
  get_available_models: {
    models: ReturnType<AgentSession["modelRuntime"]["getAvailableSnapshot"]>[number][];
  };
  set_thinking_level: undefined;
  get_available_thinking_levels: { levels: ReturnType<AgentSession["getAvailableThinkingLevels"]> };
  compact: Awaited<ReturnType<AgentSession["compact"]>>;
  export_html: { path: string };
  switch_session: { cancelled: boolean };
  fork: { text: string; cancelled: boolean };
  get_fork_messages: { messages: ReturnType<AgentSession["getUserMessagesForForking"]> };
  get_last_assistant_text: { text: string | null };
  get_commands: { commands: PiSlashCommand[] };
  reload: undefined;
  set_session_name: undefined;
}

export type PiCommandType = PiCommand["type"];
export type ResponseDataOf<T extends PiCommandType> = PiCommandData[T] extends undefined
  ? undefined
  : PiCommandData[T];

export type PiResponse =
  | { id: string; success: true; command: PiCommandType; data?: unknown }
  | { id: string; success: false; command: string; error: string };

// ---------------------------------------------------------------------------
// Session handles
// ---------------------------------------------------------------------------

/** A running session worker, keyed by a PID-side handle. */
export interface PiHandle {
  key: string;
  cwd: string;
  state: PiSessionState;
  /** Events emitted while starting, before the window knew this key (extension status and such). */
  earlyEvents: PiEvent[];
}

export interface StartPiOptions {
  cwd: string;
  /** Resume an existing Pi session file. Omit for a fresh session. */
  sessionPath?: string;
}

export interface PiEventEnvelope {
  key: string;
  event: PiEvent;
}

export interface PiExitEnvelope {
  key: string;
  code: number | null;
  signal: string | null;
  stderr: string;
}
