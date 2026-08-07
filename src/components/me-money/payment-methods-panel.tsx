import { useState } from "react";
import { Building2, CreditCard, Loader2, Plus, Star, Trash2, Zap } from "lucide-react";
import { toast } from "sonner";
import {
  useMyBillingSettings,
  usePaymentMethods,
  useRemovePaymentMethod,
  useSetAutoPay,
  useSetDefaultPaymentMethod,
} from "@/features/queries";
import { useAuth } from "@/lib/auth";
import { ApiError } from "@/lib/api";
import type { PaymentMethod } from "@/types/api";
import { EmptyState } from "@/components/states";
import { DocsHint } from "@/components/docs-hint";
import { AddCardDialog } from "@/components/me-money/add-card-dialog";
import { useConfirm } from "@/components/confirm-dialog";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";

function titleCase(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function cardLabel(m: PaymentMethod): string {
  if (m.card) return `${titleCase(m.card.brand)} •••• ${m.card.last4}`;
  return titleCase(m.type);
}

function cardExpiry(m: PaymentMethod): string | null {
  if (!m.card) return null;
  return `${String(m.card.exp_month).padStart(2, "0")}/${String(m.card.exp_year).slice(-2)}`;
}

/**
 * Payment-methods management (autopay + saved cards). Rendered as a tab inside
 * the Profile page; carries no page header of its own.
 */
export function PaymentMethodsPanel() {
  const { organization } = useAuth();
  const confirm = useConfirm();
  const [addOpen, setAddOpen] = useState(false);

  const methodsQ = usePaymentMethods({ enabled: organization != null });
  const billingQ = useMyBillingSettings({ enabled: organization != null });
  const remove = useRemovePaymentMethod();
  const setDefault = useSetDefaultPaymentMethod();
  const setAutoPay = useSetAutoPay();

  // Deliberately NOT paged, unlike every table in the console.
  //
  // This is a set you act on as a whole, not a list you browse: `hasDefault`
  // below gates autopay, and on a page it would answer "is the default card on
  // screen" — which would switch autopay off for someone whose default sat on
  // page two. Saved cards are a handful, so there is nothing to page anyway.
  // `GET /stripe/paymentMethods` does page, so the API stays uniform; this
  // caller just takes the whole (tiny) first page.
  const methods = methodsQ.data ?? [];
  const hasDefault = methods.some((m) => m.defaultPaymentMethod);
  const autoPay = billingQ.data?.autoPay ?? false;

  // A billing 500/404 here means the org hasn't finished Stripe onboarding.
  const billingUnavailable =
    (methodsQ.isError && methodsQ.error instanceof ApiError) ||
    (billingQ.isError && billingQ.error instanceof ApiError && billingQ.error.status !== 404);

  if (!organization) {
    return (
      <Card className="p-0">
        <EmptyState
          icon={Building2}
          title="No active school"
          body="Join or pick a flight school to manage your cards and autopay here."
        />
      </Card>
    );
  }

  async function onRemove(m: PaymentMethod) {
    const ok = await confirm({
      title: "Remove this card?",
      description: `${cardLabel(m)} will be removed from your account.`,
      confirmLabel: "Remove card",
      cancelLabel: "Keep",
      destructive: true,
    });
    if (!ok) return;
    try {
      await remove.mutateAsync(m.id);
      toast.success("Card removed");
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Couldn't remove that card");
    }
  }

  async function onMakeDefault(m: PaymentMethod) {
    try {
      await setDefault.mutateAsync(m.id);
      toast.success("Default card updated");
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Couldn't set the default card");
    }
  }

  async function onToggleAutoPay(next: boolean) {
    try {
      await setAutoPay.mutateAsync(next);
      toast.success(next ? "Autopay on" : "Autopay off");
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Couldn't update autopay");
    }
  }

  if (billingUnavailable) {
    return (
      <Card className="p-0">
        <EmptyState
          icon={CreditCard}
          title="Online payments aren't set up"
          body="Your school hasn't enabled card payments yet. Once they do, you can save a card and pay invoices here."
        />
      </Card>
    );
  }

  return (
    <>
      <div data-doc-shot="payment-methods-autopay" className="space-y-5">
        {/* Autopay */}
        <Card>
          <CardHeader className="flex-row items-center justify-between gap-4 space-y-0">
            <div className="min-w-0">
              <CardTitle className="flex items-center gap-2">
                <Zap className="size-4 text-primary" /> Autopay
                <DocsHint topic="autopay" />
              </CardTitle>
              <CardDescription className="mt-1">
                {hasDefault
                  ? "New invoices are charged to your default card automatically."
                  : "Add a card and set it as default to turn on autopay."}
              </CardDescription>
            </div>
            <Switch
              checked={autoPay}
              disabled={!hasDefault || setAutoPay.isPending || billingQ.isLoading}
              onCheckedChange={onToggleAutoPay}
              aria-label="Toggle autopay"
            />
          </CardHeader>
        </Card>

        {/* Saved cards */}
        <Card>
          <CardHeader className="flex-row items-center justify-between gap-4 space-y-0">
            <div>
              <CardTitle>Saved cards</CardTitle>
              <CardDescription className="mt-1">
                Cards are stored securely by Stripe.
              </CardDescription>
            </div>
            <Button size="sm" onClick={() => setAddOpen(true)}>
              <Plus className="size-4" /> Add card
            </Button>
          </CardHeader>
          <CardContent>
            {methodsQ.isPending ? (
              <div className="space-y-2">
                <Skeleton className="h-16 w-full" />
                <Skeleton className="h-16 w-full" />
              </div>
            ) : methods.length === 0 ? (
              <div className="rounded-lg border border-dashed py-10 text-center text-sm text-muted-foreground">
                No cards saved yet. Add one to pay invoices faster.
              </div>
            ) : (
              <ul className="divide-y divide-border overflow-hidden rounded-lg border">
                {methods.map((m) => {
                  const exp = cardExpiry(m);
                  return (
                    <li key={m.id} className="flex items-center gap-3 bg-card px-3 py-2.5">
                      <span className="grid size-9 shrink-0 place-items-center rounded-md bg-muted text-muted-foreground">
                        <CreditCard className="size-4" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="truncate font-medium">{cardLabel(m)}</span>
                          {m.defaultPaymentMethod && (
                            <Badge variant="secondary" className="gap-1">
                              <Star className="size-3" /> Default
                            </Badge>
                          )}
                        </div>
                        {exp && <div className="tnum text-xs text-muted-foreground">Exp {exp}</div>}
                      </div>
                      {!m.defaultPaymentMethod && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => onMakeDefault(m)}
                          disabled={setDefault.isPending}
                        >
                          Make default
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Remove ${cardLabel(m)}`}
                        className="text-muted-foreground hover:text-destructive"
                        onClick={() => onRemove(m)}
                        disabled={remove.isPending}
                      >
                        {remove.isPending ? (
                          <Loader2 className="size-4 animate-spin" />
                        ) : (
                          <Trash2 className="size-4" />
                        )}
                      </Button>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <AddCardDialog open={addOpen} onOpenChange={setAddOpen} />
    </>
  );
}
