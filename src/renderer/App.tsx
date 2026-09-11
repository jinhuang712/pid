import type { PiHandle, RpcExtensionUIRequest, RpcSessionState } from "@shared/protocol";
import { useCallback, useEffect, useReducer, useState } from "react";
import { bridge } from "./bridge";
import { Composer, type SendMode } from "./components/Composer";
import { ModelPicker } from "./components/ModelPicker";
import { QueuePanel } from "./components/QueuePanel";
import { ThinkingPicker } from "./components/ThinkingPicker";
import { Timeline } from "./components/Timeline";
import { emptyConversation, reduce } from "./state/conversation";

export function App() {
  const [folder, setFolder] = useState<string>();
  const [pi, setPi] = useState<PiHandle>();
  const [piState, setPiState] = useState<RpcSessionState>();
  const [conv, dispatch] = useReducer(reduce, undefined, emptyConversation);
  const [status, setStatus] = useState<string>();

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
  }, [key, refreshState]);

  const startIn = useCallback(
    async (dir: string) => {
      setFolder(dir);
      if (pi) await bridge.pi.stop(pi.key);
      setStatus("starting pi…");
      try {
        const handle = await bridge.pi.start({ cwd: dir });
        setPi(handle);
        setPiState(handle.state);
        setStatus(undefined);
        return handle;
      } catch (e) {
        setStatus(String(e));
      }
    },
    [pi],
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
      const handle = await startIn(info.devOpenFolder);
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
        <aside className="w-[272px] shrink-0 border-r border-line bg-paper-2 p-3 flex flex-col gap-2">
          <button
            type="button"
            onClick={openFolder}
            className="h-8 rounded-md bg-paper-3 hover:bg-paper-4 text-ink text-left px-3"
          >
            Open folder…
          </button>
          {folder && <div className="text-xs text-ink-3 px-1 truncate">{folder}</div>}
        </aside>
        <main className="flex-1 flex flex-col min-w-0">
          {pi ? (
            <>
              <Timeline state={conv} />
              {status && <div className="px-4 py-1 text-xs text-warn">{status}</div>}
              <QueuePanel
                streaming={conv.isStreaming}
                steering={conv.queue.steering}
                followUp={conv.queue.followUp}
                onClear={clearQueue}
              />
              <Composer streaming={conv.isStreaming} onSend={send} onAbort={abort} />
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
