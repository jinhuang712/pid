import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readdir, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { promisify } from "node:util";
import type { PathInfo } from "@shared/files";
import { nativeImage } from "electron";

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

/** What the composer needs to draw a chip: exists, directory or file, size. Never reads content. */
export async function statPaths(paths: string[]): Promise<PathInfo[]> {
  return Promise.all(
    paths.map(async (path) => {
      try {
        const s = await stat(path);
        if (s.isDirectory()) {
          const entries = await readdir(path).catch(() => []);
          return { path, exists: true, isDirectory: true, size: entries.length };
        }
        return { path, exists: true, isDirectory: false, size: s.size };
      } catch {
        return { path, exists: false, isDirectory: false, size: 0 };
      }
    }),
  );
}

const THUMB = 160;

/**
 * A small in-memory preview for the chip. QuickLook on macOS renders images and PDFs alike;
 * elsewhere plain images are decoded. Nothing is written to disk.
 */
export async function thumbnail(path: string): Promise<string | undefined> {
  try {
    const img = await nativeImage.createThumbnailFromPath(path, { width: THUMB, height: THUMB });
    if (!img.isEmpty()) return img.toDataURL();
  } catch {
    // fall through to a plain decode
  }
  try {
    const img = nativeImage.createFromPath(path);
    if (img.isEmpty()) return undefined;
    const { width, height } = img.getSize();
    const scale = Math.min(1, THUMB / Math.max(width, height));
    return img.resize({ width: Math.round(width * scale), height: Math.round(height * scale) }).toDataURL();
  } catch {
    return undefined;
  }
}

/** A pasted image has no path. Do what the Pi terminal does: write it to the OS temp dir and attach that path. */
export async function saveClipboardImage(bytes: Uint8Array, mime: string): Promise<string> {
  const ext =
    mime === "image/jpeg" ? "jpg" : mime === "image/gif" ? "gif" : mime === "image/webp" ? "webp" : "png";
  const path = join(tmpdir(), `pi-clipboard-${randomUUID()}.${ext}`);
  await writeFile(path, bytes);
  return path;
}
