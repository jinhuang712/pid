import { describe, expect, it } from "vitest";
import { resolveLink } from "../src/renderer/components/Markdown";
import { isProgramPath, isWebUrl } from "../src/shared/url";

const CWD = "/Users/me/dev/app";

/**
 * What a click inside a transcript is allowed to hand the OS. A link there is untrusted text, so
 * the decision is made once, in `@shared/url`, and the main process re-checks it.
 */
describe("isProgramPath", () => {
  it("treats apps and scripts as programs rather than documents", () => {
    expect(isProgramPath("/Applications/Calculator.app")).toBe(true);
    expect(isProgramPath("/Applications/Calculator.app/Contents/MacOS/Calculator")).toBe(true);
    expect(isProgramPath("/tmp/build.command")).toBe(true);
    expect(isProgramPath("/tmp/setup.SH")).toBe(true);
  });

  it("leaves documents alone, including dotted names and dotfiles", () => {
    expect(isProgramPath("/tmp/report.pdf")).toBe(false);
    expect(isProgramPath("/tmp/notes.md")).toBe(false);
    expect(isProgramPath("/tmp/v1.2.3/readme")).toBe(false);
    expect(isProgramPath("/tmp/.zshrc")).toBe(false);
    expect(isProgramPath("/tmp/app.txt")).toBe(false);
  });
});

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

// The renderer decides with isWebUrl which anchors go to the browser and the main process re-checks
// it before shell.openExternal; one definition keeps the safety net from drifting from the rule.
describe("isWebUrl", () => {
  it("accepts the schemes a click may hand to the OS", () => {
    expect(isWebUrl("https://example.com/a/b")).toBe(true);
    expect(isWebUrl("http://example.com")).toBe(true);
    expect(isWebUrl("mailto:a@b.com")).toBe(true);
    expect(isWebUrl("HTTPS://EXAMPLE.COM")).toBe(true);
  });

  it("rejects everything else, the app's own page included", () => {
    expect(isWebUrl("file:///Users/me/dev/app/out/renderer/report.html")).toBe(false);
    expect(isWebUrl("vscode://file/Users/me/x")).toBe(false);
    expect(isWebUrl("javascript:alert(1)")).toBe(false);
    expect(isWebUrl("report.html")).toBe(false);
    expect(isWebUrl("/Users/me/notes.md")).toBe(false);
  });
});
