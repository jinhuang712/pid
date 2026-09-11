import { memo, useMemo } from "react";
import { renderMarkdown } from "../markdown";

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
  // biome-ignore lint/security/noDangerouslySetInnerHtml: sanitized by DOMPurify in renderMarkdown
  return <div className={`prose ${className}`} dangerouslySetInnerHTML={{ __html: html }} />;
});
