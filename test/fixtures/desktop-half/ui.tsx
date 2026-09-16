/**
 * A desktop half, as an extension author writes one.
 *
 * Not a mock: this is bundled by the real bundler, served through the real shims and registered
 * through the real API. If the loading chain breaks, this is what stops compiling or stops drawing.
 *
 * It uses every part of the chain on purpose — a primitive, a module of its own, the host's React,
 * the search box the host puts above the page — because the parts that are not exercised here are
 * the parts that break unnoticed.
 */

import { Disclosure, Say } from "@pid/ui";
import { useState } from "react";
import { badge } from "./detail.ts";

interface Ctx {
  state: unknown;
  query: string;
}

interface Api {
  readonly id: string;
  page: (spec: {
    label?: string;
    note?: (ctx: Ctx) => unknown;
    search?: string;
    render: (ctx: Ctx) => unknown;
  }) => void;
  tool: (spec: {
    names: string[];
    render: (draw: {
      call: { name: string; arguments?: unknown };
      run?: { status?: string; result?: { details?: unknown } };
      Frame: (props: { verb?: string; detail?: string; meta?: string; body?: string }) => unknown;
    }) => unknown;
  }) => void;
}

const ROWS = ["alpha", "beta", "gamma"];

/** A component, so the host's React is doing the hook — a bundled second copy would throw here. */
function Body({ query }: { query: string }) {
  const [open, setOpen] = useState(false);
  const rows = ROWS.filter((r) => r.includes(query.toLowerCase()));
  return (
    <Disclosure
      open={open || query.length > 0}
      onToggle={() => setOpen(!open)}
      lead={<Say tone="faint">lead</Say>}
      summary={<Say>{rows.length} rows</Say>}
      trail={<Say tone="faint">trail</Say>}
    >
      {rows.map((r) => (
        <Say key={r} mono>
          {r}
        </Say>
      ))}
    </Disclosure>
  );
}

export default function register(pid: Api) {
  pid.page({
    label: "Fixture",
    search: "Search rows…",
    note: ({ state }) => <Say tone="faint">{String((state as { note?: string } | undefined)?.note ?? "no state")}</Say>,
    render: ({ query }) => <Body query={query} />,
  });
  pid.tool({
    names: ["fixture_tool"],
    render: ({ call, run, Frame }) => {
      const provider = (run?.result?.details as { provider?: string } | undefined)?.provider;
      return (
        <Frame
          verb={run?.status === "done" ? "Fixtured" : "Fixturing"}
          detail={String((call.arguments as { q?: unknown } | undefined)?.q ?? "")}
          meta={provider ? badge(provider) : undefined}
          body="none"
        />
      );
    },
  });
}
