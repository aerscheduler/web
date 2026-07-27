import { formatDistanceToNow } from "date-fns";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AppNotification } from "@/types/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

export function NotificationItem({
  notification,
  onMarkRead,
  marking,
}: {
  notification: AppNotification;
  onMarkRead: (id: number) => void;
  marking?: boolean;
}) {
  const unread = notification.readAt == null;
  const title = notification.title ?? notification.message ?? "Notification";
  // `subtitle` first: that is the field the server actually sends. Without it every
  // notification rendered as a bare title — for an announcement that meant the whole
  // row read "Test Flight School" and nothing else, so a member could see they had a
  // notification but not what it said.
  const body =
    notification.subtitle ??
    notification.body ??
    (notification.title ? notification.message ?? null : null);
  const when = notification.createdAt
    ? formatDistanceToNow(new Date(notification.createdAt), { addSuffix: true })
    : null;

  return (
    <Card
      className={cn(
        "flex items-start gap-3 p-4 transition-colors",
        unread && "border-primary/30 bg-primary/5",
        unread && "cursor-pointer hover:bg-primary/10"
      )}
      onClick={unread && !marking ? () => onMarkRead(notification.id) : undefined}
    >
      <span
        className={cn(
          "mt-1.5 size-2 shrink-0 rounded-full",
          unread ? "bg-primary" : "bg-transparent"
        )}
        aria-hidden
      />
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <span className={cn("font-medium", !unread && "text-muted-foreground")}>{title}</span>
          {when && <span className="text-xs text-muted-foreground">{when}</span>}
        </div>
        {body && <p className="text-sm text-muted-foreground">{body}</p>}
      </div>
      {unread && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="size-8 shrink-0"
              aria-label="Mark as read"
              disabled={marking}
              onClick={(e) => {
                e.stopPropagation();
                onMarkRead(notification.id);
              }}
            >
              <Check className="size-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Mark as read</TooltipContent>
        </Tooltip>
      )}
    </Card>
  );
}
