/**
 * Pi compatibility shims — the only place PID touches Pi's private layout
 * or reshapes Pi's types for a process boundary.
 *
 * Each module documents the upstream API gap that forces it to exist and the
 * upstream primitive that would let it be deleted. The boundary tests fail if
 * Pi-private paths are reached from anywhere outside this directory.
 */
export { applyPiHttpSettings } from "./http-dispatcher";
export { toJsonEvent } from "./serializable-event";
