import { describe, expect, it } from "vitest";
import { actionErrorMessage, shouldTrackAction } from "./api";

describe("shouldTrackAction", () => {
  it("skips GET and HEAD", () => {
    expect(shouldTrackAction("GET", "/reservations")).toBe(false);
    expect(shouldTrackAction("HEAD", "/reservations")).toBe(false);
  });

  it("skips the realtime ticket mint", () => {
    expect(shouldTrackAction("POST", "/realtime/ticket")).toBe(false);
    expect(shouldTrackAction("POST", "/realtime/ticket?x=1")).toBe(false);
  });

  it("still reports a booking write", () => {
    expect(shouldTrackAction("POST", "/reservations")).toBe(true);
  });

  it("does not swallow a similarly named future write", () => {
    expect(shouldTrackAction("POST", "/realtime/tickets")).toBe(true);
  });
});

describe("actionErrorMessage", () => {
  it("lifts the server message off a 400 body", () => {
    expect(actionErrorMessage({ message: "Aircraft is already booked" })).toBe(
      "Aircraft is already booked",
    );
  });

  it("prefers a stable code when the API sent one", () => {
    expect(
      actionErrorMessage({
        code: "RESERVATION_RAMPED_OUT",
        message: "Jane Doe is ramped out",
      }),
    ).toBe("RESERVATION_RAMPED_OUT");
  });

  it("redacts a tail in a message that has no code", () => {
    expect(
      actionErrorMessage({ message: "Jane Doe is not approved to use N172TS" }),
    ).toBe("Jane Doe is not approved to use <redacted>");
  });

  it("does not treat engine N1 as a tail", () => {
    expect(actionErrorMessage({ message: "N1 exceedance on takeoff" })).toBe(
      "N1 exceedance on takeoff",
    );
  });

  it("ignores HTML and empty bodies", () => {
    expect(actionErrorMessage(null)).toBeUndefined();
    expect(actionErrorMessage("<html>502</html>")).toBeUndefined();
    expect(actionErrorMessage({ message: "  " })).toBeUndefined();
  });

  it("truncates a long message", () => {
    const long = "x".repeat(250);
    expect(actionErrorMessage({ message: long })).toBe("x".repeat(200));
  });
});
