import * as React from "react";
import type { LucideIcon } from "lucide-react";
import { BookOpenCheck, CalendarClock, Check, Loader2 } from "lucide-react";
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
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  useGoogleCalendarStatus,
  useConnectGoogleCalendar,
} from "@/features/queries";
import { requestGoogleCalendarCode } from "@/lib/google";

export function IntegrationsTab() {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <GoogleCalendarCard />
      <ComingSoonCard
        name="QuickBooks"
        description="Sync invoices and payments to your accounting ledger."
        icon={BookOpenCheck}
      />
    </div>
  );
}

/** Real Google Calendar connect flow — the server exchanges the popup auth code
 *  for a refresh token and publishes reservations to the connected calendar. */
function GoogleCalendarCard() {
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
    <Card className="flex flex-col">
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
            Publish your reservations to your Google Calendar.
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent className="mt-auto">
        <Button
          variant={connected ? "outline" : "default"}
          size="sm"
          onClick={() => void onConnect()}
          disabled={connecting || status.isLoading}
        >
          {connecting && <Loader2 className="size-4 animate-spin" />}
          {connected ? "Reconnect" : "Connect"}
        </Button>
      </CardContent>
    </Card>
  );
}

function ComingSoonCard({
  name,
  description,
  icon: Icon,
}: {
  name: string;
  description: string;
  icon: LucideIcon;
}) {
  return (
    <Card className="flex flex-col">
      <CardHeader className="flex-row items-start gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground">
          <Icon className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <CardTitle>{name}</CardTitle>
            <Badge variant="outline">Not connected</Badge>
          </div>
          <CardDescription className="mt-1">{description}</CardDescription>
        </div>
      </CardHeader>
      <CardContent className="mt-auto">
        <Tooltip>
          <TooltipTrigger asChild>
            <span tabIndex={0} className="inline-flex cursor-not-allowed">
              <Button
                variant="outline"
                size="sm"
                disabled
                aria-label={`Connect ${name} (coming soon)`}
              >
                Connect
              </Button>
            </span>
          </TooltipTrigger>
          <TooltipContent>Coming soon</TooltipContent>
        </Tooltip>
      </CardContent>
    </Card>
  );
}
