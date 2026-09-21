import { describe, expect, it, vi } from "vitest";

/**
 * The search worker is replaceable — it is stopped when PID quits and can die on its own — but it
 * is asked for work by whoever is current, and requests from different workers share one pending
 * map. A dead worker failing the live one's requests sends the live one's search to the in-process
 * fallback for no reason.
 */

const h = vi.hoisted(() => ({
  children: [] as Array<{
    handlers: Map<string, Array<(...args: unknown[]) => void>>;
    posted: Array<{ id: number }>;
  }>,
  /** Queries the in-process index was asked for, in order. */
  fellBack: [] as string[],
}));

vi.mock("electron", () => ({
  utilityProcess: {
    fork: () => {
      const handlers = new Map<string, Array<(...args: unknown[]) => void>>();
      const child = {
        handlers,
        posted: [] as Array<{ id: number }>,
        on: (ev: string, cb: (...args: unknown[]) => void) => {
          handlers.set(ev, [...(handlers.get(ev) ?? []), cb]);
          return child;
        },
        postMessage: (msg: { id: number }) => {
          child.posted.push(msg);
        },
        kill: () => {},
      };
      h.children.push(child);
      return child;
    },
  },
}));

vi.mock("../src/main/pi/search", () => ({
  searchSessions: async (query: string) => {
    h.fellBack.push(query);
    return [];
  },
  dropIndex: () => {},
}));

import { readSessionMessages, searchSessions, stopSearchWorker } from "../src/main/pi/search-client";

const fire = (i: number, ev: string, ...args: unknown[]) => {
  for (const cb of h.children[i]?.handlers.get(ev) ?? []) cb(...args);
};

/** Answer the last request the given worker was handed. */
const answer = (i: number, result: unknown) => {
  const req = h.children[i]?.posted.at(-1);
  if (!req) throw new Error("that worker was handed no request");
  fire(i, "message", { id: req.id, ok: true, result });
};

describe("a search worker that dies", () => {
  it("fails its own requests and leaves the replacement's alone", async () => {
    const first = searchSessions("a", {} as never);
    stopSearchWorker();
    const second = searchSessions("b", {} as never);

    // The stopped worker's exit lands after a replacement is already serving.
    fire(0, "exit");
    answer(1, ["hit"]);

    expect(await second).toEqual(["hit"]);
    // Its own request had nobody left to answer it, so the in-process index takes over — and only
    // that one: the live worker's request is answered by the live worker.
    expect(await first).toEqual([]);
    expect(h.fellBack).toEqual(["a"]);
  });

  it("reads a session file through the worker, not on the IPC thread", async () => {
    stopSearchWorker(); // start from no worker, the way a fresh window would
    const read = readSessionMessages("/tmp/s.jsonl");

    const fake = h.children.at(-1);
    expect(fake?.posted.at(-1)).toMatchObject({ type: "readMessages", path: "/tmp/s.jsonl" });
    if (!fake) throw new Error("no worker was forked");
    fire(h.children.length - 1, "message", { id: fake.posted.at(-1)?.id, ok: true, result: [{ role: "user", text: "Q1" }] });

    expect(await read).toEqual([{ role: "user", text: "Q1" }]);
  });
});
