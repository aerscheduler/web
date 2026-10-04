/**
 * The maintenance shop's setup steps, after its name and airport: the shop's rates, the
 * aircraft in the hangar right now with its owner, and the first work order on it.
 *
 * Every step makes the REAL thing through the same endpoints the console uses (Settings >
 * Shop rates, Aircraft > A customer's aircraft and its Owners panel, Open a work order), so
 * there is nothing for setup to mark complete: the checklist reads the rates, the aircraft
 * and the job back from the data. And nothing here is sample data. A practice job in a real
 * shop is fiction somebody has to delete, the reason the flight wizard's "First flight" step
 * was removed; a person who wants to look first is pointed at the demo instead.
 */

import * as React from "react";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth";
import { isTechnician } from "@/lib/permissions";
import { api, apiList, ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";
import { track } from "@/lib/analytics";
import { trackAdConversion } from "@/lib/ads";
import { attributionChannel } from "@/lib/attribution";
import {
  useCreateLocation,
  useCreatePlane,
  useCreateWorkOrder,
  usePlanes,
  useSetWorkOrderSettings,
  useWorkOrderSettings,
} from "@/features/queries";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { MoneyInput } from "@/components/money-input";
import { TailNumberField } from "@/components/aircraft/tail-number-field";
import { EMAIL_RE } from "@/components/aircraft/aircraft-owner-field";
import { bpsFrom, pctText } from "@/components/settings/shop-rates-tab";
import {
  meterModeForCategory,
  type AircraftCategory,
  type AircraftClass,
} from "@/components/aircraft/vocabulary";
import { Field, Nav, Step } from "./wizard-parts";

function apiErr(e: unknown): string {
  if (e instanceof Error) return e.message;
  return "Something went wrong. Your entries are safe. Try again.";
}

/** Hours as typed ("2461.2") to the TENTHS every meter is stored in. */
const tenths = (text: string) => Math.max(0, Math.round((Number(text) || 0) * 10));

// ---------------------------------------------------------------- rates

/**
 * Labor rate and markups. Asked here, before the first job, because a job priced at $0 an
 * hour is the least convincing screen in the product. Markups start at 15%, which is what
 * Murray charges on both and a common default; the labor rate starts empty, because a rate
 * nobody chose that saves on Continue would bill every owner at a number we made up.
 */
export function ShopRatesStep({ onBack, onDone }: { onBack: () => void; onDone: () => void }) {
  const q = useWorkOrderSettings();
  const save = useSetWorkOrderSettings();
  const [rate, setRate] = React.useState<number | undefined>(undefined);
  const [parts, setParts] = React.useState("15");
  const [outside, setOutside] = React.useState("15");
  const [showErrors, setShowErrors] = React.useState(false);
  const loaded = React.useRef(false);

  // A shop coming back to this step (Back, or a refresh) sees what it saved, not the defaults.
  React.useEffect(() => {
    if (!q.data || loaded.current) return;
    loaded.current = true;
    if (q.data.laborRateCents != null) setRate(q.data.laborRateCents);
    if (q.data.partsMarkupBps != null) setParts(pctText(q.data.partsMarkupBps));
    if (q.data.outsideWorkMarkupBps != null) setOutside(pctText(q.data.outsideWorkMarkupBps));
  }, [q.data]);

  const partsBps = bpsFrom(parts);
  const outsideBps = bpsFrom(outside);
  const rateErr = rate == null || rate <= 0 ? "Enter your hourly labor rate, or skip this for now." : rate > 100_000_000 ? "At most $1,000,000.00 an hour." : "";
  const markupErr = partsBps === undefined || outsideBps === undefined ? "A markup is a percentage from 0 to 1000, like 15." : "";

  async function submit() {
    if (rateErr || markupErr) {
      setShowErrors(true);
      document.getElementById(rateErr ? "shop-rate" : "shop-parts")?.focus();
      return;
    }
    try {
      await save.mutateAsync({ laborRateCents: rate ?? null, partsMarkupBps: partsBps, outsideWorkMarkupBps: outsideBps });
      onDone();
    } catch (e) {
      toast.error(apiErr(e));
    }
  }

  return (
    <Step
      title="Your shop rates"
      sub="Every labor line on a work order starts at your rate, and parts and outside work at cost plus your markup. A line keeps the price it was given, so changing these later never reprices a job."
    >
      <Field id="shop-rate" label="Labor rate per hour" error={showErrors ? rateErr : ""}>
        <MoneyInput id="shop-rate" cents={rate} onCentsChange={setRate} onClear={() => setRate(undefined)} placeholder="125.00" />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field id="shop-parts" label="Markup on parts">
          <PercentInput id="shop-parts" value={parts} onChange={setParts} invalid={showErrors && partsBps === undefined} />
        </Field>
        <Field id="shop-outside" label="Markup on outside work">
          <PercentInput id="shop-outside" value={outside} onChange={setOutside} invalid={showErrors && outsideBps === undefined} />
        </Field>
      </div>
      {showErrors && markupErr ? <p className="text-xs text-destructive">{markupErr}</p> : null}
      <p className="text-xs leading-relaxed text-muted-foreground">
        Technicians log their hours at this rate; only an admin changes a price. Outside work is a
        prop overhaul or a radio repair you send out. Change any of it later in Settings, Shop rates.
      </p>
      <Nav onBack={onBack} onNext={submit} busy={save.isPending} onSkip={onDone} />
    </Step>
  );
}

function PercentInput({
  id,
  value,
  onChange,
  invalid,
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  invalid?: boolean;
}) {
  return (
    <div className="relative">
      <Input id={id} inputMode="decimal" value={value} onChange={(e) => onChange(e.target.value)} className="pr-7 tnum" aria-invalid={invalid} placeholder="15" />
      <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-muted-foreground">%</span>
    </div>
  );
}

// ---------------------------------------------------------------- the aircraft

type CreatedAircraft = { id: number; tail: string; hobbs: number; tach: number };

/**
 * The aircraft in the hangar right now, and who owns it.
 *
 * A customer's aircraft (`use: "shop"`): no rate, no flying day, never bookable, never on
 * the plan. The owner is added the way the Aircraft page adds one, and is who the job bills.
 * An address already on the roster (in a brand-new shop, usually the person signing up) is
 * a question, not an error: the same "use them, or add a new person" the Owners panel asks.
 */
export function CustomerAircraftStep({
  locationId,
  fallbackLocationName,
  onBack,
  onSkip,
  onCreated,
}: {
  locationId: number | null;
  fallbackLocationName: string;
  onBack: () => void;
  onSkip: () => void;
  onCreated: (aircraft: CreatedAircraft) => void;
}) {
  const createPlane = useCreatePlane();
  const createLocation = useCreateLocation();

  const [tail, setTail] = React.useState("");
  const [make, setMake] = React.useState("");
  const [model, setModel] = React.useState("");
  const [year, setYear] = React.useState("");
  //See `serial` in the flight wizard's aircraft step: carried from the registry pick only, and
  //cleared the moment the tail is edited, because a wrong serial is worse than none.
  const [serial, setSerial] = React.useState("");
  //No pickers on this screen (a shop sees mostly singles, and the Aircraft page has them):
  //an aeroplane unless the registry row says otherwise, so a helicopter picked from the
  //lookup still arrives as a rotorcraft with the right meters.
  const [category, setCategory] = React.useState<AircraftCategory>("airplane");
  const [aircraftClass, setAircraftClass] = React.useState<string | null>("single_engine_land");
  const [hobbs, setHobbs] = React.useState("");
  const [tach, setTach] = React.useState("");
  const [ownerName, setOwnerName] = React.useState("");
  const [ownerEmail, setOwnerEmail] = React.useState("");
  const [ownerPhone, setOwnerPhone] = React.useState("");
  const [showErrors, setShowErrors] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  //Added, but its owner is waiting on an answer (the address is somebody's already).
  const [added, setAdded] = React.useState<CreatedAircraft | null>(null);
  const [conflict, setConflict] = React.useState<{ message: string; orgUserId: number; name: string } | null>(null);
  const submitting = React.useRef(false);

  const tailErr = tail.trim() ? "" : "Enter a tail number.";
  const makeErr = make.trim() ? "" : "Enter the make.";
  const modelErr = model.trim() ? "" : "Enter the model.";
  const yearErr = !year.trim() || year.trim().length === 4 ? "" : "Enter a 4-digit year.";
  const ownerNameErr = ownerName.trim() ? "" : "Who owns it? The job is billed to them.";
  const ownerEmailErr = ownerEmail.trim() && !EMAIL_RE.test(ownerEmail.trim()) ? "That email address doesn't look right." : "";

  async function addOwner(aircraft: CreatedAircraft, extra: { orgUserId?: number; createAnyway?: boolean } = {}) {
    const body = extra.orgUserId
      ? { orgUserId: extra.orgUserId, isPrimary: true }
      : {
          name: ownerName.trim(),
          email: ownerEmail.trim() || undefined,
          phone: ownerPhone.trim() || undefined,
          isPrimary: true,
          ...(extra.createAnyway ? { createAnyway: true } : {}),
        };
    try {
      await api(`/resources/${aircraft.id}/owners`, { method: "POST", body });
      setConflict(null);
      onCreated(aircraft);
    } catch (err) {
      const conflictBody =
        err instanceof ApiError && err.status === 409
          ? (err.body as { message?: string; conflict?: { orgUserId: number; name: string } } | undefined)
          : undefined;
      if (conflictBody?.conflict) {
        setAdded(aircraft);
        setConflict({
          message: conflictBody.message ?? apiErr(err),
          orgUserId: conflictBody.conflict.orgUserId,
          name: conflictBody.conflict.name,
        });
        return;
      }
      //The aircraft is on file; only its owner failed. Carry on to the job, which can be
      //opened without an owner, and say where to add one.
      toast.error(`${aircraft.tail} is added, but its owner was not: ${apiErr(err)}. Add them on the aircraft's Owners panel.`);
      onCreated(aircraft);
    }
  }

  async function submit() {
    if (submitting.current) return;
    if (added) {
      //The aircraft exists and the owner's address was a question. Save again means the
      //details were corrected: try the owner once more.
      if (ownerNameErr || ownerEmailErr) return setShowErrors(true);
      submitting.current = true;
      setBusy(true);
      try {
        await addOwner(added);
      } finally {
        submitting.current = false;
        setBusy(false);
      }
      return;
    }
    const firstInvalid = tailErr
      ? "shop-tail"
      : makeErr
        ? "shop-make"
        : modelErr
          ? "shop-model"
          : yearErr
            ? "shop-year"
            : ownerNameErr
              ? "shop-owner-name"
              : ownerEmailErr
                ? "shop-owner-email"
                : "";
    if (firstInvalid) {
      setShowErrors(true);
      document.getElementById(firstInvalid)?.focus();
      return;
    }
    submitting.current = true;
    setBusy(true);
    try {
      let locId = locationId;
      if (!locId) {
        const { data } = await apiList<{ id: number }>("/locations");
        locId = data[0]?.id ?? null;
      }
      if (!locId) {
        const loc = await createLocation.mutateAsync({ name: (fallbackLocationName.trim() || "Home").slice(0, 60) });
        locId = loc.id;
      }
      const tailNumber = tail.trim().toUpperCase();
      const res = await createPlane.mutateAsync({
        location: { id: locId },
        use: "shop",
        type: {
          plane: {
            tailNumber,
            serialNumber: serial || undefined,
            make: make.trim(),
            model: model.trim(),
            year: year.trim(),
            category,
            aircraftClass: (aircraftClass || null) as AircraftClass | null,
            meterMode: meterModeForCategory(category, "hobbs_and_tach"),
            hobbsTime: tenths(hobbs),
            tachTime: tenths(tach),
            fuelCapacity: 0,
            fuelMeasurement: "gallons",
          },
        },
      });
      const aircraft = { id: res.id, tail: tailNumber, hobbs: tenths(hobbs), tach: tenths(tach) };
      //The shop's version of first_aircraft_added: a customer's tail in the hangar.
      track("first_customer_aircraft_added", { prefilled: serial !== "" || category !== "airplane", channel: attributionChannel() });
      await addOwner(aircraft);
    } catch (e) {
      toast.error(apiErr(e));
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }

  async function useExisting() {
    if (!added || !conflict || submitting.current) return;
    submitting.current = true;
    setBusy(true);
    try {
      await addOwner(added, { orgUserId: conflict.orgUserId });
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }

  async function addAnyway() {
    if (!added || submitting.current) return;
    submitting.current = true;
    setBusy(true);
    try {
      await addOwner(added, { createAnyway: true });
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }

  return (
    <Step
      title="The aircraft in your hangar right now"
      sub="A customer's aircraft and who owns it. It gets its own inspections and history, it is never bookable to fly, and it does not count toward what you pay."
    >
      <Field id="shop-tail" label="Tail number" error={showErrors ? tailErr : ""}>
        <TailNumberField
          id="shop-tail"
          value={tail}
          onChange={(v) => {
            setTail(v);
            setSerial("");
          }}
          onPick={(m) => {
            setTail(m.tailNumber);
            if (m.make) setMake(m.make);
            if (m.model) setModel(m.model);
            if (m.serialNumber) setSerial(m.serialNumber);
            if (m.year) setYear(String(m.year));
            if (m.category) {
              setCategory(m.category as AircraftCategory);
              setAircraftClass(m.aircraftClass ?? null);
            }
          }}
          invalid={showErrors && !!tailErr}
          autoFocus
        />
      </Field>
      <div className="grid grid-cols-3 gap-3">
        <Field id="shop-make" label="Make" error={showErrors ? makeErr : ""}>
          <Input id="shop-make" value={make} onChange={(e) => setMake(e.target.value)} placeholder="Cessna" aria-invalid={showErrors && !!makeErr} disabled={!!added} />
        </Field>
        <Field id="shop-model" label="Model" error={showErrors ? modelErr : ""}>
          <Input id="shop-model" value={model} onChange={(e) => setModel(e.target.value)} placeholder="182P" aria-invalid={showErrors && !!modelErr} disabled={!!added} />
        </Field>
        <Field id="shop-year" label="Year" error={showErrors ? yearErr : ""}>
          <Input
            id="shop-year"
            inputMode="numeric"
            maxLength={4}
            value={year}
            onChange={(e) => setYear(e.target.value.replace(/[^0-9]/g, ""))}
            placeholder="1974"
            className="tnum"
            aria-invalid={showErrors && !!yearErr}
            disabled={!!added}
          />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field id="shop-hobbs" label="Hobbs as it arrived">
          <Input id="shop-hobbs" inputMode="decimal" value={hobbs} onChange={(e) => setHobbs(e.target.value)} placeholder="2461.2" className="tnum" disabled={!!added} />
        </Field>
        <Field id="shop-tach" label="Tach as it arrived">
          <Input id="shop-tach" inputMode="decimal" value={tach} onChange={(e) => setTach(e.target.value)} placeholder="1987.4" className="tnum" disabled={!!added} />
        </Field>
      </div>

      <div className="space-y-3 rounded-xl border p-4">
        <p className="text-sm font-medium">Who owns it</p>
        <Field id="shop-owner-name" label="Name" error={showErrors ? ownerNameErr : ""}>
          <Input id="shop-owner-name" value={ownerName} onChange={(e) => setOwnerName(e.target.value)} placeholder="Dana Whitfield" aria-invalid={showErrors && !!ownerNameErr} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field id="shop-owner-email" label="Email" error={showErrors ? ownerEmailErr : ""}>
            <Input id="shop-owner-email" type="email" value={ownerEmail} onChange={(e) => setOwnerEmail(e.target.value)} placeholder="dana@example.com" aria-invalid={showErrors && !!ownerEmailErr} />
          </Field>
          <Field id="shop-owner-phone" label="Phone">
            <Input id="shop-owner-phone" type="tel" value={ownerPhone} onChange={(e) => setOwnerPhone(e.target.value)} placeholder="(208) 555-0142" />
          </Field>
        </div>
        <p className="text-xs leading-relaxed text-muted-foreground">
          The email is where they hear the aircraft has arrived and is ready, approve the work you
          find, and get the invoice. Adding them here sends nothing on its own.
        </p>
        {conflict ? (
          <div className="space-y-2 rounded-lg bg-muted/60 p-3 text-sm" role="alert">
            <p>{conflict.message}</p>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={useExisting} disabled={busy}>
                Use {conflict.name}
              </Button>
              <Button size="sm" variant="outline" onClick={addAnyway} disabled={busy}>
                Add {ownerName.trim() || "them"} as a new person
              </Button>
            </div>
          </div>
        ) : null}
      </div>

      <Nav
        onBack={added ? undefined : onBack}
        onNext={submit}
        nextLabel={added ? "Add the owner" : "Add aircraft"}
        busy={busy}
        onSkip={added ? () => onCreated(added) : onSkip}
      />
      {/* For somebody with nothing in the hangar today: the demo's sample shop, never sample
          data in their own. A new tab, because a demo session lives in its tab and leaves the
          shop they just made signed in here. */}
      <p className="text-xs text-muted-foreground">
        Nothing in the hangar today?{" "}
        <a href="/demo?to=work-orders" target="_blank" rel="noopener" className="font-medium text-foreground underline-offset-2 hover:underline">
          Look around a sample shop
        </a>{" "}
        in a new tab first.
      </p>
    </Step>
  );
}

// ---------------------------------------------------------------- the first job

/** What owners ask for most, as a start the person can tap and then edit. */
const ASKS = ["Annual inspection", "100-hour inspection", "Oil change", "Squawk", "Avionics", "Pre-buy inspection"];

/**
 * The first work order, on the aircraft just added (or, after a refresh, the newest
 * customer aircraft on file). One question, what the owner asked for, and whether the
 * aircraft is here yet. The bill-to is the aircraft's owner, which the server fills in;
 * the person signing up is put on the job when they hold the technician role, which a
 * shop's founder does.
 */
export function FirstJobStep({
  aircraft,
  onBack,
  onSkip,
  onCreated,
}: {
  aircraft: CreatedAircraft | null;
  onBack: () => void;
  onSkip: () => void;
  onCreated: (workOrderId: number) => void;
}) {
  const { orgUserId, roles } = useAuth();
  const create = useCreateWorkOrder();
  const shopPlanes = usePlanes({ scope: "shop" }, { enabled: aircraft == null });
  const fallback = React.useMemo(() => {
    const newest = [...(shopPlanes.data ?? [])].sort((a, b) => b.id - a.id)[0];
    if (!newest) return null;
    return {
      id: newest.id,
      tail: newest.type?.plane?.tailNumber ?? "",
      hobbs: newest.type?.plane?.hobbsTime ?? 0,
      tach: newest.type?.plane?.tachTime ?? 0,
    };
  }, [shopPlanes.data]);
  const target = aircraft ?? fallback;

  const [complaint, setComplaint] = React.useState("");
  const [here, setHere] = React.useState(true);
  const [showErrors, setShowErrors] = React.useState(false);
  const submitting = React.useRef(false);

  const complaintErr = complaint.trim() ? "" : "Write down what the owner asked for. A tap on one of the above is fine.";

  function addAsk(ask: string) {
    setComplaint((cur) => {
      const t = cur.trim();
      if (!t) return ask + ".";
      if (t.toLowerCase().includes(ask.toLowerCase())) return cur;
      return `${t.replace(/\.$/, "")}. ${ask}.`;
    });
  }

  async function submit() {
    if (!target || submitting.current) return;
    if (complaintErr) {
      setShowErrors(true);
      document.getElementById("shop-complaint")?.focus();
      return;
    }
    submitting.current = true;
    try {
      const job = await create.mutateAsync({
        resourceId: target.id,
        status: here ? "received" : "scheduled",
        complaint: complaint.trim(),
        //In the hangar: the meters it arrived with, which the aircraft step just recorded.
        ...(here ? { hobbsIn: target.hobbs || null, tachIn: target.tach || null } : {}),
        ...(orgUserId != null && isTechnician(roles) ? { technicianOrgUserIds: [orgUserId] } : {}),
        //Trying the product never emails a real customer: the job page offers Tell the owner.
        holdOwnerNotices: true,
      });
      //A shop's activation: the job, not a flight. Reported to the ad platforms the way
      //first_aircraft_added is for a school, so a shop campaign is judged on jobs opened.
      track("first_work_order_opened", { received: here, channel: attributionChannel() });
      trackAdConversion("activated");
      onCreated(job.id);
    } catch (e) {
      toast.error(apiErr(e));
    } finally {
      submitting.current = false;
    }
  }

  if (!target) {
    return (
      <Step title="Open your first work order" sub="Add a customer's aircraft first; the job hangs off it.">
        <Nav onBack={onBack} onNext={onBack} nextLabel="Add the aircraft" onSkip={onSkip} busy={shopPlanes.isLoading} />
      </Step>
    );
  }

  return (
    <Step
      title={`Open the first work order on ${target.tail}`}
      sub="One job for this visit. It gets a number, its own page, and everything that follows: what you find, the owner's answer, your labor and parts, and the invoice."
    >
      <Field id="shop-complaint" label="What did the owner ask for?" error={showErrors ? complaintErr : ""}>
        <div className="flex flex-wrap gap-2 pb-1">
          {ASKS.map((ask) => (
            <button
              key={ask}
              type="button"
              onClick={() => addAsk(ask)}
              className="rounded-full border px-3 py-1.5 text-xs font-medium transition-colors hover:bg-accent"
            >
              {ask}
            </button>
          ))}
        </div>
        <Textarea
          id="shop-complaint"
          value={complaint}
          onChange={(e) => setComplaint(e.target.value)}
          placeholder="Annual inspection. Left brake feels soft."
          rows={3}
          maxLength={2000}
          aria-invalid={showErrors && !!complaintErr}
        />
      </Field>
      <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Where is the aircraft?">
        {[
          { value: true, label: "It's in the hangar", blurb: "Received, with the meters it came in on." },
          { value: false, label: "It's coming in", blurb: "Scheduled. Record the meters when it lands." },
        ].map((opt) => (
          <button
            key={String(opt.value)}
            type="button"
            role="radio"
            aria-checked={here === opt.value}
            onClick={() => setHere(opt.value)}
            className={cn(
              "rounded-lg border px-3 py-2.5 text-left transition-colors",
              here === opt.value ? "border-primary bg-primary/5 ring-1 ring-primary" : "hover:bg-accent"
            )}
          >
            <div className="text-sm font-medium">{opt.label}</div>
            <div className="mt-0.5 text-xs text-muted-foreground">{opt.blurb}</div>
          </button>
        ))}
      </div>
      {/* The job opens on hold (holdOwnerNotices): say so before the click, so nobody wonders
          whether their customer just got an email. */}
      <p className="text-xs leading-relaxed text-muted-foreground">
        Nothing is emailed to the owner yet. When you're ready, Tell the owner on the job sends them a short note
        that {target.tail} {here ? "has arrived" : "is booked in"}.
      </p>
      <Nav onBack={onBack} onNext={submit} nextLabel="Open work order" busy={create.isPending} onSkip={onSkip} />
    </Step>
  );
}
