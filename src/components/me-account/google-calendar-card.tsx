import * as React from "react";
import { CalendarClock, Check, Copy, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { DocsHint } from "@/components/docs-hint";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  useGoogleCalendarStatus,
  useGoogleCalendarList,
  useSelectGoogleCalendar,
  useConnectGoogleCalendar,
  useDisconnectGoogleCalendar,
  useCalendarFeed,
  useEnsureCalendarFeed,
  useRotateCalendarFeed,
} from "@/features/queries";
import { requestGoogleCalendarCode } from "@/lib/google";
import { ApiError } from "@/lib/api";

/**
 * Personal calendar connections. Google pushes events into the member's primary
 * calendar; the ICS URL covers Apple Calendar, Outlook, and anything else that
 * can subscribe to a feed.
 */
export function GoogleCalendarCard() {
  const status = useGoogleCalendarStatus();
  const connect = useConnectGoogleCalendar();
  const disconnect = useDisconnectGoogleCalendar();
  const feed = useCalendarFeed();
  const ensureFeed = useEnsureCalendarFeed();
  const rotateFeed = useRotateCalendarFeed();
  const [connecting, setConnecting] = React.useState(false);
  const connected = status.data?.connected === true;
  const calendars = useGoogleCalendarList(connected);
  const selectCalendar = useSelectGoogleCalendar();
  const calendarId = status.data?.calendarId ?? "primary";
  // A connection made before the calendar-list scope existed cannot list calendars.
  // That is a reconnect prompt, not an error.
  const needsReconnectForList =
    calendars.error instanceof ApiError && calendars.error.status === 403;
  const feedUrl = feed.data?.httpsUrl ?? ensureFeed.data?.httpsUrl ?? null;
  const webcalUrl = feed.data?.webcalUrl ?? ensureFeed.data?.webcalUrl ?? null;

  async function onConnect() {
    setConnecting(true);
    try {
      const code = await requestGoogleCalendarCode();
      await connect.mutateAsync(code);
      toast.success("Google Calendar connected");
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Couldn't connect Google Calendar"
      );
    } finally {
      setConnecting(false);
    }
  }

  async function onDisconnect() {
    try {
      await disconnect.mutateAsync();
      toast.success("Google Calendar disconnected");
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Couldn't disconnect Google Calendar"
      );
    }
  }

  async function onSelectCalendar(nextId: string) {
    if (nextId === calendarId) return;
    const summary = calendars.data?.find((c) => c.id === nextId)?.summary ?? null;
    try {
      await selectCalendar.mutateAsync({ calendarId: nextId, calendarSummary: summary });
      toast.success(
        summary
          ? `Reservations now sync to ${summary}`
          : "Calendar updated"
      );
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Couldn't change your calendar"
      );
    }
  }

  async function onCreateFeed() {
    try {
      await ensureFeed.mutateAsync();
      toast.success("Subscription link ready");
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Couldn't create calendar feed"
      );
    }
  }

  async function onRotateFeed() {
    try {
      await rotateFeed.mutateAsync();
      toast.success("New link created. Update any calendars that used the old one.");
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Couldn't regenerate the link"
      );
    }
  }

  async function copyUrl(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Copied");
    } catch {
      toast.error("Couldn't copy");
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex-row items-start gap-3">
          <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground">
            <CalendarClock className="size-4" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <CardTitle>Google Calendar</CardTitle>
              <DocsHint topic="personal-calendar-sync" />
              {connected ? (
                <Badge variant="success" className="gap-1">
                  <Check className="size-3" /> Connected
                </Badge>
              ) : (
                <Badge variant="outline">Not connected</Badge>
              )}
            </div>
            <CardDescription className="mt-1">
              Publish your reservations to your own Google Calendar, with the aircraft,
              airport location, and who is on the booking. Existing upcoming flights
              are added when you connect.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {connected && (
            <div className="space-y-2">
              <div className="text-sm font-medium">Sync to this calendar</div>
              {needsReconnectForList ? (
                <p className="text-sm text-muted-foreground">
                  Reconnect below to choose a calendar. Your connection was made before
                  AerScheduler could read your calendar list, so flights are going to your
                  default calendar for now.
                </p>
              ) : calendars.isLoading ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="size-4 animate-spin" />
                  Loading your calendars
                </div>
              ) : calendars.error ? (
                <p className="text-sm text-muted-foreground">
                  Couldn&apos;t load your calendars. Flights are going to your default
                  calendar.
                </p>
              ) : (
                <>
                  <Select
                    value={calendarId}
                    onValueChange={(next) => void onSelectCalendar(next)}
                    disabled={selectCalendar.isPending}
                  >
                    <SelectTrigger className="sm:max-w-sm">
                      <SelectValue
                        placeholder={status.data?.calendarSummary ?? "Default calendar"}
                      />
                    </SelectTrigger>
                    <SelectContent>
                      {(calendars.data ?? []).map((cal) => (
                        <SelectItem key={cal.id} value={cal.id}>
                          {cal.summary}
                          {cal.primary ? " (default)" : ""}
                        </SelectItem>
                      ))}
                      {/* Keep the stored value selectable even if Google no longer
                          lists it, so the trigger never renders blank. */}
                      {calendarId === "primary" &&
                      !(calendars.data ?? []).some((c) => c.id === "primary") ? (
                        <SelectItem value="primary">Default calendar</SelectItem>
                      ) : null}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Changing this moves your upcoming flights off the old calendar and
                    onto the new one.
                  </p>
                </>
              )}
            </div>
          )}
          <div className="flex flex-wrap gap-2">
          <Button
            variant={connected ? "outline" : "default"}
            size="sm"
            onClick={() => void onConnect()}
            disabled={connecting || status.isLoading || disconnect.isPending}
          >
            {connecting && <Loader2 className="size-4 animate-spin" />}
            {connected ? "Reconnect" : "Connect Google Calendar"}
          </Button>
          {connected && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => void onDisconnect()}
              disabled={disconnect.isPending}
            >
              {disconnect.isPending && <Loader2 className="size-4 animate-spin" />}
              Disconnect
            </Button>
          )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-start gap-3">
          <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground">
            <CalendarClock className="size-4" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <CardTitle>Apple Calendar & Outlook</CardTitle>
              <DocsHint topic="personal-calendar-sync" />
            </div>
            <CardDescription className="mt-1">
              Subscribe with a private link. Works in Apple Calendar, Outlook, and
              most other calendar apps. Anyone with the link can see your flights,
              so regenerate it if it leaks.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {!feedUrl ? (
            <Button
              size="sm"
              onClick={() => void onCreateFeed()}
              disabled={ensureFeed.isPending}
            >
              {ensureFeed.isPending && <Loader2 className="size-4 animate-spin" />}
              Create subscription link
            </Button>
          ) : (
            <>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <Input readOnly value={feedUrl} className="font-mono text-xs" />
                <div className="flex shrink-0 gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => void copyUrl(feedUrl)}
                  >
                    <Copy className="size-4" />
                    Copy
                  </Button>
                  {webcalUrl && (
                    <Button type="button" variant="outline" size="sm" asChild>
                      <a href={webcalUrl}>Open</a>
                    </Button>
                  )}
                </div>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => void onRotateFeed()}
                disabled={rotateFeed.isPending}
              >
                {rotateFeed.isPending ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <RefreshCw className="size-4" />
                )}
                Regenerate link
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
