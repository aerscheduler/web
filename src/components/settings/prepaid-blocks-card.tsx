import { useState } from "react";
import { Archive, ArchiveRestore, Layers, Pencil, Plus, ShoppingBag } from "lucide-react";
import { toast } from "sonner";
import type { LedgerBlock } from "@/types/api";
import {
  useArchiveLedgerBlock,
  useCreateLedgerBlock,
  useLedgerBlocks,
  useUpdateLedgerBlock,
} from "@/features/queries";
import { ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { isAdmin } from "@/lib/permissions";
import { formatMoney } from "@/lib/utils";
import {
  BLOCK_DESCRIPTION_MAX,
  BLOCK_NAME_MAX,
  blockBonusCents,
  blockBonusPercent,
  blockEditorError,
  formatBlockBonus,
} from "@/lib/ledger-blocks";
import { useMoneyFieldsValid } from "@/hooks/use-money-fields-valid";
import { useConfirm } from "@/components/confirm-dialog";
import { DocsHint } from "@/components/docs-hint";
import { ExplainedButton } from "@/components/explained-button";
import { MoneyInput } from "@/components/money-input";
import { ResponsiveModal } from "@/components/responsive-modal";
import { ErrorState } from "@/components/states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";

/** The How members pay card carries this id so the invoice-mode note can point at it. */
export const HOW_MEMBERS_PAY_ID = "how-members-pay";

function errMessage(e: unknown, fallback: string): string {
  if (e instanceof ApiError) return e.message;
  if (e instanceof Error) return e.message;
  return fallback;
}

function CardIcon() {
  return (
    <span className="grid size-8 place-items-center rounded-md bg-primary/10 text-primary">
      <Layers className="size-4" />
    </span>
  );
}

/**
 * Settings, Billing: prepaid blocks (block time with a bonus). Pay 1,700, get 1,800 of
 * credit. Built from the ledger cards above it (header) and the membership plans list (rows,
 * editor). Owners AND admins manage blocks, unlike How members pay, which is owner-only.
 *
 * Blocks only exist in Account ledger mode; in invoice mode the card stays collapsed and
 * points at How members pay instead of offering an editor whose saves the server refuses.
 */
export function PrepaidBlocksCard({ ledgerOn }: { ledgerOn: boolean }) {
  if (!ledgerOn) {
    return (
      <Card data-doc-shot="ledger-prepaid-blocks">
        <CardHeader className="flex-row items-start gap-2.5">
          <CardIcon />
          <div className="min-w-0 flex-1">
            <CardTitle className="inline-flex items-center gap-1.5">
              Prepaid blocks
              <DocsHint topic="prepaid-blocks" />
            </CardTitle>
            <CardDescription>
              Blocks put credit on a member&rsquo;s balance, so they need Account ledger. Switch
              to it in{" "}
              <button
                type="button"
                className="font-medium text-foreground underline underline-offset-2 hover:text-primary"
                onClick={() => {
                  const el = document.getElementById(HOW_MEMBERS_PAY_ID);
                  el?.scrollIntoView({ block: "center" });
                }}
              >
                How members pay
              </button>
              .
            </CardDescription>
          </div>
        </CardHeader>
      </Card>
    );
  }
  return <PrepaidBlocksEditorCard />;
}

function PrepaidBlocksEditorCard() {
  const { roles } = useAuth();
  const canEdit = isAdmin(roles);
  const blocksQ = useLedgerBlocks({ includeArchived: canEdit });
  const update = useUpdateLedgerBlock();
  const archive = useArchiveLedgerBlock();
  const confirm = useConfirm();
  const [showArchived, setShowArchived] = useState(false);
  const [editing, setEditing] = useState<LedgerBlock | "new" | null>(null);

  const all = blocksQ.data ?? [];
  const live = all.filter((b) => !b.archivedAt);
  const archived = all.filter((b) => b.archivedAt);

  function toggleActive(block: LedgerBlock, active: boolean) {
    update.mutate(
      { id: block.id, active },
      {
        onError: (e) => toast.error(errMessage(e, "Couldn't change that block")),
      }
    );
  }

  async function archiveBlock(block: LedgerBlock) {
    const ok = await confirm({
      title: `Archive ${block.name}?`,
      description:
        "Members stop seeing it in Add funds and the desk can no longer sell it. Past purchases and their bonus stay on the ledger. You can restore it later.",
      confirmLabel: "Archive",
    });
    if (!ok) return;
    archive.mutate(block.id, {
      onSuccess: () => toast.success(`${block.name} archived`),
      onError: (e) => toast.error(errMessage(e, "Couldn't archive that block")),
    });
  }

  function restoreBlock(block: LedgerBlock) {
    update.mutate(
      { id: block.id, active: true },
      {
        onSuccess: () => toast.success(`${block.name} restored`),
        onError: (e) => toast.error(errMessage(e, "Couldn't restore that block")),
      }
    );
  }

  return (
    <Card data-doc-shot="ledger-prepaid-blocks">
      <CardHeader className="flex-row items-start gap-2.5">
        <CardIcon />
        <div className="min-w-0 flex-1">
          <CardTitle className="inline-flex items-center gap-1.5">
            Prepaid blocks
            <DocsHint topic="prepaid-blocks" />
          </CardTitle>
          <CardDescription>
            Sell credit up front with a bonus, for example pay 1,700 and get 1,800. Members buy
            blocks from Add funds; the desk can sell one too. The bonus is not refundable.
          </CardDescription>
        </div>
        {canEdit && (
          <Button size="sm" variant="outline" onClick={() => setEditing("new")}>
            <Plus className="size-4" />
            Add block
          </Button>
        )}
      </CardHeader>
      <CardContent>
        {blocksQ.isPending ? (
          <div className="space-y-2">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        ) : blocksQ.isError ? (
          <ErrorState error={blocksQ.error} onRetry={() => void blocksQ.refetch()} />
        ) : live.length === 0 ? (
          <p className="rounded-md bg-muted/50 px-3 py-2 text-sm text-muted-foreground">
            No blocks yet.{" "}
            {canEdit
              ? "Add one and members see it in Add funds right away."
              : "Owners and admins can add them."}
          </p>
        ) : (
          <div className="divide-y divide-border" data-doc-shot="ledger-prepaid-blocks-list">
            {live.map((block) => (
              <BlockRow
                key={block.id}
                block={block}
                canEdit={canEdit}
                onToggle={(active) => toggleActive(block, active)}
                onEdit={() => setEditing(block)}
                onArchive={() => void archiveBlock(block)}
                busy={archive.isPending}
              />
            ))}
          </div>
        )}

        {showArchived && archived.length > 0 && (
          <div className="mt-4">
            <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Archived
            </p>
            <div className="divide-y divide-border">
              {archived.map((block) => (
                <BlockRow
                  key={block.id}
                  block={block}
                  canEdit={canEdit}
                  onEdit={() => setEditing(block)}
                  onRestore={() => restoreBlock(block)}
                  busy={update.isPending}
                />
              ))}
            </div>
          </div>
        )}
      </CardContent>
      {archived.length > 0 && (
        <CardFooter className="justify-end">
          <label className="inline-flex items-center gap-2 text-xs text-muted-foreground">
            <Switch
              size="sm"
              checked={showArchived}
              onCheckedChange={setShowArchived}
              aria-label="Show archived blocks"
            />
            Show archived ({archived.length})
          </label>
        </CardFooter>
      )}

      {editing ? (
        <BlockEditor block={editing === "new" ? null : editing} onClose={() => setEditing(null)} />
      ) : null}
    </Card>
  );
}

function BlockRow({
  block,
  canEdit,
  onToggle,
  onEdit,
  onArchive,
  onRestore,
  busy,
}: {
  block: LedgerBlock;
  canEdit: boolean;
  onToggle?: (active: boolean) => void;
  onEdit: () => void;
  onArchive?: () => void;
  onRestore?: () => void;
  busy: boolean;
}) {
  const archived = !!block.archivedAt;
  const bonus = blockBonusCents(block.priceCents, block.creditCents);
  return (
    <div
      className={`flex flex-wrap items-start justify-between gap-3 py-3 first:pt-0 last:pb-0 ${archived ? "opacity-70" : ""}`}
      data-testid={`ledger-block-${block.id}`}
    >
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-sm font-medium">{block.name}</h3>
          {archived ? <Badge variant="outline">Archived</Badge> : null}
          {!archived && !block.active ? <Badge variant="secondary">Not offered</Badge> : null}
        </div>
        <p className="mt-0.5 text-sm text-muted-foreground tnum">
          Pay {formatMoney(block.priceCents)} · Get {formatMoney(block.creditCents)} ·{" "}
          <span className={bonus > 0 ? "text-emerald-700 dark:text-emerald-400" : undefined}>
            {formatBlockBonus(block.priceCents, block.creditCents)}
          </span>
        </p>
        {block.description ? (
          <p className="mt-1 max-w-xl text-xs text-muted-foreground">{block.description}</p>
        ) : null}
        <p className="mt-1 inline-flex items-center gap-1 text-xs text-muted-foreground">
          <ShoppingBag className="size-3.5" />
          {block.purchaseCount} {block.purchaseCount === 1 ? "purchase" : "purchases"}
        </p>
      </div>

      {canEdit && (
        <div className="flex shrink-0 items-center gap-2">
          {!archived && onToggle && (
            <label className="mr-1 inline-flex items-center gap-2 text-xs text-muted-foreground">
              <Switch
                checked={block.active}
                onCheckedChange={onToggle}
                aria-label={`Offer ${block.name} to members`}
              />
              Active
            </label>
          )}
          <Button size="sm" variant="outline" onClick={onEdit}>
            <Pencil className="size-3.5" />
            Edit
          </Button>
          {archived ? (
            <Button size="sm" variant="ghost" disabled={busy} onClick={onRestore}>
              <ArchiveRestore className="size-3.5" />
              Restore
            </Button>
          ) : (
            <Button size="sm" variant="ghost" disabled={busy} onClick={onArchive}>
              <Archive className="size-3.5" />
              Archive
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Add or edit one block. Copies the membership PlanEditor: a ResponsiveModal with the fields
 * and a footer. Save stays disabled, with the reason on hover, until the block is one the
 * server would take: a name, at least 1.00 paid, and at least as much credit as is paid.
 */
export function BlockEditor({ block, onClose }: { block: LedgerBlock | null; onClose: () => void }) {
  const create = useCreateLedgerBlock();
  const update = useUpdateLedgerBlock();
  const money = useMoneyFieldsValid();

  const [name, setName] = useState(block?.name ?? "");
  const [description, setDescription] = useState(block?.description ?? "");
  const [priceCents, setPriceCents] = useState<number | undefined>(block?.priceCents);
  const [creditCents, setCreditCents] = useState<number | undefined>(block?.creditCents);
  const [serverError, setServerError] = useState<string | null>(null);

  const busy = create.isPending || update.isPending;
  const problem = blockEditorError({ name, priceCents, creditCents });
  const bothEntered = priceCents != null && creditCents != null && priceCents > 0;
  // Only say what is wrong with a field once there is something in it to be wrong.
  const priceProblem =
    problem?.field === "price" && priceCents != null && priceCents > 0 ? problem.message : null;
  const creditProblem = problem?.field === "credit" && bothEntered ? problem.message : null;
  const canSave = !problem && money.allValid && !busy;
  const saveLabel = block ? "Save block" : "Add block";

  function submit() {
    if (!canSave || priceCents == null || creditCents == null) return;
    setServerError(null);
    const body = {
      name: name.trim(),
      description: description.trim() || null,
      priceCents,
      creditCents,
    };
    const done = {
      onSuccess: () => {
        toast.success(block ? "Block saved" : `${body.name} added`);
        onClose();
      },
      onError: (e: unknown) => setServerError(errMessage(e, "Couldn't save that block")),
    };
    if (block) update.mutate({ id: block.id, ...body }, done);
    else create.mutate(body, done);
  }

  return (
    <ResponsiveModal
      open
      onOpenChange={(open) => !open && !busy && onClose()}
      title={block ? "Edit block" : "New prepaid block"}
      description={
        block
          ? "Members who already bought this block keep what they paid and got."
          : "What a member pays, and the credit they get for it. The difference is their bonus."
      }
      dataDocShot="ledger-block-editor"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <ExplainedButton
            onClick={submit}
            disabled={!canSave}
            explain={problem ? problem.message : !money.allValid ? "Fix the amount first." : undefined}
            summary={problem?.message}
          >
            {busy ? "Saving…" : saveLabel}
          </ExplainedButton>
        </>
      }
    >
      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="block-name">Name</Label>
          <Input
            id="block-name"
            maxLength={BLOCK_NAME_MAX}
            placeholder="10-hour block"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="block-description">Description</Label>
          <Textarea
            id="block-description"
            rows={2}
            maxLength={BLOCK_DESCRIPTION_MAX}
            placeholder="Optional. Ten hours in the 172 at the block rate."
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="block-price">Member pays</Label>
            <MoneyInput
              id="block-price"
              cents={priceCents}
              onCentsChange={setPriceCents}
              onClear={() => setPriceCents(undefined)}
              onValidityChange={money.report("price")}
            />
            {priceProblem ? <p className="text-xs text-destructive">{priceProblem}</p> : null}
          </div>
          <div className="space-y-2">
            <Label htmlFor="block-credit">Credit added</Label>
            <MoneyInput
              id="block-credit"
              cents={creditCents}
              onCentsChange={setCreditCents}
              onClear={() => setCreditCents(undefined)}
              onValidityChange={money.report("credit")}
            />
            {creditProblem ? <p className="text-xs text-destructive">{creditProblem}</p> : null}
          </div>
        </div>

        {problem?.field !== "price" && problem?.field !== "credit" ? (
          <BonusLine priceCents={priceCents} creditCents={creditCents} />
        ) : null}

        {serverError ? <p className="text-sm text-destructive">{serverError}</p> : null}
      </div>
    </ResponsiveModal>
  );
}

/** "Bonus +$100.00 (5.9% extra)", live under the two amounts. */
function BonusLine({
  priceCents,
  creditCents,
}: {
  priceCents: number | undefined;
  creditCents: number | undefined;
}) {
  if (priceCents == null || creditCents == null || priceCents <= 0 || creditCents < priceCents) {
    return null;
  }
  const bonus = blockBonusCents(priceCents, creditCents);
  return (
    <p className="rounded-lg border bg-muted/40 px-3 py-2.5 text-sm" data-testid="block-bonus-line">
      {bonus > 0 ? (
        <>
          Bonus{" "}
          <span className="font-medium text-emerald-700 tnum dark:text-emerald-400">
            +{formatMoney(bonus)}
          </span>{" "}
          ({blockBonusPercent(priceCents, creditCents)}% extra)
        </>
      ) : (
        "No bonus. The member gets exactly what they pay."
      )}
    </p>
  );
}
