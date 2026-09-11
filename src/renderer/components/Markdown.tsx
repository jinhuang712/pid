import { useMemo } from "react";
import { renderMarkdown } from "../markdown";

export function Markdown({ source, className = "" }: { source: string; className?: string }) {
  const html = useMemo(() => renderMarkdown(source), [source]);
  // biome-ignore lint/security/noDangerouslySetInnerHtml: sanitized by DOMPurify in renderMarkdown
  return <div className={`prose ${className}`} dangerouslySetInnerHTML={{ __html: html }} />;
}
