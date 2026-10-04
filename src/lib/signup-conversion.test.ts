import { beforeEach, describe, expect, it, vi } from "vitest";

const track = vi.fn();
const trackAdConversion = vi.fn();
vi.mock("./analytics", () => ({ track: (...a: unknown[]) => track(...a) }));
vi.mock("./ads", () => ({ trackAdConversion: (...a: unknown[]) => trackAdConversion(...a) }));
vi.mock("./attribution", () => ({ attributionChannel: () => "organic" }));

import { reportSignupIfNew } from "./signup-conversion";

describe("reportSignupIfNew", () => {
  beforeEach(() => {
    track.mockReset();
    trackAdConversion.mockReset();
  });

  it("reports an account created moments ago as a signup, with the email for enhanced conversions", () => {
    reportSignupIfNew({ createdAt: new Date(Date.now() - 5_000).toISOString(), email: "a@b.test" }, "google");
    expect(track).toHaveBeenCalledWith("signup_completed", { method: "google", channel: "organic" });
    expect(trackAdConversion).toHaveBeenCalledWith("signup_completed", { email: "a@b.test" });
  });

  it("treats an older account as a plain sign-in", () => {
    reportSignupIfNew({ createdAt: new Date(Date.now() - 3 * 86_400_000).toISOString(), email: "a@b.test" }, "apple");
    expect(track).not.toHaveBeenCalled();
    expect(trackAdConversion).not.toHaveBeenCalled();
  });

  it("does nothing without a user or a parseable date", () => {
    reportSignupIfNew(null, "google");
    reportSignupIfNew({ createdAt: "not a date", email: "a@b.test" }, "google");
    expect(trackAdConversion).not.toHaveBeenCalled();
  });
});
