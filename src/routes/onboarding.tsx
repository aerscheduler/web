import * as React from "react";

import { createFileRoute, redirect, useNavigate, Link } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, CheckCircle2, Loader2 } from "lucide-react";
import { isAuthenticated, needsEmailVerification, useAuth, isStaffSync, isAdminSync } from "@/lib/auth";
import {
  clearOnboardingSticky,
  readStickyStep,
  writeStickyStep,
} from "@/lib/onboarding-sticky";
import { AirportField, countryName, subdivisionOf } from "@/components/facilities/airport-field";
import type { AirportMatch } from "@/types/api";
import {
  useConnectStripe,
  useCreateLocation,
  useCreatePlane,
  useUpdateLocation,
  useUpdateOrganization,
  useUpdateOrgUserPreferences,
} from "@/features/queries";
import { api, apiList, ApiError } from "@/lib/api";
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
  pickerIntentFromSource,
  resolveSetupSource,
  type SetupIntent,
} from "@/lib/onboarding-intent";
import { track } from "@/lib/analytics";
import { trackAdConversion } from "@/lib/ads";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { TailNumberField } from "@/components/aircraft/tail-number-field";
import {
  AIRCRAFT_CATEGORIES,
  CLASSES_BY_CATEGORY,
  meterModeForCategory,
  label as vocabLabel,
  type AircraftCategory,
  type AircraftClass,
} from "@/components/aircraft/vocabulary";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { MoneyInput } from "@/components/money-input";
import { AUTH_CONTROL, AuthShell } from "@/components/auth-shell";
import { PeopleGroupsEmptyGraphic } from "@/components/empty-graphics/people-groups";
import { InstructorsEmptyGraphic } from "@/components/empty-graphics/instructors";
import { AircraftEmptyGraphic } from "@/components/empty-graphics/aircraft";
import { LocationsEmptyGraphic } from "@/components/empty-graphics/locations";
import { DocsHint } from "@/components/docs-hint";
import { PerPlanePricingNote } from "@/components/subscription/plan";
import { toast } from "sonner";

export const Route = createFileRoute("/onboarding")({
  beforeLoad: () => {
    if (!isAuthenticated()) throw redirect({ to: "/login" });
    if (needsEmailVerification()) throw redirect({ to: "/verify-email" });
  },
  validateSearch: (search: Record<string, unknown>): { restart?: boolean } => {
    const restart = search.restart === true || search.restart === "1" || search.restart === "true";
    return restart ? { restart: true } : {};
  },
  component: Onboarding,
});

/** Replay the wizard from the persona picker. Local `npm run dev` only. */
function useWizardRestart() {
  const { restart } = Route.useSearch();
  return Boolean(import.meta.env.DEV && restart);
}

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

/** First airport/site id for this org, or null when the list is empty. Throws on a failed GET. */
async function firstLocationId(): Promise<number | null> {
  const { data } = await apiList<{ id: number }>("/locations");
  const id = data[0]?.id;
  return typeof id === "number" && Number.isFinite(id) ? id : null;
}

// ---------------------------------------------------------------- orchestrator

function Onboarding() {
  const { organization } = useAuth();
  const restart = useWizardRestart();
  const [persona, setPersona] = React.useState<Persona | null>(null);
  const sticky = readStickyStep(organization?.id);

  React.useEffect(() => {
    if (restart) clearOnboardingSticky();
  }, [restart]);

  // Complete, and this tab is not mid-wizard. sticky 2 keeps billing; sticky 1
  // keeps aircraft after Back. A new tab has no sticky, so complete → AllSet.
  // `?restart=1` on the local dev server ignores that so the wizard can be walked
  // again without reseeding.
  if (!restart && organization?.preferences?.newOrgOnboardingComplete && sticky == null) {
    return <AllSet name={organization.name} />;
  }
  // A member who joined an incomplete school is not an operator. Create operation,
  // Add aircraft, and Continue-with-an-org-already (PATCH) all require admin, and
  // local `?restart=1` must not punch through that.
  if (organization && !isAdminSync()) {
    return <AllSet name={organization.name} />;
  }
  // Org already exists (refresh after Create operation). Skip the persona picker
  // so they cannot mint a second school; resume aircraft or billing from sticky.
  if (!restart && organization && !persona) {
    const resume: Exclude<Persona, "student"> =
      organization.organizationType === "solo_instructor" ? "instructor" : "school";
    return <OperationFlow persona={resume} onBack={() => setPersona(null)} />;
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
  return <OperationFlow persona={persona} replay={restart} onBack={() => setPersona(null)} />;
}

function AllSet({ name }: { name: string }) {
  const home = isStaffSync() ? "/dashboard" : "/me";
  const label = home === "/me" ? "Go to Home" : "Go to dashboard";
  return (
    <Shell>
      <div className="text-left">
        <h1 className="text-[28px] font-semibold tracking-tight sm:text-[32px]">You&rsquo;re all set</h1>
        <p className="mt-2 text-[15px] leading-relaxed text-muted-foreground">
          {home === "/me"
            ? `${name} is ready.`
            : `${name} is ready. Remaining setup is on your dashboard.`}
        </p>
        <Button asChild size="lg" className={`mt-8 ${AUTH_CONTROL}`}>
          <Link to={home}>{label}</Link>
        </Button>
      </div>
    </Shell>
  );
}

// ---------------------------------------------------------------- persona router

function PersonaRouter({ onPick }: { onPick: (p: Persona) => void }) {
  return (
    <Shell wide>
      <Step
        title="What brings you to AerScheduler?"
        sub="Join a school with a code, or start your own operation. This picks the path, not a preference you can flip later."
      >
        <div className="grid gap-3 lg:grid-cols-3">
          <PersonaCard
            graphic={PeopleGroupsEmptyGraphic}
            title="I'm joining an organization"
            blurb="A student or renter with a code from your school or club."
            onClick={() => onPick("student")}
          />
          <PersonaCard
            graphic={InstructorsEmptyGraphic}
            title="I'm an independent instructor"
            blurb="Just you. If you teach at a school, join with their code instead."
            onClick={() => onPick("instructor")}
          />
          <PersonaCard
            graphic={AircraftEmptyGraphic}
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
  graphic: Graphic,
  title,
  blurb,
  onClick,
  selected,
}: {
  graphic: React.ComponentType<{ className?: string }>;
  title: string;
  blurb: string;
  onClick: () => void;
  selected?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex h-full flex-col items-start gap-3 rounded-xl border p-4 text-left transition-colors hover:border-primary/50 hover:bg-accent/40 sm:p-5",
        selected && "border-primary bg-primary/5 ring-1 ring-primary"
      )}
    >
      <Graphic />
      <span className="min-w-0">
        <span className="block font-medium">{title}</span>
        <span className="mt-0.5 block text-xs text-muted-foreground">{blurb}</span>
      </span>
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
    <Shell>
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
            <Button size="lg" className={AUTH_CONTROL} onClick={submit} disabled={busy || !code.trim()}>
              {busy ? <Loader2 className="size-4 animate-spin" /> : null}
              Join
              {!busy && <ArrowRight className="size-4" />}
            </Button>
          </div>
          <button
            type="button"
            onClick={onBack}
            disabled={busy}
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            Don&rsquo;t have a code? Set up an operation instead.
          </button>
        </Step>
      )}
    </Shell>
  );
}

// ---------------------------------------------------------------- operation flow

const SUBTYPES: {
  key: OrgType;
  label: string;
  blurb: string;
  graphic: React.ComponentType<{ className?: string }>;
}[] = [
  {
    key: "flight_school",
    label: "Flight school",
    blurb: "Students, instructors, a training fleet.",
    graphic: AircraftEmptyGraphic,
  },
  {
    key: "flying_club",
    label: "Flying club",
    blurb: "Members share aircraft and split the costs.",
    graphic: PeopleGroupsEmptyGraphic,
  },
  {
    key: "rental",
    label: "Rental / FBO",
    blurb: "You rent aircraft to checked-out pilots.",
    graphic: LocationsEmptyGraphic,
  },
];

/**
 * Everyone who is starting an operation: solo CFI, school, club, FBO.
 *
 * One flow rather than two, because after the type is chosen they differ only in
 * wording. The operation itself is type, name and home airport, then what to set
 * up first, then a tail, then optional billing, then product updates. The rest of
 * setup is a checklist on the dashboard, where it can be done in any order, by
 * any admin, on any day.
 *
 * There is deliberately no "book your first flight" step. It used to create a solo
 * reservation for the owner, which is a fiction at any operation where the owner
 * isn't the one flying, and it put a placeholder on a real schedule board that
 * somebody then had to cancel. Booking is the first item on the dashboard checklist
 * instead, pointing at the real form.
 */
function OperationFlow({
  persona,
  onBack,
  replay = false,
}: {
  persona: Exclude<Persona, "student">;
  onBack: () => void;
  /** Local `?restart=1`: start at type/name even though the org already exists. */
  replay?: boolean;
}) {
  const { user, organization, createOrganization, markOrgOnboardingComplete, rehydrate } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const updateOrg = useUpdateOrganization();
  const updateLocation = useUpdateLocation();
  const updatePrefs = useUpdateOrgUserPreferences();

  const solo = persona === "instructor";
  const who = user?.name?.trim().split(" ")[0];
  const attribution = React.useMemo(() => readAttribution(), []);

  const creating = React.useRef(false);
  const finishing = React.useRef(false);
  // Resume on aircraft if the org already exists (refresh after Create operation,
  // before billing). Sticky step 2 keeps a refresh on the Stripe nudge.
  const [step, setStep] = React.useState(() => {
    if (replay) return 0;
    const sticky = readStickyStep(organization?.id);
    if (sticky) return sticky;
    return organization ? 1 : 0;
  });
  const [orgPage, setOrgPage] = React.useState(0);
  const [busy, setBusy] = React.useState(false);
  const [showErrors, setShowErrors] = React.useState(false);
  const [subtype, setSubtype] = React.useState<OrgType>(() => {
    const t = organization?.organizationType;
    if (t === "flight_school" || t === "flying_club" || t === "rental" || t === "solo_instructor") {
      return t;
    }
    return solo ? "solo_instructor" : "flight_school";
  });
  const [orgName, setOrgName] = React.useState(
    organization?.name?.trim() ||
      (solo ? (who ? `${who}'s Flight Instruction` : "My Flight Instruction") : "")
  );
  const [airport, setAirport] = React.useState("");
  //Set only by choosing a row from the lookup. Everything derived from it (the address,
  //and the time zone every booking here will be read in) is absent for a typed-out field,
  //which is exactly what onboarding has always sent.
  const [airportPick, setAirportPick] = React.useState<AirportMatch | null>(null);
  const [locationId, setLocationId] = React.useState<number | null>(null);
  const [homeLocation, setHomeLocation] = React.useState<{
    id: number;
    name: string;
    address?: {
      streetAddress1?: string;
      streetAddress2?: string | null;
      city?: string;
      state?: string;
      zipCode?: string;
      country?: string;
    } | null;
  } | null>(null);
  const [intent, setIntent] = React.useState<SetupIntent | null>(() => inferredIntent(attribution) ?? "scheduling");
  const [heardFrom, setHeardFrom] = React.useState<string | null>(null);
  const [heardFromDetail, setHeardFromDetail] = React.useState("");
  const [wantUpdates, setWantUpdates] = React.useState(true);
  const heardFromRef = React.useRef(heardFrom);
  const heardFromDetailRef = React.useRef(heardFromDetail);
  const wantUpdatesRef = React.useRef(wantUpdates);
  heardFromRef.current = heardFrom;
  heardFromDetailRef.current = heardFromDetail;
  wantUpdatesRef.current = wantUpdates;

  React.useEffect(() => {
    if (replay) return;
    if (!organization?.id || step < 1) return;
    writeStickyStep(organization.id, step);
  }, [organization?.id, step, replay]);

  React.useEffect(() => {
    if (!organization) return;
    let cancelled = false;
    void apiList<{
      id: number;
      name: string;
      address?: {
        streetAddress1?: string;
        streetAddress2?: string | null;
        city?: string;
        state?: string;
        zipCode?: string;
        country?: string;
      } | null;
    }>("/locations")
      .then(({ data: locs }) => {
        const row = locs[0];
        if (cancelled || !row) return;
        setLocationId(row.id);
        setHomeLocation(row);
        // A refresh on aircraft, then Back, remounts this form empty. Fill the airport
        // from the location we already created, without overwriting a typed value.
        setAirport((cur) => cur || row.name);
      })
      .catch(() => {
        // Best-effort fill after a refresh. Add aircraft can still create a location.
      });
    return () => {
      cancelled = true;
    };
  }, [organization]);

  const intentTouched = React.useRef(false);
  React.useEffect(() => {
    if (!organization?.id) return;
    let cancelled = false;
    void api<{ source?: string | null }>("/organizations/onboarding")
      .then((row) => {
        if (cancelled || intentTouched.current) return;
        const next = pickerIntentFromSource(row.source);
        if (next) setIntent(next);
      })
      .catch(() => {
        // Attribution was cleared at create. A failed read leaves the picker on
        // the inferred default; they can still pick before Continue.
      });
    return () => {
      cancelled = true;
    };
  }, [organization?.id]);

  function locationFields() {
    return {
      name: (airport.trim() || orgName.trim() || "Home").slice(0, 60),
      address: airportPick
        ? {
            ...EMPTY_ADDRESS,
            city: airportPick.municipality ?? "",
            state: subdivisionOf(airportPick),
            country: countryName(airportPick.isoCountry),
          }
        : { ...EMPTY_ADDRESS },
      timeZone: airportPick?.timeZone ?? null,
    };
  }

  async function applyUpdatesPref(want: boolean) {
    // Always write, including true. A failed Finish after an opt-out would
    // otherwise leave the server on false when they re-check and retry.
    await updatePrefs.mutateAsync({
      notificationPreferences: {
        emailNotificationPreferences: { onboardingTips: want },
      },
    });
  }

  async function submitOrg() {
    if (creating.current) return;
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
    creating.current = true;
    setBusy(true);
    try {
      if (organization) {
        // Back from aircraft lands here. POST /organizations would mint a second school.
        // PATCH the one we already made, including the home airport.
        await updateOrg.mutateAsync({
          name: orgName.trim(),
          organizationType: subtype,
        });
        if (intentTouched.current && intent) {
          await api("/organizations/onboarding", {
            method: "PATCH",
            body: { source: intent },
          });
        }
        let locationWriteFailed = false;
        const locId = locationId ?? homeLocation?.id ?? (await firstLocationId());
        if (locId && airportPick) {
          const loc = locationFields();
          try {
            await updateLocation.mutateAsync({
              id: locId,
              name: loc.name,
              address: loc.address,
              timeZone: loc.timeZone ?? null,
              coordinates: { lat: airportPick.latitude, lng: airportPick.longitude },
            });
            setLocationId(locId);
            setHomeLocation({ id: locId, name: loc.name, address: loc.address });
          } catch (e) {
            if (!(e instanceof ApiError && (e.status === 403 || e.status === 404))) throw e;
            locationWriteFailed = true;
          }
        } else if (locId) {
          // Typed without a lookup row: rename the site, keep city/state/zone.
          // Sending an empty address here would wipe the airport we already saved.
          setLocationId(locId);
          type LocRow = {
            id: number;
            name: string;
            address?: {
              streetAddress1?: string;
              streetAddress2?: string | null;
              city?: string;
              state?: string;
              zipCode?: string;
              country?: string;
            } | null;
          };
          let saved: LocRow | null = homeLocation;
          if (!saved || saved.id !== locId) {
            try {
              const { data } = await apiList<LocRow>("/locations");
              saved = data.find((row) => row.id === locId) ?? data[0] ?? null;
            } catch {
              saved = null;
            }
          }
          const newName = (airport.trim() || orgName.trim()).slice(0, 60);
          if (saved && newName && newName !== saved.name) {
            const existing = saved.address ?? {};
            try {
              await updateLocation.mutateAsync({
                id: locId,
                name: newName,
                address: {
                  streetAddress1: existing.streetAddress1 ?? "",
                  streetAddress2: existing.streetAddress2 ?? "",
                  city: existing.city ?? "",
                  state: existing.state ?? "",
                  zipCode: existing.zipCode ?? "",
                  country: existing.country ?? "",
                },
              });
              setHomeLocation({ id: locId, name: newName, address: existing });
            } catch (e) {
              if (!(e instanceof ApiError && (e.status === 403 || e.status === 404))) throw e;
              locationWriteFailed = true;
            }
          }
        }
        if (locationWriteFailed) {
          setLocationId(null);
          toast.error("Could not update the home airport. Try again.");
          await rehydrate();
          return;
        }
        await rehydrate();
        setStep(1);
        return;
      }
      const source =
        resolveSetupSource({
          intent: intentTouched.current ? intent : null,
          src: attribution?.src,
          landingPath: attribution?.landingPath,
          utmCampaign: attribution?.utm_campaign,
          utmSource: attribution?.utm_source,
        }) ?? intent;
      const attributionBody = attributionPayload();
      const loc = locationFields();
      const created = await createOrganization({
        name: orgName.trim(),
        organizationType: subtype,
        details: { email: user?.email ?? "", phone: "", address: { ...EMPTY_ADDRESS } },
        //A picked airport carries its city, state, country and zone. Typed by hand it is a
        //bare name against an empty address, exactly as before. The zone is the one that
        //matters: without it every booking at this school renders in whatever zone the
        //reader's device is in, rather than the field's.
        location: loc,
        // Intent (or inferred campaign) orders the dashboard checklist.
        source,
        // Campaign tuple for spend reporting, plus optional human "how did you hear".
        attribution: attributionBody,
      });
      writeStickyStep(created.id, 1);
      // The single most important event in the product: a school now exists. Everything
      // upstream is a cost, and this is the first thing that could become revenue.
      track("org_created", {
        org_type: subtype,
        persona,
        channel: attributionChannel(),
        campaign: source,
        intent,
        heard_from: null,
        marketing_updates: null,
      });
      clearAttribution();
      const locId = await firstLocationId();
      if (locId) setLocationId(locId);
      setStep(1);
    } catch (e) {
      toast.error(apiErr(e));
    } finally {
      creating.current = false;
      setBusy(false);
    }
  }

  /** Aircraft is done or skipped. Stripe is optional; the wizard is not finished yet. */
  function toBilling() {
    writeStickyStep(organization?.id, 2);
    setStep(2);
  }

  function toUpdates() {
    writeStickyStep(organization?.id, 3);
    setStep(3);
  }

  async function finishUpdates() {
    if (finishing.current) return;
    finishing.current = true;
    setBusy(true);
    const heard = heardFromRef.current;
    const heardDetail = heardFromDetailRef.current.trim();
    const want = wantUpdatesRef.current;
    try {
      await applyUpdatesPref(want);
      if (heard) {
        await api("/organizations/onboarding", {
          method: "PATCH",
          body: {
            heardFrom: heard,
            ...(heardDetail ? { heardFromDetail: heardDetail.slice(0, 255) } : {}),
          },
        });
      }
      track("onboarding_updates_recorded", {
        heard_from: heard,
        marketing_updates: want,
        channel: attributionChannel(),
      });
      await updateOrg.mutateAsync({ preferences: { newOrgOnboardingComplete: true } });
      markOrgOnboardingComplete();
      finish();
    } catch (e) {
      toast.error(apiErr(e));
    } finally {
      finishing.current = false;
      setBusy(false);
    }
  }

  function finish() {
    clearOnboardingSticky();
    qc.clear();
    void navigate({ to: isStaffSync() ? "/dashboard" : "/me" });
  }

  const heardDetailLabel = HEARD_FROM_OPTIONS.find((o) => o.id === heardFrom)?.detailLabel;
  // School: type → name+airport → intent. Solo skips type.
  const namePage = solo ? 0 : 1;
  const intentPage = solo ? 1 : 2;

  function goOrgNext() {
    if (orgPage === namePage) {
      if (!orgName.trim()) {
        setShowErrors(true);
        document.getElementById("op-orgName")?.focus();
        return;
      }
      setShowErrors(false);
      setOrgPage(intentPage);
      return;
    }
    if (orgPage < intentPage) {
      setOrgPage((p) => p + 1);
      return;
    }
    void submitOrg();
  }

  function goOrgBack() {
    if (orgPage > 0) {
      setShowErrors(false);
      setOrgPage((p) => p - 1);
      return;
    }
    onBack();
  }

  return (
    <Shell stepKey={`${step}-${orgPage}`} wide={step === 0 && !solo && orgPage === 0}>
      {step === 0 && !solo && orgPage === 0 && (
        <Step
          title="What kind of operation?"
          sub="This just labels the school. You can change it later."
        >
          <div className="grid gap-3 lg:grid-cols-3">
            {SUBTYPES.map((s) => (
              <PersonaCard
                key={s.key}
                graphic={s.graphic}
                title={s.label}
                blurb={s.blurb}
                selected={subtype === s.key}
                onClick={() => setSubtype(s.key)}
              />
            ))}
          </div>
          <Nav
            onBack={organization && !replay ? undefined : goOrgBack}
            onNext={goOrgNext}
            busy={busy}
          />
        </Step>
      )}

      {step === 0 && orgPage === namePage && (
        <Step
          title={solo ? "Name your operation" : "Tell us about your operation"}
          sub="Just enough to hang a schedule on. You can change any of it later."
        >
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
                setAirport(`${m.ident} ${m.name}`.slice(0, 60));
              }}
              //VarChar(60) on the server, which does not truncate.
              maxLength={60}
              placeholder="KAPA"
            />
          </Field>
          <Nav
            onBack={organization && orgPage === 0 ? undefined : goOrgBack}
            onNext={goOrgNext}
            busy={busy}
          />
        </Step>
      )}

      {step === 0 && orgPage === intentPage && (
        <Step
          title="What do you want working first?"
          sub="We will put that at the top of your setup checklist. Everything else stays available."
        >
          <div id="op-intent">
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {SETUP_INTENTS.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => {
                    intentTouched.current = true;
                    setIntent(opt.id);
                  }}
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

          <Nav
            onBack={goOrgBack}
            onNext={goOrgNext}
            nextLabel={solo || organization ? "Continue" : "Create operation"}
            busy={busy}
          />
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
          fallbackLocationName={airport.trim() || orgName.trim() || organization?.name || "Home"}
          onBack={() => {
            setOrgPage(solo ? 0 : 1);
            setStep(0);
          }}
          onSkip={toBilling}
          onCreated={toBilling}
        />
      )}

      {step === 2 && (
        <BillingStep
          onBack={() => setStep(1)}
          onSkip={toUpdates}
          onConnectLeaving={() => writeStickyStep(organization?.id, 3)}
        />
      )}

      {step === 3 && (
        <Step
          title="A few tips while you get going"
          sub="If the board is still empty or billing isn't connected, a short email with the next step. Not a newsletter, and not invoices. Turn them off anytime in notification settings."
        >
          <label className="flex cursor-pointer items-start gap-3 rounded-lg border p-4">
            <Checkbox
              className="mt-0.5"
              checked={wantUpdates}
              onCheckedChange={(v) => setWantUpdates(v === true)}
            />
            <span>
              <span className="block text-sm font-medium">Send me those tips</span>
              <span className="mt-0.5 block text-xs text-muted-foreground">
                The next useful step, not a product digest.
              </span>
            </span>
          </label>

          <div>
            <Label>How did you hear about us? <span className="font-normal text-muted-foreground">(optional)</span></Label>
            <div className="mt-2 flex flex-wrap gap-2">
              {HEARD_FROM_OPTIONS.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  aria-pressed={heardFrom === opt.id}
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

          <Nav onBack={() => setStep(2)} onNext={finishUpdates} nextLabel="Finish" busy={busy} />
        </Step>
      )}
    </Shell>
  );
}

/**
 * Optional Stripe Connect, then out.
 *
 * Connect is what turns close-outs into money (invoices, card and ACH payments),
 * so it earns a place in the wizard. It does not earn the right to block anyone:
 * skip still continues, and the same item is waiting on the dashboard checklist.
 *
 * Note this is Connect (the school charging its members), not the per-aircraft
 * subscription (us charging the school). The trial runs regardless and is shown on
 * Settings → Plan.
 */
function BillingStep({
  onBack,
  onSkip,
  onConnectLeaving,
}: {
  onBack: () => void;
  onSkip: () => void;
  /** Stripe takes them off-origin. Leave the wizard on the next step for when they return. */
  onConnectLeaving: () => void;
}) {
  const connect = useConnectStripe();
  const [error, setError] = React.useState<string | null>(null);

  async function startConnect() {
    setError(null);
    try {
      const { url } = await connect.mutateAsync();
      // Recorded before the redirect, because Stripe's hosted onboarding is a different
      // origin, once we hand off we cannot see whether they finished, only whether they
      // started. The completion shows up later as Connect being enabled on the org.
      track("stripe_connect_started", { channel: attributionChannel() });
      onConnectLeaving();
      window.location.href = url;
    } catch (e) {
      const message = apiErr(e);
      setError(message);
      toast.error(message);
    }
  }

  return (
    <div data-testid="onboarding-billing">
      <Step
        title="Get paid when you close out"
        sub="Connect Stripe so members pay invoices by card or ACH. Payouts go to your bank. You can do this later from the dashboard."
      >
        {error ? (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        ) : null}
        <Nav
          onBack={onBack}
          onNext={startConnect}
          nextLabel="Connect Stripe"
          busy={connect.isPending}
          onSkip={onSkip}
        />
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
  onBack?: () => void;
}) {
  const createPlane = useCreatePlane();
  const createLocation = useCreateLocation();

  const [tail, setTail] = React.useState("");
  const [year, setYear] = React.useState("");
  const [hobbs, setHobbs] = React.useState("0");
  const [tach, setTach] = React.useState("0");
  const [rate, setRate] = React.useState(16500);
  const [rateBasis, setRateBasis] = React.useState<"wet" | "dry">("wet");
  const [billByHobbs, setBillByHobbs] = React.useState(true);
  const [make, setMake] = React.useState("");
  const [model, setModel] = React.useState("");
  //Filled by the tail-number lookup only; there is no box for it, because three steps is
  //the point of this flow and nobody is walking out to the aeroplane mid-signup. It still
  //has to be carried, though: an AD's applicability is written against a serial number, and
  //this is the screen every school goes through, so a fleet's very first aircraft was the
  //one arriving without one.
  //
  //INVISIBLE STATE, SO IT IS CLEARED THE MOMENT THE TAIL IS TOUCHED. Nothing on this screen
  //shows the serial, which makes a stale one genuinely dangerous rather than merely untidy:
  //pick N172SP from the lookup, correct the tail to the aeroplane you actually meant, and
  //without this the school's first aircraft is created carrying a different airframe's data
  //plate. A wrong serial is worse than no serial, because the whole point of the field is
  //deciding whether an Airworthiness Directive applies. `TailNumberField` calls `onChange`
  //before `onPick` (see its `choose`), so clearing on every keystroke costs a genuine pick
  //nothing: the clear lands first, then the pick sets it.
  const [serial, setSerial] = React.useState("");
  //The wizard asks for category and class the same way the Aircraft page does, so a
  //helicopter school can finish setup. CATEGORY_CLASSES was a four-value list that could
  //not describe one. See components/aircraft/vocabulary.ts.
  const [category, setCategory] = React.useState<AircraftCategory>("airplane");
  const [aircraftClass, setAircraftClass] = React.useState<string>("single_engine_land");
  const [busy, setBusy] = React.useState(false);
  const submitting = React.useRef(false);
  const [showErrors, setShowErrors] = React.useState(false);
  //Reported with the activation event so we can see whether the registry lookup is
  //actually carrying people through this step or whether they still type it all out.
  const [prefilledFromRegistry, setPrefilledFromRegistry] = React.useState(false);
  const meterless = category === "glider" || category === "lighter_than_air";

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
    if (submitting.current) return;
    submitting.current = true;
    setBusy(true);
    try {
      let locId = locationId ?? (await firstLocationId());
      if (!locId) {
        //A name and nothing else. This used to 400 every time it ran: the server fed the
        //missing address straight to the geocoder, which threw, which read as "Address
        //does not seem to be valid." It went unnoticed because the branch only fires when
        //the org somehow has no location yet. The server now creates a location without
        //an address, which is the whole point of the field being optional.
        const loc = await createLocation.mutateAsync({
          name: (fallbackLocationName.trim() || "Home").slice(0, 60),
        });
        locId = loc.id;
      }
      const res = await createPlane.mutateAsync({
        location: { id: locId },
        type: {
          plane: {
            tailNumber: tail.trim().toUpperCase(),
            serialNumber: serial || undefined,
            make: make.trim(),
            model: model.trim(),
            year: year.trim(),
            category: category,
            aircraftClass: (aircraftClass || null) as AircraftClass | null,
            tachTime: Math.round((Number(tach) || 0) * 10),
            hobbsTime: Math.round((Number(hobbs) || 0) * 10),
            //THE WIZARD HAS TO SEND THIS OR IT CREATES A GLIDER WITH METERS.
            //
            //The column defaults to `hobbs_and_tach`, so leaving it off was not neutral:
            //a soaring club's very first aircraft, added on the one screen they cannot
            //skip, came out claiming a Hobbs and a tach. There is no Meters control here
            //on purpose (three steps is the point of this flow), so it is derived from the
            //category with the same helper the Aircraft page uses.
            meterMode: meterModeForCategory(category, "hobbs_and_tach"),
            fuelCapacity: 0,
            fuelMeasurement: "gallons",
            cost: {
              billByHobbsTime: billByHobbs,
              ...(rateBasis === "wet" ? { wetRate: rate } : { dryRate: rate }),
            },
          },
        },
      });
      // Activation. A school with no aircraft never books anything and never pays, so
      // this, not the signup, is the event a campaign should be judged on.
      track("first_aircraft_added", {
        prefilled: prefilledFromRegistry,
        channel: attributionChannel(),
        campaign: attributionSource() ?? null,
        rate_basis: rateBasis,
        bill_by_hobbs: billByHobbs,
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
      submitting.current = false;
      setBusy(false);
    }
  }

  return (
    <Step title={title} sub={sub}>
      <Field id="ac-tail" label="Tail number" error={showErrors ? tailErr : ""}>
        <TailNumberField
          id="ac-tail"
          value={tail}
          onChange={(v) => {
            setTail(v);
            //See the `serial` declaration: it belongs to the tail that was picked, and this
            //screen never shows it, so it does not outlive an edit to that tail.
            setSerial("");
          }}
          onPick={(m) => {
            setTail(m.tailNumber);
            if (m.make) setMake(m.make);
            if (m.model) setModel(m.model);
            //Same rule as the make and the model: take the registry's value when the row
            //carries one, keep what is already there when it does not. A row with no serial
            //arrives as null, so this never blanks anything.
            if (m.serialNumber) setSerial(m.serialNumber);
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
          <Select
            value={category}
            onValueChange={(v) => {
              const next = v as AircraftCategory;
              const allowed: string[] = CLASSES_BY_CATEGORY[next] ?? [];
              setCategory(next);
              if (!allowed.includes(aircraftClass)) setAircraftClass("");
            }}
          >
            <SelectTrigger id="ac-cat" className={`w-full ${AUTH_CONTROL}`}>
              <SelectValue placeholder="Select category" />
            </SelectTrigger>
            <SelectContent>
              {AIRCRAFT_CATEGORIES.map((c) => (
                <SelectItem key={c} value={c}>
                  {vocabLabel(c)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field id="ac-class" label="Class">
          <Select
            value={aircraftClass || undefined}
            onValueChange={(v) => {
              if (v && (CLASSES_BY_CATEGORY[category] ?? []).includes(v as never)) {
                setAircraftClass(v);
              }
            }}
            disabled={!CLASSES_BY_CATEGORY[category]?.length}
          >
            <SelectTrigger id="ac-class" className={`w-full ${AUTH_CONTROL}`}>
              <SelectValue
                placeholder={
                  CLASSES_BY_CATEGORY[category]?.length ? "Select class" : "Not applicable"
                }
              >
                {aircraftClass ? vocabLabel(aircraftClass) : undefined}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {(CLASSES_BY_CATEGORY[category] ?? []).map((c) => (
                <SelectItem key={c} value={c}>
                  {vocabLabel(c)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
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
      {!meterless && (
        <>
          <Field id="ac-rate" label="Rate">
            <MoneyInput id="ac-rate" cents={rate} onCentsChange={setRate} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field id="ac-basis" label="Rate basis" hint={<DocsHint topic="rate-basis" />}>
              <Select value={rateBasis} onValueChange={(v) => setRateBasis(v as "wet" | "dry")}>
                <SelectTrigger id="ac-basis" className={`w-full ${AUTH_CONTROL}`}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="wet">Wet (fuel included)</SelectItem>
                  <SelectItem value="dry">Dry</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field id="ac-bill-by" label="Bill by">
              <Select
                value={billByHobbs ? "hobbs" : "tach"}
                onValueChange={(v) => setBillByHobbs(v === "hobbs")}
              >
                <SelectTrigger id="ac-bill-by" className={`w-full ${AUTH_CONTROL}`}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="hobbs">Hobbs</SelectItem>
                  <SelectItem value="tach">Tach</SelectItem>
                </SelectContent>
              </Select>
            </Field>
          </div>
        </>
      )}
      {meterless && (
        <p className="rounded-lg border bg-muted/40 p-3 text-xs text-muted-foreground">
          This category has no meters, so flights are not invoiced automatically. Raise
          charges from Billing when you need them.
        </p>
      )}
      <PerPlanePricingNote />
      <p className="text-xs leading-relaxed text-muted-foreground">
        This is enough to put it on the schedule. On Aircraft you can add serial, fuel,
        seats, engine and gear, flying day, and inspections.
      </p>
      <Nav onBack={onBack} onNext={submit} nextLabel="Add aircraft" busy={busy} onSkip={onSkip} />
    </Step>
  );
}


// ---------------------------------------------------------------- primitives

function Shell({
  stepKey,
  wide,
  children,
}: {
  stepKey?: string | number;
  wide?: boolean;
  children: React.ReactNode;
}) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  return (
    <AuthShell
      variant="page"
      scrollKey={stepKey}
      aside={
        user?.email ? (
          <div className="flex min-w-0 items-center justify-end gap-3">
            <span className="min-w-0 max-w-40 truncate sm:max-w-56" title={user.email}>
              {user.email}
            </span>
            <button
              type="button"
              className="shrink-0 font-medium text-foreground hover:text-primary"
              onClick={() => {
                logout();
                void navigate({ to: "/login" });
              }}
            >
              Sign out
            </button>
          </div>
        ) : undefined
      }
    >
      <div
        key={stepKey ?? "single"}
        className={cn("onboard-step-in", !wide && "mx-auto w-full max-w-xl")}
      >
        {children}
      </div>
    </AuthShell>
  );
}

function Step({ title, sub, children }: { title: string; sub?: string; children: React.ReactNode }) {
  return (
    <div>
      <h1 className="text-[28px] font-semibold tracking-tight text-balance sm:text-[32px]">{title}</h1>
      {sub && <p className="mt-2 text-[15px] leading-relaxed text-muted-foreground">{sub}</p>}
      <div className="mt-8 space-y-4">{children}</div>
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
  hint?: React.ReactNode;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5 [&_input]:h-11 [&_select]:h-11">
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
      <Button size="lg" className={AUTH_CONTROL} onClick={onNext} disabled={nextDisabled || busy}>
        {busy ? <Loader2 className="size-4 animate-spin" /> : null}
        {nextLabel}
        {!busy && <ArrowRight className="size-4" />}
      </Button>
    </div>
  );
}
