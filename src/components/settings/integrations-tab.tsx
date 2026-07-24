import type { LucideIcon } from "lucide-react";
import { BookOpenCheck, CalendarClock } from "lucide-react";
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

interface Integration {
  key: string;
  name: string;
  description: string;
  icon: LucideIcon;
}

const INTEGRATIONS: Integration[] = [
  {
    key: "quickbooks",
    name: "QuickBooks",
    description: "Sync invoices and payments to your accounting ledger.",
    icon: BookOpenCheck,
  },
  {
    key: "google-calendar",
    name: "Google Calendar",
    description: "Publish reservations to instructor and student calendars.",
    icon: CalendarClock,
  },
];

export function IntegrationsTab() {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {INTEGRATIONS.map((it) => (
        <IntegrationCard key={it.key} integration={it} />
      ))}
    </div>
  );
}

function IntegrationCard({ integration }: { integration: Integration }) {
  const Icon = integration.icon;
  return (
    <Card className="flex flex-col">
      <CardHeader className="flex-row items-start gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground">
          <Icon className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <CardTitle>{integration.name}</CardTitle>
            <Badge variant="outline">Not connected</Badge>
          </div>
          <CardDescription className="mt-1">{integration.description}</CardDescription>
        </div>
      </CardHeader>
      <CardContent className="mt-auto">
        <Tooltip>
          <TooltipTrigger asChild>
            <span tabIndex={0} className="inline-flex cursor-not-allowed">
              <Button variant="outline" size="sm" disabled aria-label={`Connect ${integration.name} (coming soon)`}>
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
