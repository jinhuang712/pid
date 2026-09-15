import { marked } from "marked";
import {
  FILE_PATH_RE,
  FILE_PATH_START_RE,
  filePathHtml,
  isFilePath,
  startsAtBoundary,
  TRAILING_PUNCT_RE,
} from "./file-paths";
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

/**
 * Local file paths become clickable tokens in three places: bare in prose, as a whole inline
 * code span, and as the target of a markdown link. The bare form starts a word, so the tokens
 * already emitted decide whether this position qualifies. Fenced blocks are left alone — code is code.
 */
marked.use({
  extensions: [
    {
      name: "filepath",
      level: "inline",
      start(src: string) {
        const m = FILE_PATH_START_RE.exec(src);
        return m ? m.index + m[0].length : undefined;
      },
      tokenizer(src, tokens) {
        if (!startsAtBoundary(tokens[tokens.length - 1]?.raw ?? "")) return undefined;
        const m = FILE_PATH_RE.exec(src);
        if (!m) return undefined;
        const raw = m[0].replace(TRAILING_PUNCT_RE, "");
        if (!isFilePath(raw)) return undefined;
        return { type: "filepath", raw, text: raw };
      },
      renderer(token) {
        return filePathHtml(token.text as string);
      },
    },
  ],
  renderer: {
    codespan({ text }) {
      return isFilePath(text) ? filePathHtml(text) : false;
    },
    link({ href, tokens }) {
      if (!isFilePath(href)) return false;
      return filePathHtml(href, this.parser.parseInline(tokens));
    },
  },
});

export { marked };
