import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { delimiter, isAbsolute, join } from "node:path";
import { compareCompat, type PiDiagnostics } from "@shared/diagnostics";
import { loadSettings } from "../settings";
import { warmShellEnv } from "../shell-env";
import { adapterSource, currentBundled } from "./bundled";
import { readPiHome } from "./ecosystem";

const sdkVersion = (): string => {
  try {
    return (
      createRequire(import.meta.url)("@earendil-works/pi-coding-agent/package.json") as { version: string }
    ).version;
  } catch {
    return "unknown";
  }
};

/** Resolve a command the way the shell would, against the login-shell PATH PID spawns with. */
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
  const piBinary = loadSettings().advanced.piBinary || "pi";
  const piPath = resolveOnPath(piBinary, env);
  const probe = piPath
    ? await piVersion(piPath, env)
    : { error: `${piBinary} not found on the login shell PATH` };
  const sdk = sdkVersion();
  const bundled = currentBundled();
  const source = adapterSource(readPiHome().packages, bundled);
  return {
    piBinary,
    piPath,
    piVersion: probe.version,
    piError: probe.error,
    sdkVersion: sdk,
    compat: compareCompat(probe.version, sdk),
    adapterSource: source,
    adapterVersion: source === "bundled" ? bundled.adapterVersion : undefined,
    bridgePath: bundled.bridge,
  };
}
