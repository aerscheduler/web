import { BookOpenCheck } from "lucide-react";
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

/**
 * Org-level integrations. Personal integrations (e.g. Google Calendar, which is
 * per-user) live on the member's own Profile, not here — Settings is admin-only.
 */
export function IntegrationsTab() {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Card className="flex flex-col">
        <CardHeader className="flex-row items-start gap-3">
          <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground">
            <BookOpenCheck className="size-4" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <CardTitle>QuickBooks</CardTitle>
              <Badge variant="outline">Not connected</Badge>
            </div>
            <CardDescription className="mt-1">
              Sync invoices and payments to your accounting ledger.
            </CardDescription>
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
                  aria-label="Connect QuickBooks (coming soon)"
                >
                  Connect
                </Button>
              </span>
            </TooltipTrigger>
            <TooltipContent>Coming soon</TooltipContent>
          </Tooltip>
        </CardContent>
      </Card>
    </div>
  );
}
