import * as React from "react";
import { CalendarClock, Check, Loader2 } from "lucide-react";
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
import {
  useGoogleCalendarStatus,
  useConnectGoogleCalendar,
} from "@/features/queries";
import { requestGoogleCalendarCode } from "@/lib/google";

/**
 * Personal Google Calendar connection. Publishes the signed-in member's own
 * reservations to their Google Calendar. Per-user (not org-level), so it lives
 * on the profile, not org settings.
 */
export function GoogleCalendarCard() {
  const status = useGoogleCalendarStatus();
  const connect = useConnectGoogleCalendar();
  const [connecting, setConnecting] = React.useState(false);
  const connected = status.data === true;

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

  return (
    <Card>
      <CardHeader className="flex-row items-start gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground">
          <CalendarClock className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <CardTitle>Google Calendar</CardTitle>
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
            airport location, and who is on the booking.
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent>
        <Button
          variant={connected ? "outline" : "default"}
          size="sm"
          onClick={() => void onConnect()}
          disabled={connecting || status.isLoading}
        >
          {connecting && <Loader2 className="size-4 animate-spin" />}
          {connected ? "Reconnect" : "Connect Google Calendar"}
        </Button>
      </CardContent>
    </Card>
  );
}
