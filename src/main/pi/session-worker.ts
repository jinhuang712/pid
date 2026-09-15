/**
 * One session, one Electron utility process, one AgentSessionRuntime.
 *
 * This is the layer `pi --mode rpc` occupies when PID spawns it: Pi's own runtime with a host
 * around it. The host here is a message port instead of stdin/stdout, so no JSON framing and no
 * external binary, but the command handling is ported from `dist/modes/rpc/rpc-mode.js` so PID
 * and the Pi terminal treat the same command the same way.
 *
 * One runtime per process is deliberate. AgentSessionRuntime holds a single session and replaces
 * it on switch/fork, which is exactly one PID session; keeping them in separate processes also
 * keeps Pi's process-global state (detached child tracking, the HTTP dispatcher) per session, and
 * an extension that crashes takes down one session rather than the app.
 */

import { randomUUID } from "node:crypto";
import {
  type AgentSession,
  type AgentSessionEvent,
  type AgentSessionRuntime,
  type CreateAgentSessionRuntimeFactory,
  createAgentSessionFromServices,
  createAgentSessionRuntime,
  createAgentSessionServices,
  getAgentDir,
  SessionManager,
} from "@earendil-works/pi-coding-agent";
import type {
  DistributiveOmit,
  PiCommand,
  RpcExtensionUIRequest,
  RpcExtensionUIResponse,
  RpcResponse,
} from "@shared/protocol";
import { applyPiHttpSettings } from "./http-config";
import { toJsonEvent } from "./json-event";
import type { MainToWorker, WorkerStartOptions, WorkerToMain } from "./worker-protocol";

type ParentPort = {
  postMessage(message: WorkerToMain): void;
  on(event: "message", listener: (e: { data: MainToWorker }) => void): void;
};

const port = (process as unknown as { parentPort: ParentPort }).parentPort;
const send = (message: WorkerToMain) => port.postMessage(message);
const emit = (event: RpcExtensionUIRequest) => send({ kind: "event", event });

let runtime: AgentSessionRuntime;
let session: AgentSession;
let unsubscribe: (() => void) | undefined;
const diagnostics: string[] = [];

// ---------------------------------------------------------------------------
// Extension UI: the dialogs an extension opens are PID's dialogs.
// Ported from rpc-mode.js, with the message port in place of stdout/stdin.
// ---------------------------------------------------------------------------

type PendingDialog = (response: RpcExtensionUIResponse) => void;
const pendingDialogs = new Map<string, PendingDialog>();

interface DialogOptions {
  signal?: AbortSignal;
  timeout?: number;
}

/** The request minus the envelope PID fills in, kept distributive so each method keeps its own fields. */
type UIRequestBody = DistributiveOmit<RpcExtensionUIRequest, "type" | "id">;

function dialog<T>(
  opts: DialogOptions | undefined,
  defaultValue: T,
  request: UIRequestBody,
  parse: (response: RpcExtensionUIResponse) => T,
): Promise<T> {
  if (opts?.signal?.aborted) return Promise.resolve(defaultValue);
  const id = randomUUID();
  return new Promise<T>((resolve) => {
    let timeoutId: NodeJS.Timeout | undefined;
    const cleanup = () => {
      if (timeoutId) clearTimeout(timeoutId);
      opts?.signal?.removeEventListener("abort", onAbort);
      pendingDialogs.delete(id);
    };
    const onAbort = () => {
      cleanup();
      resolve(defaultValue);
    };
    opts?.signal?.addEventListener("abort", onAbort, { once: true });
    if (opts?.timeout) {
      timeoutId = setTimeout(() => {
        cleanup();
        resolve(defaultValue);
      }, opts.timeout);
    }
    pendingDialogs.set(id, (response) => {
      cleanup();
      resolve(parse(response));
    });
    emit({ type: "extension_ui_request", id, ...request } as RpcExtensionUIRequest);
  });
}

const cancelled = (r: RpcExtensionUIResponse) => "cancelled" in r && r.cancelled;
const dialogValue = (r: RpcExtensionUIResponse) =>
  cancelled(r) ? undefined : "value" in r ? r.value : undefined;

/**
 * TUI-only members answer the way RPC mode answers them: do nothing, or report failure.
 * PID labels extensions that need terminal widgets unsupported rather than adapting them.
 */
function createExtensionUIContext() {
  const themes = runtimeThemes();
  return {
    select: (title: string, options: string[], opts?: DialogOptions) =>
      dialog(opts, undefined, { method: "select", title, options, timeout: opts?.timeout }, dialogValue),
    confirm: (title: string, message: string, opts?: DialogOptions) =>
      dialog(opts, false, { method: "confirm", title, message, timeout: opts?.timeout }, (r) =>
        cancelled(r) ? false : "confirmed" in r ? r.confirmed : false,
      ),
    input: (title: string, placeholder?: string, opts?: DialogOptions) =>
      dialog(opts, undefined, { method: "input", title, placeholder, timeout: opts?.timeout }, dialogValue),
    editor: (title: string, prefill?: string) =>
      dialog(undefined, undefined, { method: "editor", title, prefill }, dialogValue),

    notify(message: string, type?: "info" | "warning" | "error") {
      emit({ type: "extension_ui_request", id: randomUUID(), method: "notify", message, notifyType: type });
    },
    setStatus(key: string, text: string | undefined) {
      emit({
        type: "extension_ui_request",
        id: randomUUID(),
        method: "setStatus",
        statusKey: key,
        statusText: text,
      });
    },
    setWidget(key: string, content: unknown, options?: { placement?: "aboveEditor" | "belowEditor" }) {
      // Component factories need a TUI; only line arrays can cross to the renderer.
      if (content === undefined || Array.isArray(content)) {
        emit({
          type: "extension_ui_request",
          id: randomUUID(),
          method: "setWidget",
          widgetKey: key,
          widgetLines: content as string[] | undefined,
          widgetPlacement: options?.placement,
        });
      }
    },
    setTitle(title: string) {
      emit({ type: "extension_ui_request", id: randomUUID(), method: "setTitle", title });
    },
    setEditorText(text: string) {
      emit({ type: "extension_ui_request", id: randomUUID(), method: "set_editor_text", text });
    },
    pasteToEditor(text: string) {
      this.setEditorText(text);
    },
    getEditorText: () => "",

    onTerminalInput: () => () => {},
    setWorkingMessage: () => {},
    setWorkingVisible: () => {},
    setWorkingIndicator: () => {},
    setHiddenThinkingLabel: () => {},
    setFooter: () => {},
    setHeader: () => {},
    custom: async () => undefined,
    addAutocompleteProvider: () => {},
    setEditorComponent: () => {},
    getEditorComponent: () => undefined,
    get theme() {
      return themes[0];
    },
    getAllThemes: () => themes,
    getTheme: (name: string) => themes.find((t) => t.name === name),
    setTheme: () => ({ success: false, error: "PID renders its own theme" }),
    getToolsExpanded: () => false,
    setToolsExpanded: () => {},
  };
}

function runtimeThemes() {
  try {
    return runtime.services.resourceLoader.getThemes().themes;
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Runtime
// ---------------------------------------------------------------------------

function makeCreateRuntime(extensionPaths: string[]): CreateAgentSessionRuntimeFactory {
  return async ({ cwd, agentDir, sessionManager, sessionStartEvent }) => {
    const services = await createAgentSessionServices({
      cwd,
      agentDir,
      // What `-e <path>` did on the command line when PID spawned pi.
      resourceLoaderOptions: { additionalExtensionPaths: extensionPaths },
    });
    const httpWarning = await applyPiHttpSettings(services.settingsManager);
    if (httpWarning) diagnostics.push(httpWarning);
    return {
      ...(await createAgentSessionFromServices({ services, sessionManager, sessionStartEvent })),
      services,
      diagnostics: services.diagnostics,
    };
  };
}

async function bindSession() {
  session = runtime.session;
  await session.bindExtensions({
    uiContext: createExtensionUIContext() as never,
    mode: "rpc",
    commandContextActions: {
      waitForIdle: () => session.waitForIdle(),
      newSession: async (options) => runtime.newSession(options),
      fork: async (entryId, forkOptions) => {
        const result = await runtime.fork(entryId, forkOptions);
        return { cancelled: result.cancelled };
      },
      navigateTree: async (targetId, options) => {
        const result = await session.navigateTree(targetId, {
          summarize: options?.summarize,
          customInstructions: options?.customInstructions,
          replaceInstructions: options?.replaceInstructions,
          label: options?.label,
        });
        return { cancelled: result.cancelled };
      },
      switchSession: async (sessionPath, options) => runtime.switchSession(sessionPath, options),
      reload: async () => {
        await session.reload();
      },
    },
    onError: (err) =>
      send({
        kind: "event",
        event: {
          type: "extension_error",
          extensionPath: err.extensionPath,
          event: err.event,
          error: err.error,
        } as never,
      }),
  });
  unsubscribe?.();
  unsubscribe = session.subscribe((event: AgentSessionEvent) => {
    send({ kind: "event", event: toJsonEvent(event) });
  });
}

async function start(options: WorkerStartOptions) {
  const { cwd, sessionPath, extensionPaths } = options;
  // Pi's defaults decide where sessions live: open the file PID was asked to resume, or let
  // SessionManager create a new one in the directory the Pi terminal would have used.
  const sessionManager = sessionPath ? SessionManager.open(sessionPath) : SessionManager.create(cwd);
  runtime = await createAgentSessionRuntime(makeCreateRuntime(extensionPaths), {
    cwd: sessionManager.getCwd(),
    agentDir: getAgentDir(),
    sessionManager,
  });
  runtime.setRebindSession(async () => {
    await bindSession();
  });
  await bindSession();
  for (const d of runtime.diagnostics) diagnostics.push(`${d.type}: ${d.message}`);
  send({ kind: "started", state: getState(), diagnostics });
}

function getState() {
  return {
    model: session.model,
    thinkingLevel: session.thinkingLevel,
    isStreaming: session.isStreaming,
    isCompacting: session.isCompacting,
    steeringMode: session.steeringMode,
    followUpMode: session.followUpMode,
    sessionFile: session.sessionFile,
    sessionId: session.sessionId,
    sessionName: session.sessionName,
    autoCompactionEnabled: session.autoCompactionEnabled,
    messageCount: session.messages.length,
    pendingMessageCount: session.pendingMessageCount,
  } as never;
}

// ---------------------------------------------------------------------------
// Commands. Ported from rpc-mode.js so behavior matches the Pi terminal.
// ---------------------------------------------------------------------------

const ok = (id: string, command: string, data?: unknown): RpcResponse =>
  (data === undefined
    ? { id, type: "response", command, success: true }
    : { id, type: "response", command, success: true, data }) as RpcResponse;
const fail = (id: string, command: string, error: string): RpcResponse =>
  ({ id, type: "response", command, success: false, error }) as RpcResponse;

async function handleCommand(id: string, command: PiCommand): Promise<RpcResponse | undefined> {
  const c = command as PiCommand & Record<string, never>;
  switch (command.type) {
    case "prompt": {
      // The authoritative response goes out once preflight accepts the prompt, not when the
      // turn finishes; the turn itself is reported through the event stream.
      let preflightSucceeded = false;
      void session
        .prompt(c.message, {
          images: c.images,
          streamingBehavior: c.streamingBehavior,
          source: "rpc",
          preflightResult: (didSucceed: boolean) => {
            if (didSucceed) {
              preflightSucceeded = true;
              send({ kind: "response", id, response: ok(id, "prompt") });
            }
          },
        } as never)
        .catch((e: Error) => {
          if (!preflightSucceeded) send({ kind: "response", id, response: fail(id, "prompt", e.message) });
        });
      return undefined;
    }
    case "steer":
      await session.steer(c.message, c.images);
      return ok(id, "steer");
    case "follow_up":
      await session.followUp(c.message, c.images);
      return ok(id, "follow_up");
    case "abort":
      await session.abort();
      return ok(id, "abort");
    case "clear_queue":
      return ok(id, "clear_queue", session.clearQueue());
    case "new_session": {
      const result = await runtime.newSession(
        c.parentSession ? { parentSession: c.parentSession } : undefined,
      );
      return ok(id, "new_session", result);
    }

    case "get_state":
      return ok(id, "get_state", getState());
    case "get_messages":
      return ok(id, "get_messages", { messages: session.messages });

    case "set_model": {
      const model = session.modelRuntime
        .getAvailableSnapshot()
        .find((m) => m.provider === c.provider && m.id === c.modelId);
      if (!model) return fail(id, "set_model", `Model not found: ${c.provider}/${c.modelId}`);
      await session.setModel(model);
      return ok(id, "set_model", model);
    }
    case "cycle_model": {
      const result = await session.cycleModel();
      return ok(id, "cycle_model", result ?? null);
    }
    case "get_available_models":
      return ok(id, "get_available_models", { models: session.modelRuntime.getAvailableSnapshot() });

    case "set_thinking_level":
      session.setThinkingLevel(c.level);
      return ok(id, "set_thinking_level");
    case "cycle_thinking_level": {
      const level = session.cycleThinkingLevel();
      return ok(id, "cycle_thinking_level", level ? { level } : null);
    }
    case "get_available_thinking_levels":
      return ok(id, "get_available_thinking_levels", { levels: session.getAvailableThinkingLevels() });

    case "set_steering_mode":
      session.setSteeringMode(c.mode);
      return ok(id, "set_steering_mode");
    case "set_follow_up_mode":
      session.setFollowUpMode(c.mode);
      return ok(id, "set_follow_up_mode");

    case "compact":
      return ok(id, "compact", await session.compact(c.customInstructions));
    case "set_auto_compaction":
      session.setAutoCompactionEnabled(c.enabled);
      return ok(id, "set_auto_compaction");
    case "set_auto_retry":
      session.setAutoRetryEnabled(c.enabled);
      return ok(id, "set_auto_retry");
    case "abort_retry":
      session.abortRetry();
      return ok(id, "abort_retry");

    case "bash": {
      // Extensions that registered a user_bash handler get first refusal, exactly as in RPC mode.
      const eventResult = await session.extensionRunner.emitUserBash({
        type: "user_bash",
        command: c.command,
        excludeFromContext: c.excludeFromContext ?? false,
        cwd: session.sessionManager.getCwd(),
      } as never);
      if (eventResult?.result) {
        session.recordBashResult(c.command, eventResult.result, { excludeFromContext: c.excludeFromContext });
        return ok(id, "bash", eventResult.result);
      }
      const result = await session.executeBash(c.command, undefined, {
        excludeFromContext: c.excludeFromContext,
        id,
        operations: eventResult?.operations,
      } as never);
      return ok(id, "bash", result);
    }
    case "abort_bash":
      session.abortBash();
      return ok(id, "abort_bash");

    case "get_session_stats":
      return ok(id, "get_session_stats", session.getSessionStats());
    case "export_html":
      return ok(id, "export_html", { path: await session.exportToHtml(c.outputPath) });
    case "switch_session":
      return ok(id, "switch_session", await runtime.switchSession(c.sessionPath));
    case "fork": {
      const result = await runtime.fork(c.entryId);
      return ok(id, "fork", { text: result.selectedText, cancelled: result.cancelled });
    }
    case "clone": {
      const leafId = session.sessionManager.getLeafId();
      if (!leafId) return fail(id, "clone", "Cannot clone session: no current entry selected");
      const result = await runtime.fork(leafId, { position: "at" });
      return ok(id, "clone", { cancelled: result.cancelled });
    }
    case "get_fork_messages":
      return ok(id, "get_fork_messages", { messages: session.getUserMessagesForForking() });
    case "get_entries": {
      const sm = session.sessionManager;
      let entries = sm.getEntries();
      if (c.since !== undefined) {
        const sinceIndex = entries.findIndex((e) => e.id === c.since);
        if (sinceIndex === -1) return fail(id, "get_entries", `Entry not found: ${c.since}`);
        entries = entries.slice(sinceIndex + 1);
      }
      return ok(id, "get_entries", { entries, leafId: sm.getLeafId() });
    }
    case "get_tree":
      return ok(id, "get_tree", {
        tree: session.sessionManager.getTree(),
        leafId: session.sessionManager.getLeafId(),
      });
    case "get_last_assistant_text":
      return ok(id, "get_last_assistant_text", { text: session.getLastAssistantText() });
    case "set_session_name": {
      const name = c.name.trim();
      if (!name) return fail(id, "set_session_name", "Session name cannot be empty");
      session.setSessionName(name);
      return ok(id, "set_session_name");
    }

    case "get_commands": {
      const commands: unknown[] = [];
      for (const cmd of session.extensionRunner.getRegisteredCommands()) {
        commands.push({
          name: cmd.invocationName,
          description: cmd.description,
          source: "extension",
          sourceInfo: cmd.sourceInfo,
        });
      }
      for (const template of session.promptTemplates) {
        commands.push({
          name: template.name,
          description: template.description,
          source: "prompt",
          sourceInfo: template.sourceInfo,
        });
      }
      for (const skill of session.resourceLoader.getSkills().skills) {
        commands.push({
          name: `skill:${skill.name}`,
          description: skill.description,
          source: "skill",
          sourceInfo: skill.sourceInfo,
        });
      }
      return ok(id, "get_commands", { commands });
    }

    default:
      return fail(
        id,
        (command as { type: string }).type,
        `Unknown command: ${(command as { type: string }).type}`,
      );
  }
}

// ---------------------------------------------------------------------------

port.on("message", (e) => {
  const msg = e.data;
  void (async () => {
    switch (msg.kind) {
      case "start":
        try {
          await start(msg.options);
        } catch (err) {
          send({ kind: "start-failed", message: (err as Error).message, stack: (err as Error).stack });
        }
        return;
      case "command":
        try {
          const response = await handleCommand(msg.id, msg.command);
          if (response) send({ kind: "response", id: msg.id, response });
        } catch (err) {
          send({
            kind: "response",
            id: msg.id,
            response: fail(msg.id, msg.command.type, (err as Error).message),
          });
        }
        return;
      case "ui-response": {
        const resolve = pendingDialogs.get(msg.response.id);
        pendingDialogs.delete(msg.response.id);
        resolve?.(msg.response);
        return;
      }
      case "dispose":
        unsubscribe?.();
        await runtime?.dispose();
        send({ kind: "disposed" });
        return;
    }
  })();
});
