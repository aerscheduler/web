import { describe, expect, it } from "vitest";
import { notificationHref } from "./notification-link";

describe("organization deletion notification links", () => {
  it("opens the Security tab from the mobile-compatible link", () => {
    expect(notificationHref("/organization-settings?tab=security")).toBe(
      "/settings?tab=security"
    );
  });

  it("keeps the generic organization settings link on its original tab", () => {
    expect(notificationHref("/organization-settings")).toBe("/settings?tab=organization");
  });
});

describe("booking request notification links", () => {
  it("opens the desk queue from the staff list link", () => {
    expect(notificationHref("/booking-requests")).toBe("/schedule?panel=booking-requests");
  });

  it("opens the member requests tab from a request detail link", () => {
    expect(notificationHref("/booking-requests/42")).toBe("/me/schedule?tab=requests");
  });
});
