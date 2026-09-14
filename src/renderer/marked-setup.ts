import { marked } from "marked";

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

export { marked };
