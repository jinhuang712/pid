import DOMPurify from "dompurify";
import { marked } from "./marked-setup";

/**
 * Parsed + sanitized HTML by source text, shared by every Markdown instance. Switching sessions
 * remounts the timeline; with this cache the remount costs DOM work only, not a second parse
 * of every message. Insertion order doubles as recency: a hit is re-inserted at the end.
 */
const cache = new Map<string, string>();
const CACHE_ENTRIES = 4000;

/** `remember: false` for text still streaming — every token would otherwise add a partial to the cache. */
export function renderMarkdown(src: string, remember = true): string {
  const hit = cache.get(src);
  if (hit !== undefined) {
    cache.delete(src);
    cache.set(src, hit);
    return hit;
  }
  const html = DOMPurify.sanitize(marked.parse(src, { async: false }) as string, {
    USE_PROFILES: { html: true },
  });
  if (!remember) return html;
  cache.set(src, html);
  if (cache.size > CACHE_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  return html;
}
