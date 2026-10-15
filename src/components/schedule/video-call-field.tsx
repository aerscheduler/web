import { Link } from "@tanstack/react-router";
import { ExternalLink, Video } from "lucide-react";
import { DocsHint } from "@/components/docs-hint";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useMeetingOptions } from "@/features/queries";
import type { MeetingCreator } from "@/types/api";
import { NO_VIDEO_CALL, videoCallProviderLabel, type VideoCallChoice } from "@/components/schedule/video-call";

/**
 * "Video call" on a booking: none, or a Google Meet or Zoom meeting made on the booker's own
 * account. There is deliberately no "paste a link": a call is one of the integrations we
 * support, as in a calendar app, so every link on a booking is one we made and can trust.
 *
 * Making one needs that account connected (Profile & account, Calendar). An option that can't
 * work is shown greyed with the reason rather than hidden, so people learn it exists and
 * where to switch it on; Zoom is left out entirely until AerScheduler's Zoom app is live.
 */
export function VideoCallField({
  value,
  onChange,
  invalid,
  instructorOrgUserId,
}: {
  value: VideoCallChoice;
  onChange: (next: VideoCallChoice) => void;
  invalid?: boolean;
  /** The booking's instructor: the meeting is hosted on their account when they are connected. */
  instructorOrgUserId?: number | null;
}) {
  const options = useMeetingOptions(instructorOrgUserId);
  const google = options.data?.googleMeet.connected ?? false;
  const zoom = options.data?.zoom;
  const host = value.mode === "zoom" ? zoom?.host : value.mode === "google_meet" ? options.data?.googleMeet.host : null;
  const hostAccount = host?.who === "instructor" && host.name ? `${host.name}'s` : "your";

  const selectValue = value.mode === "keep" ? "keep" : value.mode;

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1.5">
        <Label htmlFor="res-video-call" className="flex items-center gap-1.5">
          <Video className="size-3.5 text-muted-foreground" aria-hidden />
          Video call
        </Label>
        <DocsHint topic="video-call" />
      </div>
      <Select
        value={selectValue}
        onValueChange={(v) => {
          if (v === "keep") return;
          onChange(v === "none" ? NO_VIDEO_CALL : { mode: v as MeetingCreator });
        }}
      >
        <SelectTrigger id="res-video-call" className="w-full" aria-invalid={invalid}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="none">No video call</SelectItem>
          {value.mode === "keep" && <SelectItem value="keep">{videoCallProviderLabel(value.url)} (current call)</SelectItem>}
          <SelectItem value="google_meet" disabled={!google}>
            {google ? "Add Google Meet" : "Add Google Meet (connect Google Calendar first)"}
          </SelectItem>
          {zoom?.available && (
            <SelectItem value="zoom" disabled={!zoom.connected}>
              {zoom.connected ? "Add Zoom meeting" : "Add Zoom meeting (connect Zoom first)"}
            </SelectItem>
          )}
        </SelectContent>
      </Select>

      {value.mode === "keep" && (
        <a
          href={value.url}
          target="_blank"
          rel="noreferrer"
          className="block truncate text-xs text-primary underline-offset-2 hover:underline"
        >
          {value.url}
        </a>
      )}
      {(value.mode === "google_meet" || value.mode === "zoom") && (
        <p className="text-xs text-muted-foreground">
          The meeting is made on {hostAccount} {value.mode === "zoom" ? "Zoom" : "Google"} account when you save, and
          everyone on the booking can join it.
        </p>
      )}
      {!google && !zoom?.connected && value.mode === "none" && options.isSuccess && (
        <p className="text-xs text-muted-foreground">
          To add a call, you or the lesson's instructor connect Google Calendar (or Zoom) in{" "}
          <Link
            to="/me/profile"
            search={{ tab: "calendar" }}
            className="text-primary underline-offset-2 hover:underline"
          >
            Profile &amp; account, Calendar
          </Link>
          .
        </p>
      )}
    </div>
  );
}

/** "Join Zoom" on a booking: opens the call in a new tab. */
export function JoinCallLink({ url }: { url: string }) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center gap-1 font-medium text-primary underline-offset-2 hover:underline"
    >
      Join {videoCallProviderLabel(url)}
      <ExternalLink className="size-3" aria-hidden />
    </a>
  );
}
