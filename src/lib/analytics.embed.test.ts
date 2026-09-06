// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("./geo", () => ({
  getVisitorCountry: () => "US",
  isConsentImpliedRegion: () => true,
}));
vi.mock("./demo", () => ({ isDemoTab: () => false }));
vi.mock("./attribution", () => ({
  readAttribution: () => null,
  attributionChannel: () => "direct",
}));

const init = vi.fn();
vi.mock("posthog-js", () => ({
  default: {
    init,
    register: vi.fn(),
    capture: vi.fn(),
    identify: vi.fn(),
    group: vi.fn(),
    reset: vi.fn(),
    opt_out_capturing: vi.fn(),
  },
}));

vi.stubEnv("VITE_POSTHOG_DEV", "1");

const analytics = await import("./analytics");

function go(pathAndQuery: string) {
  window.history.pushState({}, "", pathAndQuery);
}

function clearConsentCookie() {
  document.cookie = "aer_consent=; path=/; max-age=0";
}

afterEach(() => {
  clearConsentCookie();
  go("/");
  init.mockClear();
  Object.defineProperty(window, "top", { value: window.self, configurable: true });
});

describe("isEmbeddedGuestBooking", () => {
  it("is true for the guest page with embed=1", () => {
    go("/book/aertest01/discovery?embed=1");
    expect(analytics.isEmbeddedGuestBooking()).toBe(true);
  });

  it("is true when the guest page is framed without the query", () => {
    go("/book/aertest01/discovery");
    Object.defineProperty(window, "top", { value: {}, configurable: true });
    expect(analytics.isEmbeddedGuestBooking()).toBe(true);
    Object.defineProperty(window, "top", { value: window.self, configurable: true });
  });

  it("is false for the hosted share link", () => {
    go("/book/aertest01/discovery");
    expect(analytics.isEmbeddedGuestBooking()).toBe(false);
  });

  it("is false on the email confirm page", () => {
    go("/book/confirm?token=abc");
    expect(analytics.isEmbeddedGuestBooking()).toBe(false);
  });
});

describe("isPublicGuestBookingPath", () => {
  it("covers hosted, embed, and confirm, but not member book", () => {
    go("/book/aertest01/discovery");
    expect(analytics.isPublicGuestBookingPath()).toBe(true);
    go("/book/confirm?token=abc");
    expect(analytics.isPublicGuestBookingPath()).toBe(true);
    go("/me/book");
    expect(analytics.isPublicGuestBookingPath()).toBe(false);
    go("/schedule");
    expect(analytics.isPublicGuestBookingPath()).toBe(false);
  });
});

describe("embed analytics stay off", () => {
  it("does not imply US consent or start PostHog inside an embed", async () => {
    go("/book/aertest01/discovery?embed=1");
    expect(analytics.bootstrapAnalyticsConsent()).toBe(false);
    expect(document.cookie).not.toMatch(/aer_consent=granted/);

    document.cookie = "aer_consent=granted; path=/";
    analytics.startAnalytics();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(init).not.toHaveBeenCalled();
  });
});
