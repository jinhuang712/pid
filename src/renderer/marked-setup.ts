import { marked } from "marked";
import { highlight, resolveLanguage } from "./highlight";

marked.setOptions({ gfm: true, breaks: false });

/**
 * Strikethrough needs a double tilde. marked's GFM tokenizer also accepts a single one, which turns
 * ordinary ranges in model output ("17~24 条/批 ≈ 70~94 条/秒") into <del>. GitHub renders
 * single tildes as text, so we do the same: skip the rule unless the run opens with "~~".
 */
marked.use({
  tokenizer: {
    del(src: string) {
      // `false` hands the double-tilde case back to marked's own tokenizer.
      return src.startsWith("~~") ? false : undefined;
    },
  },
});

const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/**
 * Fenced blocks get highlight.js spans when we know the language; otherwise marked's plain
 * escaped output. The `language-*` class stays on <code> either way so CSS can key on it.
 */
marked.use({
  renderer: {
    code({ text, lang }) {
      const language = resolveLanguage(lang);
      const cls = language ? ` class="language-${language} hljs"` : "";
      const body = language ? highlight(text, language) : escapeHtml(text);
      return `<pre><code${cls}>${body}\n</code></pre>\n`;
    },
  },
});

export { marked };
