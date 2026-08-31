// @vitest-environment jsdom
/**
 * `is_demo` on the events that MAKE a person and a group.
 *
 * The public demo runs inside the real production console, so its traffic is separated
 * from customers' by one super property. `track()` re-checks the tab on every event,
 * because a tab becomes a demo tab after PostHog has already booted. `identify()` did
 * not, and it is the call that emits `$identify` and `$groupidentify` - the two events
 * a PostHog person and organization are built out of. In production that shipped the
 * demo pool's owner as a person carrying `is_demo: false`.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

let demoTab = false;
vi.mock("./demo", () => ({ isDemoTab: () => demoTab }));
vi.mock("./attribution", () => ({
  readAttribution: () => null,
  attributionChannel: () => "direct",
}));
vi.mock("./geo", () => ({
  getVisitorCountry: () => "US",
  isConsentImpliedRegion: () => true,
}));

const registered: Array<Record<string, unknown>> = [];
const captured: Array<{ event: string; props: Record<string, unknown> }> = [];
const identifies: string[] = [];
let resets = 0;

const fakeClient = {
  init: vi.fn(),
  register: (props: Record<string, unknown>) => registered.push(props),
  capture: (event: string, props: Record<string, unknown>) => captured.push({ event, props }),
  identify: (id: string) => identifies.push(id),
  group: vi.fn(),
  reset: () => {
    resets += 1;
    // The real reset() clears persistence, super properties included.
    registered.length = 0;
  },
  opt_out_capturing: vi.fn(),
};
vi.mock("posthog-js", () => ({ default: fakeClient }));

vi.stubEnv("VITE_POSTHOG_DEV", "1"); // otherwise a dev build stays silent by design

const analytics = await import("./analytics");

/** What is registered as a super property right now. */
function currentDemoFlag(): unknown {
  for (let i = registered.length - 1; i >= 0; i--) {
    if ("is_demo" in registered[i]) return registered[i].is_demo;
  }
  return undefined;
}

beforeEach(async () => {
  document.cookie = "aer_consent=granted; path=/";
  demoTab = false;
  analytics.startAnalytics();
  // startAnalytics import()s posthog-js, and until that resolves every call is queued
  // rather than run. A macrotask is what lets the queue drain before the assertions.
  await new Promise((resolve) => setTimeout(resolve, 0));
  // The module caches what it last registered, and it is imported once for the whole
  // file. Reset before each case so one test cannot make the next one pass.
  analytics.resetIdentity();
  registered.length = 0;
  captured.length = 0;
  identifies.length = 0;
  resets = 0;
});

describe("is_demo", () => {
  it("is re-registered by identify when the tab became a demo after boot", () => {
    // The demo is entered from inside a console that is already running, so the value
    // registered at init is stale by the time the demo signs its visitor in.
    demoTab = true;
    analytics.identify(1, { email: "owner@demo.aerscheduler.invalid" }, { id: 552 });
    expect(currentDemoFlag()).toBe(true);
    expect(identifies).toEqual(["1"]);
  });

  it("is re-registered by identify on the way back out to a real account", () => {
    demoTab = true;
    analytics.track("demo_opened");
    expect(currentDemoFlag()).toBe(true);

    demoTab = false;
    analytics.identify(4242, { email: "owner@example.com" }, { id: 77 });
    expect(currentDemoFlag()).toBe(false);
  });

  it("survives a reset, which drops super properties", () => {
    demoTab = true;
    analytics.track("demo_opened");
    expect(currentDemoFlag()).toBe(true);

    analytics.resetIdentity();
    expect(resets).toBe(1);

    // Still a demo tab, so the very next event has to put the flag back rather than
    // trusting a cache that now disagrees with an emptied cookie.
    analytics.track("ui_click");
    expect(currentDemoFlag()).toBe(true);
    expect(captured.at(-1)?.props.is_demo).toBe(true);
  });

  it("does not re-register when nothing changed", () => {
    demoTab = false;
    analytics.track("a");
    const after = registered.length;
    analytics.track("b");
    analytics.identify(1, {}, undefined);
    expect(registered.length).toBe(after);
  });
});
