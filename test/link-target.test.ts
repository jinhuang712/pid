import { describe, expect, it } from "vitest";
import { resolveLink } from "../src/renderer/components/Markdown";

const CWD = "/Users/me/dev/app";

describe("resolveLink", () => {
  it("sends http and https links to the browser", () => {
    expect(resolveLink("https://git.example.com/x/-/merge_requests/12", undefined, CWD)).toEqual({
      kind: "url",
      url: "https://git.example.com/x/-/merge_requests/12",
    });
    expect(resolveLink("http://example.com", undefined, undefined)).toEqual({
      kind: "url",
      url: "http://example.com",
    });
    expect(resolveLink("mailto:a@b.com", undefined, undefined)).toEqual({
      kind: "url",
      url: "mailto:a@b.com",
    });
  });

  it("prefers the path a file token carries", () => {
    expect(resolveLink("#", "/Users/me/report.html", CWD)).toEqual({
      kind: "path",
      path: "/Users/me/report.html",
    });
  });

  it("resolves a relative href against the session folder", () => {
    expect(resolveLink("ttd-sdk-api.html", undefined, CWD)).toEqual({
      kind: "path",
      path: "/Users/me/dev/app/ttd-sdk-api.html",
    });
    expect(resolveLink("./docs/a%20b.html", undefined, CWD)).toEqual({
      kind: "path",
      path: "/Users/me/dev/app/docs/a b.html",
    });
  });

  it("keeps absolute, tilde and file:// paths as they are", () => {
    expect(resolveLink("/tmp/x.html", undefined, CWD)).toEqual({ kind: "path", path: "/tmp/x.html" });
    expect(resolveLink("~/x.html", undefined, CWD)).toEqual({ kind: "path", path: "~/x.html" });
    expect(resolveLink("file:///tmp/a%20b.html", undefined, CWD)).toEqual({
      kind: "path",
      path: "/tmp/a b.html",
    });
  });

  it("ignores anchors, empty hrefs and other schemes", () => {
    expect(resolveLink("#", undefined, CWD)).toBeUndefined();
    expect(resolveLink("", undefined, CWD)).toBeUndefined();
    expect(resolveLink(null, undefined, CWD)).toBeUndefined();
    expect(resolveLink("javascript:alert(1)", undefined, CWD)).toBeUndefined();
    expect(resolveLink("vscode://file/x", undefined, CWD)).toBeUndefined();
  });

  it("drops a relative href when no folder is known", () => {
    expect(resolveLink("x.html", undefined, undefined)).toBeUndefined();
  });
});
