import type { PiHandle, RpcExtensionUIRequest } from "@shared/protocol";
import { useCallback, useEffect, useReducer, useState } from "react";
import { bridge } from "./bridge";
import { Composer } from "./components/Composer";
import { Timeline } from "./components/Timeline";
import { emptyConversation, reduce } from "./state/conversation";

export function App() {
  const [folder, setFolder] = useState<string>();
  const [pi, setPi] = useState<PiHandle>();
  const [conv, dispatch] = useReducer(reduce, undefined, emptyConversation);
  const [status, setStatus] = useState<string>();

  useEffect(() => {
    const offEvent = bridge.pi.onEvent(({ key, event }) => {
      if (key !== pi?.key) return;
      if (event.type === "extension_ui_request") return handleUI(key, event);
      dispatch(event);
    });
    const offExit = bridge.pi.onExit(({ key, code, stderr }) => {
      if (key !== pi?.key) return;
      setStatus(`pi exited (${code}) ${stderr.split("\n").slice(-3).join(" ")}`);
      setPi(undefined);
    });
    return () => {
      offEvent();
      offExit();
    };
  }, [pi?.key]);

  const startIn = useCallback(
    async (dir: string) => {
      setFolder(dir);
      if (pi) await bridge.pi.stop(pi.key);
      setStatus("starting pi…");
      try {
        const handle = await bridge.pi.start({ cwd: dir });
        setPi(handle);
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

  const send = (text: string) => {
    if (!pi) return;
    void bridge.pi.command(pi.key, { type: "prompt", message: text }).catch((e) => setStatus(String(e)));
  };
  const abort = () => pi && void bridge.pi.command(pi.key, { type: "abort" });

  return (
    <div className="h-full flex flex-col">
      <header className="drag h-11 shrink-0 pl-[84px] pr-3 flex items-center gap-3 border-b border-line text-ink-2">
        <span className="font-medium text-ink">PID</span>
        {folder && <span className="font-mono text-xs truncate">{folder}</span>}
        <span className="flex-1" />
        {pi?.state.model && (
          <span className="text-xs">
            {pi.state.model.provider}/{pi.state.model.id} · {pi.state.thinkingLevel}
          </span>
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
