import type { NotifyRequest, NotifyResult } from "@shared/notifications";
import { notificationGate } from "@shared/notifications";
import { Notification, shell } from "electron";
import { loadSettings } from "./settings";

/**
 * The window's desktop notifications, shown by the main process.
 *
 * The renderer used to call the web `Notification` constructor. In this app that reports
 * `permission: "granted"` and then delivers nothing — a page asking for a banner, not the app
 * posting one — while Electron's main-process module is the app speaking for itself, which is what
 * macOS wants and the only side that can say why a banner did not appear.
 *
 * A shown notification is held until it is clicked or closed. Electron cannot deliver a click to a
 * notification the garbage collector has already taken, and `id`/`groupId` are what let the next
 * turn's banner replace this one instead of piling up beside it.
 */
const live = new Map<string, Notification>();

/** How long to wait for a platform that answers `show()` with neither an error nor a confirmation. */
const REFUSAL_TIMEOUT = 1500;

export async function showNotification(
  req: NotifyRequest,
  opts: { focused: boolean; onOpen: (req: NotifyRequest) => void },
): Promise<NotifyResult> {
  const gate = notificationGate(loadSettings().notifications, req.kind, opts.focused);
  if (gate !== "send") return { shown: false, reason: gate };
  if (!Notification.isSupported()) return { shown: false, reason: "unsupported" };

  // One key per session: every kind from a session lands under one heading, and a banner the user
  // has not read yet is replaced by the newer one rather than talked over.
  const key = req.sessionFile ?? "pid";
  const n = new Notification({
    title: req.title,
    subtitle: req.subtitle,
    body: req.body,
    id: key,
    groupId: key,
    // No `silent`: whether a notification makes a sound is the user's setting in System Settings,
    // and overriding it here would take that decision away from the one place they look for it.
  });

  live.get(key)?.close();
  live.set(key, n);
  const forget = () => {
    if (live.get(key) === n) live.delete(key);
  };
  n.once("close", forget);
  n.on("click", () => {
    forget();
    opts.onOpen(req);
  });

  // macOS answers a refusal here and nowhere else: `show()` returns void whether the banner
  // appeared or the system turned it down, so the error event is the whole report.
  const refusal = new Promise<string | undefined>((resolve) => {
    n.once("failed", (_e, error) => resolve(error));
    n.once("show", () => resolve(undefined));
    setTimeout(() => resolve(undefined), REFUSAL_TIMEOUT);
  });

  n.show();
  const error = await refusal;
  return error ? { shown: false, reason: "refused", error } : { shown: true };
}

/**
 * System Settings → Notifications, which is where a refusal is undone. The pane exists on macOS
 * alone, and so does this kind of refusal.
 */
export function openNotificationSettings(): void {
  if (process.platform !== "darwin") return;
  // Ventura and later. An older pane id still redirects here.
  void shell.openExternal("x-apple.systempreferences:com.apple.Notifications-Settings.extension");
}
