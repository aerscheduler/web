// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import * as React from "react";
import { renderHook, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

/**
 * The socket that opened is not always the socket `ws` points at.
 *
 * PostHog reported, from `/dashboard`, in a frame named `l.onopen`:
 *
 *   DOMException: Failed to execute 'send' on 'WebSocket': Still in CONNECTING state.
 *
 * Which reads as a contradiction until you notice `onopen` closed over the mutable
 * `ws` rather than over its own socket:
 *
 *   ws = new WebSocket(url);
 *   ws.onopen = () => { ws?.send(...auth ticket...) };
 *
 * `connect()` awaits `mintTicket()`, and that await is wide: the mint is floored at
 * one second apart, so a whole second can pass between deciding to connect and
 * constructing the socket. A visibility change in that window schedules another
 * connect, which runs its "drop any half-open socket" check while `ws` is still null,
 * and then assigns over it. Now two sockets exist, `ws` is the second, and when the
 * FIRST one opens it sends the auth frame down the second, which is still CONNECTING.
 *
 * Three things were wrong with that and all three are asserted below: it threw, it
 * sent one socket's ticket down another, and it leaked the superseded socket, which
 * nobody ever closed.
 */

const ticketQueue: Array<(t: unknown) => void> = [];

vi.mock("./api", () => ({
  // A token whose payload decodes to orgId 1.
  getToken: () => `x.${btoa(JSON.stringify({ orgId: 1 }))}.y`,
  isTokenExpired: () => false,
  tokenExpiresAt: () => Date.now() + 60 * 60 * 1000,
  api: () =>
    new Promise((resolve) => {
      ticketQueue.push(resolve as (t: unknown) => void);
    }),
}));
vi.mock("./analytics", () => ({ track: () => {} }));
vi.mock("./env", () => ({ API_URL: "https://api.example.test" }));

type SentFrame = { socket: FakeSocket; data: string };

const sent: SentFrame[] = [];
const sockets: FakeSocket[] = [];

class FakeSocket {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;

  readyState = 0;
  closed = false;
  onopen: (() => void) | null = null;
  onmessage: ((ev: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;

  readonly url: string;

  constructor(url: string) {
    // A parameter property would be neater and does not survive `erasableSyntaxOnly`,
    // which the build enforces.
    this.url = url;
    sockets.push(this);
  }

  /// What the browser does, and the whole point of the test.
  send(data: string) {
    if (this.readyState === FakeSocket.CONNECTING) {
      throw new DOMException(
        "Failed to execute 'send' on 'WebSocket': Still in CONNECTING state.",
        "InvalidStateError",
      );
    }
    sent.push({ socket: this, data });
  }

  close() {
    this.closed = true;
    this.readyState = FakeSocket.CLOSED;
  }

  /// The server accepting this particular socket.
  open() {
    this.readyState = FakeSocket.OPEN;
    this.onopen?.();
  }
}

describe("a socket superseded while its ticket was being minted", () => {
  let useRealtime: typeof import("./realtime").useRealtime;
  let uncaught: string[];

  beforeEach(async () => {
    sent.length = 0;
    sockets.length = 0;
    ticketQueue.length = 0;
    uncaught = [];
    vi.stubGlobal("WebSocket", FakeSocket);
    // A throw inside onopen is an uncaught error on the window, which is exactly how
    // PostHog saw it. jsdom reports it here.
    window.addEventListener("error", (e) => uncaught.push(String(e.message ?? e)));
    vi.resetModules();
    useRealtime = (await import("./realtime")).useRealtime;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const wrapper = ({ children }: { children: React.ReactNode }) => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    return React.createElement(QueryClientProvider, { client }, children);
  };

  it("does not send its ticket down whichever socket is current", async () => {
    vi.useFakeTimers();
    try {
      renderHook(() => useRealtime({ channels: ["schedule"] }), { wrapper });

      // Let the first connect reach its ticket await.
      await act(async () => {
        await Promise.resolve();
      });
      expect(ticketQueue.length).toBe(1);
      expect(sockets.length).toBe(0);

      // The tab comes back while that mint is still in flight. `onVisibility` sees no
      // open socket and schedules an immediate reconnect, which is a timer, so the
      // second connect lands while the first is still awaiting the same ticket.
      await act(async () => {
        document.dispatchEvent(new Event("visibilitychange"));
        await vi.advanceTimersByTimeAsync(1_200);
      });

      // Release the ticket. Both awaiting connects resume and each builds a socket.
      await act(async () => {
        for (const resolve of ticketQueue.splice(0)) {
          resolve({
            ticket: "tkt-1",
            expiresAt: new Date(Date.now() + 60_000).toISOString(),
            url: "",
            path: "/realtime/ws",
          });
        }
        await vi.advanceTimersByTimeAsync(50);
      });

      // The race itself. If this ever stops holding, the rest of the test is
      // asserting nothing and should fail rather than pass quietly.
      expect(sockets.length).toBe(2);

      const [first, second] = sockets;

      // The first socket opens last, after `ws` has moved on to the second.
      await act(async () => {
        first.open();
        await vi.advanceTimersByTimeAsync(10);
      });

      expect(uncaught.join(" ")).not.toContain("Still in CONNECTING state");
      // Nothing may be written to a socket that has not opened.
      expect(sent.filter((f) => f.socket === second)).toEqual([]);
      // And the socket nobody is going to read from must not be left open.
      expect(first.closed).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it("still authenticates the socket that is current when it opens", async () => {
    renderHook(() => useRealtime({ channels: ["schedule"] }), { wrapper });

    await act(async () => {
      await Promise.resolve();
    });
    await act(async () => {
      for (const resolve of ticketQueue.splice(0)) {
        resolve({
          ticket: "tkt-current",
          expiresAt: new Date(Date.now() + 60_000).toISOString(),
          url: "",
          path: "/realtime/ws",
        });
      }
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(sockets.length).toBeGreaterThanOrEqual(1);
    const socket = sockets[sockets.length - 1];

    await act(async () => {
      socket.open();
      await Promise.resolve();
    });

    const frames = sent.filter((f) => f.socket === socket).map((f) => JSON.parse(f.data));
    expect(frames).toContainEqual({ v: 1, type: "auth", ticket: "tkt-current" });
    expect(socket.closed).toBe(false);
  });
});
