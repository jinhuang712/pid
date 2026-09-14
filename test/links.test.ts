import { describe, expect, it } from "vitest";
import { collapseLinks, expandLinks, linkDisplay } from "../src/renderer/links";

const lark = "https://project.larksuite.com/klook-rnd/siteops_ticket/homepage";

describe("linkDisplay", () => {
  it("keeps a short path whole and squeezes a long one to its last segment", () => {
    expect(linkDisplay("https://www.example.com/docs")).toBe("🔗example.com/docs");
    expect(linkDisplay(lark)).toBe("🔗project.larksuite.com/…/homepage");
    expect(linkDisplay("https://a.dev/?q=1#x")).toBe("🔗a.dev");
  });
});

describe("collapseLinks", () => {
  it("folds a URL only once whitespace follows it, and moves the caret with it", () => {
    const typing = collapseLinks(`see ${lark}`, [], { caret: 4 + lark.length });
    expect(typing.text).toBe(`see ${lark}`);
    expect(typing.added).toEqual([]);

    const left = collapseLinks(`see ${lark} ok`, [], { caret: 4 + lark.length + 1 });
    expect(left.text).toBe("see 🔗project.larksuite.com/…/homepage ok");
    expect(left.caret).toBe("see 🔗project.larksuite.com/…/homepage ".length);
    expect(left.added).toEqual([{ display: "🔗project.larksuite.com/…/homepage", href: lark }]);
  });

  it("folds everything in a paste", () => {
    const r = collapseLinks(`${lark}\nand https://a.dev/x`, [], { all: true });
    expect(r.text).toBe("🔗project.larksuite.com/…/homepage\nand 🔗a.dev/x");
    expect(r.added.map((l) => l.href)).toEqual([lark, "https://a.dev/x"]);
  });

  it("does not report a link that is already known, and leaves an ambiguous one raw", () => {
    const known = [{ display: "🔗a.dev/x", href: "https://a.dev/x" }];
    const same = collapseLinks("https://a.dev/x ", known);
    expect(same.text).toBe("🔗a.dev/x ");
    expect(same.added).toEqual([]);
    const clash = collapseLinks("https://a.dev/x?other=1 ", known);
    expect(clash.text).toBe("https://a.dev/x?other=1 ");
    expect(clash.added).toEqual([]);
  });
});

describe("expandLinks", () => {
  it("puts the hrefs back and reports which were used", () => {
    const links = [
      { display: "🔗a.dev/x", href: "https://a.dev/x" },
      { display: "🔗a.dev/xy", href: "https://a.dev/xy" },
      { display: "🔗gone.dev", href: "https://gone.dev" },
    ];
    const r = expandLinks("open 🔗a.dev/xy then 🔗a.dev/x", links);
    expect(r.text).toBe("open https://a.dev/xy then https://a.dev/x");
    expect(r.used.map((l) => l.display)).toEqual(["🔗a.dev/x", "🔗a.dev/xy"]);
  });
});
