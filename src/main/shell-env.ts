import { execFile, execFileSync } from "node:child_process";

/**
 * GUI apps on macOS do not inherit the user's shell PATH.
 * Ask the login shell once so `pi` resolves the same way it does in a terminal.
 */
let cached: NodeJS.ProcessEnv | undefined;
let warming: Promise<NodeJS.ProcessEnv> | undefined;

const shell = () => process.env.SHELL || "/bin/zsh";

function parse(out: string): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env };
  for (const line of out.split("\n")) {
    const i = line.indexOf("=");
    if (i > 0) env[line.slice(0, i)] = line.slice(i + 1);
  }
  return env;
}

/**
 * Start resolving the login-shell environment in the background. Call at app start so the
 * first pi spawn finds it ready instead of blocking the main process on `zsh -ilc env`.
 */
export function warmShellEnv(): Promise<NodeJS.ProcessEnv> {
  if (cached) return Promise.resolve(cached);
  if (warming) return warming;
  warming = new Promise((resolve) => {
    execFile(shell(), ["-ilc", "env"], { encoding: "utf8", timeout: 5000 }, (err, out) => {
      cached ??= err ? { ...process.env } : parse(out);
      warming = undefined;
      resolve(cached);
    });
  });
  return warming;
}

/** The resolved environment; falls back to a synchronous probe only if the warm-up has not finished. */
export function shellEnv(): NodeJS.ProcessEnv {
  if (cached) return cached;
  try {
    cached = parse(
      execFileSync(shell(), ["-ilc", "env"], {
        encoding: "utf8",
        timeout: 5000,
        stdio: ["ignore", "pipe", "ignore"],
      }),
    );
  } catch {
    cached = { ...process.env };
  }
  return cached;
}
