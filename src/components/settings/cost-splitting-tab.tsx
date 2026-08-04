import { useMemo, useState } from "react";
import { AlertTriangle, Check, Loader2, RotateCcw, Split, Users } from "lucide-react";
import { toast } from "sonner";
import {
  useApplySplitPreset,
  useClearSplitRules,
  useSetSplitRule,
  useSplitRules,
} from "@/features/queries";
import type {
  ChargeLine,
  SplitPreset,
  SplitRulesDescription,
  WorkedExample,
} from "@/types/api";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/states";
import { ResponsiveModal } from "@/components/responsive-modal";
import { ApiError } from "@/lib/api";
import { typeLabel } from "@/components/schedule/meta";
import type { ReservationType } from "@/types/api";

/**
 * How this organization divides the cost of a booking between the people on it.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────
 * WHY THIS SCREEN IS MOSTLY EXPLANATION
 * ─────────────────────────────────────────────────────────────────────────────────────
 *
 * The setting itself is a five-way choice per charge line. The hard part is not making
 * the choice, it is understanding what it will do — and one of the five, "each pays in
 * full", MULTIPLIES what the school collects rather than dividing it. An operator who
 * picks it expecting a division would overcharge every student on every group booking
 * and find out from a parent.
 *
 * So every option carries a worked example with real money in it, and those examples are
 * computed BY THE SERVER'S OWN APPORTIONMENT ENGINE (`utils/splitExamples.ts`) rather
 * than written here as prose or re-derived in the browser. That is the whole point: the
 * figure shown on this screen is the figure that will land on the invoice, by
 * construction, and it cannot drift from the billing code because it IS the billing code.
 *
 * The same applies to the vocabulary — the list of rules, the labels, the blurbs and the
 * per-type limits all arrive from the server. Nothing about what a rule means is
 * hardcoded here.
 */
export function CostSplittingTab() {
  const q = useSplitRules();

  if (q.isPending) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-72" />
        </CardHeader>
        <CardContent className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full" />
          ))}
        </CardContent>
      </Card>
    );
  }

  if (q.isError) {
    return (
      <Card>
        <CardContent className="p-0">
          <ErrorState error={q.error} onRetry={() => void q.refetch()} />
        </CardContent>
      </Card>
    );
  }

  return <CostSplitting data={q.data!} />;
}

function CostSplitting({ data }: { data: SplitRulesDescription }) {
  const configured = data.rules.length > 0;

  return (
    <div className="space-y-4">
      <HowItWorks configured={configured} />
      <Presets data={data} />
      <RuleMatrix data={data} />
      <Reference data={data} />
    </div>
  );
}

// ── The explainer at the top ────────────────────────────────────────────────────────

function HowItWorks({ configured }: { configured: boolean }) {
  return (
    <Card>
      <CardHeader className="flex-row items-start gap-2.5">
        <span className="grid size-8 shrink-0 place-items-center rounded-md bg-primary/10 text-primary">
          <Split className="size-4" />
        </span>
        <div>
          <CardTitle>Cost splitting</CardTitle>
          <CardDescription>
            When more than one person is on a booking, these rules decide who is charged what.
            Each person gets their own invoice.
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <div className="rounded-md border bg-muted/40 p-3 text-muted-foreground">
          <p className="mb-2">
            A booking is priced in two parts, and each part can be split differently — a
            classroom class can charge every student the full instruction rate while the room
            itself is shared.
          </p>
          <p>
            Rules only ever apply when there are <strong>two or more people</strong> on a
            booking. A booking with one person is always invoiced exactly as it is today,
            whatever these say.
          </p>
        </div>

        {!configured && (
          <div className="flex items-start gap-2 rounded-md border border-dashed p-3 text-muted-foreground">
            <Users className="mt-0.5 size-4 shrink-0" />
            <p>
              You haven't set any rules yet, so every booking bills one person for the whole
              thing — exactly as it always has. Pick the kind of operation you run below to
              get sensible defaults, or set individual rules yourself.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ── Presets ────────────────────────────────────────────────────────────────────────

function Presets({ data }: { data: SplitRulesDescription }) {
  const [preview, setPreview] = useState<SplitPreset | null>(null);
  const apply = useApplySplitPreset();
  const clear = useClearSplitRules();

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Start from your kind of operation</CardTitle>
          <CardDescription>
            These are starting points, not modes — each one just writes the rules below, and
            you can change any of them afterwards.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-2 sm:grid-cols-2">
            {data.presets.map((p) => (
              <button
                key={p.key}
                type="button"
                onClick={() => setPreview(p)}
                className="rounded-md border p-3 text-left transition-colors hover:border-primary/50 hover:bg-accent/40"
              >
                <div className="font-medium">{p.label}</div>
                <div className="mt-0.5 text-sm text-muted-foreground">{p.summary}</div>
              </button>
            ))}
          </div>

          {data.rules.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              disabled={clear.isPending}
              onClick={() => {
                clear.mutate(undefined, {
                  onSuccess: () => toast.success("Back to one invoice per booking."),
                  onError: (e) =>
                    toast.error(e instanceof ApiError ? e.message : "Could not clear the rules."),
                });
              }}
            >
              {clear.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <RotateCcw className="size-4" />
              )}
              Clear all rules
            </Button>
          )}
        </CardContent>
      </Card>

      {/* Shows the EXACT rules before committing. Nobody should have their billing
          rewritten by a button whose effect they could not read first. */}
      <ResponsiveModal
        open={!!preview}
        onOpenChange={(o) => !o && setPreview(null)}
        title={preview ? `Use the ${preview.label.toLowerCase()} defaults?` : ""}
        description={
          preview
            ? "This replaces every rule you have now with the ones below. Nothing is billed differently until your next close-out."
            : ""
        }
      >
        {preview && (
          <div className="space-y-3">
            <ul className="space-y-2">
              {preview.rules.map((r, i) => (
                <li key={i} className="rounded-md border p-2.5 text-sm">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Badge variant="secondary">
                      {r.reservationType
                        ? typeLabel(r.reservationType as ReservationType)
                        : "All bookings"}
                    </Badge>
                    <span className="text-muted-foreground">
                      {data.copy.chargeLines[r.chargeLine].label}
                    </span>
                    <span aria-hidden>→</span>
                    <span className="font-medium">
                      {data.copy.apportionments[r.apportionment].label}
                    </span>
                  </div>
                  <p className="mt-1.5 text-muted-foreground">{r.rationale}</p>
                </li>
              ))}
            </ul>

            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setPreview(null)}>
                Cancel
              </Button>
              <Button
                disabled={apply.isPending}
                onClick={() => {
                  apply.mutate(preview.key, {
                    onSuccess: () => {
                      toast.success(`Using the ${preview.label.toLowerCase()} defaults.`);
                      setPreview(null);
                    },
                    onError: (e) =>
                      toast.error(
                        e instanceof ApiError ? e.message : "Could not apply those defaults."
                      ),
                  });
                }}
              >
                {apply.isPending && <Loader2 className="size-4 animate-spin" />}
                Use these rules
              </Button>
            </div>
          </div>
        )}
      </ResponsiveModal>
    </>
  );
}

// ── The rule matrix ────────────────────────────────────────────────────────────────

/** Booking types that can never hold two people have nothing to split. */
function typeCanSplit(data: SplitRulesDescription, type: string): boolean {
  const limits = data.personnelLimits[type];
  return !!limits && Object.values(limits).some((n) => n > 1);
}

function RuleMatrix({ data }: { data: SplitRulesDescription }) {
  const splittable = data.bookableTypes.filter((t) => typeCanSplit(data, t));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Rules by booking type</CardTitle>
        <CardDescription>
          Set a rule for a specific kind of booking, or leave it on the default. Booking types
          that only ever have one person paying aren't listed.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {splittable.map((type) => (
          <div key={type} className="rounded-md border">
            <div className="flex items-center gap-2 border-b bg-muted/40 px-3 py-2">
              <span className="font-medium">{typeLabel(type as ReservationType)}</span>
              <span className="text-xs text-muted-foreground">
                up to {Math.max(...Object.values(data.personnelLimits[type] ?? {}))} people
              </span>
            </div>
            <div className="divide-y">
              {data.chargeLines.map((line) => (
                <RuleRow key={line} data={data} type={type} line={line} />
              ))}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function RuleRow({
  data,
  type,
  line,
}: {
  data: SplitRulesDescription;
  type: string;
  line: ChargeLine;
}) {
  const set = useSetSplitRule();
  const plan = data.resolved[type];
  const current = plan?.lines[line] ?? data.productDefault;
  const source = plan?.sources[line] ?? "product_default";
  const isDefault = source === "product_default";

  const example = useMemo(
    () => data.examples.find((e) => e.chargeLine === line && e.apportionment === current),
    [data.examples, line, current]
  );

  return (
    <div className="p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-2 text-sm font-medium">
            {data.copy.chargeLines[line].label}
            {isDefault ? (
              <Badge variant="outline" className="text-xs font-normal">
                Default
              </Badge>
            ) : (
              <Badge className="text-xs font-normal">
                <Check className="mr-0.5 size-3" /> Set by you
              </Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground">{data.copy.chargeLines[line].blurb}</p>
        </div>

        {!isDefault && (
          <Button
            variant="ghost"
            size="sm"
            disabled={set.isPending}
            onClick={() =>
              set.mutate(
                { reservationType: type, chargeLine: line, apportionment: null },
                {
                  onSuccess: () => toast.success("Back to the default."),
                  onError: (e) =>
                    toast.error(e instanceof ApiError ? e.message : "Could not clear that rule."),
                }
              )
            }
          >
            Reset
          </Button>
        )}
      </div>

      <div className="mt-2 flex flex-wrap gap-1.5">
        {data.apportionments.map((a) => {
          const active = a === current;
          return (
            <button
              key={a}
              type="button"
              disabled={set.isPending}
              onClick={() =>
                set.mutate(
                  { reservationType: type, chargeLine: line, apportionment: a },
                  {
                    onError: (e) =>
                      toast.error(
                        e instanceof ApiError ? e.message : "Could not save that rule."
                      ),
                  }
                )
              }
              className={[
                "rounded-full border px-2.5 py-1 text-xs transition-colors",
                active
                  ? "border-primary bg-primary text-primary-foreground"
                  : "hover:border-primary/50 hover:bg-accent",
              ].join(" ")}
            >
              {data.copy.apportionments[a].label}
            </button>
          );
        })}
      </div>

      <p className="mt-2 text-xs text-muted-foreground">
        {data.copy.apportionments[current].blurb}
      </p>

      {example && <ExampleBlock example={example} compact />}
    </div>
  );
}

// ── Worked examples ────────────────────────────────────────────────────────────────

/**
 * A worked example, straight from the server.
 *
 * `totalNote` is rendered prominently on purpose: for "each pays in full" it is the line
 * that says the revenue MULTIPLIES, which is the one thing an operator must not miss.
 */
function ExampleBlock({ example, compact }: { example: WorkedExample; compact?: boolean }) {
  const multiplies = /NOT a division/i.test(example.totalNote);

  return (
    <div className={["rounded-md border bg-muted/30 p-2.5", compact ? "mt-2" : "mt-0"].join(" ")}>
      <div className="text-xs font-medium text-muted-foreground">{example.scenario}</div>

      {example.refusal ? (
        <div className="mt-1.5 flex items-start gap-1.5 text-xs text-muted-foreground">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
          <span>{example.refusal}</span>
        </div>
      ) : (
        <>
          <ul className="mt-1.5 space-y-0.5 text-xs">
            {example.perPayer.map((p) => (
              <li key={p.name} className="flex items-baseline justify-between gap-3">
                <span className={p.free ? "text-muted-foreground" : ""}>
                  {p.name}
                  <span className="text-muted-foreground"> · {p.hours}h</span>
                </span>
                <span className={p.free ? "text-muted-foreground" : "font-medium tabular-nums"}>
                  {p.free ? "not charged" : p.amount}
                </span>
              </li>
            ))}
          </ul>

          <div className="mt-1.5 flex items-baseline justify-between gap-3 border-t pt-1.5 text-xs">
            <span className="text-muted-foreground">You collect</span>
            <span className="font-semibold tabular-nums">{example.total}</span>
          </div>

          <p
            className={[
              "mt-1 text-xs",
              multiplies ? "font-medium text-amber-600 dark:text-amber-500" : "text-muted-foreground",
            ].join(" ")}
          >
            {multiplies && <AlertTriangle className="mr-1 inline size-3" />}
            {example.totalNote}
          </p>
        </>
      )}
    </div>
  );
}

// ── Reference: what every option does ──────────────────────────────────────────────

function Reference({ data }: { data: SplitRulesDescription }) {
  const [line, setLine] = useState<ChargeLine>(data.chargeLines[0]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">What each option does</CardTitle>
        <CardDescription>
          Every figure below is produced by the same code that prices your invoices, so this
          is exactly what would happen.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap gap-1.5">
          {data.chargeLines.map((l) => (
            <button
              key={l}
              type="button"
              onClick={() => setLine(l)}
              className={[
                "rounded-full border px-2.5 py-1 text-xs transition-colors",
                l === line
                  ? "border-primary bg-primary text-primary-foreground"
                  : "hover:border-primary/50 hover:bg-accent",
              ].join(" ")}
            >
              {data.copy.chargeLines[l].label}
            </button>
          ))}
        </div>

        <div className="grid gap-3 lg:grid-cols-2">
          {data.apportionments.map((a) => {
            const example = data.examples.find(
              (e) => e.chargeLine === line && e.apportionment === a
            );
            return (
              <div key={a} className="rounded-md border p-3">
                <div className="text-sm font-medium">{data.copy.apportionments[a].label}</div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {data.copy.apportionments[a].blurb}
                </p>
                <p className="mt-1.5 text-xs">
                  <span className="text-muted-foreground">Best for: </span>
                  {data.copy.apportionments[a].bestFor}
                </p>
                {example && <ExampleBlock example={example} compact />}
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
