import { describe, expect, it } from "vitest";
import {
  redactSensitiveEventProperties,
  redactSensitiveUrl,
} from "./analytics";

describe("redactSensitiveUrl", () => {
  it("strips a public-booking confirm token from $current_url", () => {
    const href = "http://localhost:5173/book/confirm?token=secret-one-time";
    expect(redactSensitiveUrl(href)).toBe("http://localhost:5173/book/confirm?token=%3Credacted%3E");
  });

  it("leaves ordinary query params alone", () => {
    const href = "http://localhost:5173/schedule?tab=week&view=day";
    expect(redactSensitiveUrl(href)).toBe(href);
  });
});

describe("redactSensitiveEventProperties", () => {
  it("redacts token query params on PostHog URL fields", () => {
    const properties: Record<string, unknown> = {
      $current_url: "http://localhost:5173/book/confirm?token=secret-one-time",
      $referrer: "http://localhost:5173/book/confirm?token=secret-one-time",
      path: "/book/confirm",
    };
    redactSensitiveEventProperties(properties);
    expect(properties.$current_url).toBe("http://localhost:5173/book/confirm?token=%3Credacted%3E");
    expect(properties.$referrer).toBe("http://localhost:5173/book/confirm?token=%3Credacted%3E");
    expect(properties.path).toBe("/book/confirm");
  });
});
