import * as React from "react";
import { createFileRoute, redirect, useNavigate, Link } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  KeyRound,
  Loader2,
  PlaneTakeoff,
  Rocket,
  User as UserIcon,
  Users,
} from "lucide-react";
import { isAuthenticated, useAuth } from "@/lib/auth";
import {
  useCreateCurrencyType,
  useCreateLocation,
  useCreatePlane,
  useCreateRating,
  useCreateReservation,
  useInviteMember,
  useUpdateAvailability,
  useUpdateBilling,
  useUpdateOrganization,
} from "@/features/queries";
import { api, ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { MoneyInput } from "@/components/money-input";
import { LogoMark } from "@/components/logo";
import { toast } from "sonner";

export const Route = createFileRoute("/onboarding")({
  beforeLoad: () => {
    if (!isAuthenticated()) throw redirect({ to: "/login" });
  },
  component: Onboarding,
});

// ---------------------------------------------------------------- personas

type PersonaKey = "flight_school" | "flying_club" | "rental" | "solo_instructor";

const PERSONAS: {
  key: PersonaKey;
  icon: typeof PlaneTakeoff;
  title: string;
  blurb: string;
}[] = [
  { key: "flight_school", icon: PlaneTakeoff, title: "Flight school", blurb: "Students, instructors, a training fleet." },
  { key: "flying_club", icon: Users, title: "Flying club", blurb: "Members share aircraft and split the costs." },
  { key: "rental", icon: KeyRound, title: "Rental / FBO", blurb: "You rent aircraft to checked-out pilots." },
  { key: "solo_instructor", icon: UserIcon, title: "Independent instructor", blurb: "Just you (and maybe a club aircraft)." },
];

// Aircraft templates → prefill make/model/categoryClass + suggested wet rate (cents) + fuel (gal).
const AIRCRAFT_TEMPLATES: Record<
  string,
  { make: string; model: string; categoryClass: string; rate: number; fuel: number } | null
> = {
  "Cessna 172": { make: "Cessna", model: "172", categoryClass: "single-engine land", rate: 16500, fuel: 56 },
  "Cessna 152": { make: "Cessna", model: "152", categoryClass: "single-engine land", rate: 13500, fuel: 26 },
  "Piper PA-28": { make: "Piper", model: "PA-28", categoryClass: "single-engine land", rate: 15500, fuel: 50 },
  "Diamond DA40": { make: "Diamond", model: "DA40", categoryClass: "single-engine land", rate: 19500, fuel: 40 },
  "Cirrus SR20": { make: "Cirrus", model: "SR20", categoryClass: "single-engine land", rate: 22500, fuel: 56 },
  Other: null,
};

const DAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"] as const;

function apiErr(e: unknown): string {
  if (e instanceof ApiError) return e.message;
  if (e instanceof Error) return e.message;
  return "Something went wrong. Your entries are safe — try again.";
}

// ---------------------------------------------------------------- wizard

function Onboarding() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { user, organization, orgUserId, createOrganization } = useAuth();

  const createLocation = useCreateLocation();
  const createPlane = useCreatePlane();
  const createRating = useCreateRating();
  const updateBilling = useUpdateBilling();
  const createCurrencyType = useCreateCurrencyType();
  const updateAvailability = useUpdateAvailability();
  const inviteMember = useInviteMember();
  const createReservation = useCreateReservation();
  const updateOrg = useUpdateOrganization();

  const [step, setStep] = React.useState(0);
  const [busy, setBusy] = React.useState(false);

  // collected state
  const [persona, setPersona] = React.useState<PersonaKey | null>(null);
  const [orgName, setOrgName] = React.useState("");
  const [airport, setAirport] = React.useState("");
  const [locationId, setLocationId] = React.useState<number | null>(null);

  const [template, setTemplate] = React.useState<string>("Cessna 172");
  const [tail, setTail] = React.useState("");
  const [year, setYear] = React.useState(String(new Date().getFullYear()));
  const [hobbs, setHobbs] = React.useState("0");
  const [tach, setTach] = React.useState("0");
  const [rate, setRate] = React.useState<number>(16500);
  const [resourceId, setResourceId] = React.useState<number | null>(null);

  // persona-branch state
  const [ratingName, setRatingName] = React.useState("Private Pilot");
  const [instrRate, setInstrRate] = React.useState<number>(6500);
  const [groundUnpaid, setGroundUnpaid] = React.useState(true);
  const [checkoutName, setCheckoutName] = React.useState("Aircraft Checkout");
  const [availDays, setAvailDays] = React.useState<Set<string>>(
    new Set(["monday", "wednesday", "friday"])
  );
  const [availStart, setAvailStart] = React.useState("09:00");
  const [availEnd, setAvailEnd] = React.useState("17:00");

  const [inviteEmails, setInviteEmails] = React.useState("");
  const [inviteRole, setInviteRole] = React.useState<
    "instructor" | "student" | "renter" | "dispatcher" | "admin"
  >("instructor");

  const isSolo = persona === "solo_instructor";
  const STEPS = ["Persona", "Operation", "Aircraft", "Setup", "Team", "Booking"];

  function next() {
    setStep((s) => Math.min(s + 1, STEPS.length));
  }
  function back() {
    setStep((s) => Math.max(s - 1, 0));
  }

  async function guarded(fn: () => Promise<void>) {
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      toast.error(apiErr(e));
    } finally {
      setBusy(false);
    }
  }

  // Step 1 → create org (token swaps). The server also provisions a home-base
  // location as part of org creation — both details.address and location{name,address}
  // are REQUIRED by the create service (empty strings are accepted).
  async function submitOrg() {
    await guarded(async () => {
      const emptyAddr = {
        streetAddress1: "",
        streetAddress2: "",
        city: "",
        state: "",
        zipCode: "",
        country: "",
      };
      await createOrganization({
        name: orgName.trim(),
        organizationType: persona,
        details: { email: user?.email ?? "", phone: "", address: { ...emptyAddr } },
        location: { name: airport.trim() || orgName.trim(), address: { ...emptyAddr } },
      });
      // grab the home-base location id the create just made, for the aircraft step
      try {
        const locs = await api<{ id: number }[]>("/locations");
        if (locs[0]) setLocationId(locs[0].id);
      } catch {
        /* the aircraft step re-checks and can create one if needed */
      }
      toast.success(`${airport.trim() || "Home base"} is set as your home base.`);
      next();
    });
  }

  async function submitAircraft(skip = false) {
    if (skip) return next();
    await guarded(async () => {
      let locId = locationId;
      if (!locId) {
        const loc = await createLocation.mutateAsync({ name: airport.trim() || orgName.trim() });
        locId = loc.id;
        setLocationId(loc.id);
      }
      const tpl = AIRCRAFT_TEMPLATES[template];
      const res = await createPlane.mutateAsync({
        location: { id: locId },
        type: {
          plane: {
            tailNumber: tail.trim().toUpperCase(),
            make: tpl?.make,
            model: tpl?.model,
            year: year.trim(),
            categoryClass: tpl?.categoryClass ?? "single-engine land",
            tachTime: Math.round((Number(tach) || 0) * 10),
            hobbsTime: Math.round((Number(hobbs) || 0) * 10),
            fuelCapacity: tpl?.fuel ?? 50,
            fuelMeasurement: "gallons",
            cost: { wetRate: rate, billByHobbsTime: true },
          },
        },
      });
      setResourceId(res.id);
      toast.success(`${tail.trim().toUpperCase()} is on the schedule.`);
      next();
    });
  }

  async function submitPersonaStep(skip = false) {
    if (skip) return next();
    await guarded(async () => {
      if (persona === "flight_school" || isSolo) {
        await createRating.mutateAsync({
          name: ratingName.trim() || "Flight Instruction",
          defaultInstructorRate: instrRate,
          anyInstructorCanTeach: true,
        });
      }
      if (persona === "flying_club") {
        await updateBilling.mutateAsync({
          enabled: true,
          defaultInstructorRate: instrRate,
          ...(groundUnpaid ? { groundUserUnpaidInvoices: 1 } : {}),
        });
      }
      if (persona === "rental") {
        await createCurrencyType.mutateAsync({ name: checkoutName.trim() || "Aircraft Checkout" });
      }
      if (isSolo) {
        const blocks: Record<string, { start: string; end: string }[]> = {};
        for (const d of availDays) blocks[d] = [{ start: availStart, end: availEnd }];
        await updateAvailability.mutateAsync(blocks);
      }
      toast.success("Setup saved.");
      next();
    });
  }

  async function submitInvites(skip = false) {
    if (skip) return next();
    const emails = inviteEmails
      .split(/[\s,;]+/)
      .map((e) => e.trim())
      .filter((e) => e.includes("@"));
    if (emails.length === 0) return next();
    await guarded(async () => {
      let ok = 0;
      for (const email of emails) {
        try {
          await inviteMember.mutateAsync({ email, [inviteRole]: true });
          ok++;
        } catch {
          /* keep going through the list */
        }
      }
      toast.success(`${ok} invitation${ok === 1 ? "" : "s"} sent.`);
      next();
    });
  }

  async function finish(withBooking: boolean) {
    await guarded(async () => {
      if (withBooking && resourceId && locationId && orgUserId) {
        const start = new Date();
        start.setHours(start.getHours() + 1, 0, 0, 0);
        const end = new Date(start);
        end.setHours(end.getHours() + 1);
        try {
          // Book the owner as the pilot so activation never blocks on a second person.
          // "solo" + 1 instructor + a plane is a valid reservation type (see the server's
          // validateReservationType); the owner has the instructor role.
          await createReservation.mutateAsync({
            title: "First flight",
            type: "solo",
            start: start.toISOString(),
            end: end.toISOString(),
            timeZoneName: Intl.DateTimeFormat().resolvedOptions().timeZone,
            resource: { id: resourceId },
            location: { id: locationId },
            personnel: { instructors: [{ id: orgUserId }] },
          });
          toast.success("You're cleared for takeoff — first flight is on the schedule.");
        } catch (e) {
          toast.error(apiErr(e));
        }
      }
      try {
        await updateOrg.mutateAsync({ preferences: { newOrgOnboardingComplete: true } });
      } catch {
        /* completion flag is best-effort */
      }
      qc.clear();
      navigate({ to: "/dashboard" });
    });
  }

  // If the user already has a completed org, they don't belong here.
  const alreadySetUp = organization?.preferences?.newOrgOnboardingComplete;

  return (
    <div className="grid min-h-dvh lg:grid-cols-[minmax(0,44%)_minmax(0,56%)]">
      {/* brand / preview panel */}
      <aside className="relative hidden flex-col justify-between overflow-hidden bg-sidebar p-10 text-sidebar-foreground lg:flex">
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.5]"
          style={{
            backgroundImage:
              "radial-gradient(60% 50% at 80% 0%, color-mix(in oklch, var(--sidebar-primary) 30%, transparent), transparent), linear-gradient(color-mix(in oklch,var(--sidebar-border) 60%,transparent) 1px, transparent 1px), linear-gradient(90deg, color-mix(in oklch,var(--sidebar-border) 60%,transparent) 1px, transparent 1px)",
            backgroundSize: "auto, 34px 34px, 34px 34px",
          }}
        />
        <div className="relative flex items-center gap-2.5">
          <span className="grid size-9 place-items-center rounded-lg bg-sidebar-primary p-1.5">
            <LogoMark onDark className="size-full" />
          </span>
          <span className="text-[15px] font-semibold tracking-tight text-white">AerScheduler</span>
        </div>
        <div className="relative max-w-md">
          <h2 className="text-3xl font-semibold leading-tight tracking-tight text-white text-balance">
            Two minutes to a bookable aircraft.
          </h2>
          <p className="mt-3 text-sm text-sidebar-foreground/70">
            No credit card, no sales call. We'll set up your operation as you go — every step writes
            real data you can use the moment you land on your dashboard.
          </p>
          <ol className="mt-8 space-y-3 text-sm">
            {STEPS.map((label, i) => (
              <li key={label} className="flex items-center gap-3">
                <span
                  className={cn(
                    "grid size-6 shrink-0 place-items-center rounded-full text-xs font-semibold",
                    i < step
                      ? "bg-sidebar-primary text-sidebar-primary-foreground"
                      : i === step
                        ? "bg-white text-sidebar"
                        : "bg-sidebar-accent text-sidebar-foreground/60"
                  )}
                >
                  {i < step ? <Check className="size-3.5" /> : i + 1}
                </span>
                <span className={cn(i === step ? "text-white" : "text-sidebar-foreground/60")}>
                  {label}
                </span>
              </li>
            ))}
          </ol>
        </div>
        <div className="relative text-xs text-sidebar-foreground/50">
          Signed in as {user?.email}
        </div>
      </aside>

      {/* step content */}
      <main className="flex flex-col items-center justify-center p-6 sm:p-10">
        <div className="w-full max-w-lg">
          {alreadySetUp && step === 0 ? (
            <div className="text-center">
              <h1 className="text-2xl font-semibold tracking-tight">You're all set up</h1>
              <p className="mt-2 text-sm text-muted-foreground">
                {organization?.name} is already configured.
              </p>
              <Button asChild className="mt-6">
                <Link to="/dashboard">Go to dashboard</Link>
              </Button>
            </div>
          ) : (
            <>
              {step === 0 && (
                <Step title="Which one sounds like you?" sub="This just tailors the setup — nothing here is locked in.">
                  <div className="grid gap-3 sm:grid-cols-2">
                    {PERSONAS.map((p) => (
                      <button
                        key={p.key}
                        type="button"
                        onClick={() => setPersona(p.key)}
                        className={cn(
                          "flex flex-col items-start gap-2 rounded-xl border p-4 text-left transition-colors hover:border-primary/50 hover:bg-accent/40",
                          persona === p.key && "border-primary bg-primary/5 ring-1 ring-primary"
                        )}
                      >
                        <span className="grid size-9 place-items-center rounded-lg bg-primary/10 text-primary">
                          <p.icon className="size-5" />
                        </span>
                        <span className="font-medium">{p.title}</span>
                        <span className="text-xs text-muted-foreground">{p.blurb}</span>
                      </button>
                    ))}
                  </div>
                  <Nav onNext={next} nextDisabled={!persona} />
                </Step>
              )}

              {step === 1 && (
                <Step title="What do we call it?" sub="Name your operation and set a home base.">
                  <Field id="orgName" label="Operation name">
                    <Input
                      id="orgName"
                      value={orgName}
                      onChange={(e) => setOrgName(e.target.value)}
                      placeholder="Blue Sky Aviation"
                      autoFocus
                    />
                  </Field>
                  <Field id="airport" label="Home airport" hint="Identifier, e.g. KAPA">
                    <Input
                      id="airport"
                      value={airport}
                      onChange={(e) => setAirport(e.target.value.toUpperCase())}
                      placeholder="KAPA"
                    />
                  </Field>
                  <Nav onBack={back} onNext={submitOrg} nextLabel="Create operation" nextDisabled={!orgName.trim()} busy={busy} />
                </Step>
              )}

              {step === 2 && (
                <Step
                  title="Add the aircraft you fly most"
                  sub={isSolo ? "Fly a club or FBO plane? You can skip this." : "One tail is all we need to make the schedule real."}
                >
                  <Field id="template" label="Type">
                    <Select
                      value={template}
                      onValueChange={(v) => {
                        setTemplate(v);
                        const t = AIRCRAFT_TEMPLATES[v];
                        if (t) setRate(t.rate);
                      }}
                    >
                      <SelectTrigger id="template">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.keys(AIRCRAFT_TEMPLATES).map((k) => (
                          <SelectItem key={k} value={k}>
                            {k}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field id="tail" label="Tail number">
                    <Input
                      id="tail"
                      value={tail}
                      onChange={(e) => setTail(e.target.value.toUpperCase())}
                      placeholder="N734X"
                    />
                  </Field>
                  <div className="grid grid-cols-3 gap-3">
                    <Field id="year" label="Year">
                      <Input
                        id="year"
                        inputMode="numeric"
                        maxLength={4}
                        value={year}
                        onChange={(e) => setYear(e.target.value.replace(/[^0-9]/g, ""))}
                        className="tnum"
                      />
                    </Field>
                    <Field id="hobbs" label="Hobbs">
                      <Input id="hobbs" inputMode="decimal" value={hobbs} onChange={(e) => setHobbs(e.target.value)} className="tnum" />
                    </Field>
                    <Field id="tach" label="Tach">
                      <Input id="tach" inputMode="decimal" value={tach} onChange={(e) => setTach(e.target.value)} className="tnum" />
                    </Field>
                  </div>
                  <Field id="rate" label="Rate" hint="Billed on Hobbs (wet)">
                    <MoneyInput id="rate" cents={rate} onCentsChange={setRate} />
                  </Field>
                  <Nav
                    onBack={back}
                    onNext={() => submitAircraft(false)}
                    nextLabel="Add aircraft"
                    nextDisabled={!tail.trim() || year.trim().length !== 4}
                    busy={busy}
                    onSkip={isSolo ? () => submitAircraft(true) : undefined}
                  />
                </Step>
              )}

              {step === 3 && <PersonaStep />}

              {step === 4 && (
                <Step title={isSolo ? "Add your first student" : "Who else runs the ramp?"} sub="Invitees land in the right place automatically — you never have to explain the app.">
                  <Field id="role" label="They are a…">
                    <Select value={inviteRole} onValueChange={(v) => setInviteRole(v as typeof inviteRole)}>
                      <SelectTrigger id="role">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="instructor">Instructor</SelectItem>
                        <SelectItem value="student">Student</SelectItem>
                        <SelectItem value="renter">Renter / member</SelectItem>
                        <SelectItem value="dispatcher">Front desk / dispatcher</SelectItem>
                        <SelectItem value="admin">Admin</SelectItem>
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field id="emails" label="Email addresses" hint="One per line — paste a whole roster">
                    <Textarea
                      id="emails"
                      value={inviteEmails}
                      onChange={(e) => setInviteEmails(e.target.value)}
                      placeholder={"cfi@example.com\nstudent@example.com"}
                      rows={4}
                    />
                  </Field>
                  <Nav onBack={back} onNext={() => submitInvites(false)} nextLabel="Send invites" busy={busy} onSkip={() => submitInvites(true)} />
                </Step>
              )}

              {step === 5 && (
                <Step title="Put something on the schedule" sub="One booking makes the whole thing real — ramp it in when the flight's done and we'll draft the invoice.">
                  <div className="rounded-xl border bg-card p-5">
                    <div className="flex items-center gap-3">
                      <span className="grid size-10 place-items-center rounded-lg bg-primary/10 text-primary">
                        <PlaneTakeoff className="size-5" />
                      </span>
                      <div className="text-sm">
                        <div className="font-medium">
                          {tail ? tail.toUpperCase() : "Your aircraft"} · today
                        </div>
                        <div className="text-muted-foreground">
                          {resourceId ? "A starter reservation, pre-filled and ready." : "Add an aircraft first to place a booking."}
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <Button className="flex-1" onClick={() => finish(true)} disabled={busy || !resourceId}>
                      {busy ? <Loader2 className="size-4 animate-spin" /> : <Rocket className="size-4" />}
                      Place booking &amp; finish
                    </Button>
                    <Button variant="outline" className="flex-1" onClick={() => finish(false)} disabled={busy}>
                      Finish without booking
                    </Button>
                  </div>
                  <button type="button" onClick={back} className="mt-2 text-xs text-muted-foreground hover:text-foreground">
                    ← Back
                  </button>
                </Step>
              )}
            </>
          )}
        </div>
      </main>
    </div>
  );

  function PersonaStep() {
    if (persona === "flight_school" || isSolo) {
      return (
        <Step
          title={isSolo ? "Set your instruction rate" : "Set your instruction types & rates"}
          sub={isSolo ? "A student can't book a CFI with no open time or rate." : "A lesson isn't priceable without a rating rate."}
        >
          <Field id="ratingName" label="Instruction type">
            <Input id="ratingName" value={ratingName} onChange={(e) => setRatingName(e.target.value)} placeholder="Private Pilot" />
          </Field>
          <Field id="instrRate" label="Instructor rate" hint="Per hour">
            <MoneyInput id="instrRate" cents={instrRate} onCentsChange={setInstrRate} />
          </Field>
          {isSolo && (
            <>
              <div className="pt-1">
                <Label>Weekly availability</Label>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {DAYS.map((d) => {
                    const on = availDays.has(d);
                    return (
                      <button
                        key={d}
                        type="button"
                        onClick={() =>
                          setAvailDays((prev) => {
                            const n = new Set(prev);
                            if (n.has(d)) n.delete(d);
                            else n.add(d);
                            return n;
                          })
                        }
                        className={cn(
                          "rounded-md border px-2.5 py-1 text-xs font-medium capitalize transition-colors",
                          on ? "border-primary bg-primary text-primary-foreground" : "hover:bg-accent"
                        )}
                      >
                        {d.slice(0, 3)}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field id="as" label="From">
                  <Input id="as" type="time" value={availStart} onChange={(e) => setAvailStart(e.target.value)} />
                </Field>
                <Field id="ae" label="To">
                  <Input id="ae" type="time" value={availEnd} onChange={(e) => setAvailEnd(e.target.value)} />
                </Field>
              </div>
            </>
          )}
          <Nav onBack={back} onNext={() => submitPersonaStep(false)} busy={busy} onSkip={() => submitPersonaStep(true)} />
        </Step>
      );
    }

    if (persona === "flying_club") {
      return (
        <Step title="Set dues & billing rules" sub="Turn on billing and the delinquency lever treasurers ask for by name.">
          <Field id="instrRate" label="Default instructor rate" hint="Per hour">
            <MoneyInput id="instrRate" cents={instrRate} onCentsChange={setInstrRate} />
          </Field>
          <label className="flex items-center justify-between rounded-lg border p-3">
            <span className="text-sm">
              <span className="font-medium">Block booking on unpaid balances</span>
              <span className="block text-xs text-muted-foreground">Members with overdue invoices can't book.</span>
            </span>
            <Switch checked={groundUnpaid} onCheckedChange={setGroundUnpaid} />
          </label>
          <Nav onBack={back} onNext={() => submitPersonaStep(false)} busy={busy} onSkip={() => submitPersonaStep(true)} />
        </Step>
      );
    }

    // rental
    return (
      <Step title="Set your checkout requirement" sub="Only checked-out pilots can book a given tail.">
        <Field id="checkout" label="Checkout name">
          <Input id="checkout" value={checkoutName} onChange={(e) => setCheckoutName(e.target.value)} placeholder="Aircraft Checkout" />
        </Field>
        <Nav onBack={back} onNext={() => submitPersonaStep(false)} busy={busy} onSkip={() => submitPersonaStep(true)} />
      </Step>
    );
  }
}

// ---------------------------------------------------------------- small pieces

function Step({ title, sub, children }: { title: string; sub?: string; children: React.ReactNode }) {
  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight text-balance">{title}</h1>
      {sub && <p className="mt-1.5 text-sm text-muted-foreground">{sub}</p>}
      <div className="mt-6 space-y-4">{children}</div>
    </div>
  );
}

function Field({
  id,
  label,
  hint,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between">
        <Label htmlFor={id}>{label}</Label>
        {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
      </div>
      {children}
    </div>
  );
}

function Nav({
  onBack,
  onNext,
  nextLabel = "Continue",
  nextDisabled,
  busy,
  onSkip,
}: {
  onBack?: () => void;
  onNext: () => void;
  nextLabel?: string;
  nextDisabled?: boolean;
  busy?: boolean;
  onSkip?: () => void;
}) {
  return (
    <div className="flex items-center gap-2 pt-2">
      {onBack && (
        <Button variant="ghost" size="icon" onClick={onBack} aria-label="Back" disabled={busy}>
          <ArrowLeft className="size-4" />
        </Button>
      )}
      <div className="flex-1" />
      {onSkip && (
        <Button variant="ghost" onClick={onSkip} disabled={busy}>
          Skip for now
        </Button>
      )}
      <Button onClick={onNext} disabled={nextDisabled || busy}>
        {busy ? <Loader2 className="size-4 animate-spin" /> : null}
        {nextLabel}
        {!busy && <ArrowRight className="size-4" />}
      </Button>
    </div>
  );
}
