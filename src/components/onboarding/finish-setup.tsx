import * as React from "react";
import { Link } from "@tanstack/react-router";
import {
  ArrowRight,
  Check,
  CheckCircle2,
  GraduationCap,
  Loader2,
  MonitorPlay,
  Rocket,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { useCreateRating, useRatings, useRooms, useSimulators } from "@/features/queries";
import { ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MoneyInput } from "@/components/money-input";
import { PlanCard, useSubStatus } from "@/components/subscription/plan";

/**
 * The school / club / FBO "Finish setting up" checklist — shown AFTER the first
 * reservation (the activation aha), never before. Leads with the plan/trial
 * summary (per-aircraft subscription), then an optional 2-item checklist. Nothing
 * here gates the first booking.
 */
export function FinishSetup({
  orgName,
  defaultInstructorRate = 6500,
  onGoToDashboard,
  busy,
}: {
  orgName: string;
  defaultInstructorRate?: number;
  onGoToDashboard: () => void;
  busy?: boolean;
}) {
  const status = useSubStatus();
  const ratings = useRatings();
  const sims = useSimulators();
  const rooms = useRooms();

  const hasRate = (ratings.data?.length ?? 0) > 0;
  const hasFacility = (sims.data?.length ?? 0) + (rooms.data?.length ?? 0) > 0;
  const done = [hasRate, hasFacility].filter(Boolean).length;

  return (
    <div>
      <div className="flex items-center gap-2 text-success">
        <CheckCircle2 className="size-5" />
        <span className="text-sm font-medium">You're live — {orgName || "your operation"} is set up.</span>
      </div>
      <h1 className="mt-3 text-[22px] font-semibold tracking-tight text-balance">Finish setting up</h1>
      <p className="mt-1.5 text-sm text-muted-foreground">
        Do these now or anytime from your dashboard — nothing here blocks you from flying.
      </p>

      {/* Plan / trial summary — always shown, not part of the checklist count. */}
      {status && (
        <div className="mt-5">
          <PlanCard status={status} />
        </div>
      )}

      {/* optional checklist */}
      <div className="mt-5 flex items-center gap-3">
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-primary transition-all duration-500"
            style={{ width: `${(done / 2) * 100}%` }}
          />
        </div>
        <span className="text-xs tabular-nums text-muted-foreground">{done}/2</span>
      </div>

      <div className="mt-4 space-y-3">
        <RateCard done={hasRate} defaultRate={defaultInstructorRate} />
        <FacilitiesCard done={hasFacility} />
      </div>

      <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <Link
          to="/people"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <Users className="size-4" /> Invite instructors &amp; members
        </Link>
        <Button onClick={onGoToDashboard} disabled={busy}>
          {busy ? <Loader2 className="size-4 animate-spin" /> : <Rocket className="size-4" />}
          Go to dashboard
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- checklist cards

function CardShell({
  icon: Icon,
  title,
  done,
  children,
}: {
  icon: typeof GraduationCap;
  title: string;
  done?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("rounded-xl border bg-card p-4 transition-colors", done && "bg-muted/30")}>
      <div className="flex items-start gap-3">
        <span
          className={cn(
            "mt-0.5 grid size-9 shrink-0 place-items-center rounded-lg",
            done ? "bg-success/15 text-success" : "bg-primary/10 text-primary"
          )}
        >
          {done ? <Check className="size-5" /> : <Icon className="size-5" />}
        </span>
        <div className="min-w-0 flex-1">
          <div className="font-medium">{title}</div>
          {children}
        </div>
      </div>
    </div>
  );
}

function RateCard({ done, defaultRate }: { done: boolean; defaultRate: number }) {
  const create = useCreateRating();
  const [name, setName] = React.useState("Private Pilot");
  const [rate, setRate] = React.useState(defaultRate);

  async function save() {
    try {
      await create.mutateAsync({
        name: name.trim() || "Flight Instruction",
        defaultInstructorRate: rate,
        anyInstructorCanTeach: true,
      });
      toast.success("Instruction rate saved.");
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Couldn't save the rate");
    }
  }

  if (done) {
    return (
      <CardShell icon={GraduationCap} title="Instruction types &amp; rates" done>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Rate set — lessons are priceable. Add more in Settings → Rates.
        </p>
      </CardShell>
    );
  }

  return (
    <CardShell icon={GraduationCap} title="Set an instruction rate">
      <p className="mt-0.5 text-sm text-muted-foreground">A lesson isn't priceable until a rating has a rate.</p>
      <div className="mt-3 space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="fs-rate-name" className="text-xs">
            Instruction type
          </Label>
          <Input id="fs-rate-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Private Pilot" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="fs-rate" className="text-xs">
            Per hour
          </Label>
          <div className="flex items-center gap-2">
            <div className="flex-1">
              <MoneyInput id="fs-rate" cents={rate} onCentsChange={setRate} />
            </div>
            <Button onClick={save} disabled={create.isPending}>
              {create.isPending ? <Loader2 className="size-4 animate-spin" /> : "Save"}
            </Button>
          </div>
        </div>
      </div>
    </CardShell>
  );
}

function FacilitiesCard({ done }: { done: boolean }) {
  if (done) {
    return (
      <CardShell icon={MonitorPlay} title="Simulators &amp; classrooms" done>
        <p className="mt-0.5 text-sm text-muted-foreground">Added — they're bookable on the schedule (and free).</p>
      </CardShell>
    );
  }
  return (
    <CardShell icon={MonitorPlay} title="Add simulators &amp; classrooms">
      <p className="mt-0.5 text-sm text-muted-foreground">
        Make your sims and ground-school rooms bookable alongside aircraft — they're free, no per-seat charge.
      </p>
      <Button asChild size="sm" variant="outline" className="mt-3">
        <Link to="/facilities">
          Add facilities <ArrowRight className="size-4" />
        </Link>
      </Button>
    </CardShell>
  );
}
