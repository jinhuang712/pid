import { Component, type ErrorInfo, type ReactNode } from "react";

/**
 * One plugin's drawing, contained.
 *
 * Pi lets an extension's render throw all the way out — the terminal restores itself and exits. A
 * window can do better for free, and the point is not protection: it is that the author sees the
 * stack next to the errors their agent half already raises, instead of a blank window.
 */
export class PluginBoundary extends Component<{ id: string; children: ReactNode }, { error?: string }> {
  state: { error?: string } = {};

  static getDerivedStateFromError(error: unknown) {
    return { error: error instanceof Error ? error.message : String(error) };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`plugin ${this.props.id} failed to render`, error, info.componentStack);
  }

  render() {
    if (this.state.error === undefined) return this.props.children;
    return (
      <div className="px-3 py-1.5 text-xs text-danger truncate" title={this.state.error}>
        {this.props.id}: {this.state.error}
      </div>
    );
  }
}
