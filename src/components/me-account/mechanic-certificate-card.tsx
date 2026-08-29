import * as React from "react";
import { Loader2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth";
import { useUpdateMechanicCertificate } from "@/features/queries";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const TYPES = [
  { value: "A&P", label: "A&P (Airframe and Powerplant)" },
  { value: "IA", label: "IA (Inspection Authorization)" },
  { value: "Repair station", label: "Repair station" },
];

/**
 * Your FAA certificate, stated once.
 *
 * Signing an inspection off writes a permanent compliance record, and 14 CFR 91.417 wants
 * the certificate of whoever certified the work. Asking for six to eight exact characters
 * at every single signature, on a phone, at an aircraft, is how a compliance log fills up
 * with blanks and typos, which is the failure the log exists to prevent. So it is stated
 * here and prefilled from then on.
 *
 * ONLY EVER A DEFAULT. The record snapshots what was actually typed at signature, because an
 * outside IA signing an annual has no account here at all. Changing this does not alter a
 * record already signed, and it should not.
 */
export function MechanicCertificateCard() {
  const { user, rehydrate } = useAuth();
  //The server scopes orgUsers to the active school, so the first entry is this membership.
  const membership = user?.orgUsers?.[0];
  const update = useUpdateMechanicCertificate();

  const savedNumber = membership?.mechanicCertificateNumber ?? "";
  const savedType = membership?.mechanicCertificateType ?? "";

  const [number, setNumber] = React.useState(savedNumber);
  const [type, setType] = React.useState(savedType);

  React.useEffect(() => {
    setNumber(savedNumber);
    setType(savedType);
  }, [savedNumber, savedType]);

  const dirty = number.trim() !== savedNumber || type !== savedType;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    try {
      await update.mutateAsync({
        mechanicCertificateNumber: number.trim(),
        mechanicCertificateType: type,
      });
      //Re-read the session, or the sign-off form keeps prefilling the old value until the
      //next sign-in and the save looks like it did nothing.
      await rehydrate?.();
      toast.success("Certificate saved.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't save that.");
    }
  }

  return (
    <Card>
      <form onSubmit={submit}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="size-4 text-muted-foreground" />
            Mechanic certificate
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Filled in for you when you sign an inspection off, so you don&rsquo;t type it
            every time. Only you and whoever reads the record see it.
          </p>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="mech-cert-number">Certificate number</Label>
            <Input
              id="mech-cert-number"
              value={number}
              onChange={(e) => setNumber(e.target.value)}
              maxLength={32}
              autoCapitalize="characters"
              autoCorrect="off"
              spellCheck={false}
            />
            <p className="text-xs text-muted-foreground">
              Leave it blank to remove it.
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="mech-cert-type">Type</Label>
            <Select value={type || "none"} onValueChange={(v) => setType(v === "none" ? "" : v)}>
              <SelectTrigger id="mech-cert-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Not set</SelectItem>
                {TYPES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
        <CardFooter className="justify-end">
          <Button type="submit" disabled={!dirty || update.isPending}>
            {update.isPending && <Loader2 className="size-4 animate-spin" />}
            Save certificate
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}
