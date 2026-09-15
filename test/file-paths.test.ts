import { describe, expect, it } from "vitest";
import { filePathHtml, fromFileUrl, isDirectoryPath, isFilePath, splitPath } from "../src/renderer/file-paths";
import { marked } from "../src/renderer/marked-setup";

const HTML = "/Users/jin.huang/dev/repository/dev-docs/product/sdk/html/ttd-sdk-api.html";

describe("isFilePath", () => {
  it("accepts absolute, home and file: paths", () => {
    expect(isFilePath(HTML)).toBe(true);
    expect(isFilePath("~/dev/x.md")).toBe(true);
    expect(isFilePath("file:///Users/a/b.txt")).toBe(true);
  });
  it("rejects urls, relative paths and a lone slash", () => {
    expect(isFilePath("https://a.com/b/c")).toBe(false);
    expect(isFilePath("src/main/index.ts")).toBe(false);
    expect(isFilePath("/")).toBe(false);
    expect(isFilePath("//host/share")).toBe(false);
  });
});

describe("isDirectoryPath", () => {
  it("reads bundles and project folders as folders, not documents", () => {
    expect(isDirectoryPath("/Applications/PID.app")).toBe(true);
    expect(isDirectoryPath("/Users/a/Library/Frameworks/X.framework")).toBe(true);
    expect(isDirectoryPath("/Users/a/dev/app/ChatApp.xcodeproj")).toBe(true);
    expect(isDirectoryPath("/Users/a/dev/thing/")).toBe(true);
  });
  it("leaves files, and file names that merely mention a bundle extension", () => {
    expect(isDirectoryPath("/Users/a/dev/pid/README.md")).toBe(false);
    expect(isDirectoryPath("~/dev/x.swift")).toBe(false);
    expect(isDirectoryPath("/Users/a/notes.app.txt")).toBe(false);
  });
});

describe("splitPath", () => {
  it("collapses the home folder and keeps the last two directories", () => {
    expect(splitPath(HTML)).toEqual({ dir: "…/sdk/html/", name: "ttd-sdk-api.html" });
    expect(splitPath("~/dev/x.md")).toEqual({ dir: "~/dev/", name: "x.md" });
    expect(splitPath("/tmp/out.txt")).toEqual({ dir: "/tmp/", name: "out.txt" });
  });
  it("drops a trailing slash so a folder token has a name", () => {
    expect(splitPath("/Users/a/dev/repo/")).toEqual({ dir: "~/dev/", name: "repo" });
  });
  it("decodes file urls", () => {
    expect(fromFileUrl("file:///Users/a/my%20doc.md")).toBe("/Users/a/my doc.md");
    expect(splitPath("file:///Users/a/my%20doc.md").name).toBe("my doc.md");
  });
});

describe("file tokens in markdown", () => {
  it("marks a bundle as a folder token, so the glyph matches what a click opens", () => {
    const html = filePathHtml("/Applications/PID.app");
    expect(html).toContain('data-kind="dir"');
    expect(html).toContain('<span class="file-dir">/Applications/</span><span class="file-name">PID.app</span>');
    expect(filePathHtml("/Users/a/dev/x.md")).toContain('data-kind="file"');
    expect(filePathHtml("/Users/a/dev/x.md")).not.toContain('data-kind="dir"');
  });
  it("turns a bare path in prose into a token and leaves the sentence period out", () => {
    const html = marked.parse(`打开 ${HTML}.`) as string;
    expect(html).toContain(`data-path="${HTML}"`);
    expect(html).toContain('<span class="file-dir">…/sdk/html/</span><span class="file-name">ttd-sdk-api.html</span></a>.');
  });
  it("tokenises a whole inline code span that is a path", () => {
    expect(marked.parse("see `~/dev/x.md`")).toContain('class="file-link" href="#" data-path="~/dev/x.md"');
  });
  it("keeps a code span that is not just a path", () => {
    expect(marked.parse("run `open ~/dev/x.md`")).toBe("<p>run <code>open ~/dev/x.md</code></p>\n");
  });
  it("turns a link with a path target into a token keeping the link text", () => {
    const html = marked.parse(`[the api doc](${HTML})`) as string;
    expect(html).toContain(`data-path="${HTML}"`);
    expect(html).toContain('<span class="file-name">the api doc</span>');
  });
  it("leaves http links, and/or, ratios and fenced code alone", () => {
    expect(marked.parse("[x](https://a.com/b/c)")).toBe('<p><a href="https://a.com/b/c">x</a></p>\n');
    expect(marked.parse("read and/or write, 3/4 of it")).toBe("<p>read and/or write, 3/4 of it</p>\n");
    expect(marked.parse("```\n/Users/a/b\n```")).toBe("<pre><code>/Users/a/b\n</code></pre>\n");
  });
  it("leaves a slash-joined enumeration alone", () => {
    const html = marked.parse("- C/D/E partially ✗ (the rename didn't happen)") as string;
    expect(html).not.toContain("file-link");
    expect(html).toContain("C/D/E partially");
    expect(marked.parse("v1/v2/v3 差异")).toBe("<p>v1/v2/v3 差异</p>\n");
  });
  it("still takes a path at the start of a line or after an opening bracket", () => {
    expect(marked.parse("/tmp/out.txt is the file")).toContain('data-path="/tmp/out.txt"');
    expect(marked.parse("see (/tmp/out.txt)")).toContain('data-path="/tmp/out.txt"');
  });
  it("escapes the path in attributes", () => {
    expect(filePathHtml('/tmp/a"b/c.txt')).toContain('data-path="/tmp/a&quot;b/c.txt"');
  });
});
