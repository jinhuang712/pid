import { execFile } from "node:child_process";
import { readdir } from "node:fs/promises";
import { join, relative } from "node:path";
import { promisify } from "node:util";

const execFileP = promisify(execFile);
const IGNORED = new Set([
  "node_modules",
  ".git",
  "dist",
  "out",
  "release",
  ".next",
  "target",
  ".venv",
  "__pycache__",
]);
const LIMIT = 20000;

/** Files under a folder, relative paths. Git repos use git's own view (tracked + untracked, not ignored). */
export async function listFiles(cwd: string): Promise<string[]> {
  try {
    const { stdout } = await execFileP(
      "git",
      ["ls-files", "--cached", "--others", "--exclude-standard", "-z"],
      {
        cwd,
        maxBuffer: 64 * 1024 * 1024,
      },
    );
    const files = stdout.split("\0").filter(Boolean);
    if (files.length > 0) return files.slice(0, LIMIT);
  } catch {
    // not a git repo, fall through
  }
  const out: string[] = [];
  const walk = async (dir: string) => {
    if (out.length >= LIMIT) return;
    let entries: import("node:fs").Dirent[];
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (out.length >= LIMIT) return;
      if (IGNORED.has(e.name)) continue;
      const full = join(dir, e.name);
      if (e.isDirectory()) await walk(full);
      else if (e.isFile()) out.push(relative(cwd, full));
    }
  };
  await walk(cwd);
  return out;
}
