import type { MeetingCreator } from "@/types/api";

/**
 * What the booking's video call should be. `keep` is an edit that leaves an existing link
 * alone; `link` is a pasted (or edited) link; the two creators ask the server to make one
 * on the booker's own account.
 */
export type VideoCallChoice =
  | { mode: "none" }
  | { mode: "keep"; url: string }
  | { mode: "link"; url: string }
  | { mode: MeetingCreator };

export const NO_VIDEO_CALL: VideoCallChoice = { mode: "none" };

export function hasVideoCall(choice: VideoCallChoice): boolean {
  return choice.mode !== "none" && (choice.mode !== "link" || choice.url.trim() !== "");
}

/**
 * The fields a create or edit sends for the choice. An edit that turns the call off sends
 * `meetingUrl: null`; a create that has none sends nothing, so a server that has never
 * heard of links sees the body it always did.
 */
export function videoCallInput(
  choice: VideoCallChoice,
  editingHadLink: boolean
): { meetingUrl?: string | null; meeting?: { create: MeetingCreator } } {
  switch (choice.mode) {
    case "none":
      return editingHadLink ? { meetingUrl: null } : {};
    case "keep":
      return {};
    case "link":
      return { meetingUrl: choice.url.trim() || null };
    default:
      return { meeting: { create: choice.mode } };
  }
}

/** Provider name from a link's host, for the label beside a kept link. */
export function videoCallProviderLabel(url: string | null | undefined): string {
  if (!url) return "Video call";
  let host = "";
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return "Video call";
  }
  if (host === "meet.google.com") return "Google Meet";
  if (host === "zoom.us" || host.endsWith(".zoom.us")) return "Zoom";
  if (host === "teams.microsoft.com" || host === "teams.live.com") return "Microsoft Teams";
  if (host.endsWith(".webex.com")) return "Webex";
  return "Video call";
}
