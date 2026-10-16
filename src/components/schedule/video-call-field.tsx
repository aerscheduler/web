import { useEffect, useRef, useState, type ReactNode } from "react";
import { ExternalLink, Loader2, Video } from "lucide-react";
import { toast } from "sonner";
import { GoogleMeetLogo, ZoomLogo } from "@/components/brand-logos";
import { DocsHint } from "@/components/docs-hint";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useConnectGoogleCalendar, useMeetingOptions, useZoomAuthorizeUrl } from "@/features/queries";
import { ApiError } from "@/lib/api";
import { preloadGoogle, requestGoogleCalendarCode } from "@/lib/google";
import { ZOOM_CONNECT_CHANNEL, type ZoomConnectMessage } from "@/lib/zoom-connect";
import type { MeetingCreator } from "@/types/api";
import { NO_VIDEO_CALL, videoCallProviderLabel, type VideoCallChoice } from "@/components/schedule/video-call";

/**
 * "Video call" on a booking: none, or a Google Meet or Zoom meeting made on the instructor's
 * account when they are connected, else the booker's. There is deliberately no "paste a link":
 * a call is one of the integrations we support, as in a calendar app, so every link on a
 * booking is one we made and can trust.
 *
 * Picking a provider nobody on the booking has connected connects the booker's account right
 * here (Google's consent popup, or Zoom's in a small window) and then picks it, so the form,
 * and everything typed into it, stays put. Zoom is left out until AerScheduler's Zoom app is live.
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
  const connectGoogle = useConnectGoogleCalendar();
  const zoomUrl = useZoomAuthorizeUrl();
  const [connecting, setConnecting] = useState<MeetingCreator | null>(null);
  const google = options.data?.googleMeet.connected ?? false;
  const zoom = options.data?.zoom;
  const host = value.mode === "zoom" ? zoom?.host : value.mode === "google_meet" ? options.data?.googleMeet.host : null;
  const hostAccount = host?.who === "instructor" && host.name ? `${host.name}'s` : "your";
  const selectValue = value.mode === "keep" ? "keep" : value.mode;

  //The latest onChange, for the Zoom window's message, which arrives long after the click.
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const refetch = options.refetch;

  useEffect(() => {
    if (!google) preloadGoogle();
  }, [google]);

  //Zoom's window lands on the callback page, which connects the account and says so here.
  useEffect(() => {
    if (typeof BroadcastChannel === "undefined") return;
    const channel = new BroadcastChannel(ZOOM_CONNECT_CHANNEL);
    channel.onmessage = (e: MessageEvent<ZoomConnectMessage>) => {
      setConnecting((c) => (c === "zoom" ? null : c));
      if (!e.data?.connected) return;
      void refetch().then(() => onChangeRef.current({ mode: "zoom" }));
    };
    return () => channel.close();
  }, [refetch]);

  async function connectGoogleThenPick() {
    setConnecting("google_meet");
    try {
      const code = await requestGoogleCalendarCode();
      await connectGoogle.mutateAsync(code);
      await refetch();
      onChange({ mode: "google_meet" });
      toast.success("Google connected. A Google Meet is made when you save.");
    } catch (err) {
      toast.error(
        err instanceof ApiError || err instanceof Error ? err.message : "Couldn't connect Google. Try again."
      );
    } finally {
      setConnecting(null);
    }
  }

  function connectZoomThenPick() {
    //Opened inside the click, or the browser blocks it; Zoom's address is filled in after.
    const popup = window.open("", "aerscheduler-zoom", "popup,width=520,height=720");
    if (!popup) {
      toast.error("Your browser blocked the Zoom window. Allow pop-ups for this site and pick Zoom again.");
      return;
    }
    setConnecting("zoom");
    zoomUrl
      .mutateAsync()
      .then(({ url }) => {
        popup.location.href = url;
      })
      .catch((err) => {
        popup.close();
        setConnecting(null);
        toast.error(err instanceof ApiError ? err.message : "Couldn't reach Zoom. Try again.");
      });
  }

  function onPick(v: string) {
    if (v === "keep") return;
    if (v === "none") return onChange(NO_VIDEO_CALL);
    if (v === "google_meet" && !google) return void connectGoogleThenPick();
    if (v === "zoom" && !zoom?.connected) return connectZoomThenPick();
    onChange({ mode: v as MeetingCreator });
  }

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1.5">
        <Label htmlFor="res-video-call" className="flex items-center gap-1.5">
          <Video className="size-3.5 text-muted-foreground" aria-hidden />
          Video call
        </Label>
        <DocsHint topic="video-call" />
      </div>
      <Select value={selectValue} onValueChange={onPick} disabled={connecting !== null}>
        <SelectTrigger id="res-video-call" className="w-full" aria-invalid={invalid}>
          {connecting ? (
            <span className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="size-3.5 animate-spin" aria-hidden />
              {connecting === "zoom" ? "Connecting Zoom…" : "Connecting Google…"}
            </span>
          ) : (
            <SelectValue />
          )}
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="none">No video call</SelectItem>
          {value.mode === "keep" && (
            <SelectItem value="keep">
              <ProviderLabel url={value.url}>{videoCallProviderLabel(value.url)} (current call)</ProviderLabel>
            </SelectItem>
          )}
          <SelectItem
            value="google_meet"
            //The second line lines up with the name, past the logo.
            className="[&>span[aria-hidden]]:pl-6"
            description={google || !options.isSuccess ? undefined : "Connects Google first"}
          >
            <span className="inline-flex items-center gap-2">
              <GoogleMeetLogo />
              Add Google Meet
            </span>
          </SelectItem>
          {zoom?.available && (
            <SelectItem
              value="zoom"
              className="[&>span[aria-hidden]]:pl-6"
              description={zoom.connected ? undefined : "Connects Zoom first"}
            >
              <span className="inline-flex items-center gap-2">
                <ZoomLogo />
                Add Zoom meeting
              </span>
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
    </div>
  );
}

/** A call's label with its service's mark in front, when it is Meet or Zoom. */
function ProviderLabel({ url, children }: { url: string; children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-2">
      <ProviderMark url={url} />
      {children}
    </span>
  );
}

function ProviderMark({ url }: { url: string }) {
  const provider = videoCallProviderLabel(url);
  return provider === "Google Meet" ? <GoogleMeetLogo /> : provider === "Zoom" ? <ZoomLogo /> : null;
}

/** "Join Zoom" on a booking: opens the call in a new tab. */
export function JoinCallLink({ url }: { url: string }) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center gap-1.5 font-medium text-primary underline-offset-2 hover:underline"
    >
      <ProviderMark url={url} />
      Join {videoCallProviderLabel(url)}
      <ExternalLink className="size-3" aria-hidden />
    </a>
  );
}
