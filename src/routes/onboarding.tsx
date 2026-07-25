import * as React from "react";
import { createFileRoute, redirect, useNavigate, Link } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  Check,
  CheckCircle2,
  Loader2,
  PlaneTakeoff,
  Rocket,
  Ticket,
  User as UserIcon,
} from "lucide-react";
import { isAuthenticated, needsEmailVerification, useAuth } from "@/lib/auth";
import {
  useCreateLocation,
  useCreatePlane,
  useCreateReservation,
  useUpdateOrganization,
} from "@/features/queries";
import { api, ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MoneyInput } from "@/components/money-input";
import { LogoMark } from "@/components/logo";
import { FinishSetup } from "@/components/onboarding/finish-setup";
import { PerPlanePricingNote, PlanCard, useSubStatus } from "@/components/subscription/plan";
import { toast } from "sonner";

export const Route = createFileRoute("/onboarding")({
  beforeLoad: () => {
    if (!isAuthenticated()) throw redirect({ to: "/login" });
    if (needsEmailVerification()) throw redirect({ to: "/verify-email" });
  },
  component: Onboarding,
});

// ---------------------------------------------------------------- shared

type Persona = "student" | "instructor" | "school";
type OrgType = "flight_school" | "flying_club" | "rental" | "solo_instructor";

/** Aircraft templates → prefill make/model/categoryClass + suggested wet rate (cents) + fuel (gal). */
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

const EMPTY_ADDRESS = {
  streetAddress1: "",
  streetAddress2: "",
  city: "",
  state: "",
  zipCode: "",
  country: "",
};

// The server accepts these exact category/class strings; a free-text box lets typos
// through and 400s, so "Other" uses a dropdown of these.
const CATEGORY_CLASSES = [
  "single-engine land",
  "multi-engine land",
  "single-engine sea",
  "multi-engine sea",
] as const;

function apiErr(e: unknown): string {
  if (e instanceof ApiError) return e.message;
  if (e instanceof Error) return e.message;
  return "Something went wrong. Your entries are safe — try again.";
}

/** Book the owner as the pilot so activation never blocks on a second person.
 *  "solo" + 1 instructor + a plane is a valid reservation type (validateReservationType);
 *  the owner has the instructor role on a freshly created org. */
async function bookFirstFlight(
  create: ReturnType<typeof useCreateReservation>,
  opts: { resourceId: number; locationId: number; orgUserId: number }
) {
  const start = new Date();
  start.setHours(start.getHours() + 1, 0, 0, 0);
  const end = new Date(start);
  end.setHours(end.getHours() + 1);
  await create.mutateAsync({
    title: "First flight",
    type: "solo",
    start: start.toISOString(),
    end: end.toISOString(),
    timeZoneName: Intl.DateTimeFormat().resolvedOptions().timeZone,
    resource: { id: opts.resourceId },
    location: { id: opts.locationId },
    personnel: { instructors: [{ id: opts.orgUserId }] },
  });
}

// ---------------------------------------------------------------- orchestrator

function Onboarding() {
  const { organization } = useAuth();
  const [persona, setPersona] = React.useState<Persona | null>(null);

  if (organization?.preferences?.newOrgOnboardingComplete) {
    return <AllSet name={organization.name} />;
  }
  if (!persona) return <PersonaRouter onPick={setPersona} />;
  if (persona === "student") return <StudentFlow onBack={() => setPersona(null)} />;
  if (persona === "instructor") return <InstructorFlow onBack={() => setPersona(null)} />;
  return <SchoolFlow onBack={() => setPersona(null)} />;
}

function AllSet({ name }: { name: string }) {
  return (
    <Shell headline="You're all set up.">
      <div className="text-center">
        <h1 className="text-[22px] font-semibold tracking-tight">You're all set up</h1>
        <p className="mt-2 text-sm text-muted-foreground">{name} is already configured.</p>
        <Button asChild className="mt-5">
          <Link to="/dashboard">Go to dashboard</Link>
        </Button>
      </div>
    </Shell>
  );
}

// ---------------------------------------------------------------- persona router

function PersonaRouter({ onPick }: { onPick: (p: Persona) => void }) {
  return (
    <Shell headline="Let's get you flying." sub="Tell us who you are — we'll set up only what you need, nothing more.">
      <Step title="What brings you to AerScheduler?" sub="This just tailors your setup. You can change anything later.">
        <div className="grid gap-3">
          <PersonaCard
            icon={Ticket}
            title="I'm joining an organization"
            blurb="A student or renter with a code from your school or club."
            onClick={() => onPick("student")}
          />
          <PersonaCard
            icon={UserIcon}
            title="I'm an independent instructor"
            blurb="Just you — add a plane and start booking in about a minute."
            onClick={() => onPick("instructor")}
          />
          <PersonaCard
            icon={Building2}
            title="I run a flight school, club, or FBO"
            blurb="Set up your fleet, team, and schedule."
            onClick={() => onPick("school")}
          />
        </div>
      </Step>
    </Shell>
  );
}

function PersonaCard({
  icon: Icon,
  title,
  blurb,
  onClick,
}: {
  icon: typeof Ticket;
  title: string;
  blurb: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex items-center gap-4 rounded-xl border p-4 text-left transition-colors hover:border-primary/50 hover:bg-accent/40"
    >
      <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
        <Icon className="size-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-medium">{title}</span>
        <span className="block text-xs text-muted-foreground">{blurb}</span>
      </span>
      <ArrowRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
    </button>
  );
}

// ---------------------------------------------------------------- student flow

function StudentFlow({ onBack }: { onBack: () => void }) {
  const { joinByCode } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const [code, setCode] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [requested, setRequested] = React.useState(false);

  async function submit() {
    if (!code.trim()) return setError("Enter the code your school gave you.");
    setBusy(true);
    setError(null);
    try {
      const outcome = await joinByCode(code);
      if (outcome === "joined") {
        await qc.invalidateQueries();
        toast.success("You're in! Let's book your first lesson.");
        void navigate({ to: "/me/book" });
      } else {
        setRequested(true);
      }
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "That code didn't work. Double-check it and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Shell headline="You're almost in." sub="Enter your code and you'll land right on the schedule.">
      {requested ? (
        <div className="text-center">
          <div className="mx-auto grid size-12 place-items-center rounded-full bg-[color-mix(in_oklch,var(--success)_15%,transparent)] text-success">
            <CheckCircle2 className="size-6" />
          </div>
          <h1 className="mt-4 text-lg font-semibold">Request sent</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            This is a private organization, so an admin needs to approve you. You&rsquo;ll get access as
            soon as they do.
          </p>
          <Button variant="outline" className="mt-5" onClick={onBack}>
            <ArrowLeft className="size-4" /> Back
          </Button>
        </div>
      ) : (
        <Step title="Join your organization" sub="Enter the code your flight school or club shared with you.">
          <Field id="join-code" label="Invite code" error={error ?? ""}>
            <Input
              id="join-code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="e.g. MURRAY-AV"
              autoFocus
              autoComplete="off"
              className="text-center font-mono text-lg tracking-widest"
              aria-invalid={!!error}
            />
          </Field>
          <div className="flex items-center gap-2 pt-2">
            <Button variant="ghost" size="icon" onClick={onBack} aria-label="Back" disabled={busy}>
              <ArrowLeft className="size-4" />
            </Button>
            <div className="flex-1" />
            <Button onClick={submit} disabled={busy || !code.trim()}>
              {busy ? <Loader2 className="size-4 animate-spin" /> : null}
              Join
              {!busy && <ArrowRight className="size-4" />}
            </Button>
          </div>
        </Step>
      )}
    </Shell>
  );
}

// ---------------------------------------------------------------- instructor flow

function InstructorFlow({ onBack }: { onBack: () => void }) {
  const { user, orgUserId, createOrganization } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const createReservation = useCreateReservation();
  const updateOrg = useUpdateOrganization();
  const subStatus = useSubStatus();

  const who = user?.name?.trim().split(" ")[0];
  const [step, setStep] = React.useState(0);
  const [busy, setBusy] = React.useState(false);
  const [showErrors, setShowErrors] = React.useState(false);
  const [orgName, setOrgName] = React.useState(who ? `${who}'s Flight Instruction` : "My Flight Instruction");
  const [airport, setAirport] = React.useState("");
  const [locationId, setLocationId] = React.useState<number | null>(null);
  const [resourceId, setResourceId] = React.useState<number | null>(null);
  const [tail, setTail] = React.useState("");

  const STEPS = ["You", "Aircraft", "Book", "Plan"];

  async function submitOrg() {
    if (!orgName.trim()) {
      setShowErrors(true);
      document.getElementById("i-orgName")?.focus();
      return;
    }
    setBusy(true);
    try {
      await createOrganization({
        name: orgName.trim(),
        organizationType: "solo_instructor" satisfies OrgType,
        details: { email: user?.email ?? "", phone: "", address: { ...EMPTY_ADDRESS } },
        location: { name: airport.trim() || orgName.trim(), address: { ...EMPTY_ADDRESS } },
      });
      try {
        const locs = await api<{ id: number }[]>("/locations");
        if (locs[0]) setLocationId(locs[0].id);
      } catch {
        /* the aircraft step re-checks and can create one if needed */
      }
      setStep(1);
    } catch (e) {
      toast.error(apiErr(e));
    } finally {
      setBusy(false);
    }
  }

  // Book (optionally) then advance to the Plan step. Mark onboarding complete here
  // so nothing strands the user if they leave from the plan step.
  async function toPlan(withBooking: boolean) {
    setBusy(true);
    try {
      if (withBooking && resourceId && locationId && orgUserId) {
        try {
          await bookFirstFlight(createReservation, { resourceId, locationId, orgUserId });
          toast.success("You're cleared for takeoff — first flight is on the schedule.");
        } catch (e) {
          toast.error(apiErr(e));
        }
      }
      void updateOrg.mutateAsync({ preferences: { newOrgOnboardingComplete: true } }).catch(() => {});
      setStep(3);
    } finally {
      setBusy(false);
    }
  }

  function finishToDashboard() {
    qc.clear();
    void navigate({ to: "/dashboard" });
  }

  return (
    <Shell headline="Two minutes to a bookable aircraft." steps={STEPS} step={step}>
      {step === 0 && (
        <Step title="Name your operation" sub="Just enough to hang a schedule on — you can rename it anytime.">
          <Field id="i-orgName" label="Operation name" error={showErrors && !orgName.trim() ? "Give your operation a name." : ""}>
            <Input
              id="i-orgName"
              value={orgName}
              onChange={(e) => setOrgName(e.target.value)}
              autoFocus
              aria-invalid={showErrors && !orgName.trim()}
            />
          </Field>
          <Field id="i-airport" label="Home airport" hint="Identifier, e.g. KAPA">
            <Input
              id="i-airport"
              value={airport}
              onChange={(e) => setAirport(e.target.value.toUpperCase())}
              placeholder="KAPA"
            />
          </Field>
          <div className="flex items-center gap-2 pt-2">
            <Button variant="ghost" size="icon" onClick={onBack} aria-label="Back" disabled={busy}>
              <ArrowLeft className="size-4" />
            </Button>
            <div className="flex-1" />
            <Button onClick={submitOrg} disabled={busy}>
              {busy ? <Loader2 className="size-4 animate-spin" /> : null}
              Continue
              {!busy && <ArrowRight className="size-4" />}
            </Button>
          </div>
        </Step>
      )}

      {step === 1 && (
        <AircraftStep
          title="Add the aircraft you fly"
          sub="Don't own an aircraft? Skip for now — you can add one anytime from the Aircraft page."
          locationId={locationId}
          fallbackLocationName={airport.trim() || orgName.trim()}
          onBack={() => setStep(0)}
          onSkip={() => setStep(2)}
          onCreated={(resId, locId, tailNo) => {
            setResourceId(resId);
            setLocationId(locId);
            setTail(tailNo);
            setStep(2);
          }}
        />
      )}

      {step === 2 && (
        <BookingStep
          tail={tail}
          resourceId={resourceId}
          busy={busy}
          onBack={() => setStep(1)}
          onPlace={() => toPlan(true)}
          onSkip={() => toPlan(false)}
        />
      )}

      {step === 3 && (
        <Step title="Your plan" sub="You're on a free trial — no card needed to start.">
          {subStatus && <PlanCard status={subStatus} />}
          <div className="flex justify-end pt-2">
            <Button onClick={finishToDashboard}>
              <Rocket className="size-4" />
              Go to dashboard
            </Button>
          </div>
        </Step>
      )}
    </Shell>
  );
}

// ---------------------------------------------------------------- school / club / FBO flow

const SUBTYPES: { key: OrgType; label: string }[] = [
  { key: "flight_school", label: "Flight school" },
  { key: "flying_club", label: "Flying club" },
  { key: "rental", label: "Rental / FBO" },
];

function SchoolFlow({ onBack }: { onBack: () => void }) {
  const { user, orgUserId, organization, createOrganization } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const createReservation = useCreateReservation();
  const updateOrg = useUpdateOrganization();

  const [step, setStep] = React.useState(0);
  const [busy, setBusy] = React.useState(false);
  const [showErrors, setShowErrors] = React.useState(false);
  const [subtype, setSubtype] = React.useState<OrgType>("flight_school");
  const [orgName, setOrgName] = React.useState("");
  const [airport, setAirport] = React.useState("");
  const [locationId, setLocationId] = React.useState<number | null>(null);
  const [resourceId, setResourceId] = React.useState<number | null>(null);
  const [tail, setTail] = React.useState("");

  const STEPS = ["You", "Aircraft", "Book", "Finish"];

  async function submitOrg() {
    if (!orgName.trim()) {
      setShowErrors(true);
      document.getElementById("s-orgName")?.focus();
      return;
    }
    setBusy(true);
    try {
      await createOrganization({
        name: orgName.trim(),
        organizationType: subtype,
        details: { email: user?.email ?? "", phone: "", address: { ...EMPTY_ADDRESS } },
        location: { name: airport.trim() || orgName.trim(), address: { ...EMPTY_ADDRESS } },
      });
      try {
        const locs = await api<{ id: number }[]>("/locations");
        if (locs[0]) setLocationId(locs[0].id);
      } catch {
        /* the aircraft step re-checks and can create one if needed */
      }
      setStep(1);
    } catch (e) {
      toast.error(apiErr(e));
    } finally {
      setBusy(false);
    }
  }

  /** Enter the finish-setup checklist. Mark onboarding complete here (they've
   *  activated) so the checklist's deep-links can leave the wizard safely. */
  async function toFinish(withBooking: boolean) {
    setBusy(true);
    try {
      if (withBooking && resourceId && locationId && orgUserId) {
        try {
          await bookFirstFlight(createReservation, { resourceId, locationId, orgUserId });
          toast.success("You're cleared for takeoff — first flight is on the schedule.");
        } catch (e) {
          toast.error(apiErr(e));
        }
      }
      void updateOrg.mutateAsync({ preferences: { newOrgOnboardingComplete: true } }).catch(() => {});
      setStep(3);
    } finally {
      setBusy(false);
    }
  }

  function goToDashboard() {
    qc.clear();
    void navigate({ to: "/dashboard" });
  }

  return (
    <Shell headline="Set up your operation." steps={STEPS} step={step}>
      {step === 0 && (
        <Step title="Tell us about your operation" sub="This tailors your setup — you can change it later.">
          <div>
            <Label>Type</Label>
            <div className="mt-2 grid grid-cols-3 gap-2">
              {SUBTYPES.map((s) => (
                <button
                  key={s.key}
                  type="button"
                  onClick={() => setSubtype(s.key)}
                  className={cn(
                    "rounded-lg border px-2 py-2 text-xs font-medium transition-colors",
                    subtype === s.key ? "border-primary bg-primary/5 text-primary ring-1 ring-primary" : "hover:bg-accent"
                  )}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>
          <Field id="s-orgName" label="Operation name" error={showErrors && !orgName.trim() ? "Give your operation a name." : ""}>
            <Input
              id="s-orgName"
              value={orgName}
              onChange={(e) => setOrgName(e.target.value)}
              placeholder="Blue Sky Aviation"
              autoFocus
              aria-invalid={showErrors && !orgName.trim()}
            />
          </Field>
          <Field id="s-airport" label="Home airport" hint="Identifier, e.g. KAPA">
            <Input
              id="s-airport"
              value={airport}
              onChange={(e) => setAirport(e.target.value.toUpperCase())}
              placeholder="KAPA"
            />
          </Field>
          <div className="flex items-center gap-2 pt-2">
            <Button variant="ghost" size="icon" onClick={onBack} aria-label="Back" disabled={busy}>
              <ArrowLeft className="size-4" />
            </Button>
            <div className="flex-1" />
            <Button onClick={submitOrg} disabled={busy}>
              {busy ? <Loader2 className="size-4 animate-spin" /> : null}
              Create operation
              {!busy && <ArrowRight className="size-4" />}
            </Button>
          </div>
        </Step>
      )}

      {step === 1 && (
        <AircraftStep
          title="Add your first aircraft"
          sub="One tail is all we need to make the schedule real — add the rest later."
          locationId={locationId}
          fallbackLocationName={airport.trim() || orgName.trim()}
          onBack={() => setStep(0)}
          onSkip={() => setStep(2)}
          onCreated={(resId, locId, tailNo) => {
            setResourceId(resId);
            setLocationId(locId);
            setTail(tailNo);
            setStep(2);
          }}
        />
      )}

      {step === 2 && (
        <BookingStep
          tail={tail}
          resourceId={resourceId}
          busy={busy}
          onBack={() => setStep(1)}
          onPlace={() => toFinish(true)}
          onSkip={() => toFinish(false)}
        />
      )}

      {step === 3 && (
        <FinishSetup orgName={organization?.name ?? orgName} onGoToDashboard={goToDashboard} busy={busy} />
      )}
    </Shell>
  );
}

// ---------------------------------------------------------------- shared steps

function AircraftStep({
  title,
  sub,
  locationId,
  fallbackLocationName,
  onCreated,
  onSkip,
  onBack,
}: {
  title: string;
  sub: string;
  locationId: number | null;
  fallbackLocationName: string;
  onCreated: (resourceId: number, locationId: number, tail: string) => void;
  onSkip: () => void;
  onBack: () => void;
}) {
  const createPlane = useCreatePlane();
  const createLocation = useCreateLocation();

  const [template, setTemplate] = React.useState("Cessna 172");
  const [tail, setTail] = React.useState("");
  const [year, setYear] = React.useState(String(new Date().getFullYear()));
  const [hobbs, setHobbs] = React.useState("0");
  const [tach, setTach] = React.useState("0");
  const [rate, setRate] = React.useState(16500);
  // "Other" isn't in the template list, so make/model/category are entered by hand.
  const [make, setMake] = React.useState("");
  const [model, setModel] = React.useState("");
  const [categoryClass, setCategoryClass] = React.useState<string>("single-engine land");
  const [busy, setBusy] = React.useState(false);
  const [showErrors, setShowErrors] = React.useState(false);

  const isOther = template === "Other";
  const tailErr = tail.trim() ? "" : "Enter a tail number.";
  const yearErr = year.trim().length === 4 ? "" : "Enter a 4-digit year.";
  const makeErr = isOther && !make.trim() ? "Enter the make." : "";
  const modelErr = isOther && !model.trim() ? "Enter the model." : "";

  async function submit() {
    const firstInvalid = tailErr ? "ac-tail" : yearErr ? "ac-year" : makeErr ? "ac-make" : modelErr ? "ac-model" : "";
    if (firstInvalid) {
      setShowErrors(true);
      document.getElementById(firstInvalid)?.focus();
      return;
    }
    setBusy(true);
    try {
      let locId = locationId;
      if (!locId) {
        const loc = await createLocation.mutateAsync({ name: fallbackLocationName });
        locId = loc.id;
      }
      const tpl = AIRCRAFT_TEMPLATES[template];
      const res = await createPlane.mutateAsync({
        location: { id: locId },
        type: {
          plane: {
            tailNumber: tail.trim().toUpperCase(),
            make: isOther ? make.trim() : tpl?.make,
            model: isOther ? model.trim() : tpl?.model,
            year: year.trim(),
            categoryClass: isOther ? categoryClass : tpl?.categoryClass ?? "single-engine land",
            tachTime: Math.round((Number(tach) || 0) * 10),
            hobbsTime: Math.round((Number(hobbs) || 0) * 10),
            fuelCapacity: tpl?.fuel ?? 50,
            fuelMeasurement: "gallons",
            cost: { wetRate: rate, billByHobbsTime: true },
          },
        },
      });
      toast.success(`${tail.trim().toUpperCase()} is on the schedule.`);
      onCreated(res.id, locId, tail.trim().toUpperCase());
    } catch (e) {
      toast.error(apiErr(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Step title={title} sub={sub}>
      <Field id="ac-template" label="Type">
        <select
          id="ac-template"
          value={template}
          onChange={(e) => {
            setTemplate(e.target.value);
            const t = AIRCRAFT_TEMPLATES[e.target.value];
            if (t) setRate(t.rate);
          }}
          className="flex h-8 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40"
        >
          {Object.keys(AIRCRAFT_TEMPLATES).map((k) => (
            <option key={k} value={k}>
              {k}
            </option>
          ))}
        </select>
      </Field>

      {isOther && (
        <>
          <div className="grid grid-cols-2 gap-3">
            <Field id="ac-make" label="Make" error={showErrors ? makeErr : ""}>
              <Input
                id="ac-make"
                value={make}
                onChange={(e) => setMake(e.target.value)}
                placeholder="e.g. Cessna"
                aria-invalid={showErrors && !!makeErr}
              />
            </Field>
            <Field id="ac-model" label="Model" error={showErrors ? modelErr : ""}>
              <Input
                id="ac-model"
                value={model}
                onChange={(e) => setModel(e.target.value)}
                placeholder="e.g. 172"
                aria-invalid={showErrors && !!modelErr}
              />
            </Field>
          </div>
          <Field id="ac-cat" label="Category &amp; class">
            <select
              id="ac-cat"
              value={categoryClass}
              onChange={(e) => setCategoryClass(e.target.value)}
              className="flex h-8 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40"
            >
              {CATEGORY_CLASSES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </Field>
        </>
      )}

      <Field id="ac-tail" label="Tail number" error={showErrors ? tailErr : ""}>
        <Input
          id="ac-tail"
          value={tail}
          onChange={(e) => setTail(e.target.value.toUpperCase())}
          placeholder="N734X"
          aria-invalid={showErrors && !!tailErr}
        />
      </Field>
      <div className="grid grid-cols-3 gap-3">
        <Field id="ac-year" label="Year" error={showErrors ? yearErr : ""}>
          <Input
            id="ac-year"
            inputMode="numeric"
            maxLength={4}
            value={year}
            onChange={(e) => setYear(e.target.value.replace(/[^0-9]/g, ""))}
            className="tnum"
            aria-invalid={showErrors && !!yearErr}
          />
        </Field>
        <Field id="ac-hobbs" label="Hobbs">
          <Input id="ac-hobbs" inputMode="decimal" value={hobbs} onChange={(e) => setHobbs(e.target.value)} className="tnum" />
        </Field>
        <Field id="ac-tach" label="Tach">
          <Input id="ac-tach" inputMode="decimal" value={tach} onChange={(e) => setTach(e.target.value)} className="tnum" />
        </Field>
      </div>
      <Field id="ac-rate" label="Rate" hint="Billed on Hobbs (wet)">
        <MoneyInput id="ac-rate" cents={rate} onCentsChange={setRate} />
      </Field>
      <PerPlanePricingNote />
      <Nav onBack={onBack} onNext={submit} nextLabel="Add aircraft" busy={busy} onSkip={onSkip} />
    </Step>
  );
}

function BookingStep({
  tail,
  resourceId,
  busy,
  onPlace,
  onSkip,
  onBack,
}: {
  tail: string;
  resourceId: number | null;
  busy: boolean;
  onPlace: () => void;
  onSkip: () => void;
  onBack: () => void;
}) {
  return (
    <Step
      title="Put something on the schedule"
      sub="One booking makes the whole thing real — ramp it in when the flight's done and we'll draft the invoice."
    >
      <div className="rounded-xl border bg-card p-4">
        <div className="flex items-center gap-3">
          <span className="grid size-10 place-items-center rounded-lg bg-primary/10 text-primary">
            <PlaneTakeoff className="size-5" />
          </span>
          <div className="text-sm">
            <div className="font-medium">{tail ? tail : "Your aircraft"} · today</div>
            <div className="text-muted-foreground">
              {resourceId ? "A starter reservation, pre-filled and ready." : "Add an aircraft first to place a booking."}
            </div>
          </div>
        </div>
      </div>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Button className="flex-1" onClick={onPlace} disabled={busy || !resourceId}>
          {busy ? <Loader2 className="size-4 animate-spin" /> : <Rocket className="size-4" />}
          Place booking &amp; continue
        </Button>
        <Button variant="outline" className="flex-1" onClick={onSkip} disabled={busy}>
          Skip for now
        </Button>
      </div>
      <button type="button" onClick={onBack} className="mt-2 text-xs text-muted-foreground hover:text-foreground">
        ← Back
      </button>
    </Step>
  );
}

// ---------------------------------------------------------------- primitives

function Shell({
  steps,
  step = 0,
  headline,
  sub,
  children,
}: {
  steps?: string[];
  step?: number;
  headline: string;
  sub?: string;
  children: React.ReactNode;
}) {
  const { user } = useAuth();
  return (
    <div className="grid min-h-dvh lg:grid-cols-[minmax(0,44%)_minmax(0,56%)]">
      <aside className="relative hidden overflow-hidden bg-brand-surface p-10 text-white/75 lg:flex lg:flex-col">
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.6]"
          style={{
            backgroundImage:
              "radial-gradient(60% 50% at 80% 0%, color-mix(in oklch, var(--primary) 45%, transparent), transparent), linear-gradient(color-mix(in oklch,#ffffff 8%,transparent) 1px, transparent 1px), linear-gradient(90deg, color-mix(in oklch,#ffffff 8%,transparent) 1px, transparent 1px)",
            backgroundSize: "auto, 34px 34px, 34px 34px",
          }}
        />
        {/* Content capped + centered so it doesn't fly to the far-left on wide screens. */}
        <div className="relative mx-auto flex h-full w-full max-w-md flex-col justify-between">
          <div className="flex items-center gap-2.5">
            <LogoMark onDark className="h-8 w-auto" />
            <span className="text-[15px] font-semibold tracking-tight text-white">AerScheduler</span>
          </div>
          <div>
            <h2 className="text-3xl font-semibold leading-tight tracking-tight text-white text-balance">{headline}</h2>
            {sub && <p className="mt-3 text-sm text-white/70">{sub}</p>}
            {steps ? (
              <ol className="mt-8 space-y-3 text-sm">
                {steps.map((label, i) => (
                  <li key={label} className="flex items-center gap-3">
                    <span
                      className={cn(
                        "grid size-6 shrink-0 place-items-center rounded-full text-xs font-semibold",
                        i < step
                          ? "bg-primary text-primary-foreground"
                          : i === step
                            ? "bg-white text-brand-surface"
                            : "bg-white/10 text-white/50"
                      )}
                    >
                      {i < step ? <Check className="size-3.5" /> : i + 1}
                    </span>
                    <span className={cn(i === step ? "text-white" : "text-white/55")}>{label}</span>
                  </li>
                ))}
              </ol>
            ) : (
              <ul className="mt-8 space-y-2.5 text-sm text-white/70">
                {["Set up in minutes — no sales call", "No credit card to start", "Every step writes real, usable data"].map(
                  (t) => (
                    <li key={t} className="flex items-center gap-2.5">
                      <Check className="size-4 shrink-0 text-primary" /> {t}
                    </li>
                  )
                )}
              </ul>
            )}
          </div>
          <div className="text-xs text-white/45">Signed in as {user?.email}</div>
        </div>
      </aside>

      <main className="flex flex-col items-center justify-center p-6 sm:p-10">
        <div className="w-full max-w-lg">{children}</div>
      </main>
    </div>
  );
}

function Step({ title, sub, children }: { title: string; sub?: string; children: React.ReactNode }) {
  return (
    <div>
      <h1 className="text-[22px] font-semibold tracking-tight text-balance">{title}</h1>
      {sub && <p className="mt-1.5 text-sm text-muted-foreground">{sub}</p>}
      <div className="mt-5 space-y-4">{children}</div>
    </div>
  );
}

function Field({
  id,
  label,
  hint,
  error,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between">
        <Label htmlFor={id}>{label}</Label>
        {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
      </div>
      {children}
      {error && <p className="text-xs text-destructive">{error}</p>}
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
