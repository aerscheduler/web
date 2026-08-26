import * as React from "react";

import { createFileRoute, redirect, useNavigate, Link } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  Check,
  CheckCircle2,
  CreditCard,
  Loader2,
  Ticket,
  User as UserIcon,
} from "lucide-react";
import { isAuthenticated, needsEmailVerification, useAuth } from "@/lib/auth";
import { AirportField, countryName, subdivisionOf } from "@/components/facilities/airport-field";
import type { AirportMatch } from "@/types/api";
import {
  useConnectStripe,
  useCreateLocation,
  useCreatePlane,
  useUpdateOrganization,
} from "@/features/queries";
import { api, ApiError } from "@/lib/api";
import {
  attributionChannel,
  attributionPayload,
  attributionSource,
  clearAttribution,
  readAttribution,
} from "@/lib/attribution";
import {
  SETUP_INTENTS,
  HEARD_FROM_OPTIONS,
  inferredIntent,
  resolveSetupSource,
  shouldAskHeardFrom,
  type SetupIntent,
} from "@/lib/onboarding-intent";
import { track } from "@/lib/analytics";
import { trackAdConversion } from "@/lib/ads";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TailNumberField } from "@/components/aircraft/tail-number-field";
import {
  AIRCRAFT_CATEGORIES,
  CLASSES_BY_CATEGORY,
  label as vocabLabel,
  type AircraftCategory,
  type AircraftClass,
} from "@/components/aircraft/vocabulary";
import { Label } from "@/components/ui/label";
import { MoneyInput } from "@/components/money-input";
import { LogoMark } from "@/components/logo";
import { SetupChecklistPreview } from "@/components/onboarding/setup-checklist";
import { PerPlanePricingNote } from "@/components/subscription/plan";
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

function apiErr(e: unknown): string {
  if (e instanceof ApiError) return e.message;
  if (e instanceof Error) return e.message;
  return "Something went wrong. Your entries are safe. Try again.";
}

// ---------------------------------------------------------------- orchestrator

function Onboarding() {
  const { organization } = useAuth();
  const [persona, setPersona] = React.useState<Persona | null>(null);

  if (organization?.preferences?.newOrgOnboardingComplete) {
    return <AllSet name={organization.name} />;
  }
  if (!persona)
    return (
      <PersonaRouter
        onPick={(p) => {
          // The first branch in the funnel. A campaign that sends mostly students when
          // you are trying to sell to schools is a targeting problem, not a copy problem,
          // and this is the only event that shows it.
          track("onboarding_persona_selected", { persona: p, channel: attributionChannel() });
          setPersona(p);
        }}
      />
    );
  if (persona === "student") return <StudentFlow onBack={() => setPersona(null)} />;
  return <OperationFlow persona={persona} onBack={() => setPersona(null)} />;
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
    <Shell headline="Let's get you flying." sub="Tell us who you are. We'll set up only what you need, nothing more.">
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
            blurb="Just you. Add a plane and start booking in about a minute."
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

// ---------------------------------------------------------------- operation flow

const SUBTYPES: { key: OrgType; label: string }[] = [
  { key: "flight_school", label: "Flight school" },
  { key: "flying_club", label: "Flying club" },
  { key: "rental", label: "Rental / FBO" },
];

/**
 * Everyone who is starting an operation: solo CFI, school, club, FBO.
 *
 * One flow rather than two, because after the type is chosen they differ only in
 * wording: name it, add a tail, optionally connect billing, go. Three steps is the
 * whole point. The rest of setup is a checklist on the dashboard, where it can be
 * done in any order, by any admin, on any day.
 *
 * There is deliberately no "book your first flight" step. It used to create a solo
 * reservation for the owner, which is a fiction at any operation where the owner
 * isn't the one flying, and it put a placeholder on a real schedule board that
 * somebody then had to cancel. Booking is the first item on the dashboard checklist
 * instead, pointing at the real form.
 */
function OperationFlow({ persona, onBack }: { persona: Exclude<Persona, "student">; onBack: () => void }) {
  const { user, organization, createOrganization } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const updateOrg = useUpdateOrganization();

  const solo = persona === "instructor";
  const who = user?.name?.trim().split(" ")[0];
  const attribution = React.useMemo(() => readAttribution(), []);
  const askHeardFrom = shouldAskHeardFrom(attribution);

  const [step, setStep] = React.useState(0);
  const [busy, setBusy] = React.useState(false);
  const [showErrors, setShowErrors] = React.useState(false);
  const [subtype, setSubtype] = React.useState<OrgType>(solo ? "solo_instructor" : "flight_school");
  const [orgName, setOrgName] = React.useState(
    solo ? (who ? `${who}'s Flight Instruction` : "My Flight Instruction") : ""
  );
  const [airport, setAirport] = React.useState("");
  //Set only by choosing a row from the lookup. Everything derived from it (the address,
  //and the time zone every booking here will be read in) is absent for a typed-out field,
  //which is exactly what onboarding has always sent.
  const [airportPick, setAirportPick] = React.useState<AirportMatch | null>(null);
  const [locationId, setLocationId] = React.useState<number | null>(null);
  const [intent, setIntent] = React.useState<SetupIntent | null>(() => inferredIntent(attribution) ?? "scheduling");
  const [heardFrom, setHeardFrom] = React.useState<string | null>(null);
  const [heardFromDetail, setHeardFromDetail] = React.useState("");

  const STEPS = ["Operation", "Aircraft", "Billing"];

  async function submitOrg() {
    if (!orgName.trim()) {
      setShowErrors(true);
      document.getElementById("op-orgName")?.focus();
      return;
    }
    if (!intent) {
      setShowErrors(true);
      document.getElementById("op-intent")?.focus();
      return;
    }
    setBusy(true);
    try {
      const source =
        resolveSetupSource({
          intent,
          src: attribution?.src,
          landingPath: attribution?.landingPath,
          utmCampaign: attribution?.utm_campaign,
          utmSource: attribution?.utm_source,
        }) ?? intent;
      const attributionBody = {
        ...attributionPayload(),
        ...(askHeardFrom && heardFrom ? { heardFrom } : {}),
        ...(askHeardFrom && heardFrom && heardFromDetail.trim()
          ? { heardFromDetail: heardFromDetail.trim().slice(0, 255) }
          : {}),
      };
      await createOrganization({
        name: orgName.trim(),
        organizationType: subtype,
        details: { email: user?.email ?? "", phone: "", address: { ...EMPTY_ADDRESS } },
        //A picked airport carries its city, state, country and zone. Typed by hand it is a
        //bare name against an empty address, exactly as before. The zone is the one that
        //matters: without it every booking at this school renders in whatever zone the
        //reader's device is in, rather than the field's.
        location: {
          name: airport.trim() || orgName.trim(),
          address: airportPick
            ? {
                ...EMPTY_ADDRESS,
                city: airportPick.municipality ?? "",
                state: subdivisionOf(airportPick),
                country: countryName(airportPick.isoCountry),
              }
            : { ...EMPTY_ADDRESS },
          timeZone: airportPick?.timeZone ?? null,
        },
        // Intent (or inferred campaign) orders the dashboard checklist.
        source,
        // Campaign tuple for spend reporting, plus optional human "how did you hear".
        attribution: Object.keys(attributionBody).length ? attributionBody : undefined,
      });
      // The single most important event in the product: a school now exists. Everything
      // upstream is a cost, and this is the first thing that could become revenue.
      track("org_created", {
        org_type: subtype,
        persona,
        channel: attributionChannel(),
        campaign: source,
        intent,
        heard_from: askHeardFrom ? heardFrom : null,
      });
      clearAttribution();
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

  /** Leaving the aircraft step is the point of no return: everything after it is
   *  optional and can be abandoned (including a redirect out to Stripe) so the org
   *  is marked set up here rather than at the end. */
  function toBilling() {
    void updateOrg.mutateAsync({ preferences: { newOrgOnboardingComplete: true } }).catch(() => {});
    setStep(2);
  }

  function finish() {
    qc.clear();
    void navigate({ to: "/dashboard" });
  }

  const heardDetailLabel = HEARD_FROM_OPTIONS.find((o) => o.id === heardFrom)?.detailLabel;

  return (
    <Shell
      headline={solo ? "Two minutes to a bookable aircraft." : "Set up your operation."}
      steps={STEPS}
      step={step}
    >
      {step === 0 && (
        <Step
          title={solo ? "Name your operation" : "Tell us about your operation"}
          sub="Just enough to hang a schedule on. You can change any of it later."
        >
          {!solo && (
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
                      subtype === s.key
                        ? "border-primary bg-primary/5 text-primary ring-1 ring-primary"
                        : "hover:bg-accent"
                    )}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>
          )}
          <Field
            id="op-orgName"
            label="Operation name"
            error={showErrors && !orgName.trim() ? "Give your operation a name." : ""}
          >
            <Input
              id="op-orgName"
              value={orgName}
              onChange={(e) => setOrgName(e.target.value)}
              placeholder={solo ? undefined : "Blue Sky Aviation"}
              autoFocus
              aria-invalid={showErrors && !orgName.trim()}
            />
          </Field>
          <Field
            id="op-airport"
            label="Home airport"
            hint="Search by identifier or name, e.g. KAPA or Centennial"
          >
            <AirportField
              id="op-airport"
              value={airport}
              //Typed by hand it stays uppercase, which is how identifiers are written and
              //what this field has always done. A picked row arrives already formatted as
              //"KAPA Centennial Airport", so leave that alone.
              onChange={(v) => {
                setAirportPick(null);
                setAirport(v.toUpperCase());
              }}
              onPick={(m) => {
                setAirportPick(m);
                setAirport(`${m.ident} ${m.name}`);
              }}
              //VarChar(60) on the server, which does not truncate.
              maxLength={60}
              placeholder="KAPA"
            />
          </Field>

          <div id="op-intent">
            <Label>What do you want working first?</Label>
            <p className="mt-1 text-xs text-muted-foreground">
              We will put that at the top of your setup checklist. Everything else stays available.
            </p>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              {SETUP_INTENTS.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setIntent(opt.id)}
                  className={cn(
                    "rounded-lg border px-3 py-2.5 text-left transition-colors",
                    intent === opt.id
                      ? "border-primary bg-primary/5 ring-1 ring-primary"
                      : "hover:bg-accent"
                  )}
                >
                  <div className="text-sm font-medium">{opt.label}</div>
                  <div className="mt-0.5 text-xs text-muted-foreground">{opt.blurb}</div>
                </button>
              ))}
            </div>
            {showErrors && !intent ? (
              <p className="mt-1.5 text-xs text-destructive">Pick one so we know where to start.</p>
            ) : null}
          </div>

          {askHeardFrom && (
            <div>
              <Label>How did you hear about us? <span className="font-normal text-muted-foreground">(optional)</span></Label>
              <div className="mt-2 flex flex-wrap gap-2">
                {HEARD_FROM_OPTIONS.map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setHeardFrom((cur) => (cur === opt.id ? null : opt.id))}
                    className={cn(
                      "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                      heardFrom === opt.id
                        ? "border-primary bg-primary/5 text-primary"
                        : "hover:bg-accent"
                    )}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              {heardDetailLabel && heardFrom ? (
                <div className="mt-3">
                  <Field id="op-heard-detail" label={heardDetailLabel}>
                    <Input
                      id="op-heard-detail"
                      value={heardFromDetail}
                      onChange={(e) => setHeardFromDetail(e.target.value)}
                      placeholder={heardFrom === "switching" ? "MyFBO, Flight Circle…" : undefined}
                      maxLength={255}
                    />
                  </Field>
                </div>
              ) : null}
            </div>
          )}

          <div className="flex items-center gap-2 pt-2">
            <Button variant="ghost" size="icon" onClick={onBack} aria-label="Back" disabled={busy}>
              <ArrowLeft className="size-4" />
            </Button>
            <div className="flex-1" />
            <Button onClick={submitOrg} disabled={busy}>
              {busy ? <Loader2 className="size-4 animate-spin" /> : null}
              {solo ? "Continue" : "Create operation"}
              {!busy && <ArrowRight className="size-4" />}
            </Button>
          </div>
        </Step>
      )}

      {step === 1 && (
        <AircraftStep
          title={solo ? "Add the aircraft you fly" : "Add your first aircraft"}
          sub={
            solo
              ? "Don't own an aircraft? Skip for now. You can add one anytime from the Aircraft page."
              : "One tail is all we need to make the schedule real. Add the rest later."
          }
          locationId={locationId}
          fallbackLocationName={airport.trim() || orgName.trim()}
          onBack={() => setStep(0)}
          onSkip={toBilling}
          onCreated={toBilling}
        />
      )}

      {step === 2 && (
        <BillingStep orgName={organization?.name ?? orgName} onBack={() => setStep(1)} onDone={finish} />
      )}
    </Shell>
  );
}

/**
 * Optional Stripe Connect, then out.
 *
 * Connect is what turns close-outs into money (invoices, card and ACH payments,
 * QuickBooks), so it earns a place in the wizard. It does not earn the right to block
 * anyone: "I'll do this later" is the equal-weight option, and the same item is
 * waiting on the checklist either way.
 *
 * Note this is Connect (the school charging its members), not the per-aircraft
 * subscription (us charging the school). The trial runs regardless and is shown on
 * Settings → Plan.
 */
function BillingStep({
  orgName,
  onBack,
  onDone,
}: {
  orgName: string;
  onBack: () => void;
  onDone: () => void;
}) {
  const connect = useConnectStripe();

  async function startConnect() {
    try {
      const { url } = await connect.mutateAsync();
      // Recorded before the redirect, because Stripe's hosted onboarding is a different
      // origin, once we hand off we cannot see whether they finished, only whether they
      // started. The completion shows up later as Connect being enabled on the org.
      track("stripe_connect_started", { channel: attributionChannel() });
      window.location.href = url;
    } catch (e) {
      toast.error(apiErr(e));
    }
  }

  return (
    <div>
      <div className="flex items-center gap-2 text-success">
        <CheckCircle2 className="size-5" />
        <span className="text-sm font-medium">You&rsquo;re live. {orgName || "your operation"} is set up.</span>
      </div>

      <Step
        title="Get paid for it"
        sub="Connect Stripe and close-outs turn into invoices your members can pay by card or ACH, and sync straight to QuickBooks. Payouts go to your own bank account."
      >
        <div className="rounded-xl border bg-card p-4">
          <ul className="space-y-2 text-sm text-muted-foreground">
            {[
              "Invoices drafted from Hobbs or tach at close-out",
              "Card and ACH payments, with autopay if members want it",
              "QuickBooks sync, so your books close without re-keying",
            ].map((t) => (
              <li key={t} className="flex items-start gap-2.5">
                <Check className="mt-0.5 size-4 shrink-0 text-primary" /> {t}
              </li>
            ))}
          </ul>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row">
          <Button className="flex-1" onClick={startConnect} disabled={connect.isPending}>
            {connect.isPending ? <Loader2 className="size-4 animate-spin" /> : <CreditCard className="size-4" />}
            Connect Stripe
          </Button>
          <Button variant="outline" className="flex-1" onClick={onDone} disabled={connect.isPending}>
            I&rsquo;ll do this later
            <ArrowRight className="size-4" />
          </Button>
        </div>

        <SetupChecklistPreview limit={3} />

        <button
          type="button"
          onClick={onBack}
          className="text-xs text-muted-foreground hover:text-foreground"
          disabled={connect.isPending}
        >
          ← Back
        </button>
      </Step>
    </div>
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

  const [tail, setTail] = React.useState("");
  const [year, setYear] = React.useState(String(new Date().getFullYear()));
  const [hobbs, setHobbs] = React.useState("0");
  const [tach, setTach] = React.useState("0");
  const [rate, setRate] = React.useState(16500);
  const [make, setMake] = React.useState("");
  const [model, setModel] = React.useState("");
  //The wizard asks for category and class the same way the Aircraft page does, so a
  //helicopter school can finish setup. CATEGORY_CLASSES was a four-value list that could
  //not describe one. See components/aircraft/vocabulary.ts.
  const [category, setCategory] = React.useState<AircraftCategory>("airplane");
  const [aircraftClass, setAircraftClass] = React.useState<string>("single_engine_land");
  const [busy, setBusy] = React.useState(false);
  const [showErrors, setShowErrors] = React.useState(false);
  //Reported with the activation event so we can see whether the registry lookup is
  //actually carrying people through this step or whether they still type it all out.
  const [prefilledFromRegistry, setPrefilledFromRegistry] = React.useState(false);

  const tailErr = tail.trim() ? "" : "Enter a tail number.";
  //Optional here, exactly as on the Aircraft page: a year nobody knows must not stop
  //someone getting a tail onto the board.
  const yearErr = year.trim().length === 0 || year.trim().length === 4 ? "" : "Enter a 4-digit year.";
  const makeErr = make.trim() ? "" : "Enter the make.";
  const modelErr = model.trim() ? "" : "Enter the model.";

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
        //A name and nothing else. This used to 400 every time it ran: the server fed the
        //missing address straight to the geocoder, which threw, which read as "Address
        //does not seem to be valid." It went unnoticed because the branch only fires when
        //the org somehow has no location yet. The server now creates a location without
        //an address, which is the whole point of the field being optional.
        const loc = await createLocation.mutateAsync({ name: fallbackLocationName });
        locId = loc.id;
      }
      const res = await createPlane.mutateAsync({
        location: { id: locId },
        type: {
          plane: {
            tailNumber: tail.trim().toUpperCase(),
            make: make.trim(),
            model: model.trim(),
            year: year.trim(),
            category: category,
            aircraftClass: (aircraftClass || null) as AircraftClass | null,
            tachTime: Math.round((Number(tach) || 0) * 10),
            hobbsTime: Math.round((Number(hobbs) || 0) * 10),
            fuelCapacity: 0,
            fuelMeasurement: "gallons",
            cost: { wetRate: rate, billByHobbsTime: true },
          },
        },
      });
      // Activation. A school with no aircraft never books anything and never pays, so
      // this, not the signup, is the event a campaign should be judged on.
      track("first_aircraft_added", {
        prefilled: prefilledFromRegistry,
        channel: attributionChannel(),
        campaign: attributionSource() ?? null,
      });
      // Reported to the ad platforms as `activated`, the same reasoning as the comment
      // above: a signup that never adds an aircraft is not worth bidding for. Secondary
      // in the Ads account, so it is observed rather than optimised toward.
      trackAdConversion("activated");
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
      <Field id="ac-tail" label="Tail number" error={showErrors ? tailErr : ""}>
        <TailNumberField
          id="ac-tail"
          value={tail}
          onChange={setTail}
          onPick={(m) => {
            setTail(m.tailNumber);
            if (m.make) setMake(m.make);
            if (m.model) setModel(m.model);
            if (m.year) setYear(String(m.year));
            //Straight from the registry now, so a helicopter arrives as a rotorcraft
            //rather than leaving the pickers for the person to work out.
            if (m.category) setCategory(m.category as AircraftCategory);
            if (m.aircraftClass) setAircraftClass(m.aircraftClass);
            setPrefilledFromRegistry(true);
          }}
          invalid={showErrors && !!tailErr}
        />
      </Field>

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
      <div className="grid grid-cols-2 gap-3">
        <Field id="ac-cat" label="Category">
          <select
            id="ac-cat"
            value={category}
            onChange={(e) => {
              //Drop the class only if it does not belong to the new category, so a
              //programmatic change from the tail lookup does not wipe what it just set.
              const next = e.target.value as AircraftCategory;
              const allowed: string[] = CLASSES_BY_CATEGORY[next] ?? [];
              setCategory(next);
              if (!allowed.includes(aircraftClass)) setAircraftClass("");
            }}
            className="flex h-8 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40"
          >
            {AIRCRAFT_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {vocabLabel(c)}
              </option>
            ))}
          </select>
        </Field>
        {CLASSES_BY_CATEGORY[category]?.length > 0 && (
          <Field id="ac-class" label="Class">
            <select
              id="ac-class"
              value={aircraftClass}
              onChange={(e) => setAircraftClass(e.target.value)}
              className="flex h-8 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40"
            >
              <option value="">Select class</option>
              {CLASSES_BY_CATEGORY[category].map((c) => (
                <option key={c} value={c}>
                  {vocabLabel(c)}
                </option>
              ))}
            </select>
          </Field>
        )}
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Field id="ac-year" label="Year (optional)" error={showErrors ? yearErr : ""}>
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
                {["Set up in minutes. No sales call", "No credit card to start", "Every step writes real, usable data"].map(
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
