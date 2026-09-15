/**
 * The plan-quota service: one reading, for the provider behind the model the user is looking at.
 *
 * The renderer owns the notion of an active session, so it tells this service which model is in
 * front of the user; the service owns the fetching, the cadence and the failure behaviour, and
 * pushes a snapshot whenever the answer changes. Nothing here is per-session state — two sessions
 * on the same provider share one account and therefore one quota.
 */

import {
  type ProviderHealth,
  type ProviderUsage,
  USAGE_PROVIDERS,
  type UsageErrorCode,
  type UsageProviderId,
  type UsageSnapshot,
} from "@shared/usage";
import type { BrowserWindow } from "electron";
import { loadSettings } from "../settings";
import { resolveHttpAuth } from "./auth";
import { restate, UsageFailure } from "./normalize";
import { type ActiveModel, ADAPTERS, adapterFor, canonicalProviderId, hasArkcli } from "./providers";

/** A burst of tool calls ends many things at once; one refresh covers the lot. */
const TURN_DEBOUNCE_MS = 250;

export class UsageService {
  private model: ActiveModel | undefined;
  private usage: ProviderUsage | undefined;
  private providers: ProviderHealth[] = [];
  private timer: NodeJS.Timeout | undefined;
  private debounce: NodeJS.Timeout | undefined;
  private inFlight: AbortController | undefined;
  /** Last good reading per provider, so switching away and back does not refetch. */
  private readonly cache = new Map<UsageProviderId, ProviderUsage>();
  private disposed = false;

  constructor(private readonly win: () => BrowserWindow | undefined) {}

  snapshot(): UsageSnapshot {
    const now = Date.now();
    return {
      usage: this.usage ? restate(this.usage, now) : undefined,
      providers: this.providers,
    };
  }

  /**
   * The renderer switched session, model, or thinking level. A model change is the only one that
   * matters here, so an identical model is a no-op — otherwise every keystroke-driven state
   * refresh would restart the clock.
   */
  setModel(model: ActiveModel | undefined) {
    const same = this.model?.provider === model?.provider && this.model?.baseUrl === model?.baseUrl;
    if (same) return;
    this.model = model;
    this.abort();
    const adapter = adapterFor(model);
    if (!adapter) {
      this.usage = undefined;
      this.rearm();
      this.publish();
      // Health is a disk read per provider, so it lands a moment later, on its own push.
      void this.refreshHealth().then(() => this.publish());
      return;
    }
    // A reading taken within one refresh interval is still the answer; show it and wait for the
    // timer rather than spending a request to learn the same number.
    const cached = this.cache.get(adapter.id);
    const fresh =
      cached?.fetchedAt !== undefined &&
      Date.now() - cached.fetchedAt < this.intervalMs() &&
      cached.provider === adapter.id;
    if (fresh && cached) {
      this.usage = cached;
      this.publish();
      this.rearm();
      void this.refreshHealth().then(() => this.publish());
      return;
    }
    this.usage = { provider: adapter.id, state: "loading", windows: [] };
    this.publish();
    void this.fetch();
  }

  /** A turn finished, so the quota moved. Debounced: a turn is many events, not one. */
  turnEnded() {
    if (!loadSettings().usageBar.refreshAfterTurn) return;
    if (this.debounce) clearTimeout(this.debounce);
    this.debounce = setTimeout(() => {
      this.debounce = undefined;
      void this.fetch();
    }, TURN_DEBOUNCE_MS);
  }

  /** The Refresh button in settings, and the only path that ignores everything cached. */
  async refresh(): Promise<UsageSnapshot> {
    await this.fetch();
    return this.snapshot();
  }

  /** Settings changed: the interval may have moved, or the bar may have been switched off. */
  settingsChanged() {
    this.rearm();
  }

  dispose() {
    this.disposed = true;
    this.abort();
    if (this.timer) clearTimeout(this.timer);
    if (this.debounce) clearTimeout(this.debounce);
    this.timer = undefined;
    this.debounce = undefined;
  }

  // -------------------------------------------------------------------------

  private intervalMs(): number {
    return Math.max(15, loadSettings().usageBar.refreshSeconds) * 1000;
  }

  /**
   * Re-arm from now rather than on a fixed schedule, so a manual refresh or a post-turn fetch
   * resets the clock instead of being followed a second later by the interval's own request.
   */
  private rearm() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined;
    if (this.disposed) return;
    const s = loadSettings().usageBar;
    if (!s.enabled || !adapterFor(this.model)) return;
    this.timer = setTimeout(() => void this.fetch(), this.intervalMs());
    this.timer.unref?.();
  }

  private abort() {
    this.inFlight?.abort();
    this.inFlight = undefined;
  }

  private async fetch() {
    if (this.disposed) return;
    const model = this.model;
    const adapter = adapterFor(model);
    if (!model || !adapter) {
      this.rearm();
      return;
    }
    this.abort();
    const controller = new AbortController();
    this.inFlight = controller;
    const now = Date.now();
    try {
      const windows = await adapter.fetch(model, controller.signal, now);
      if (controller.signal.aborted || this.disposed) return;
      const usage: ProviderUsage = {
        provider: adapter.id,
        state: "fresh",
        fetchedAt: now,
        windows,
      };
      this.cache.set(adapter.id, usage);
      this.lastOutcome.delete(adapter.id); // a reading supersedes whatever last went wrong
      this.usage = usage;
    } catch (e) {
      if (controller.signal.aborted || this.disposed) return;
      this.usage = this.onFailure(adapter.id, e);
    } finally {
      if (this.inFlight === controller) this.inFlight = undefined;
      if (!this.disposed) {
        await this.refreshHealth();
        this.publish();
        this.rearm();
      }
    }
  }

  /**
   * A failed refresh with a previous reading in hand keeps the numbers and marks them stale: a
   * quota that was 61% a minute ago is still roughly 61%, and blanking the row on a flaky network
   * teaches the user to distrust it. Without a previous reading there is nothing honest to show.
   */
  private onFailure(id: UsageProviderId, e: unknown): ProviderUsage {
    const failure = e instanceof UsageFailure ? e : undefined;
    const code = failure?.code ?? "network";
    const message = failure?.message ?? (e instanceof Error ? e.message : String(e));
    this.remember(id, code, message);
    const previous = this.cache.get(id);
    const keepStale = loadSettings().usageBar.keepStale;
    if (keepStale && previous && previous.windows.length > 0 && code !== "unsupported") {
      return { ...previous, state: "stale", errorCode: code, errorMessage: message };
    }
    // `unavailable` hides the provider half of the bar; `error` keeps it with nothing to say,
    // which is only worth doing when the cause is something the user can act on.
    const hidden = code === "unsupported" || code === "no-subscription";
    return {
      provider: id,
      state: hidden ? "unavailable" : "error",
      errorCode: code,
      errorMessage: message,
      windows: [],
    };
  }

  /**
   * The settings page's provider list. The row for the running model reports what the last real
   * query concluded; the rest report only what can be checked without spending a request.
   */
  private async refreshHealth() {
    const activeId = adapterFor(this.model)?.id;
    const out: ProviderHealth[] = [];
    for (const id of USAGE_PROVIDERS) {
      if (id === activeId) {
        out.push({ provider: id, ...this.activeHealth() });
        continue;
      }
      // What a real query last said outranks anything we can guess from disk.
      const remembered = this.lastOutcome.get(id);
      if (remembered && !this.cache.has(id)) {
        out.push({ provider: id, ...remembered });
        continue;
      }
      out.push(await this.probe(id));
    }
    this.providers = out;
  }

  /** The provider behind the running model: whatever the last query actually found out. */
  private activeHealth(): Omit<ProviderHealth, "provider"> {
    const u = this.usage;
    if (!u || u.state === "loading") return { state: "active" };
    if (u.errorCode === "auth") return { state: "signed-out", detail: u.errorMessage };
    if (u.errorCode === "no-subscription") return { state: "unsupported", detail: "No active subscription." };
    if (u.errorCode === "unsupported") return { state: "unsupported", detail: u.errorMessage };
    return { state: "active", detail: u.state === "stale" ? u.errorMessage : undefined };
  }

  /** What the last real fetch for a provider concluded, kept so the list stops guessing. */
  private readonly lastOutcome = new Map<UsageProviderId, Omit<ProviderHealth, "provider">>();

  private remember(id: UsageProviderId, code: UsageErrorCode, message: string) {
    if (code === "auth") this.lastOutcome.set(id, { state: "signed-out", detail: message });
    else if (code === "no-subscription")
      this.lastOutcome.set(id, { state: "unsupported", detail: "No active subscription." });
    else if (code === "unsupported") this.lastOutcome.set(id, { state: "unsupported", detail: message });
  }

  /**
   * A cheap look, and only at what can honestly be looked at. A credential either sits on disk or
   * does not; a CLI either exists or does not. Whether an Ark plan is subscribed is a question only
   * a real query answers, so until one has run the row says so rather than implying a green light.
   */
  private async probe(id: UsageProviderId): Promise<ProviderHealth> {
    if (id === "openai-codex" || id === "opencode-go") {
      const auth = await resolveHttpAuth(id);
      return auth
        ? { provider: id, state: "ready" }
        : { provider: id, state: "signed-out", detail: "No credential found on this machine." };
    }
    return (await hasArkcli())
      ? {
          provider: id,
          state: "unknown",
          detail: "arkcli is installed; the plan is read when a model on it runs.",
        }
      : { provider: id, state: "unsupported", detail: "arkcli is not installed." };
  }

  private publish() {
    const w = this.win();
    if (w && !w.isDestroyed()) w.webContents.send("usage:changed", this.snapshot());
  }
}

/** The renderer hands over what `get_state` gave it; anything else is not a model we can match. */
export function toActiveModel(model: unknown): ActiveModel | undefined {
  if (typeof model !== "object" || model === null) return undefined;
  const m = model as { provider?: unknown; baseUrl?: unknown };
  if (typeof m.provider !== "string" || typeof m.baseUrl !== "string") return undefined;
  return { provider: canonicalProviderId(m.provider), baseUrl: m.baseUrl };
}

export { ADAPTERS };
