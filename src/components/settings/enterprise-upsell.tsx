import { Check, Clock, ExternalLink, KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ENTERPRISE_CONTACT_URL, ENTERPRISE_FEATURES } from "@/lib/enterprise";

/**
 * What a non-Enterprise school sees where API keys would be.
 *
 * The tab is hidden from the rail, so nobody arrives here by browsing, they arrive
 * from a bookmark, a deep link, or the API documentation telling them where the
 * screen is. Answering that with "unknown section" would be the worst version of
 * this: they went looking for a feature we sell and got a dead end. So the pane
 * exists, says what the plan is, and gives them the one thing they can do about it.
 */
export function EnterpriseUpsell() {
  return (
    <Card>
      <CardHeader className="flex-row items-start gap-2.5">
        <span className="grid size-8 place-items-center rounded-md bg-primary/10 text-primary">
          <KeyRound className="size-4" />
        </span>
        <div>
          <CardTitle className="flex items-center gap-2">
            API keys
            <Badge variant="secondary">Enterprise</Badge>
          </CardTitle>
          <CardDescription>
            The AerScheduler API is part of the Enterprise plan. Enterprise is priced per
            account rather than per aircraft, so it starts with a conversation.
          </CardDescription>
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
        <ul className="grid gap-4 sm:grid-cols-2">
          {ENTERPRISE_FEATURES.map((feature) => (
            <li key={feature.title} className="flex items-start gap-2.5">
              {feature.soon ? (
                <Clock className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
              ) : (
                <Check className="mt-0.5 size-4 shrink-0 text-primary" />
              )}
              <div>
                <p className="flex items-center gap-2 text-sm font-medium text-foreground">
                  {feature.title}
                  {feature.soon && (
                    <Badge variant="outline" className="font-normal">
                      Coming soon
                    </Badge>
                  )}
                </p>
                <p className="mt-0.5 text-sm text-muted-foreground">{feature.body}</p>
              </div>
            </li>
          ))}
        </ul>

        <div className="flex flex-wrap items-center gap-3 border-t pt-5">
          <Button asChild>
            <a href={ENTERPRISE_CONTACT_URL} target="_blank" rel="noreferrer">
              Talk to us about Enterprise <ExternalLink className="size-4" />
            </a>
          </Button>
          <a
            href="https://www.aerscheduler.com/docs/api"
            target="_blank"
            rel="noreferrer"
            className="text-sm text-muted-foreground underline underline-offset-2 hover:text-foreground"
          >
            Read the API documentation
          </a>
        </div>
      </CardContent>
    </Card>
  );
}
