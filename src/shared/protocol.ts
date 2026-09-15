/**
 * Types shared by main, preload, and renderer.
 * Pi owns the agent protocol; PID only adds the thin "which process" envelope.
 */
import type {
  JsonAgentSessionEvent,
  RpcCommand,
  RpcExtensionUIRequest,
  RpcExtensionUIResponse,
  RpcResponse,
  RpcSessionState,
} from "@earendil-works/pi-coding-agent";

export type {
  JsonAgentSessionEvent,
  RpcCommand,
  RpcExtensionUIRequest,
  RpcExtensionUIResponse,
  RpcResponse,
  RpcSessionState,
};

/** A running `pi --mode rpc` process, keyed by PID-side handle. */
export interface PiHandle {
  key: string;
  cwd: string;
  state: RpcSessionState;
  /** Events pi emitted while starting, before the renderer knew this key (extension status etc.). */
  earlyEvents: PiEvent[];
}

export interface StartPiOptions {
  cwd: string;
  /** Resume an existing Pi session file. Omit for a fresh session. */
  sessionPath?: string;
}

/** Anything the pi process emits on stdout that is not a command response. */
export type PiEvent = JsonAgentSessionEvent | RpcExtensionUIRequest;

export interface PiEventEnvelope {
  key: string;
  event: PiEvent;
}

export interface PiExitEnvelope {
  key: string;
  code: number | null;
  signal: string | null;
  stderr: string;
}

export type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
/** An RPC command without the correlation id (PID assigns it). */
export type PiCommand = DistributiveOmit<RpcCommand, "id">;
export type ResponseDataOf<T extends RpcCommand["type"]> =
  Extract<RpcResponse, { command: T; success: true }> extends { data: infer D } ? D : undefined;
