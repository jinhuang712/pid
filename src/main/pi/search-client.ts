import { join } from "node:path";
import type { SearchHit, SearchScope } from "@shared/sessions";
import { type UtilityProcess, utilityProcess } from "electron";
import * as inProcess from "./search";
import type { WorkerRequest, WorkerResponse } from "./search-worker";

/**
 * Main-process handle on the search utility process. Falls back to the in-process index
 * if the worker cannot be started, so search keeps working either way.
 */
type Pending = { resolve: (v: unknown) => void; reject: (e: Error) => void; owner: UtilityProcess };

let child: UtilityProcess | undefined;
let failed = false;
let nextId = 1;
const pending = new Map<number, Pending>();

function spawn(): UtilityProcess | undefined {
  if (child || failed) return child;
  let spawned: UtilityProcess;
  try {
    spawned = utilityProcess.fork(join(__dirname, "search-worker.js"), [], { serviceName: "pid-search" });
  } catch {
    failed = true;
    return undefined;
  }
  child = spawned;
  spawned.on("message", (msg: WorkerResponse) => {
    const p = pending.get(msg.id);
    if (!p) return;
    pending.delete(msg.id);
    if (msg.ok) p.resolve(msg.result);
    else p.reject(new Error(msg.error));
  });
  spawned.on("exit", () => {
    // A dead worker fails its own requests and nothing else. A replacement shares this map — the
    // previous worker is stopped on quit, and a request in flight is not the dead one's to reject.
    for (const [id, p] of pending) {
      if (p.owner !== spawned) continue;
      pending.delete(id);
      p.reject(new Error("search worker exited"));
    }
    if (child === spawned) child = undefined; // the next call forks a fresh one
  });
  return spawned;
}

type Body = WorkerRequest extends infer R ? (R extends { id: number } ? Omit<R, "id"> : never) : never;

function request<T>(req: Body): Promise<T> {
  const c = spawn();
  if (!c) return Promise.reject(new Error("no search worker"));
  const id = nextId++;
  return new Promise<T>((resolve, reject) => {
    pending.set(id, { resolve: resolve as (v: unknown) => void, reject, owner: c });
    c.postMessage({ id, ...req } as WorkerRequest);
  });
}

export async function searchSessions(query: string, scope: SearchScope): Promise<SearchHit[]> {
  if (failed) return inProcess.searchSessions(query, scope);
  try {
    return await request<SearchHit[]>({ type: "search", query, scope });
  } catch {
    return inProcess.searchSessions(query, scope);
  }
}

/** Build the index ahead of the first ⌘K, so it opens with results instead of a wait. */
export function warmSearchIndex() {
  if (failed) return;
  void request({ type: "warm" }).catch(() => {});
}

export function dropIndex() {
  inProcess.dropIndex();
  if (child) void request({ type: "drop" }).catch(() => {});
}

export function stopSearchWorker() {
  child?.kill();
  child = undefined;
}
