import type { SearchScope } from "@shared/sessions";
import { dropIndex, ensureIndex, searchSessions } from "./search";

/**
 * Entry point of the search utility process. Reading and tokenizing every session file
 * (hundreds of MB on a busy machine) happens here, never on the main process's IPC thread.
 */
export type WorkerRequest =
  | { id: number; type: "search"; query: string; scope: SearchScope }
  | { id: number; type: "warm" }
  | { id: number; type: "drop" };

export type WorkerResponse =
  | { id: number; ok: true; result: unknown }
  | { id: number; ok: false; error: string };

type Port = {
  on(event: "message", listener: (e: { data: WorkerRequest }) => void): void;
  postMessage(message: WorkerResponse): void;
};

const port = (process as unknown as { parentPort: Port }).parentPort;

port.on("message", async ({ data: req }) => {
  try {
    let result: unknown;
    if (req.type === "search") result = await searchSessions(req.query, req.scope);
    else if (req.type === "warm") {
      await ensureIndex();
      result = undefined;
    } else dropIndex();
    port.postMessage({ id: req.id, ok: true, result });
  } catch (e) {
    port.postMessage({ id: req.id, ok: false, error: e instanceof Error ? e.message : String(e) });
  }
});
