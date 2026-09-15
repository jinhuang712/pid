/**
 * Messages between the main process and one session worker.
 *
 * Only main and the worker speak this envelope. What it carries is PID's own protocol, so the
 * window is unaffected by how a session is hosted.
 */
import type { PiCommand, PiDialogResponse, PiEvent, PiResponse, PiSessionState } from "@shared/protocol";

export interface WorkerStartOptions {
  cwd: string;
  /** Resume an existing Pi session file. Omit for a fresh session. */
  sessionPath?: string;
}

export type MainToWorker =
  | { kind: "start"; options: WorkerStartOptions }
  | { kind: "command"; id: string; command: PiCommand }
  | { kind: "ui-response"; response: PiDialogResponse }
  | { kind: "dispose" };

export type WorkerToMain =
  | { kind: "started"; state: PiSessionState; diagnostics: string[] }
  | { kind: "start-failed"; message: string; stack?: string }
  | { kind: "response"; id: string; response: PiResponse }
  | { kind: "event"; event: PiEvent }
  | { kind: "log"; text: string }
  | { kind: "disposed" };
