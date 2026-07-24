import { useState, type FormEvent } from "react";
import { Building2, Check, Copy, KeyRound, Loader2, SlidersHorizontal } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth";
import { useUpdateOrganization } from "@/features/queries";
import type { Organization, OrganizationDetails } from "@/types/api";
import { ApiError } from "@/lib/api";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Field, ComingSoonToggle } from "@/components/settings/parts";

export function OrganizationTab() {
  const { organization, rehydrate } = useAuth();
  const update = useUpdateOrganization();

  if (!organization) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-sm text-muted-foreground">
          No active organization. Pick or join one to manage its settings.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1.6fr_1fr]">
      <OrganizationProfileCard
        organization={organization}
        saving={update.isPending}
        onSave={(patch) =>
          update.mutate(patch, {
            onSuccess: async () => {
              toast.success("Organization updated");
              await rehydrate();
            },
            onError: (err) =>
              toast.error(
                err instanceof ApiError ? err.message : "Couldn't save changes"
              ),
          })
        }
      />

      <div className="space-y-6">
        <IdentityCard organization={organization} />

        <Card>
          <CardHeader className="flex-row items-center gap-2.5">
            <span className="grid size-8 place-items-center rounded-md bg-primary/10 text-primary">
              <SlidersHorizontal className="size-4" />
            </span>
            <div>
              <CardTitle>Booking preferences</CardTitle>
              <CardDescription>Coming soon to the web console</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="divide-y divide-border">
            <ComingSoonToggle
              label="Instructors can override reservation prices"
              description="Let instructors adjust the rate when booking dual time."
            />
            <ComingSoonToggle
              label="Members can only book approved resources"
              description="Restrict bookings to aircraft a member is checked out on."
            />
            <ComingSoonToggle
              label="Private organization"
              description="Hide this school from the public directory."
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function OrganizationProfileCard({
  organization,
  saving,
  onSave,
}: {
  organization: Organization;
  saving: boolean;
  onSave: (patch: Partial<Organization> & Record<string, unknown>) => void;
}) {
  const initialName = organization.name ?? "";
  const initialPhone = organization.details?.phone ?? "";
  const initialEmail = organization.details?.email ?? "";

  const [name, setName] = useState(initialName);
  const [phone, setPhone] = useState(initialPhone);
  const [email, setEmail] = useState(initialEmail);

  const dirty =
    name.trim() !== initialName ||
    phone.trim() !== initialPhone ||
    email.trim() !== initialEmail;
  const valid = name.trim().length > 0;

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!dirty || !valid) return;
    const details = {
      phone: phone.trim() || null,
      email: email.trim() || null,
    } as OrganizationDetails;
    onSave({ name: name.trim(), details });
  }

  return (
    <Card>
      <form onSubmit={handleSubmit}>
        <CardHeader className="flex-row items-center gap-2.5">
          <span className="grid size-8 place-items-center rounded-md bg-primary/10 text-primary">
            <Building2 className="size-4" />
          </span>
          <div>
            <CardTitle>Organization profile</CardTitle>
            <CardDescription>Name and contact details for your school.</CardDescription>
          </div>
        </CardHeader>
        <CardContent className="space-y-5">
          <Field label="Name" htmlFor="org-name">
            <Input
              id="org-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Acme Flight Academy"
              aria-invalid={!valid}
              autoComplete="organization"
            />
            {!valid && (
              <p className="text-xs text-destructive">Name is required.</p>
            )}
          </Field>
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Phone" htmlFor="org-phone">
              <Input
                id="org-phone"
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="(555) 123-4567"
                autoComplete="tel"
              />
            </Field>
            <Field label="Email" htmlFor="org-email">
              <Input
                id="org-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="ops@example.com"
                autoComplete="email"
              />
            </Field>
          </div>
        </CardContent>
        <CardFooter className="justify-end gap-2">
          <Button type="submit" disabled={!dirty || !valid || saving}>
            {saving && <Loader2 className="size-4 animate-spin" />}
            Save changes
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}

function IdentityCard({ organization }: { organization: Organization }) {
  const [copied, setCopied] = useState(false);

  function copyCode() {
    if (!organization.code) return;
    void navigator.clipboard
      .writeText(organization.code)
      .then(() => {
        setCopied(true);
        toast.success("Join code copied");
        window.setTimeout(() => setCopied(false), 1500);
      })
      .catch(() => toast.error("Couldn't copy code"));
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Identity</CardTitle>
        <CardDescription>Read-only details managed by AerScheduler.</CardDescription>
      </CardHeader>
      <CardContent className="divide-y divide-border">
        <div className="flex items-center justify-between gap-4 py-3 first:pt-0">
          <span className="text-sm text-muted-foreground">Type</span>
          <Badge variant="secondary" className="capitalize">
            {organization.organizationType?.replace(/[_-]/g, " ") ?? "Flight school"}
          </Badge>
        </div>
        <div className="flex items-center justify-between gap-4 py-3 last:pb-0">
          <span className="text-sm text-muted-foreground">Join code</span>
          {organization.code ? (
            <span className="inline-flex items-center gap-1.5">
              <KeyRound className="size-3.5 text-muted-foreground" />
              <span className="font-mono text-sm font-medium tracking-wide">
                {organization.code}
              </span>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    aria-label="Copy join code"
                    onClick={copyCode}
                  >
                    {copied ? <Check className="size-3" /> : <Copy className="size-3" />}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{copied ? "Copied" : "Copy code"}</TooltipContent>
              </Tooltip>
            </span>
          ) : (
            <span className="text-sm font-medium">—</span>
          )}
        </div>
      </CardContent>
      <Separator />
      <CardContent className="pt-4">
        <p className="text-xs text-muted-foreground">
          Share the join code with instructors and students so they can join your
          organization from the mobile app.
        </p>
      </CardContent>
    </Card>
  );
}
