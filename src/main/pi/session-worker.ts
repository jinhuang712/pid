/**
 * One session, one Electron utility process, one AgentSessionRuntime.
 *
 * This file is the whole of PID's contact with Pi's agent API. On one side it holds the runtime
 * the Pi terminal is also built on; on the other it speaks PID's own commands, events and dialogs
 * from `@shared/protocol`. Everything else in PID sees only that vocabulary, so a change in how
 * Pi is driven stops here.
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
  type ExtensionUIContext,
  getAgentDir,
  SessionManager,
} from "@earendil-works/pi-coding-agent";
import type {
  DistributiveOmit,
  PiCommand,
  PiDialogRequest,
  PiDialogResponse,
  PiResponse,
  PiSessionState,
  ResponseDataOf,
} from "@shared/protocol";
import { applyPiHttpSettings, toJsonEvent } from "./compat";
import type { MainToWorker, WorkerStartOptions, WorkerToMain } from "./worker-protocol";

type ParentPort = {
  postMessage(message: WorkerToMain): void;
  on(event: "message", listener: (e: { data: MainToWorker }) => void): void;
};

const port = (process as unknown as { parentPort: ParentPort }).parentPort;
const send = (message: WorkerToMain) => port.postMessage(message);
const emit = (event: PiDialogRequest) => send({ kind: "event", event });

let runtime: AgentSessionRuntime;
let session: AgentSession;
let unsubscribe: (() => void) | undefined;
const diagnostics: string[] = [];

// ---------------------------------------------------------------------------
// Extension UI: the dialogs an extension opens are PID's dialogs.
// A dialog request goes out, the window answers it, and the extension's await resolves.
// ---------------------------------------------------------------------------

type PendingDialog = (response: PiDialogResponse) => void;
const pendingDialogs = new Map<string, PendingDialog>();

interface DialogOptions {
  signal?: AbortSignal;
  timeout?: number;
}

/** The request minus the envelope PID fills in, kept distributive so each method keeps its own fields. */
type UIRequestBody = DistributiveOmit<PiDialogRequest, "type" | "id">;

function dialog<T>(
  opts: DialogOptions | undefined,
  defaultValue: T,
  request: UIRequestBody,
  parse: (response: PiDialogResponse) => T,
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
    emit({ type: "dialog", id, ...request } as PiDialogRequest);
  });
}

const cancelled = (r: PiDialogResponse) => "cancelled" in r && r.cancelled;
const dialogValue = (r: PiDialogResponse) => (cancelled(r) ? undefined : "value" in r ? r.value : undefined);

/**
 * The UI an extension gets when its host is a window rather than a terminal.
 *
 * `PID_UI_SUPPORT` in `@shared/extension-ui` says which members PID serves, which it accepts and
 * ignores, and which need a terminal. This function implements that table and the Extensions page
 * reports it, so what the page promises is what an extension gets. `test/extension-ui.test.ts`
 * fails if the two stop agreeing.
 */
function createExtensionUIContext(): ExtensionUIContext {
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
      emit({ type: "dialog", id: randomUUID(), method: "notify", message, notifyType: type });
    },
    setStatus(key: string, text: string | undefined) {
      emit({
        type: "dialog",
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
          type: "dialog",
          id: randomUUID(),
          method: "setWidget",
          widgetKey: key,
          widgetLines: content as string[] | undefined,
          widgetPlacement: options?.placement,
        });
      }
    },
    // A window is not a terminal tab, and one window holds many sessions: a background session
    // renaming the whole window would be wrong. The composer draft belongs to the window, and
    // `getEditorText` is synchronous, so the worker cannot ask for it either.
    setTitle: () => {},
    setEditorText: () => {},
    pasteToEditor: () => {},
    getEditorText: () => "",

    onTerminalInput: () => () => {},
    setWorkingMessage: () => {},
    setWorkingVisible: () => {},
    setWorkingIndicator: () => {},
    setHiddenThinkingLabel: () => {},
    setFooter: () => {},
    setHeader: () => {},
    // A component factory needs a TUI to mount into and a `done` callback that only the TUI calls,
    // so the promise would never settle. Resolving undefined lets the extension carry on.
    custom: <T>() => Promise.resolve(undefined as T),
    addAutocompleteProvider: () => {},
    setEditorComponent: () => {},
    getEditorComponent: () => undefined,
    // Themes are Pi's terminal palettes; PID paints its own. They stay readable so an extension
    // that inspects a colour still gets Pi's answer, but PID never switches to one.
    get theme() {
      return themes[0];
    },
    getAllThemes: () => themes.map((t) => ({ name: t.name ?? "", path: t.sourcePath })),
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

function makeCreateRuntime(): CreateAgentSessionRuntimeFactory {
  return async ({ cwd, agentDir, sessionManager, sessionStartEvent }) => {
    // No extension paths: PID adds none of its own. A session loads exactly what Pi resolves for
    // this directory, which is what the terminal loads too.
    const services = await createAgentSessionServices({ cwd, agentDir });
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
    uiContext: createExtensionUIContext(),
    // Pi's own label for a non-terminal host; it gates the TUI-only paths inside extensions.
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
          stack: err.stack,
        },
      }),
  });
  unsubscribe?.();
  unsubscribe = session.subscribe((event: AgentSessionEvent) => {
    send({ kind: "event", event: toJsonEvent(event) });
  });
}

async function start(options: WorkerStartOptions) {
  const { cwd, sessionPath } = options;
  // Pi's defaults decide where sessions live: open the file PID was asked to resume, or let
  // SessionManager create a new one in the directory the Pi terminal would have used.
  const sessionManager = sessionPath ? SessionManager.open(sessionPath) : SessionManager.create(cwd);
  runtime = await createAgentSessionRuntime(makeCreateRuntime(), {
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

function getState(): PiSessionState {
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
  };
}

// ---------------------------------------------------------------------------
// Commands. Each case is PID's command translated into one AgentSession call.
// ---------------------------------------------------------------------------

/** `data` is checked against what PiCommandData says this command answers with. */
const ok = <T extends PiCommand["type"]>(id: string, command: T, data?: ResponseDataOf<T>): PiResponse =>
  data === undefined ? { id, command, success: true } : { id, command, success: true, data };

const fail = (id: string, command: string, error: string): PiResponse => ({
  id,
  command,
  success: false,
  error,
});

async function handleCommand(id: string, command: PiCommand): Promise<PiResponse | undefined> {
  switch (command.type) {
    case "prompt": {
      // The authoritative response goes out once preflight accepts the prompt, not when the
      // turn finishes; the turn itself is reported through the event stream.
      let preflightSucceeded = false;
      void session
        .prompt(command.message, {
          images: command.images,
          streamingBehavior: command.streamingBehavior,
          source: "rpc", // Pi's InputSource for a programmatic caller, as opposed to a typed prompt
          preflightResult: (didSucceed: boolean) => {
            if (didSucceed) {
              preflightSucceeded = true;
              send({ kind: "response", id, response: ok(id, "prompt") });
            }
          },
        })
        .catch((e: Error) => {
          if (!preflightSucceeded) send({ kind: "response", id, response: fail(id, "prompt", e.message) });
        });
      return undefined;
    }
    case "steer":
      await session.steer(command.message, command.images);
      return ok(id, "steer");
    case "follow_up":
      await session.followUp(command.message, command.images);
      return ok(id, "follow_up");
    case "abort":
      await session.abort();
      return ok(id, "abort");
    case "clear_queue":
      return ok(id, "clear_queue", session.clearQueue());
    case "new_session": {
      const result = await runtime.newSession(
        command.parentSession ? { parentSession: command.parentSession } : undefined,
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
        .find((m) => m.provider === command.provider && m.id === command.modelId);
      if (!model) return fail(id, "set_model", `Model not found: ${command.provider}/${command.modelId}`);
      await session.setModel(model);
      return ok(id, "set_model", model);
    }
    case "get_available_models":
      return ok(id, "get_available_models", { models: [...session.modelRuntime.getAvailableSnapshot()] });

    case "set_thinking_level":
      session.setThinkingLevel(command.level);
      return ok(id, "set_thinking_level");
    case "get_available_thinking_levels":
      return ok(id, "get_available_thinking_levels", { levels: session.getAvailableThinkingLevels() });

    case "compact":
      return ok(id, "compact", await session.compact(command.customInstructions));

    case "export_html":
      return ok(id, "export_html", { path: await session.exportToHtml(command.outputPath) });
    case "switch_session":
      return ok(id, "switch_session", await runtime.switchSession(command.sessionPath));
    case "fork": {
      const result = await runtime.fork(command.entryId);
      return ok(id, "fork", { text: result.selectedText ?? "", cancelled: result.cancelled });
    }
    case "get_fork_messages":
      return ok(id, "get_fork_messages", { messages: session.getUserMessagesForForking() });
    case "get_last_assistant_text":
      return ok(id, "get_last_assistant_text", { text: session.getLastAssistantText() ?? null });
    case "set_session_name": {
      const name = command.name.trim();
      if (!name) return fail(id, "set_session_name", "Session name cannot be empty");
      session.setSessionName(name);
      return ok(id, "set_session_name");
    }

    case "get_commands": {
      const commands: ResponseDataOf<"get_commands">["commands"] = [];
      for (const cmd of session.extensionRunner.getRegisteredCommands()) {
        commands.push({
          name: cmd.invocationName,
          description: cmd.description ?? "",
          source: "extension",
          sourceInfo: cmd.sourceInfo,
        });
      }
      for (const template of session.promptTemplates) {
        commands.push({
          name: template.name,
          description: template.description ?? "",
          source: "prompt",
          sourceInfo: template.sourceInfo,
        });
      }
      for (const skill of session.resourceLoader.getSkills().skills) {
        commands.push({
          name: `skill:${skill.name}`,
          description: skill.description ?? "",
          source: "skill",
          sourceInfo: skill.sourceInfo,
        });
      }
      return ok(id, "get_commands", { commands });
    }
    case "reload": {
      // Pi routes `/reload` only in its own TUI: typed anywhere else the text reaches the model as
      // a prompt. The session exposes the operation directly, so PID runs it rather than shipping
      // an extension to register the command.
      await session.reload();
      return ok(id, "reload");
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
