import * as React from "react";
import { useQueryClient } from "@tanstack/react-query";
import { API_URL } from "./env";
import { api, getToken, isTokenExpired, tokenExpiresAt } from "./api";

//---------------------------------------------------------------------------------
// Realtime bridge for TanStack Query.
//
// Adding a live surface:
//   1. Register the channel on the server (realtime/channels.ts).
//   2. Pass it here: useRealtime({ channels: ["schedule", "notifications"] }).
//   3. Server events carry `invalidate` query-key roots, we invalidate those.
//
// Auth uses a short-lived ticket + first-frame auth (no ticket in the WS URL).
//---------------------------------------------------------------------------------

export type RealtimeChannel = "schedule" | "notifications" | "billing";

type TicketResponse = {
  ticket: string;
  expiresAt: string;
  url: string;
  path: string;
};

type Options = {
  /** When false, disconnect and stay quiet. */
  enabled?: boolean;
  /** Channels to request after hello. Defaults to ["schedule"]. */
  channels?: RealtimeChannel[];
  /**
   * Active org id. When it changes (switch org), the socket is torn down and
   * re-authed so events never leak across schools.
   */
  orgId?: number | null;
  /** Skip applying an event right now (e.g. mid-drag). Pending keys are flushed later. */
  shouldApply?: () => boolean;
  /** Called when the socket is (re)connected after hello. */
  onConnected?: () => void;
};

/** Serialize ticket mints across concurrent hook mounts / reconnect storms. */
let ticketInFlight: Promise<TicketResponse> | null = null;

async function mintTicket(): Promise<TicketResponse> {
  if (!ticketInFlight) {
    ticketInFlight = api<TicketResponse>("/realtime/ticket", { method: "POST" }).finally(() => {
      ticketInFlight = null;
    });
  }
  return ticketInFlight;
}

/**
 * Build a WebSocket URL that matches how the console talks to the API.
 * Same-origin `/api` (Vite proxy) → `ws(s)://host/api/realtime/ws`.
 * Absolute API_URL → swap http(s) for ws(s).
 */
export function buildRealtimeWsUrl(path = "/realtime/ws"): string {
  if (API_URL.startsWith("http://") || API_URL.startsWith("https://")) {
    const u = new URL(path, API_URL.endsWith("/") ? API_URL : `${API_URL}/`);
    u.protocol = u.protocol === "https:" ? "wss:" : "ws:";
    return u.toString();
  }
  // Relative API root (usually "/api"): stay on the page origin so Vite can proxy WS.
  const base = API_URL.replace(/\/$/, "") || "";
  const page = window.location;
  const protocol = page.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${page.host}${base}${path.startsWith("/") ? path : `/${path}`}`;
}

function decodeOrgId(token: string | null): number | null {
  if (!token) return null;
  try {
    const payload = token.split(".")[1];
    if (!payload) return null;
    const b64 = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = b64.padEnd(b64.length + ((4 - (b64.length % 4)) % 4), "=");
    const bytes = Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
    const claims = JSON.parse(new TextDecoder().decode(bytes)) as { orgId?: unknown };
    return typeof claims.orgId === "number" ? claims.orgId : null;
  } catch {
    return null;
  }
}

/**
 * Keep a WebSocket open while authenticated. Invalidates React Query keys from
 * each `event` message. Hardened for reconnect storms, tab sleep, org switch,
 * and drag coalescing.
 */
export function useRealtime(options: Options = {}): { connected: boolean } {
  const {
    enabled = true,
    channels = ["schedule"],
    orgId = null,
    shouldApply,
    onConnected,
  } = options;
  const queryClient = useQueryClient();
  const [connected, setConnected] = React.useState(false);

  const shouldApplyRef = React.useRef(shouldApply);
  shouldApplyRef.current = shouldApply;
  const onConnectedRef = React.useRef(onConnected);
  onConnectedRef.current = onConnected;
  const channelsKey = channels.slice().sort().join(",");
  const pendingRootsRef = React.useRef<Set<string>>(new Set());

  const flushPending = React.useCallback(() => {
    if (shouldApplyRef.current && !shouldApplyRef.current()) return;
    const roots = [...pendingRootsRef.current];
    pendingRootsRef.current.clear();
    for (const root of roots) {
      void queryClient.invalidateQueries({ queryKey: [root] });
    }
  }, [queryClient]);

  // When the caller becomes ready again (drag ended), flush coalesced keys.
  React.useEffect(() => {
    const id = window.setInterval(() => flushPending(), 250);
    return () => window.clearInterval(id);
  }, [flushPending]);

  React.useEffect(() => {
    const token = getToken();
    if (!enabled || !token || isTokenExpired(token)) {
      setConnected(false);
      return;
    }

    // Prefer the explicit orgId; fall back to the JWT claim so a missing prop
    // still scopes reconnects when the token itself changes org.
    const scopedOrgId = orgId ?? decodeOrgId(token);

    let cancelled = false;
    let ws: WebSocket | null = null;
    let pingTimer: number | undefined;
    let reconnectTimer: number | undefined;
    let expiryTimer: number | undefined;
    let attempt = 0;
    let authed = false;

    const clearTimers = () => {
      if (pingTimer != null) window.clearInterval(pingTimer);
      if (reconnectTimer != null) window.clearTimeout(reconnectTimer);
      if (expiryTimer != null) window.clearTimeout(expiryTimer);
      pingTimer = undefined;
      reconnectTimer = undefined;
      expiryTimer = undefined;
    };

    const disconnect = () => {
      clearTimers();
      authed = false;
      setConnected(false);
      try {
        ws?.close(1000, "client_disconnect");
      } catch {
        /* ignore */
      }
      ws = null;
    };

    const scheduleReconnect = (immediate = false) => {
      if (cancelled) return;
      setConnected(false);
      authed = false;
      if (reconnectTimer != null) window.clearTimeout(reconnectTimer);
      const base = immediate ? 0 : Math.min(30_000, 1_000 * 2 ** attempt);
      // Jitter so many tabs do not stampede the ticket endpoint together.
      const delay = base + Math.floor(Math.random() * 1_000);
      attempt += 1;
      reconnectTimer = window.setTimeout(() => {
        void connect();
      }, delay);
    };

    const applyRoots = (roots: string[]) => {
      const canApply = !shouldApplyRef.current || shouldApplyRef.current();
      for (const root of roots) {
        if (typeof root !== "string" || !root) continue;
        if (canApply) {
          void queryClient.invalidateQueries({ queryKey: [root] });
        } else {
          pendingRootsRef.current.add(root);
        }
      }
    };

    const connect = async () => {
      if (cancelled) return;
      clearTimers();
      // Drop any half-open socket before opening another.
      if (ws) {
        try {
          ws.onclose = null;
          ws.close();
        } catch {
          /* ignore */
        }
        ws = null;
      }

      const current = getToken();
      if (!current || isTokenExpired(current)) {
        setConnected(false);
        return;
      }
      // Org switched under us: stop until the effect re-runs with the new orgId.
      const tokenOrg = decodeOrgId(current);
      if (scopedOrgId != null && tokenOrg != null && tokenOrg !== scopedOrgId) {
        setConnected(false);
        return;
      }

      try {
        const issued = await mintTicket();
        if (cancelled) return;

        const wsUrl = buildRealtimeWsUrl(issued.path || "/realtime/ws");
        ws = new WebSocket(wsUrl);
        authed = false;

        ws.onopen = () => {
          ws?.send(JSON.stringify({ v: 1, type: "auth", ticket: issued.ticket }));
        };

        ws.onmessage = (ev) => {
          let msg: {
            v?: number;
            type?: string;
            invalidate?: string[];
            heartbeatIntervalMs?: number;
          };
          try {
            msg = JSON.parse(String(ev.data));
          } catch {
            return;
          }
          if (msg?.v !== 1 || typeof msg.type !== "string") return;

          if (msg.type === "hello") {
            attempt = 0;
            authed = true;
            setConnected(true);
            const list = channelsKey.split(",").filter(Boolean);
            if (list.length && ws?.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({ v: 1, type: "subscribe", channels: list }));
            }
            const interval =
              typeof msg.heartbeatIntervalMs === "number" && msg.heartbeatIntervalMs > 0
                ? Math.min(msg.heartbeatIntervalMs, 25_000)
                : 25_000;
            if (pingTimer != null) window.clearInterval(pingTimer);
            pingTimer = window.setInterval(() => {
              if (ws?.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ v: 1, type: "ping" }));
              }
            }, interval);
            onConnectedRef.current?.();
            flushPending();
            return;
          }
          if (msg.type === "ping") {
            if (ws?.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({ v: 1, type: "pong" }));
            }
            return;
          }
          if (msg.type === "pong" || msg.type === "subscribed" || msg.type === "unsubscribed") {
            return;
          }
          if (msg.type === "error") return;

          if (msg.type === "event") {
            applyRoots(Array.isArray(msg.invalidate) ? msg.invalidate : []);
          }
        };

        ws.onclose = () => {
          setConnected(false);
          clearTimers();
          if (!cancelled) scheduleReconnect();
        };

        ws.onerror = () => {
          try {
            ws?.close();
          } catch {
            /* ignore */
          }
        };

        // Proactively reconnect before the JWT expires so the socket never
        // outlives a session that REST would already reject.
        const exp = tokenExpiresAt(current);
        if (exp != null) {
          const until = Math.max(5_000, exp - Date.now() - 30_000);
          expiryTimer = window.setTimeout(() => {
            disconnect();
            scheduleReconnect(true);
          }, until);
        }
      } catch {
        scheduleReconnect();
      }
    };

    const onVisibility = () => {
      if (document.visibilityState !== "visible") return;
      if (cancelled) return;
      if (!getToken() || isTokenExpired()) {
        disconnect();
        return;
      }
      if (!ws || ws.readyState !== WebSocket.OPEN || !authed) {
        scheduleReconnect(true);
        return;
      }
      try {
        ws.send(JSON.stringify({ v: 1, type: "ping" }));
      } catch {
        scheduleReconnect(true);
      }
    };

    const onOnline = () => {
      if (cancelled) return;
      scheduleReconnect(true);
    };

    const onOffline = () => {
      disconnect();
    };

    // Logout / token clear in this or another tab.
    const onStorage = (ev: StorageEvent) => {
      if (ev.key !== "aer.token") return;
      if (!ev.newValue) {
        cancelled = true;
        disconnect();
        return;
      }
      // Token replaced (org switch / re-login): tear down; effect deps will reconnect.
      disconnect();
    };

    const onTokenChange = () => {
      const next = getToken();
      if (!next || isTokenExpired(next)) {
        disconnect();
        return;
      }
      const tokenOrg = decodeOrgId(next);
      // Org switch: the effect re-runs with the new orgId; do not reconnect on the old scope.
      if (scopedOrgId != null && tokenOrg != null && tokenOrg !== scopedOrgId) {
        disconnect();
        return;
      }
      disconnect();
      scheduleReconnect(true);
    };

    void connect();
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    window.addEventListener("storage", onStorage);
    window.addEventListener("aer:token-change", onTokenChange);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("aer:token-change", onTokenChange);
      disconnect();
    };
  }, [enabled, orgId, channelsKey, queryClient, flushPending]);

  return { connected };
}
