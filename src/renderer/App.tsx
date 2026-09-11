import type { PiHandle, RpcExtensionUIRequest, RpcSessionState } from "@shared/protocol";
import type { SessionSummary } from "@shared/sessions";
import { useCallback, useEffect, useReducer, useState } from "react";
import { bridge } from "./bridge";
import { Composer, type SendMode } from "./components/Composer";
import { ForkMenu } from "./components/ForkMenu";
import { Lineage } from "./components/Lineage";
import { ModelPicker } from "./components/ModelPicker";
import { QueuePanel } from "./components/QueuePanel";
import { Sidebar } from "./components/Sidebar";
import { ThinkingPicker } from "./components/ThinkingPicker";
import { Timeline } from "./components/Timeline";
import { type ConversationState, emptyConversation, fromMessages, reduce } from "./state/conversation";

export function App() {
  const [folder, setFolder] = useState<string>();
  const [pi, setPi] = useState<PiHandle>();
  const [piState, setPiState] = useState<RpcSessionState>();
  const [conv, dispatch] = useReducer(convReducer, undefined, emptyConversation);
  const [status, setStatus] = useState<string>();
  const [draft, setDraft] = useState("");
  const [folders, setFolders] = useState<string[]>([]);
  const [sessions, setSessions] = useState<SessionSummary[]>([]);

  useEffect(() => {
    void bridge.folders.recent().then(setFolders);
  }, []);
  const refreshSessions = useCallback(
    async (dir: string) => setSessions(await bridge.sessions.list(dir)),
    [],
  );

  const key = pi?.key;
  const refreshState = useCallback(async () => {
    if (!key) return;
    setPiState(await bridge.pi.command(key, { type: "get_state" }));
  }, [key]);

  useEffect(() => {
    const offEvent = bridge.pi.onEvent(({ key: k, event }) => {
      if (k !== key) return;
      if (event.type === "extension_ui_request") return handleUI(k, event);
      dispatch(event);
      if (
        event.type === "thinking_level_changed" ||
        event.type === "session_info_changed" ||
        event.type === "agent_end"
      ) {
        void refreshState();
      }
      if (event.type === "agent_end" && folder) void refreshSessions(folder);
    });
    const offExit = bridge.pi.onExit(({ key: k, code, stderr }) => {
      if (k !== key) return;
      setStatus(`pi exited (${code}) ${stderr.split("\n").slice(-3).join(" ")}`);
      setPi(undefined);
    });
    return () => {
      offEvent();
      offExit();
    };
  }, [key, refreshState, folder, refreshSessions]);

  const startIn = useCallback(
    async (dir: string, sessionPath?: string) => {
      setFolder(dir);
      setFolders(await bridge.folders.remember(dir));
      void refreshSessions(dir);
      if (pi) await bridge.pi.stop(pi.key);
      setPi(undefined);
      dispatch({ reset: emptyConversation() });
      setStatus(sessionPath ? "resuming session…" : "starting pi…");
      try {
        const handle = await bridge.pi.start({ cwd: dir, sessionPath });
        if (sessionPath) {
          const { messages } = await bridge.pi.command(handle.key, { type: "get_messages" });
          dispatch({ reset: fromMessages(messages) });
        }
        setPi(handle);
        setPiState(handle.state);
        setStatus(undefined);
        return handle;
      } catch (e) {
        setStatus(String(e));
      }
    },
    [pi, refreshSessions],
  );

  const openFolder = useCallback(async () => {
    const dir = await bridge.pickFolder();
    if (dir) await startIn(dir);
  }, [startIn]);

  // Dev hooks (PID_OPEN_FOLDER / PID_PROMPT) for headless smoke tests.
  // biome-ignore lint/correctness/useExhaustiveDependencies: run once on mount
  useEffect(() => {
    void bridge.appInfo().then(async (info) => {
      if (!info.devOpenFolder) return;
      const handle = await startIn(info.devOpenFolder, info.devOpenSession);
      if (handle && info.devPrompt)
        await bridge.pi.command(handle.key, { type: "prompt", message: info.devPrompt });
    });
  }, []);

  const run = <T,>(p: Promise<T>) => p.catch((e) => setStatus(String(e)));
  const send = (text: string, mode: SendMode) => {
    if (!key) return;
    const cmd =
      mode === "steer"
        ? ({ type: "steer", message: text } as const)
        : mode === "followUp"
          ? ({ type: "follow_up", message: text } as const)
          : ({ type: "prompt", message: text } as const);
    void run(bridge.pi.command(key, cmd));
  };
  const clearQueue = () => key && void run(bridge.pi.command(key, { type: "clear_queue" }));
  const abort = () => key && void run(bridge.pi.command(key, { type: "abort" }));

  const loadForkPoints = useCallback(
    async () => (key ? (await bridge.pi.command(key, { type: "get_fork_messages" })).messages : []),
    [key],
  );
  /** Pi forks in-process: the running session becomes the new fork. Reload state and timeline from Pi. */
  const fork = async (entryId: string) => {
    if (!key) return;
    const r = await bridge.pi.command(key, { type: "fork", entryId });
    if (r.cancelled) return;
    setDraft(r.text); // Pi hands back the forked-from message so it can be edited and resent
    const { messages } = await bridge.pi.command(key, { type: "get_messages" });
    dispatch({ reset: fromMessages(messages) });
    await refreshState();
    if (folder) await refreshSessions(folder);
  };

  const loadModels = useCallback(
    async () => (key ? (await bridge.pi.command(key, { type: "get_available_models" })).models : []),
    [key],
  );
  const loadLevels = useCallback(
    async () => (key ? (await bridge.pi.command(key, { type: "get_available_thinking_levels" })).levels : []),
    [key],
  );

  return (
    <div className="h-full flex flex-col">
      <header className="drag h-11 shrink-0 pl-[84px] pr-3 flex items-center gap-3 border-b border-line text-ink-2">
        <span className="font-medium text-ink">PID</span>
        {folder && <span className="font-mono text-xs truncate">{folder}</span>}
        <span className="flex-1" />
        {key && piState && (
          <div className="flex items-center gap-1">
            <ForkMenu load={loadForkPoints} onFork={(id) => void run(fork(id))} />
            <ModelPicker
              current={piState.model ? { provider: piState.model.provider, id: piState.model.id } : undefined}
              load={loadModels}
              onSelect={(m) =>
                void run(
                  bridge.pi
                    .command(key, { type: "set_model", provider: m.provider, modelId: m.id })
                    .then(refreshState),
                )
              }
            />
            <ThinkingPicker
              current={piState.thinkingLevel}
              load={loadLevels}
              onSelect={(level) =>
                void run(bridge.pi.command(key, { type: "set_thinking_level", level }).then(refreshState))
              }
            />
          </div>
        )}
      </header>
      <div className="flex-1 flex min-h-0">
        <Sidebar
          folders={folders}
          folder={folder}
          sessions={sessions}
          activeSessionPath={piState?.sessionFile}
          onOpenFolder={(dir) => void startIn(dir)}
          onPickFolder={() => void openFolder()}
          onNewSession={() => folder && void startIn(folder)}
          onOpenSession={(s) => void startIn(s.cwd, s.path)}
        />
        <main className="flex-1 flex flex-col min-w-0">
          {pi ? (
            <>
              <Lineage
                current={sessions.find((s) => s.path === piState?.sessionFile)}
                sessions={sessions}
                onOpen={(s) => void startIn(s.cwd, s.path)}
              />
              <Timeline state={conv} />
              {status && <div className="px-4 py-1 text-xs text-warn">{status}</div>}
              <QueuePanel
                streaming={conv.isStreaming}
                steering={conv.queue.steering}
                followUp={conv.queue.followUp}
                onClear={clearQueue}
              />
              <Composer
                text={draft}
                setText={setDraft}
                streaming={conv.isStreaming}
                onSend={send}
                onAbort={abort}
              />
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-ink-3 gap-2">
              <div>Open a folder to start a Pi session.</div>
              {status && <div className="text-xs text-warn max-w-lg text-center">{status}</div>}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

type ConvAction = Parameters<typeof reduce>[1] | { reset: ConversationState };
function convReducer(state: ConversationState, action: ConvAction): ConversationState {
  return "reset" in action ? action.reset : reduce(state, action);
}

/** Extension UI requests. Fire-and-forget methods are ignored for now; dialogs are cancelled. */
function handleUI(key: string, req: RpcExtensionUIRequest) {
  switch (req.method) {
    case "select":
    case "confirm":
    case "input":
    case "editor":
      void bridge.pi.uiResponse(key, { type: "extension_ui_response", id: req.id, cancelled: true });
      break;
    default:
      break;
  }
}
