import { type MouseEvent, memo, useCallback, useMemo } from "react";
import { renderMarkdown } from "../markdown";

/** The file token under a click, if any: `<a class="file-link" data-path>` rendered by marked-setup. */
function filePathAt(e: MouseEvent<HTMLElement>): string | undefined {
  const a = (e.target as HTMLElement).closest?.("a.file-link[data-path]");
  return a instanceof HTMLAnchorElement ? a.dataset.path : undefined;
}

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

  // Click opens with the default app; ⌘-click / ⌥-click / right-click reveals in Finder instead.
  const onClick = useCallback((e: MouseEvent<HTMLElement>) => {
    const path = filePathAt(e);
    if (!path) return;
    e.preventDefault();
    if (e.metaKey || e.altKey) void window.bridge.shell.reveal(path);
    else void window.bridge.shell.openPath(path);
  }, []);
  const onContextMenu = useCallback((e: MouseEvent<HTMLElement>) => {
    const path = filePathAt(e);
    if (!path) return;
    e.preventDefault();
    void window.bridge.shell.reveal(path);
  }, []);

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
