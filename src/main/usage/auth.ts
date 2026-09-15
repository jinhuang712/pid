/**
 * Reading — never writing — the credential Pi already signed in with.
 *
 * Pi keeps provider credentials in `~/.pi/agent/auth.json`, a 0600 JSON file keyed by provider id.
 * An extension running inside Pi would ask the model registry for a resolved bearer; PID is a
 * separate process, so it reads the same file. That is a deliberate boundary: PID opens the file
 * read-only, and never refreshes, rotates or writes a credential back.
 *
 * The cost of that boundary is the Codex token, which lives about an hour. Pi rotates it when it
 * next makes a completion call — that is, whenever the user actually sends something — so an idle
 * session can reach a window where PID has nothing valid to ask with. The bar goes quiet and comes
 * back on the next turn. The alternative, PID performing its own OAuth refresh and writing into
 * Pi's credential store under Pi's lock, is a large amount of risk to carry for a footer.
 */

import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

/** A GET takes milliseconds, so a token with half a minute left is still a usable token. */
const MIN_VALIDITY_MS = 30_000;

type StoredCredential =
  | { type: "oauth"; access?: unknown; expires?: unknown; accountId?: unknown }
  | { type: "api_key"; key?: unknown; env?: unknown };

/**
 * Pi's agent directory. `PI_CODING_AGENT_DIR` is the only override Pi itself honours, so it is the
 * only one PID honours — guessing at other locations would risk reading a different install's
 * credential.
 */
function authPath(): string {
  const override = process.env.PI_CODING_AGENT_DIR;
  if (override) {
    const expanded = override.startsWith("~") ? join(homedir(), override.slice(1)) : override;
    return join(expanded, "auth.json");
  }
  return join(homedir(), ".pi", "agent", "auth.json");
}

async function readStore(): Promise<Record<string, StoredCredential>> {
  try {
    const parsed = JSON.parse(await readFile(authPath(), "utf8"));
    return typeof parsed === "object" && parsed !== null ? parsed : {};
  } catch {
    return {}; // no file, no permission, or not JSON — all mean "no credential", not an error
  }
}

/**
 * Headers for a provider's quota endpoint, or undefined when there is nothing usable to send.
 * Undefined is the normal answer for a provider the user has not signed into, so it is never an
 * error — the caller turns it into a quiet "signed out" rather than a failure.
 */
export async function resolveHttpAuth(
  provider: "openai-codex" | "opencode-go",
): Promise<Record<string, string> | undefined> {
  const entry = (await readStore())[provider];
  if (!entry) return provider === "opencode-go" ? fromEnvKey() : undefined;

  if (provider === "openai-codex") {
    if (entry.type !== "oauth") return undefined;
    const access = asText(entry.access);
    const expires = typeof entry.expires === "number" ? entry.expires : undefined;
    if (!access) return undefined;
    // An expired token would just earn a 401; saying so up front keeps the settings page honest
    // about whose problem it is.
    if (expires !== undefined && expires <= Date.now() + MIN_VALIDITY_MS) return undefined;
    const accountId = asText(entry.accountId);
    return {
      authorization: `Bearer ${access}`,
      // Codex routes on the account, not just the token; without this the endpoint answers for
      // nobody. Pi sends the same pair on every call it makes.
      ...(accountId ? { "chatgpt-account-id": accountId } : {}),
      originator: "pi",
    };
  }

  if (entry.type !== "api_key") return undefined;
  const key = resolveConfigValue(asText(entry.key), entry.env);
  if (!key) return fromEnvKey();
  return { authorization: `Bearer ${key}` };
}

/** Pi falls back to this variable when nothing is stored, so PID looks in the same place. */
function fromEnvKey(): Record<string, string> | undefined {
  const key = asText(process.env.OPENCODE_API_KEY);
  return key ? { authorization: `Bearer ${key}` } : undefined;
}

/**
 * Pi lets a stored key stand in for an environment variable (`$VAR`, `${VAR}`) or the output of a
 * shell command (`!op read …`). PID resolves the variable forms and declines the command form:
 * running a command out of a credential file, from the main process, to decorate a footer, is not
 * a trade worth making. A user on that setup sees the provider as signed out here while Pi itself
 * keeps working.
 */
function resolveConfigValue(raw: string | undefined, env: unknown): string | undefined {
  if (!raw || raw.startsWith("!")) return undefined;
  const extra = typeof env === "object" && env !== null ? (env as Record<string, unknown>) : {};
  const lookup = (name: string) => asText(extra[name]) ?? asText(process.env[name]);
  const resolved = raw.replace(
    /\$\{([A-Za-z_][A-Za-z0-9_]*)\}|\$([A-Za-z_][A-Za-z0-9_]*)/g,
    (_m, a, b) => lookup(a ?? b) ?? "",
  );
  return resolved.trim() ? resolved : undefined;
}

function asText(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}
