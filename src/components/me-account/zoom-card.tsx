import { Check, Loader2, Video } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useDisconnectZoom, useZoomAuthorizeUrl, useZoomStatus } from "@/features/queries";
import { ApiError } from "@/lib/api";

/**
 * Zoom, so "Add Zoom meeting" on a booking can make the meeting on the member's own Zoom
 * account. Renders nothing until AerScheduler's Zoom app is switched on, so nobody meets a
 * Connect button that cannot work. A pasted Zoom link works on any booking regardless.
 */
export function ZoomCard() {
  const status = useZoomStatus();
  const authorize = useZoomAuthorizeUrl();
  const disconnect = useDisconnectZoom();

  if (!status.data?.available) return null;
  const connected = status.data.connected;

  async function onConnect() {
    try {
      const { url } = await authorize.mutateAsync();
      window.location.assign(url);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Couldn't start connecting Zoom");
    }
  }

  async function onDisconnect() {
    try {
      await disconnect.mutateAsync();
      toast.success("Zoom disconnected");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Couldn't disconnect Zoom");
    }
  }

  return (
    <Card>
      <CardHeader className="flex-row items-start gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground">
          <Video className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <CardTitle>Zoom</CardTitle>
            {connected ? (
              <Badge variant="success" className="gap-1">
                <Check className="size-3" /> Connected
              </Badge>
            ) : (
              <Badge variant="outline">Not connected</Badge>
            )}
          </div>
          <CardDescription className="mt-1">
            Add a Zoom meeting to a booking with one choice, made on your Zoom account. Everyone on
            the booking sees the link.
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {connected ? (status.data.email ? `Connected as ${status.data.email}.` : "Connected.") : "Not connected yet."}
        </p>
        {connected ? (
          <Button variant="outline" size="sm" onClick={() => void onDisconnect()} disabled={disconnect.isPending}>
            {disconnect.isPending && <Loader2 className="size-4 animate-spin" />}
            Disconnect
          </Button>
        ) : (
          <Button size="sm" onClick={() => void onConnect()} disabled={authorize.isPending}>
            {authorize.isPending && <Loader2 className="size-4 animate-spin" />}
            Connect Zoom
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
