/**
 * Messages between the main process and one session worker.
 *
 * Only main and the worker speak this. What reaches the renderer is unchanged: Pi's own
 * RpcResponse / JsonAgentSessionEvent / RpcExtensionUIRequest shapes, so the UI keeps
 * consuming the same data it did when a `pi --mode rpc` child produced it.
 */
import type {
  PiCommand,
  PiEvent,
  RpcExtensionUIResponse,
  RpcResponse,
  RpcSessionState,
} from "@shared/protocol";

export interface WorkerStartOptions {
  cwd: string;
  /** Resume an existing Pi session file. Omit for a fresh session. */
  sessionPath?: string;
  /** Extensions PID loads on top of the user's own, by absolute path. */
  extensionPaths: string[];
}

export type MainToWorker =
  | { kind: "start"; options: WorkerStartOptions }
  | { kind: "command"; id: string; command: PiCommand }
  | { kind: "ui-response"; response: RpcExtensionUIResponse }
  | { kind: "dispose" };

export type WorkerToMain =
  | { kind: "started"; state: RpcSessionState; diagnostics: string[] }
  | { kind: "start-failed"; message: string; stack?: string }
  | { kind: "response"; id: string; response: RpcResponse }
  | { kind: "event"; event: PiEvent }
  | { kind: "log"; text: string }
  | { kind: "disposed" };
