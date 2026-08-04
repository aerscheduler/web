import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Loader2, Phone } from "lucide-react";
import { toast } from "sonner";
import { ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useContactDetails, useUpdateContactDetails } from "@/features/queries";
import { formatPhone, formatPhoneAsTyped, looksValid } from "@/lib/phone";
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
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Your own phone numbers and date of birth.
 *
 * Separate from `ProfileCard` (name and email) rather than folded into it, because these
 * are the fields the school needs in order to reach you and the ones it will text when
 * SMS notifications ship — worth their own heading rather than being three more inputs
 * under "Profile".
 *
 * Numbers are reformatted as you type and checked before submit, but the SERVER decides
 * what is valid; this is a hint that saves a round trip, not the rule. Anything it
 * rejects comes back as a message and is shown as-is.
 */
export function ContactDetailsCard() {
  const { user } = useAuth();
  const userId = user?.id ?? null;

  const q = useContactDetails(userId);
  const update = useUpdateContactDetails(userId);

  const [phone, setPhone] = useState("");
  const [homePhone, setHomePhone] = useState("");
  const [workPhone, setWorkPhone] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [preferredName, setPreferredName] = useState("");

  const details = q.data;

  /**
   * What the server holds, rendered the way a person writes it.
   *
   * The server stores and returns E.164, so seeding the inputs with the raw value put
   * "+13035550142" in the box — technically correct, unreadable, and the exact thing
   * this whole module exists to avoid. Formatting on the way IN means you edit
   * "(303) 555-1234"; the server re-normalizes on the way out, so the round trip is
   * lossless and the stored value is still canonical.
   *
   * These doubles as the baseline for `dirty` — comparing a formatted input against a
   * raw E.164 original would mark the form dirty the moment it loaded.
   */
  const initial = useMemo(
    () => ({
      phone: formatPhone(details?.phone, details?.phoneCountry),
      homePhone: formatPhone(details?.homePhone),
      workPhone: formatPhone(details?.workPhone),
      dateOfBirth: details?.dateOfBirth?.slice(0, 10) ?? "",
      preferredName: details?.preferredName ?? "",
    }),
    [details]
  );

  // Re-seeded whenever the server's copy changes, which includes after a save — so the
  // inputs settle on the normalized number the server actually stored rather than
  // whatever was typed. That is the feedback that shows the field worked.
  useEffect(() => {
    setPhone(initial.phone);
    setHomePhone(initial.homePhone);
    setWorkPhone(initial.workPhone);
    setDateOfBirth(initial.dateOfBirth);
    setPreferredName(initial.preferredName);
  }, [initial]);

  const phoneOk = looksValid(phone);
  const homeOk = looksValid(homePhone);
  const workOk = looksValid(workPhone);
  const valid = phoneOk && homeOk && workOk;

  const dirty =
    phone !== initial.phone ||
    homePhone !== initial.homePhone ||
    workPhone !== initial.workPhone ||
    dateOfBirth !== initial.dateOfBirth ||
    preferredName !== initial.preferredName;

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!dirty || !valid) return;

    // Empty string, not undefined, for a cleared field — the server reads `undefined` as
    // "leave it alone" and `""` as "clear it", and clearing has to be possible.
    update.mutate(
      {
        phone: phone.trim(),
        homePhone: homePhone.trim(),
        workPhone: workPhone.trim(),
        dateOfBirth: dateOfBirth.trim(),
        preferredName: preferredName.trim(),
      },
      {
        onSuccess: () => toast.success("Contact details updated"),
        onError: (err) =>
          toast.error(err instanceof ApiError ? err.message : "Couldn't save changes"),
      }
    );
  }

  return (
    <Card>
      <form onSubmit={handleSubmit}>
        <CardHeader className="flex-row items-center gap-2.5">
          <span className="grid size-8 place-items-center rounded-md bg-primary/10 text-primary">
            <Phone className="size-4" />
          </span>
          <div>
            <CardTitle>Contact details</CardTitle>
            <CardDescription>
              How your school reaches you. Staff can see these; other members can&apos;t.
            </CardDescription>
          </div>
        </CardHeader>

        <CardContent className="space-y-5">
          {q.isPending ? (
            <div className="space-y-3">
              <Skeleton className="h-9 w-full" />
              <Skeleton className="h-9 w-full" />
            </div>
          ) : (
            <>
              <PhoneField
                id="contact-phone"
                label="Mobile phone"
                hint="Used for text notifications when we turn them on."
                value={phone}
                onChange={setPhone}
                valid={phoneOk}
              />
              <div className="grid gap-5 sm:grid-cols-2">
                <PhoneField
                  id="contact-home"
                  label="Home phone"
                  value={homePhone}
                  onChange={setHomePhone}
                  valid={homeOk}
                />
                <PhoneField
                  id="contact-work"
                  label="Work phone"
                  value={workPhone}
                  onChange={setWorkPhone}
                  valid={workOk}
                />
              </div>

              <div className="grid gap-5 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="contact-dob">Date of birth</Label>
                  <Input
                    id="contact-dob"
                    type="date"
                    value={dateOfBirth}
                    // Stops the native picker offering next year, which the server
                    // would reject anyway.
                    max={new Date().toISOString().slice(0, 10)}
                    onChange={(e) => setDateOfBirth(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="contact-preferred">Preferred name</Label>
                  <Input
                    id="contact-preferred"
                    value={preferredName}
                    onChange={(e) => setPreferredName(e.target.value)}
                    placeholder="What you go by"
                    autoComplete="nickname"
                  />
                </div>
              </div>
            </>
          )}
        </CardContent>

        <CardFooter className="justify-end">
          <Button type="submit" disabled={!dirty || !valid || update.isPending || q.isPending}>
            {update.isPending && <Loader2 className="size-4 animate-spin" />}
            Save changes
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}

/**
 * A phone input that reformats as you type.
 *
 * `type="tel"` rather than `text` so a phone brings up the numeric keypad; the
 * reformatting is what makes a long string of digits readable back.
 */
function PhoneField({
  id,
  label,
  hint,
  value,
  onChange,
  valid,
}: {
  id: string;
  label: string;
  hint?: string;
  value: string;
  onChange: (v: string) => void;
  valid: boolean;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type="tel"
        inputMode="tel"
        autoComplete="tel"
        value={value}
        onChange={(e) => onChange(formatPhoneAsTyped(e.target.value))}
        placeholder="(303) 555-1234"
        aria-invalid={!valid}
      />
      {!valid ? (
        <p className="text-xs text-destructive">
          That doesn&apos;t look like a valid number. Include the country code for a
          number outside the US.
        </p>
      ) : hint ? (
        <p className="text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}
