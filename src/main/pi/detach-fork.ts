import { readFile, writeFile } from "node:fs/promises";

/**
 * Pi stamps a forked session's header with `parentSession`, the path of the file it was
 * forked from. PID treats a fork as a plain new session, so the stamp is dropped right after
 * the fork completes. The copied history is untouched; only the header line is rewritten.
 * Called while pi is idle between the fork response and the next prompt, so nothing is
 * appended concurrently.
 */
export async function detachFork(sessionFile: string): Promise<void> {
  const raw = await readFile(sessionFile, "utf8");
  const nl = raw.indexOf("\n");
  const first = nl === -1 ? raw : raw.slice(0, nl);
  let header: Record<string, unknown>;
  try {
    header = JSON.parse(first);
  } catch {
    return;
  }
  if (header.type !== "session" || !("parentSession" in header)) return;
  delete header.parentSession;
  await writeFile(sessionFile, JSON.stringify(header) + (nl === -1 ? "" : raw.slice(nl)), "utf8");
}
