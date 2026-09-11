import type { Bridge } from "../preload/bridge-types";

if (!window.bridge) throw new Error("PID renderer must run inside Electron (window.bridge missing)");
export const bridge: Bridge = window.bridge;
