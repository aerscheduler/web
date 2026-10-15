/**
 * Connecting Zoom from a booking form happens in a small window, so the form stays open.
 * The window ends on /integrations/zoom/callback, which says how it went on this channel.
 * A BroadcastChannel rather than window.opener: Zoom's pages may cut the opener link.
 */
export const ZOOM_CONNECT_CHANNEL = "aerscheduler:zoom-connect";

export type ZoomConnectMessage = { connected: boolean; email: string | null };

/** Tells any open booking form how the connection went. */
export function announceZoomConnect(message: ZoomConnectMessage) {
  if (typeof BroadcastChannel === "undefined") return;
  const channel = new BroadcastChannel(ZOOM_CONNECT_CHANNEL);
  channel.postMessage(message);
  channel.close();
}
