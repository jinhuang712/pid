import { execFileSync } from "node:child_process";

/**
 * GUI apps on macOS do not inherit the user's shell PATH.
 * Ask the login shell once so `pi` resolves the same way it does in a terminal.
 */
let cached: NodeJS.ProcessEnv | undefined;

export function shellEnv(): NodeJS.ProcessEnv {
  if (cached) return cached;
  const shell = process.env.SHELL || "/bin/zsh";
  try {
    const out = execFileSync(shell, ["-ilc", "env"], {
      encoding: "utf8",
      timeout: 5000,
      stdio: ["ignore", "pipe", "ignore"],
    });
    const env: NodeJS.ProcessEnv = { ...process.env };
    for (const line of out.split("\n")) {
      const i = line.indexOf("=");
      if (i > 0) env[line.slice(0, i)] = line.slice(i + 1);
    }
    cached = env;
  } catch {
    cached = { ...process.env };
  }
  return cached;
}
