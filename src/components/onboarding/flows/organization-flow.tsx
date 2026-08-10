/**
 * Personalize the school, logo, contact details, time zone.
 *
 * These three are grouped because they share one outcome: what a member sees on an
 * invoice, an email, and the schedule. Settings → Organization has them spread across
 * three cards among things like the join code and the org type.
 *
 * The time zone is here rather than left for later on purpose: it is the setting that
 * silently breaks a schedule if nobody sets it, because times then render in each
 * person's own zone.
 */

import * as React from "react";
import { Building2, ImagePlus, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useUpdateOrganization, useUpdateOrgLogo, useUpdateOrganizationTimeZone } from "@/features/queries";
import { useAuth } from "@/lib/auth";
import { ApiError } from "@/lib/api";
import { COMMON_TIME_ZONES, allTimeZones } from "@/lib/timezone";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Combobox, type ComboOption } from "@/components/combobox";
import { FlowClose, FlowDone, FlowModal, FlowNav, type FlowProps } from "./flow-shell";

/** Same ordering as the settings card: the handful people actually pick, then the rest. */
function zoneOptions(): ComboOption[] {
  const common = COMMON_TIME_ZONES.map((z) => ({ value: z.value, label: z.label }));
  const seen = new Set(common.map((c) => c.value));
  return [
    ...common,
    ...allTimeZones()
      .filter((z) => !seen.has(z))
      .map((z) => ({ value: z, label: z.replace(/_/g, " ") })),
  ];
}

export function OrganizationFlow({ onClose }: FlowProps) {
  const { organization, rehydrate } = useAuth();
  const update = useUpdateOrganization();
  const uploadLogo = useUpdateOrgLogo();
  const updateZone = useUpdateOrganizationTimeZone();
  const options = React.useMemo(zoneOptions, []);
  const fileRef = React.useRef<HTMLInputElement>(null);

  const [done, setDone] = React.useState(false);
  const [name, setName] = React.useState(organization?.name ?? "");
  const [phone, setPhone] = React.useState(organization?.details?.phone ?? "");
  const [email, setEmail] = React.useState(organization?.details?.email ?? "");
  const [zone, setZone] = React.useState(organization?.timeZone ?? "");
  const [logo, setLogo] = React.useState(organization?.profileImage ?? null);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) return toast.error("Pick an image file (PNG, JPG, or SVG).");
    if (file.size > 5 * 1024 * 1024) return toast.error("That image is over 5 MB, pick a smaller one.");
    try {
      const url = await uploadLogo.mutateAsync(file);
      setLogo(typeof url === "string" ? url : organization?.profileImage ?? null);
      await rehydrate();
      toast.success("Logo updated");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Couldn't upload the logo");
    }
  }

  async function save() {
    try {
      await update.mutateAsync({
        name: name.trim() || organization?.name,
        details: { phone: phone.trim(), email: email.trim() },
      });
      // Separate endpoint, it validates the zone rather than trusting it.
      if (zone !== (organization?.timeZone ?? "")) {
        await updateZone.mutateAsync(zone || null);
      }
      await rehydrate();
      setDone(true);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Couldn't save your details");
    }
  }

  const busy = update.isPending || updateZone.isPending;

  return (
    <FlowModal
      open
      onOpenChange={(o) => !o && onClose()}
      title="Make it look like your operation"
      description="This is what shows up on invoices, emails, and your join page."
      size="lg"
      footer={
        done ? (
          <FlowClose onClose={onClose} />
        ) : (
          <FlowNav onNext={save} nextLabel="Save" busy={busy} onSkip={onClose} skipLabel="Cancel" />
        )
      }
    >
      {done ? (
        <FlowDone
          headline="Looking good."
          body="Your logo and details now appear on everything you send out."
        />
      ) : (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <span className="grid size-14 shrink-0 place-items-center overflow-hidden rounded-xl border bg-muted">
              {logo ? (
                <img src={logo} alt="" className="size-full object-cover" />
              ) : (
                <Building2 className="size-5 text-muted-foreground" />
              )}
            </span>
            <div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => fileRef.current?.click()}
                disabled={uploadLogo.isPending}
              >
                {uploadLogo.isPending ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <ImagePlus className="size-4" />
                )}
                {logo ? "Replace logo" : "Upload logo"}
              </Button>
              <p className="mt-1 text-xs text-muted-foreground">PNG, JPG or SVG, under 5 MB.</p>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={onFile}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="of-name">Name</Label>
            <Input id="of-name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="of-phone">Phone</Label>
              <Input
                id="of-phone"
                inputMode="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="(303) 555-0134"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="of-email">Contact email</Label>
              <Input
                id="of-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="front-desk@example.com"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Time zone</Label>
            <Combobox
              options={options}
              value={zone}
              onChange={setZone}
              placeholder="Where you fly from"
              searchPlaceholder="Search time zones…"
              emptyText="No matching zone."
            />
            <p className="text-xs text-muted-foreground">
              The schedule shows times at your field, so a 9:00 AM lesson stays 9:00 AM for
              everyone, including anyone travelling.
            </p>
          </div>
        </div>
      )}
    </FlowModal>
  );
}
