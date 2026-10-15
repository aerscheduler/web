import { Link } from "@tanstack/react-router";
import { ExternalLink, Video } from "lucide-react";
import { DocsHint } from "@/components/docs-hint";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useMeetingOptions } from "@/features/queries";
import type { MeetingCreator } from "@/types/api";
import { NO_VIDEO_CALL, videoCallProviderLabel, type VideoCallChoice } from "@/components/schedule/video-call";

/**
 * "Video call" on a booking: none, make a Google Meet or Zoom meeting, or paste any link.
 *
 * Making one needs that account connected (Profile & account, Calendar). An option that can't
 * work is shown greyed with the reason rather than hidden, so people learn it exists and
 * where to switch it on; Zoom is left out entirely until AerScheduler's Zoom app is live.
 */
export function VideoCallField({
  value,
  onChange,
  invalid,
}: {
  value: VideoCallChoice;
  onChange: (next: VideoCallChoice) => void;
  invalid?: boolean;
}) {
  const options = useMeetingOptions();
  const google = options.data?.googleMeet.connected ?? false;
  const zoom = options.data?.zoom;

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
          if (v === "keep" && value.mode === "keep") return;
          if (v === "link") onChange({ mode: "link", url: value.mode === "keep" ? value.url : "" });
          else onChange(v === "none" ? NO_VIDEO_CALL : { mode: v as MeetingCreator });
        }}
      >
        <SelectTrigger id="res-video-call" className="w-full" aria-invalid={invalid}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="none">No video call</SelectItem>
          {value.mode === "keep" && <SelectItem value="keep">{videoCallProviderLabel(value.url)} (current link)</SelectItem>}
          <SelectItem value="google_meet" disabled={!google}>
            {google ? "Add Google Meet" : "Add Google Meet (connect Google Calendar first)"}
          </SelectItem>
          {zoom?.available && (
            <SelectItem value="zoom" disabled={!zoom.connected}>
              {zoom.connected ? "Add Zoom meeting" : "Add Zoom meeting (connect Zoom first)"}
            </SelectItem>
          )}
          <SelectItem value="link">Paste a link</SelectItem>
        </SelectContent>
      </Select>

      {value.mode === "link" && (
        <Input
          id="res-video-call-link"
          aria-label="Meeting link"
          aria-invalid={invalid}
          inputMode="url"
          autoComplete="off"
          placeholder="https://zoom.us/j/… or meet.google.com/…"
          value={value.url}
          maxLength={500}
          onChange={(e) => onChange({ mode: "link", url: e.target.value })}
        />
      )}
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
          The link is made on your {value.mode === "zoom" ? "Zoom" : "Google"} account when you save, and everyone on the
          booking sees it.
        </p>
      )}
      {!google && !zoom?.connected && value.mode === "none" && options.isSuccess && (
        <p className="text-xs text-muted-foreground">
          To make meetings from here, connect an account in{" "}
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
