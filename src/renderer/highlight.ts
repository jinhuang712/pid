import hljs from "highlight.js/lib/core";
import bash from "highlight.js/lib/languages/bash";
import css from "highlight.js/lib/languages/css";
import diff from "highlight.js/lib/languages/diff";
import go from "highlight.js/lib/languages/go";
import ini from "highlight.js/lib/languages/ini";
import java from "highlight.js/lib/languages/java";
import javascript from "highlight.js/lib/languages/javascript";
import json from "highlight.js/lib/languages/json";
import markdown from "highlight.js/lib/languages/markdown";
import protobuf from "highlight.js/lib/languages/protobuf";
import python from "highlight.js/lib/languages/python";
import rust from "highlight.js/lib/languages/rust";
import sql from "highlight.js/lib/languages/sql";
import typescript from "highlight.js/lib/languages/typescript";
import xml from "highlight.js/lib/languages/xml";
import yaml from "highlight.js/lib/languages/yaml";

/**
 * A hand-picked grammar set instead of the full bundle: registering everything costs ~1 MB of
 * renderer JS for languages that never show up in a chat. Aliases cover the info strings models
 * actually write (`js`, `ts`, `sh`, `shell`, `jsonc`, `yml`, `html`, `proto`, `toml`).
 */
hljs.registerLanguage("bash", bash);
hljs.registerLanguage("css", css);
hljs.registerLanguage("diff", diff);
hljs.registerLanguage("go", go);
hljs.registerLanguage("ini", ini);
hljs.registerLanguage("java", java);
hljs.registerLanguage("javascript", javascript);
hljs.registerLanguage("json", json);
hljs.registerLanguage("markdown", markdown);
hljs.registerLanguage("protobuf", protobuf);
hljs.registerLanguage("python", python);
hljs.registerLanguage("rust", rust);
hljs.registerLanguage("sql", sql);
hljs.registerLanguage("typescript", typescript);
hljs.registerLanguage("xml", xml);
hljs.registerLanguage("yaml", yaml);

const ALIASES: Record<string, string> = {
  jsonc: "json",
  json5: "json",
  js: "javascript",
  jsx: "javascript",
  mjs: "javascript",
  ts: "typescript",
  tsx: "typescript",
  sh: "bash",
  shell: "bash",
  zsh: "bash",
  console: "bash",
  yml: "yaml",
  html: "xml",
  svg: "xml",
  proto: "protobuf",
  toml: "ini",
  py: "python",
  rs: "rust",
  golang: "go",
  md: "markdown",
  patch: "diff",
};

/** Language for a fence info string, or null when we have no grammar for it. */
export function resolveLanguage(info: string | undefined): string | null {
  const tag = (info ?? "").trim().split(/\s+/)[0]?.toLowerCase();
  if (!tag) return null;
  const lang = ALIASES[tag] ?? tag;
  return hljs.getLanguage(lang) ? lang : null;
}

/** Escaped, span-wrapped HTML for one code block. Synchronous, so it sits inside marked's render pass. */
export function highlight(code: string, lang: string): string {
  return hljs.highlight(code, { language: lang, ignoreIllegals: true }).value;
}
