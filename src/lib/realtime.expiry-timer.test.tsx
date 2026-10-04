// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import * as React from "react";
import { renderHook, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MAX_TIMEOUT_MS, clampTimeoutDelay } from "./safe-timeout";

/**
 * A 30-day session token must not make the socket reconnect in a loop.
 *
 * The hook reconnects 30s before the token expires, with a timer. For a 30-day token
 * that delay is ~2.59e9 ms, past the 2^31-1 ms a browser timer can hold, and a timer
 * that overflows fires AT ONCE. So every console tab tore its socket down the moment it
 * authenticated, minted another ticket, and did it again: no live updates for the first
 * ~5 days of a session, and a ticket a second. Fake timers overflow the same way the
 * browser does, so the second half of this test fails on the old code, not just the spy.
 */

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
let ticketsMinted = 0;

vi.mock("./api", () => ({
  // A token whose payload decodes to orgId 1.
  getToken: () => `x.${btoa(JSON.stringify({ orgId: 1 }))}.y`,
  isTokenExpired: () => false,
  tokenExpiresAt: () => Date.now() + THIRTY_DAYS_MS,
  api: () => {
    ticketsMinted += 1;
    return Promise.resolve({
      ticket: `tkt-${ticketsMinted}`,
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      url: "",
      path: "/realtime/ws",
    });
  },
}));
vi.mock("./analytics", () => ({ track: () => {} }));
vi.mock("./env", () => ({ API_URL: "https://api.example.test" }));

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
    this.url = url;
    sockets.push(this);
  }

  send() {}

  close() {
    this.closed = true;
    this.readyState = FakeSocket.CLOSED;
    this.onclose?.();
  }

  /// The server accepting the socket and the ticket.
  openAndHello() {
    this.readyState = FakeSocket.OPEN;
    this.onopen?.();
    this.onmessage?.({
      data: JSON.stringify({ v: 1, type: "hello", connectionId: "c", channels: [], heartbeatIntervalMs: 25_000 }),
    });
  }
}

describe("clampTimeoutDelay", () => {
  it("keeps ordinary delays, clamps the ones a timer cannot hold", () => {
    expect(clampTimeoutDelay(1_500)).toBe(1_500);
    expect(clampTimeoutDelay(-5)).toBe(0);
    expect(clampTimeoutDelay(THIRTY_DAYS_MS)).toBe(MAX_TIMEOUT_MS);
    expect(clampTimeoutDelay(Number.POSITIVE_INFINITY)).toBe(MAX_TIMEOUT_MS);
    // NaN would otherwise be coerced to 0 and fire immediately, the same failure.
    expect(clampTimeoutDelay(Number.NaN)).toBe(MAX_TIMEOUT_MS);
  });
});

describe("the token-expiry reconnect timer", () => {
  let useRealtime: typeof import("./realtime").useRealtime;

  beforeEach(async () => {
    sockets.length = 0;
    ticketsMinted = 0;
    vi.stubGlobal("WebSocket", FakeSocket);
    vi.resetModules();
    useRealtime = (await import("./realtime")).useRealtime;
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  const wrapper = ({ children }: { children: React.ReactNode }) => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return React.createElement(QueryClientProvider, { client }, children);
  };

  it("never asks for a delay above 2^31-1 ms, and does not reconnect in a loop", async () => {
    vi.useFakeTimers();
    const setTimeoutSpy = vi.spyOn(window, "setTimeout");

    const { result } = renderHook(() => useRealtime({ channels: ["schedule"] }), { wrapper });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(sockets.length).toBe(1);

    await act(async () => {
      sockets[0].openAndHello();
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(result.current.connected).toBe(true);

    const delays = setTimeoutSpy.mock.calls.map((call) => Number(call[1] ?? 0));
    // The expiry timer was armed (clamped to the ceiling), and nothing overflowed.
    expect(delays).toContain(MAX_TIMEOUT_MS);
    expect(delays.filter((d) => d > MAX_TIMEOUT_MS)).toEqual([]);

    // A minute on, the one socket is still the one, and only one ticket was minted.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });
    expect(ticketsMinted).toBe(1);
    expect(sockets.length).toBe(1);
    expect(sockets[0].closed).toBe(false);
    expect(result.current.connected).toBe(true);
  });
});
