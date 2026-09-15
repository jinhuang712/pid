import type { UsageSnapshot } from "@shared/usage";
import { useEffect, useRef, useState } from "react";
import { bridge } from "./bridge";

const EMPTY: UsageSnapshot = { providers: [] };

/**
 * Keep the main process pointed at the model in front of the user, and hold its latest reading.
 *
 * Called once, at the top of the app: quota belongs to an account, not to a session, so there is
 * one reading no matter how many sessions are open. The model is sent as two plain fields rather
 * than the whole model object — those are the two the adapters match on, and an object identity
 * that changes on every state refresh would restart the fetch clock for no reason.
 */
export function useUsageWatch(model: { provider: string; baseUrl?: string } | undefined) {
  const [snapshot, setSnapshot] = useState<UsageSnapshot>(EMPTY);
  const provider = model?.provider;
  const baseUrl = model?.baseUrl;

  useEffect(() => bridge.usage.onChange(setSnapshot), []);

  useEffect(() => {
    const target = provider && baseUrl ? { provider, baseUrl } : undefined;
    void bridge.usage.watch(target).then(setSnapshot);
  }, [provider, baseUrl]);

  return snapshot;
}

/**
 * Nudge the service when a turn settles. Only the running→idle edge counts: an app that has just
 * opened is idle too, and that is not a turn ending. The main process debounces on top, so a
 * session that finishes three turns at once still costs one request.
 */
export function useTurnEndedSignal(isStreaming: boolean) {
  const wasStreaming = useRef(false);
  useEffect(() => {
    const ended = wasStreaming.current && !isStreaming;
    wasStreaming.current = isStreaming;
    if (ended) void bridge.usage.turnEnded();
  }, [isStreaming]);
}
