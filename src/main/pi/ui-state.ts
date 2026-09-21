import type { PiEvent } from "@shared/protocol";

/**
 * The last line an extension published, per key.
 *
 * A window that adopts a worker already running — a renderer reload — never sees a session start,
 * so no extension republishes: the session's standing lines have to be handed over rather than
 * announced again. Only the two members whose value is a standing state are kept. A notification
 * is news, not state, and replaying one would say it twice.
 */
export class UiState {
  private lines = new Map<string, PiEvent>();

  /** Remember what a dialog event says, or forget the key whose line it clears. */
  note(event: PiEvent): void {
    if (event.type !== "dialog") return;
    if (event.method === "setStatus") {
      this.keep(`status:${event.statusKey}`, event, event.statusText === undefined);
    }
    if (event.method === "setWidget") {
      this.keep(`widget:${event.widgetKey}`, event, event.widgetLines === undefined);
    }
  }

  /** What the session currently shows, as the events that would put it back. */
  replay(): PiEvent[] {
    return [...this.lines.values()];
  }

  private keep(key: string, event: PiEvent, cleared: boolean): void {
    // The key is still remembered for a status and a widget that share it, so the two cannot
    // displace each other.
    if (cleared) this.lines.delete(key);
    else this.lines.set(key, event);
  }
}
