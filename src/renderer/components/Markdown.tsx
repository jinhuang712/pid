import { isWebUrl } from "@shared/url";
import { type MouseEvent, memo, useCallback, useMemo } from "react";
import { useCwd } from "../cwd-context";
import { fromFileUrl } from "../file-paths";
import { renderMarkdown } from "../markdown";

/** The anchor under a click, if any. */
function anchorAt(e: MouseEvent<HTMLElement>): HTMLAnchorElement | undefined {
  const a = (e.target as HTMLElement).closest?.("a");
  return a instanceof HTMLAnchorElement ? a : undefined;
}

/** Where a click on an anchor should go. `file-link` tokens carry the real path in `data-path`. */
export type LinkTarget = { kind: "path"; path: string } | { kind: "url"; url: string } | undefined;

const SCHEME_RE = /^[a-z][a-z0-9+.-]*:/i;

type ShellBridge = Window["bridge"]["shell"];

/**
 * The shell bridge, or `undefined` when the preload bundle predates one of its methods — a stale
 * `out/preload` after a rebuild that skipped the main process. Callers bail out before calling
 * `preventDefault`, so the main process navigation handlers still open web URLs and the click
 * degrades instead of dying silently.
 */
function shellBridge(): ShellBridge | undefined {
  // The declared type promises every method; only the bundle actually loaded decides.
  const shell = window.bridge?.shell as Partial<ShellBridge> | undefined;
  if (shell?.openExternal && shell.openPath && shell.reveal) return shell as ShellBridge;
  console.error("PID: window.bridge.shell is incomplete — rebuild and restart the app.");
  return undefined;
}

/**
 * Anything that is not a web URL is a file: an absolute or "~" path opens as is, "file://" is
 * unwrapped, and a relative href ("docs/report.html") means a file under the session's cwd.
 */
export function resolveLink(
  href: string | null,
  tokenPath: string | undefined,
  cwd: string | undefined,
): LinkTarget {
  if (tokenPath) return { kind: "path", path: tokenPath };
  if (!href || href === "#") return undefined;
  if (isWebUrl(href)) return { kind: "url", url: href };
  if (href.startsWith("file://")) return { kind: "path", path: fromFileUrl(href) };
  if (SCHEME_RE.test(href)) return undefined;
  let path: string;
  try {
    path = decodeURIComponent(href);
  } catch {
    path = href;
  }
  if (path.startsWith("/") || path === "~" || path.startsWith("~/")) return { kind: "path", path };
  if (!cwd) return undefined;
  return { kind: "path", path: `${cwd.replace(/\/$/, "")}/${path.replace(/^\.\//, "")}` };
}

const targetOf = (a: HTMLAnchorElement, cwd: string | undefined) =>
  resolveLink(a.getAttribute("href"), a.dataset.path, cwd);

export const Markdown = memo(function Markdown({
  source,
  className = "",
  live = false,
}: {
  source: string;
  className?: string;
  /** Still streaming: render without adding partial text to the shared cache. */
  live?: boolean;
}) {
  const html = useMemo(() => renderMarkdown(source, !live), [source, live]);
  const cwd = useCwd();

  // Every anchor is handled here: web URLs open in the browser, files in their default app,
  // and ⌘-click / ⌥-click / right-click on a file reveals it in Finder instead.
  const onClick = useCallback(
    (e: MouseEvent<HTMLElement>) => {
      const a = anchorAt(e);
      if (!a) return;
      const shell = shellBridge();
      if (!shell) return;
      e.preventDefault();
      const target = targetOf(a, cwd);
      if (!target) return;
      if (target.kind === "url") void shell.openExternal(target.url);
      else if (e.metaKey || e.altKey) void shell.reveal(target.path);
      else void shell.openPath(target.path);
    },
    [cwd],
  );
  const onContextMenu = useCallback(
    (e: MouseEvent<HTMLElement>) => {
      const a = anchorAt(e);
      if (!a) return;
      const target = targetOf(a, cwd);
      if (target?.kind !== "path") return;
      const shell = shellBridge();
      if (!shell) return;
      e.preventDefault();
      void shell.reveal(target.path);
    },
    [cwd],
  );

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: delegated handler for the <a> tokens inside
    // biome-ignore lint/a11y/useKeyWithClickEvents: the anchors themselves take keyboard focus
    <div
      className={`prose ${className}`}
      onClick={onClick}
      onContextMenu={onContextMenu}
      // biome-ignore lint/security/noDangerouslySetInnerHtml: sanitized by DOMPurify in renderMarkdown
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
});
