import { useState } from "react";
import { AlertTriangle, CircleHelp, Loader2, Pencil, RotateCcw, Split } from "lucide-react";
import { toast } from "sonner";
import { useClearSplitRules, useSetSplitRule, useSplitRules } from "@/features/queries";
import type {
  ChargeLine,
  ReservationType,
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
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ApiError } from "@/lib/api";
import { typeLabel } from "@/components/schedule/meta";
import { CostSplittingFlow } from "@/components/onboarding/flows/cost-splitting-flow";

/**
 * How this organization divides the cost of a booking between the people on it.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────
 * WHY THIS SCREEN IS MOSTLY A SUMMARY
 * ─────────────────────────────────────────────────────────────────────────────────────
 *
 * It used not to be, and that was the bug. This screen opened with three explanatory
 * paragraphs and then rendered TWELVE live billing controls — six booking types × two
 * charge lines — each with five options, a paragraph of its own, and a worked example
 * with money in it. Below that, a reference section repeated all five examples again.
 * Around seventeen money tables on one page.
 *
 * Every one of the twelve looked identical, because they were all on the default, so the
 * repetition carried no information at all. The reaction to it was "a lot of words, and I
 * felt scared to change anything" — which for a page that decides who gets invoiced is the
 * worst outcome available. Worse, its own comment defended this as "mostly explanation",
 * as though volume were thoroughness.
 *
 * The instinct behind it was right: nobody should choose "each pays in full" by accident,
 * because it MULTIPLIES what the school collects instead of dividing it. The error was
 * concluding that every explanation must therefore be on screen at all times. Explanation
 * belongs at the moment of choosing. So now:
 *
 *  - **One decision up front.** Most operators want "bill groups the way a flight school
 *    does", which is a preset. That is the primary action, and it opens the same flow the
 *    setup checklist opens — one path to the decision, not two that can drift.
 *  - **The matrix is a read-only summary**, one line per booking type in plain English,
 *    scannable in a few seconds. Editing is per-type and opt-in.
 *  - **The five options, their blurbs and their worked examples live inside that editor**,
 *    where somebody has deliberately gone to make a choice — not on the landing view.
 *  - **The two facts that remove the fear are stated once**, not per block: a booking with
 *    one person is unaffected, and an invoice already raised never changes.
 *
 * The figures in the examples are still computed BY THE SERVER'S OWN APPORTIONMENT ENGINE
 * (`utils/splitExamples.ts`), so what this screen shows is what will land on the invoice by
 * construction. They use an illustrative aircraft and rate rather than this org's own, and
 * are labelled as an example so nobody reads them as their real numbers.
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
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
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
  const [flowOpen, setFlowOpen] = useState(false);

  return (
    <div className="space-y-4">
      <Status data={data} onSetUp={() => setFlowOpen(true)} />
      <Summary data={data} />
      {flowOpen && <CostSplittingFlow onClose={() => setFlowOpen(false)} />}
    </div>
  );
}

// ── Where you stand, and the one action ────────────────────────────────────────────

function Status({ data, onSetUp }: { data: SplitRulesDescription; onSetUp: () => void }) {
  const configured = data.rules.length > 0;
  const clear = useClearSplitRules();

  return (
    <Card>
      <CardHeader className="flex-row items-start gap-2.5">
        <span className="grid size-8 shrink-0 place-items-center rounded-md bg-primary/10 text-primary">
          <Split className="size-4" />
        </span>
        <div className="min-w-0">
          <CardTitle>Cost splitting</CardTitle>
          <CardDescription>
            {configured
              ? "Bookings with two or more people are split by the rules below. Each person gets their own invoice."
              : "Every booking bills one person for the whole thing, the same as it always has."}
          </CardDescription>
        </div>
      </CardHeader>

      <CardContent className="space-y-3">
        <div className="flex flex-wrap gap-2">
          <Button onClick={onSetUp} variant={configured ? "outline" : "default"}>
            {configured ? "Start from a preset" : "Set up cost splitting"}
          </Button>

          {configured && (
            <Button
              variant="ghost"
              disabled={clear.isPending}
              onClick={() =>
                clear.mutate(undefined, {
                  onSuccess: () => toast.success("Back to one invoice per booking."),
                  onError: (e) =>
                    toast.error(e instanceof ApiError ? e.message : "Could not clear the rules."),
                })
              }
            >
              {clear.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <RotateCcw className="size-4" />
              )}
              Clear all rules
            </Button>
          )}
        </div>

        {/* The two facts that make this page safe to touch. Stated ONCE — they used to be
            implied twelve times over and landed as noise rather than reassurance. */}
        <ul className="space-y-1 text-sm text-muted-foreground">
          <li>A booking with one person is always invoiced exactly as it is today.</li>
          <li>Changing a rule only affects close-outs from now on. Invoices already raised never change.</li>
        </ul>
      </CardContent>
    </Card>
  );
}

// ── The summary, and the editor behind it ──────────────────────────────────────────

/** Booking types that can never hold two people have nothing to split. */
function typeCanSplit(data: SplitRulesDescription, type: string): boolean {
  const limits = data.personnelLimits[type];
  return !!limits && Object.values(limits).some((n) => n > 1);
}

function Summary({ data }: { data: SplitRulesDescription }) {
  const [editing, setEditing] = useState<string | null>(null);
  const [reference, setReference] = useState(false);
  const splittable = data.bookableTypes.filter((t) => typeCanSplit(data, t));

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">By booking type</CardTitle>
          <CardDescription>
            Types that only ever have one person paying aren't listed.{" "}
            <button
              type="button"
              onClick={() => setReference(true)}
              className="text-primary underline-offset-2 hover:underline"
            >
              What do the options mean?
            </button>
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="divide-y border-t">
            {splittable.map((type) => (
              <SummaryRow key={type} data={data} type={type} onEdit={() => setEditing(type)} />
            ))}
          </div>
        </CardContent>
      </Card>

      {editing && (
        <EditType data={data} type={editing} onClose={() => setEditing(null)} />
      )}

      <ResponsiveModal
        open={reference}
        onOpenChange={setReference}
        title="What the options mean"
        description="Every figure here is produced by the same code that prices your invoices."
        size="lg"
      >
        <Reference data={data} />
      </ResponsiveModal>
    </>
  );
}

/**
 * One booking type's rules as a single readable phrase.
 *
 * Collapses when every charge line agrees, which is the overwhelmingly common case — an
 * org on the defaults, or one that picked a preset splitting everything evenly. Spelling
 * both lines out there produced "aircraft, simulator & room time: one person pays ·
 * instruction: one person pays" on all six rows: the same words twice, six times over,
 * which is the wordiness this redesign exists to remove. The labelled form is kept for
 * when the two lines genuinely differ, because then the distinction is the whole point.
 */
function describe(data: SplitRulesDescription, type: string): string {
  const plan = data.resolved[type];
  const named = data.chargeLines.map((l) => ({
    line: l,
    apportionment: plan?.lines[l] ?? data.productDefault,
  }));
  const distinct = new Set(named.map((n) => n.apportionment));

  if (distinct.size === 1) {
    return data.copy.apportionments[named[0].apportionment].label;
  }

  return named
    .map(
      (n) =>
        `${data.copy.chargeLines[n.line].label.toLowerCase()}: ${data.copy.apportionments[
          n.apportionment
        ].label.toLowerCase()}`
    )
    .join(" · ");
}

/** One booking type, its current rules in plain English. Read-only until asked. */
function SummaryRow({
  data,
  type,
  onEdit,
}: {
  data: SplitRulesDescription;
  type: string;
  onEdit: () => void;
}) {
  const plan = data.resolved[type];
  const cap = Math.max(...Object.values(data.personnelLimits[type] ?? { a: 0 }));
  const customised = data.chargeLines.some(
    (l) => (plan?.sources[l] ?? "product_default") !== "product_default"
  );

  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">{typeLabel(type as ReservationType)}</span>
          <span className="text-xs text-muted-foreground">up to {cap}</span>
          {customised && (
            <Badge variant="secondary" className="text-xs font-normal">
              Your rule
            </Badge>
          )}
        </div>
        <div className="mt-0.5 text-sm text-muted-foreground">{describe(data, type)}</div>
      </div>

      {/* "Edit" + Pencil, matching the row action every other settings tab uses
          (document types, currency types, groups). Those put it in a MoreHorizontal
          menu because they have Edit AND Delete; a rule can only be edited, and a menu
          holding one item is two clicks for one action. Same verb and icon, no menu. */}
      <Button variant="ghost" size="sm" onClick={onEdit}>
        <Pencil className="size-3.5" />
        Edit
      </Button>
    </div>
  );
}

/**
 * The editor for ONE booking type — both of its charge lines, five options each.
 *
 * This is where the explanation and the worked example live now. The difference from
 * before is not the content but the consent: somebody opened this because they want to
 * change this type, rather than meeting twelve of them on arrival.
 */
function EditType({
  data,
  type,
  onClose,
}: {
  data: SplitRulesDescription;
  type: string;
  onClose: () => void;
}) {
  return (
    <ResponsiveModal
      open
      onOpenChange={(o) => !o && onClose()}
      title={`${typeLabel(type as ReservationType)} bookings`}
      description="How each part of the cost divides when more than one person is on the booking."
      size="lg"
      footer={<Button onClick={onClose}>Done</Button>}
    >
      <div className="space-y-5">
        {data.chargeLines.map((line) => (
          <LineEditor key={line} data={data} type={type} line={line} />
        ))}
      </div>
    </ResponsiveModal>
  );
}

function LineEditor({
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
  const isDefault = (plan?.sources[line] ?? "product_default") === "product_default";

  // The example for what is CURRENTLY chosen, which is the question the help icon answers:
  // "what does my setting do to the money?" One icon per section rather than one per option.
  const example = data.examples.find(
    (e) => e.chargeLine === line && e.apportionment === current
  );

  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <div className="flex items-center gap-1">
            <div className="text-sm font-medium">{data.copy.chargeLines[line].label}</div>
            {example && (
              <ExampleHelp example={example} sectionLabel={data.copy.chargeLines[line].label} />
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
            Reset to default
          </Button>
        )}
      </div>

      <div className="mt-2 grid gap-1.5">
        {data.apportionments.map((a) => {
          const active = a === current;
          return (
            <button
              key={a}
              type="button"
              disabled={set.isPending}
              aria-pressed={active}
              onClick={() =>
                set.mutate(
                  { reservationType: type, chargeLine: line, apportionment: a },
                  {
                    onError: (e) =>
                      toast.error(e instanceof ApiError ? e.message : "Could not save that rule."),
                  }
                )
              }
              className={[
                "rounded-lg border p-2.5 text-left transition-colors",
                active ? "border-primary bg-primary/5 ring-1 ring-primary" : "hover:bg-accent/40",
              ].join(" ")}
            >
              <div className="text-sm font-medium">{data.copy.apportionments[a].label}</div>
              <div className="text-xs text-muted-foreground">
                {data.copy.apportionments[a].blurb}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── Worked examples ────────────────────────────────────────────────────────────────

/**
 * A help icon beside a section title that opens a worked example of the current setting.
 *
 * One per section, not one per option. An icon on every option turned into five identical
 * glyphs down the side of the list, which reads as a control you are meant to use rather
 * than as help you can ignore.
 *
 * A POPOVER rather than a hover tooltip, deliberately. The content is a small table: a line
 * per payer, a total, sometimes a warning. A hover tooltip cannot be read on a touch screen,
 * disappears when the pointer moves toward it, and should not hold anything a person needs a
 * moment with. Click to open keeps the lightness without making the figures hard to read.
 *
 * Nothing dangerous is hidden behind it. "Each pays in full" states the multiplication in
 * its own blurb, which stays on the row, so the popover carries the arithmetic rather than
 * the warning.
 */
function ExampleHelp({ example, sectionLabel }: { example: WorkedExample; sectionLabel: string }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-5 text-muted-foreground"
          aria-label={`See an example of how ${sectionLabel.toLowerCase()} is split`}
        >
          <CircleHelp className="size-3.5" />
        </Button>
      </PopoverTrigger>
      {/* No z-index override needed even though this opens inside a dialog: the popover
          portals after the dialog in document order, so at equal z-index it still paints on
          top. Verified rather than assumed, because a screenshot taken mid fade-in looks
          exactly like a stacking bug. */}
      <PopoverContent align="start">
        <ExampleBlock example={example} />
      </PopoverContent>
    </Popover>
  );
}

/**
 * A worked example, straight from the server.
 *
 * `totalNote` is rendered prominently on purpose: for "each pays in full" it is the line
 * that says the revenue MULTIPLIES, which is the one thing an operator must not miss.
 */
function ExampleBlock({ example }: { example: WorkedExample }) {
  const multiplies = /NOT a division/i.test(example.totalNote);

  return (
    <div className="mt-2 rounded-md border bg-muted/30 p-2.5">
      {/* Labelled as an example because the rate isn't this org's — an unlabelled dollar
          figure on a billing screen reads as your own money. */}
      <div className="text-xs font-medium text-muted-foreground">
        For example: {example.scenario}
      </div>

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
              multiplies
                ? "font-medium text-amber-600 dark:text-amber-500"
                : "text-muted-foreground",
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

// ── Reference: what every option does, on request ──────────────────────────────────

function Reference({ data }: { data: SplitRulesDescription }) {
  const [line, setLine] = useState<ChargeLine>(data.chargeLines[0]);

  return (
    <div className="space-y-3">
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

      <div className="space-y-3">
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
              {example && <ExampleBlock example={example} />}
            </div>
          );
        })}
      </div>
    </div>
  );
}
