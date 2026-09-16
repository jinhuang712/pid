/**
 * A desktop half, as an extension author writes one.
 *
 * Not a mock: this is bundled by the real bundler, served through the real shims and registered
 * through the real API. If the loading chain breaks, this is what stops compiling or stops drawing.
 */

import { Say } from "@pid/ui";
import { badge } from "./detail.ts";

interface Api {
  readonly id: string;
  page: (spec: { label?: string; render: (ctx: { state: unknown }) => unknown }) => void;
  tool: (spec: {
    names: string[];
    render: (draw: {
      call: { name: string; arguments?: unknown };
      run?: { status?: string; result?: { details?: unknown } };
      Frame: (props: { verb?: string; detail?: string; meta?: string; body?: string }) => unknown;
    }) => unknown;
  }) => void;
}

export default function register(pid: Api) {
  pid.page({
    label: "Fixture",
    render: ({ state }) => <Say tone="faint">{String((state as { note?: string } | undefined)?.note ?? "no state")}</Say>,
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
