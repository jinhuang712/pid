import type { ToolCall } from "@earendil-works/pi-ai";
import { Component, type ReactNode } from "react";
import { ToolCard } from "../components/ToolCard";
import type { ToolRun } from "../state/conversation";

/**
 * Tool renderers: who draws a tool call in the transcript.
 *
 * The contract is deliberately ToolCard's own props. The built-in card is the
 * default every tool falls back to, so if it cannot live behind this contract
 * the contract is wrong — that is the dogfood test, and it runs on every render.
 *
 * Only built-ins register here. An extension's own rows come from its desktop
 * half through the `tool` mount, which the timeline consults first — those are
 * keyed by name and rebuilt when the folder changes, so they cannot live in a
 * module-level list that only grows. Match order, fallback and failure
 * isolation are still decided here once, with tests, rather than growing as
 * conditions inside the timeline.
 */

/** What a renderer receives: the call Pi made and its run state, nothing else. */
export interface ToolRenderProps {
  call: ToolCall;
  run?: ToolRun;
}

export interface ToolRenderer {
  /** Human-readable owner, for logs. Built-ins use "pid". */
  name: string;
  /** First match wins. A throwing matcher counts as no match. */
  match: (toolName: string) => boolean;
  render: (props: ToolRenderProps) => ReactNode;
}

export interface ToolRegistry {
  register: (r: ToolRenderer) => void;
  resolve: (toolName: string) => (props: ToolRenderProps) => ReactNode;
}

export function createToolRegistry(): ToolRegistry {
  const registrants: ToolRenderer[] = [];
  return {
    register(r) {
      registrants.push(r);
    },
    resolve(toolName) {
      for (const r of registrants) {
        let hit = false;
        try {
          hit = r.match(toolName);
        } catch {
          hit = false;
        }
        if (hit) return r.render;
      }
      return (props) => <ToolCard {...props} />;
    },
  };
}

/** The registry the transcript reads. */
export const toolRenderers: ToolRegistry = createToolRegistry();

/**
 * A throwing renderer degrades to the generic card, not to a blank window.
 * Keyed per tool call by the parent, so a failure sticks to its own card and
 * a new call starts fresh.
 */
export class ToolRendererBoundary extends Component<{
  call: ToolCall;
  run?: ToolRun;
  children?: ReactNode;
}> {
  state: { failed: boolean } = { failed: false };

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }

  render(): ReactNode {
    if (this.state.failed) return <ToolCard call={this.props.call} run={this.props.run} />;
    return this.props.children;
  }
}

/** Indirection so the boundary — not the renderer — owns the failure. */
export function RenderTool({
  call,
  run,
  render,
}: ToolRenderProps & { render: (props: ToolRenderProps) => ReactNode }): ReactNode {
  return <>{render({ call, run })}</>;
}
