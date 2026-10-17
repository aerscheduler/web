// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import * as React from "react";
import { renderHook, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

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

/**
 * Console presence (server/src/realtime/presence.ts): while the console is in use, the server
 * holds message pushes to the same person's phone. Only a hook asked for it sends presence.
 */
describe("console presence over the realtime socket", () => {
  let useRealtime: typeof import("./realtime").useRealtime;

  beforeEach(async () => {
    sent.length = 0;
    sockets.length = 0;
    ticketQueue.length = 0;
    vi.stubGlobal("WebSocket", FakeSocket);
    Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
    vi.resetModules();
    useRealtime = (await import("./realtime")).useRealtime;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: new QueryClient() }, children);

  async function connect(presence: boolean) {
    renderHook(() => useRealtime({ channels: ["messages"], presence }), { wrapper });
    await act(async () => {
      await Promise.resolve();
    });
    await act(async () => {
      for (const resolve of ticketQueue.splice(0)) {
        resolve({ ticket: "tkt", expiresAt: new Date(Date.now() + 60_000).toISOString(), url: "", path: "/realtime/ws" });
      }
      await Promise.resolve();
      await Promise.resolve();
    });
    const socket = sockets[sockets.length - 1]!;
    await act(async () => {
      socket.open();
      socket.onmessage?.({ data: JSON.stringify({ v: 1, type: "hello", heartbeatIntervalMs: 25_000 }) });
      await Promise.resolve();
    });
    return socket;
  }

  const presenceFrames = () =>
    sent.map((f) => JSON.parse(f.data) as { type: string; active?: boolean }).filter((m) => m.type === "presence");

  it("says it is in use as soon as it connects", async () => {
    await connect(true);
    expect(presenceFrames()).toEqual([{ v: 1, type: "presence", active: true }]);
  });

  it("says it is not the moment the tab is hidden, so the phone takes over", async () => {
    await connect(true);
    await act(async () => {
      Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(presenceFrames().at(-1)).toEqual({ v: 1, type: "presence", active: false });
  });

  it("sends nothing from a socket that did not ask (every page's own sockets)", async () => {
    await connect(false);
    expect(presenceFrames()).toEqual([]);
  });
});
