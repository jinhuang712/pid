import { appendFileSync, mkdirSync, renameSync, statSync } from "node:fs";
import { join } from "node:path";
import { app } from "electron";

/**
 * A small append-only log for the things that leave no trace otherwise.
 *
 * A session that does not come back is the case this exists for: the window shows why for as long
 * as the tab is on screen, and a worker's output lives in memory until it is dismissed. One line on
 * disk is what makes "it did not open last night" answerable the next morning.
 *
 * Never throws: a log is not worth failing a start over.
 */
const MAX_BYTES = 512 * 1024;

export function logLine(scope: string, message: string) {
  try {
    const dir = app.getPath("userData");
    const file = join(dir, "pid.log");
    mkdirSync(dir, { recursive: true });
    try {
      if (statSync(file).size > MAX_BYTES) renameSync(file, `${file}.1`);
    } catch {
      // no log yet, or it cannot be rotated: write anyway
    }
    appendFileSync(file, `${new Date().toISOString()} ${scope} ${message.replace(/\s+/g, " ").trim()}\n`);
  } catch {
    // nothing left to do
  }
}
