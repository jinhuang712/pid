import { parseExtensionPage } from "@shared/extension-page";
import { describe, expect, it } from "vitest";

const page = (v: unknown) => parseExtensionPage([JSON.stringify(v)]);

const FULL = {
  title: "Servers",
  note: "what is connected",
  sections: [
    {
      title: "Configured",
      rows: [
        {
          id: "gh",
          title: "github",
          subtitle: "https://api.github.com",
          badges: [{ text: "http", tone: "muted" }, { text: "oauth" }],
          toggle: { value: true, on: "/x enable gh", off: "/x disable gh" },
          actions: [{ label: "Reconnect", command: "/x reconnect gh", tone: "accent" }],
          details: [{ label: "config", value: "~/.config/x.json" }],
          rows: [{ id: "gh:search", title: "search", badges: [{ text: "active", tone: "ok" }] }],
        },
      ],
    },
  ],
};

describe("a page an extension described", () => {
  it("reads the whole shape", () => {
    const p = page(FULL);
    expect(p?.title).toBe("Servers");
    const row = p?.sections[0].rows[0];
    expect(row?.badges?.map((b) => b.text)).toEqual(["http", "oauth"]);
    expect(row?.toggle).toEqual({ value: true, on: "/x enable gh", off: "/x disable gh" });
    expect(row?.rows?.[0].title).toBe("search");
    // A button always shows what it will run, even when the extension gave no title.
    expect(row?.actions?.[0].title).toBe("/x reconnect gh");
  });

  it("needs a title, and drops a section with nothing in it", () => {
    expect(page({ sections: [] })).toBeUndefined();
    expect(page({ title: "  " })).toBeUndefined();
    expect(page({ title: "X", sections: [{ rows: [] }] })?.sections).toEqual([]);
  });

  it("drops a row that cannot be drawn or kept", () => {
    const rows = (v: unknown[]) => page({ title: "X", sections: [{ rows: v }] })?.sections[0]?.rows ?? [];
    // No id means its expanded state has nowhere to live; a duplicate id would share one.
    expect(rows([{ title: "no id" }])).toEqual([]);
    expect(rows([{ id: "a", title: "A" }, { id: "a", title: "Again" }]).length).toBe(1);
    expect(rows([{ id: "a" }])).toEqual([]);
  });

  it("drops an affordance that would do nothing", () => {
    const row = (v: unknown) =>
      page({ title: "X", sections: [{ rows: [{ id: "a", title: "A", ...(v as object) }] }] })?.sections[0]
        .rows[0];
    // A switch with one command could turn something on and never off.
    expect(row({ toggle: { value: true, on: "/x on" } })?.toggle).toBeUndefined();
    expect(row({ actions: [{ label: "Go" }, { command: "/x go" }] })?.actions).toEqual([]);
    expect(row({ badges: [{ tone: "ok" }] })?.badges).toEqual([]);
  });

  it("stops nesting before it becomes a tree PID has to lay out", () => {
    const deep = {
      title: "X",
      sections: [
        { rows: [{ id: "a", title: "A", rows: [{ id: "b", title: "B", rows: [{ id: "c", title: "C" }] }] }] },
      ],
    };
    expect(page(deep)?.sections[0].rows[0].rows?.[0].rows).toBeUndefined();
  });

  it("reads a description it cannot understand as no page", () => {
    expect(parseExtensionPage(undefined)).toBeUndefined();
    expect(parseExtensionPage([])).toBeUndefined();
    expect(parseExtensionPage(["{"])).toBeUndefined();
    expect(page({ title: "X", sections: "lots" })?.sections).toEqual([]);
    // An unknown tone would land in a class name; it reads as no tone.
    const badges = page({
      title: "X",
      sections: [{ rows: [{ id: "a", title: "A", badges: [{ text: "b", tone: "neon" }] }] }],
    })?.sections[0].rows[0].badges;
    expect(badges?.[0].tone).toBeUndefined();
  });
});
