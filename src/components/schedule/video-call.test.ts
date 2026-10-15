import { describe, expect, it } from "vitest";
import { hasVideoCall, NO_VIDEO_CALL, videoCallInput, videoCallProviderLabel } from "./video-call";

describe("videoCallInput", () => {
  it("sends nothing for a new booking with no call", () => {
    expect(videoCallInput(NO_VIDEO_CALL, false)).toEqual({});
  });

  it("clears the link when an edit turns the call off", () => {
    expect(videoCallInput(NO_VIDEO_CALL, true)).toEqual({ meetingUrl: null });
  });

  it("leaves a kept link alone", () => {
    expect(videoCallInput({ mode: "keep", url: "https://zoom.us/j/1" }, true)).toEqual({});
  });

  it("sends a pasted link trimmed", () => {
    expect(videoCallInput({ mode: "link", url: "  zoom.us/j/1 " }, false)).toEqual({ meetingUrl: "zoom.us/j/1" });
  });

  it("asks the server to make a meeting", () => {
    expect(videoCallInput({ mode: "google_meet" }, false)).toEqual({ meeting: { create: "google_meet" } });
    expect(videoCallInput({ mode: "zoom" }, true)).toEqual({ meeting: { create: "zoom" } });
  });
});

describe("hasVideoCall", () => {
  it("is false for none and for an empty pasted link", () => {
    expect(hasVideoCall(NO_VIDEO_CALL)).toBe(false);
    expect(hasVideoCall({ mode: "link", url: "  " })).toBe(false);
  });

  it("is true for a link, a kept link, or a meeting to make", () => {
    expect(hasVideoCall({ mode: "link", url: "https://x.example" })).toBe(true);
    expect(hasVideoCall({ mode: "keep", url: "https://x.example" })).toBe(true);
    expect(hasVideoCall({ mode: "zoom" })).toBe(true);
  });
});

describe("videoCallProviderLabel", () => {
  it("names the service from the host", () => {
    expect(videoCallProviderLabel("https://meet.google.com/abc")).toBe("Google Meet");
    expect(videoCallProviderLabel("https://us02web.zoom.us/j/1")).toBe("Zoom");
    expect(videoCallProviderLabel("https://notzoom.us/j/1")).toBe("Video call");
    expect(videoCallProviderLabel("garbage")).toBe("Video call");
  });
});
