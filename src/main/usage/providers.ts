/**
 * One adapter per provider that publishes a plan quota.
 *
 * An adapter is picked by the model running right now — its provider id and its base URL, both of
 * which PID already has from `get_state`. The base URL matters as much as the id: quota belongs to
 * an account on the official endpoint, and a model pointed at a proxy or a self-hosted gateway is
 * a different account or none at all. Rather than send a credential somewhere unexpected to find
 * out, an unofficial origin simply has no adapter.
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { UsageProviderId, UsageWindow } from "@shared/usage";
import { shellEnv } from "../shell-env";
import { resolveHttpAuth } from "./auth";
import { normalizeArkPlan, normalizeCodex, normalizeOpenCodeGo, UsageFailure } from "./normalize";

const run = promisify(execFile);

const CODEX_USAGE_URL = "https://chatgpt.com/backend-api/wham/usage";
/** The GO plan serves quota only from the versioned path, whatever the model's base URL says. */
const OPENCODE_GO_USAGE_URL = "https://opencode.ai/zen/go/v1/usage";

/** A quota reading is 30 seconds stale by design; a slow one is worth abandoning. */
const TIMEOUT_MS = 8_000;
/** These endpoints answer in a few hundred bytes. Anything larger is not the answer we asked for. */
const MAX_RESPONSE_BYTES = 64 * 1024;

/** Everything an adapter needs to know about the session in front of the user. */
export interface ActiveModel {
  provider: string;
  baseUrl: string;
}

export interface UsageAdapter {
  id: UsageProviderId;
  matches(model: ActiveModel): boolean;
  fetch(model: ActiveModel, signal: AbortSignal, now: number): Promise<UsageWindow[]>;
}

/** Pi's catalog spells some provider ids with spaces and capitals; the adapters use one spelling. */
export function canonicalProviderId(id: string | undefined): string {
  return (id ?? "").trim().toLowerCase().replace(/\s+/g, "-");
}

/**
 * Is this base URL the provider's own endpoint? Credentials and quota questions go nowhere else.
 * A URL carrying a query, a fragment, or inline credentials is rejected outright — none of those
 * belong on an endpoint we are about to authenticate against.
 */
export function isOfficialOrigin(provider: UsageProviderId, baseUrl: string | undefined): boolean {
  if (!baseUrl) return false;
  try {
    const url = new URL(baseUrl);
    if (url.username || url.password || url.search || url.hash) return false;
    switch (provider) {
      case "openai-codex":
        return url.origin === "https://chatgpt.com";
      case "opencode-go":
        return url.origin === "https://opencode.ai";
      // Only the plan endpoints carry subscription quota. The generic /api/v3 runtime is
      // pay-as-you-go: there is no allowance to be a percentage of.
      case "volcengine-agent-plan":
        return isArk(url, "/api/plan");
      case "volcengine-coding-plan":
        return isArk(url, "/api/coding");
    }
  } catch {
    return false;
  }
}

const isArk = (url: URL, prefix: string) =>
  url.origin === "https://ark.cn-beijing.volces.com" && url.pathname.startsWith(prefix);

// ---------------------------------------------------------------------------

function httpAdapter(
  id: "openai-codex" | "opencode-go",
  url: string,
  parse: (payload: unknown, now: number) => UsageWindow[],
): UsageAdapter {
  return {
    id,
    matches: (m) => canonicalProviderId(m.provider) === id && isOfficialOrigin(id, m.baseUrl),
    async fetch(_model, signal, now) {
      const auth = await resolveHttpAuth(id);
      if (!auth) throw new UsageFailure("auth", `No ${id} credential to read the quota with.`);
      return parse(await getJson(url, auth, signal), now);
    },
  };
}

/**
 * The Ark plans keep their quota on the control plane rather than the inference endpoint, and it
 * is authenticated by an `arkcli` SSO login rather than the model's API key. So the adapter shells
 * out to the CLI the user already signed in with instead of holding a credential of its own.
 */
function arkAdapter(
  id: "volcengine-agent-plan" | "volcengine-coding-plan",
  product: "agent-plan" | "coding-plan",
): UsageAdapter {
  return {
    id,
    matches: (m) => canonicalProviderId(m.provider) === id && isOfficialOrigin(id, m.baseUrl),
    async fetch(_model, signal, now) {
      let stdout: string;
      try {
        const out = await run("arkcli", ["usage", "plan", "--product", product, "--format", "json"], {
          encoding: "utf8",
          timeout: TIMEOUT_MS,
          maxBuffer: MAX_RESPONSE_BYTES,
          env: shellEnv(),
          signal,
        });
        stdout = out.stdout;
      } catch (e) {
        throw arkFailure(e, product);
      }
      const payload = parseLooseJson(stdout);
      if (payload === undefined)
        throw new UsageFailure("invalid-response", "arkcli returned something that was not JSON.");
      // The CLI reports its own failures in-band with ok:false rather than a non-zero exit.
      if (isRecord(payload) && payload.ok === false) {
        const message = isRecord(payload.error) ? String(payload.error.message ?? "") : "";
        throw new UsageFailure(
          looksLikeAuth(message) ? "auth" : "network",
          `arkcli could not resolve the ${product} subscription.`,
        );
      }
      return normalizeArkPlan(payload, product, now);
    },
  };
}

export const ADAPTERS: UsageAdapter[] = [
  httpAdapter("openai-codex", CODEX_USAGE_URL, normalizeCodex),
  httpAdapter("opencode-go", OPENCODE_GO_USAGE_URL, normalizeOpenCodeGo),
  arkAdapter("volcengine-agent-plan", "agent-plan"),
  arkAdapter("volcengine-coding-plan", "coding-plan"),
];

export function adapterFor(model: ActiveModel | undefined): UsageAdapter | undefined {
  if (!model) return undefined;
  return ADAPTERS.find((a) => a.matches(model));
}

/**
 * Is the Ark CLI on the PATH at all? Whether its login is still valid can only be learned by
 * running a real query, so the settings page reports installed-or-not and lets the last actual
 * fetch speak for the login.
 */
let arkcliPresent: Promise<boolean> | undefined;
export function hasArkcli(): Promise<boolean> {
  arkcliPresent ??= run("arkcli", ["--version"], { timeout: TIMEOUT_MS, env: shellEnv() })
    .then(() => true)
    .catch(() => false);
  return arkcliPresent;
}

// ---------------------------------------------------------------------------

async function getJson(url: string, headers: Record<string, string>, signal: AbortSignal): Promise<unknown> {
  const timeout = AbortSignal.timeout(TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(url, {
      headers: { accept: "application/json", ...headers },
      signal: AbortSignal.any([signal, timeout]),
    });
  } catch (e) {
    if (timeout.aborted) throw new UsageFailure("timeout", "The quota endpoint did not answer.");
    throw new UsageFailure("network", describe(e));
  }
  if (res.status === 401 || res.status === 403)
    throw new UsageFailure("auth", "The stored credential was refused.");
  if (!res.ok) throw new UsageFailure("network", `The quota endpoint answered ${res.status}.`);
  const text = await readCapped(res);
  try {
    return JSON.parse(text);
  } catch {
    throw new UsageFailure("invalid-response", "The quota endpoint did not answer with JSON.");
  }
}

/** Read at most MAX_RESPONSE_BYTES, so a wrong URL answering with a web page cannot fill memory. */
async function readCapped(res: Response): Promise<string> {
  const body = res.body;
  if (!body) return "";
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (size < MAX_RESPONSE_BYTES) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        chunks.push(value);
        size += value.byteLength;
      }
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
  return new TextDecoder().decode(concat(chunks, Math.min(size, MAX_RESPONSE_BYTES)));
}

function concat(chunks: Uint8Array[], limit: number): Uint8Array {
  const out = new Uint8Array(limit);
  let at = 0;
  for (const c of chunks) {
    if (at >= limit) break;
    const take = Math.min(c.byteLength, limit - at);
    out.set(c.subarray(0, take), at);
    at += take;
  }
  return out;
}

/** arkcli prefixes its JSON with log lines often enough that the first brace is the safer start. */
function parseLooseJson(stdout: string): unknown {
  const start = stdout.indexOf("{");
  if (start < 0) return undefined;
  try {
    return JSON.parse(stdout.slice(start));
  } catch {
    return undefined;
  }
}

function arkFailure(e: unknown, product: string): UsageFailure {
  const err = e as NodeJS.ErrnoException & { stdout?: string; stderr?: string };
  if (err?.name === "AbortError") return new UsageFailure("timeout", "arkcli was cancelled.");
  if (err?.code === "ENOENT")
    return new UsageFailure("unsupported", "arkcli is not installed on this machine.");
  const said = `${err?.stdout ?? ""}\n${err?.stderr ?? ""}`;
  return new UsageFailure(
    looksLikeAuth(said) ? "auth" : "network",
    `arkcli could not read the ${product} quota.`,
  );
}

/** Tell a signed-out CLI from a broken one, so the settings page can offer a sign-in. */
function looksLikeAuth(said: string): boolean {
  const s = said.toLowerCase();
  return (
    s.includes("not configured") ||
    s.includes("not logged in") ||
    s.includes("not login") ||
    s.includes("access denied") ||
    s.includes("unauthorized")
  );
}

function describe(e: unknown): string {
  return e instanceof Error ? e.message : "The quota endpoint could not be reached.";
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
