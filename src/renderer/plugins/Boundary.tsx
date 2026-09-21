import { Component, type ErrorInfo, type ReactNode } from "react";

/**
 * One plugin's drawing, contained.
 *
 * Pi lets an extension's render throw all the way out — the terminal restores itself and exits. A
 * window can do better for free, and the point is not protection: it is that the author sees the
 * stack next to the errors their agent half already raises, instead of a blank window.
 */
interface PluginBoundaryProps {
  id: string;
  children: ReactNode;
  /**
   * The identity of what is being drawn. When it changes — a folder switch reloads the desktop
   * half — the boundary forgets its failure and draws the new plugin, rather than keeping an error
   * line for the rest of the window's life.
   */
  resetKey?: unknown;
}

export class PluginBoundary extends Component<PluginBoundaryProps, { error?: string }> {
  state: { error?: string } = {};

  static getDerivedStateFromError(error: unknown) {
    return { error: error instanceof Error ? error.message : String(error) };
  }

  componentDidUpdate(prev: PluginBoundaryProps) {
    if (this.state.error !== undefined && prev.resetKey !== this.props.resetKey) {
      this.setState({ error: undefined });
    }
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
