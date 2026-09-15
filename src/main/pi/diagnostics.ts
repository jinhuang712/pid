import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { delimiter, isAbsolute, join } from "node:path";
import { compareCompat, type PiDiagnostics } from "@shared/diagnostics";
import { warmShellEnv } from "../shell-env";

/** The Pi PID actually runs: the version pinned in package.json and loaded by every session worker. */
const runtimeVersion = (): string => {
  try {
    return (
      createRequire(import.meta.url)("@earendil-works/pi-coding-agent/package.json") as { version: string }
    ).version;
  } catch {
    return "unknown";
  }
};

/** Resolve a command the way the shell would, against the login-shell PATH workers inherit. */
export function resolveOnPath(cmd: string, env: NodeJS.ProcessEnv): string | undefined {
  if (isAbsolute(cmd)) return existsSync(cmd) ? cmd : undefined;
  for (const dir of (env.PATH ?? "").split(delimiter)) {
    if (!dir) continue;
    const p = join(dir, cmd);
    if (existsSync(p)) return p;
  }
  return undefined;
}

/** Ask the binary for its version; a few seconds is plenty, `pi --version` prints and exits. */
function piVersion(binary: string, env: NodeJS.ProcessEnv): Promise<{ version?: string; error?: string }> {
  return new Promise((resolve) => {
    execFile(binary, ["--version"], { env, timeout: 5000, encoding: "utf8" }, (err, out, stderr) => {
      if (err) return resolve({ error: err.message.split("\n")[0] || String(err) });
      const version = out.trim().split("\n").at(-1)?.trim();
      resolve(version ? { version } : { error: stderr.trim() || "no version printed" });
    });
  });
}

export async function runDiagnostics(): Promise<PiDiagnostics> {
  const env = await warmShellEnv();
  const runtime = runtimeVersion();
  // Informational only: PID does not drive this binary, it just shares a home directory with it.
  const terminalPath = resolveOnPath("pi", env);
  const probe = terminalPath
    ? await piVersion(terminalPath, env)
    : { error: "no `pi` on the login shell PATH; PID runs its own" };
  return {
    runtimeVersion: runtime,
    terminalPath,
    terminalVersion: probe.version,
    terminalError: probe.error,
    compat: compareCompat(probe.version, runtime),
  };
}
