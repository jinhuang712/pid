/**
 * The primitives the window is built from.
 *
 * Everything here is presentation and nothing else: no session, no IPC, no domain type. A component
 * that knows what a session or a tool call is belongs in `components/`, not here.
 *
 * PID draws its own interface with these, which is the point — a primitive nothing uses is a
 * primitive nobody has checked. The same set is what an extension will be handed when it wants to
 * put something in the window, so the list is deliberately short and the names deliberately plain.
 */

export { useActiveInView } from "./active";
export { ContextMenu, type MenuItem } from "./ContextMenu";
export { Action, IconButton, Row, Segmented, Toggle, Trigger } from "./Controls";
export { Chevron, Disclosure } from "./Disclosure";
export { useDismiss } from "./dismiss";
export { Key, Keys, SigilChip } from "./Key";
export { Logo } from "./Logo";
export { Badge, Dot, Eyebrow, Num } from "./Marks";
export { Modal } from "./Modal";
export { Popover } from "./Popover";
export { Divider, Floating, Inline, Line, Panel, Say, Scroll, Spread, Stack } from "./Surface";
export { FILL, SOFT, TEXT, type Tone } from "./tone";
