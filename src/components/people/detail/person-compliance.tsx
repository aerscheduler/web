import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Upload } from "lucide-react";
import type { Currency, OrganizationUser } from "@/types/api";
import {
  useMemberCurrencies,
  useMemberDocuments,
  useMyCurrencies,
} from "@/features/queries";
import { useAuth } from "@/lib/auth";
import { DetailCard, CardEmpty, CardSkeleton } from "@/components/detail/detail-page";
import { DocumentRow } from "@/components/documents/document-row";
import { DocumentUploadModal } from "@/components/me-account/document-upload-modal";
import { CurrencyStatusBadge, currencyStatus } from "@/components/me-money/currency-status";
import {
  RenewCurrencyDialog,
  canOfferRenew,
  isDocumentGated,
} from "@/components/people/renew-currency-dialog";
import { Button } from "@/components/ui/button";
import { memberName } from "@/components/people/util";

/**
 * Medicals, flight reviews and checkouts.
 *
 * Read through two different endpoints depending on who is asking, and they are
 * not interchangeable: `GET /currencies` returns the CALLER's own records, while
 * the per-type list (`/currencies/types/:id/currencies?orgUserId=`) reads someone
 * else's and is admin-or-dispatcher only. Picking the wrong one gives a member a
 * 403 on their own page.
 */
export function PersonCurrencies({
  ou,
  isSelf,
}: {
  ou: OrganizationUser;
  isSelf: boolean;
}) {
  const { isAdmin, roles, orgUserId } = useAuth();
  const [active, setActive] = useState<Currency | null>(null);

  const mine = useMyCurrencies({ enabled: isSelf });
  const theirs = useMemberCurrencies(ou.id, { enabled: !isSelf });

  const isPending = isSelf ? mine.isPending : theirs.isPending;
  const isError = isSelf ? mine.isError : theirs.isError;
  const raw = isSelf ? mine.data : theirs.data;

  // Worst first: an expired medical is the whole reason to look at this card, and
  // it must not be sorted under six things that are fine.
  const currencies = useMemo(() => {
    const weight = (c: Currency) => {
      switch (currencyStatus(c).key) {
        case "expired":
        case "notSignedOff":
          return 0;
        case "expiring":
          return 1;
        default:
          return 2;
      }
    };
    return [...(raw ?? [])]
      .filter((c) => c.archivedAt == null)
      .sort((a, b) => weight(a) - weight(b));
  }, [raw]);

  return (
    <DetailCard
      title="Currencies"
      description={
        isSelf
          ? "What has to stay signed off for you to fly."
          : "What has to stay signed off for them to fly."
      }
      action={
        isSelf ? (
          <Button variant="outline" size="sm" asChild>
            <Link to="/me/currencies">View all</Link>
          </Button>
        ) : undefined
      }
    >
      {isPending ? (
        <CardSkeleton rows={3} />
      ) : isError ? (
        <CardEmpty>Couldn&apos;t load currencies.</CardEmpty>
      ) : currencies.length === 0 ? (
        <CardEmpty>
          No currency records{" "}
          {isAdmin ? (
            <>
             , check they&apos;re in a group scoped by a{" "}
              <Link to="/settings" className="underline underline-offset-2">
                currency rule
              </Link>
              .
            </>
          ) : isSelf ? (
            "apply to you. Your school sets these up per group."
          ) : (
            "for this member."
          )}
        </CardEmpty>
      ) : (
        <ul className="divide-y divide-border">
          {currencies.map((c) => {
            const gated = isDocumentGated(c);
            const canRenew = canOfferRenew(c, roles, isAdmin, ou.id === orgUserId);
            return (
              <li
                key={c.id}
                className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0"
              >
                <div className="min-w-0">
                  <div className="truncate text-[13px] font-medium">
                    {c.currencyType?.name ?? "Currency"}
                  </div>
                  <div className="mt-1">
                    <CurrencyStatusBadge status={currencyStatus(c)} />
                  </div>
                </div>
                {gated ? (
                  <span className="max-w-[9rem] shrink-0 text-right text-xs text-muted-foreground">
                    Renew via document upload
                  </span>
                ) : canRenew ? (
                  <Button variant="outline" size="sm" onClick={() => setActive(c)}>
                    {c.renewedBy == null ? "Sign off" : "Renew"}
                  </Button>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}

      <RenewCurrencyDialog
        currency={active}
        open={active != null}
        onOpenChange={(open) => {
          if (!open) setActive(null);
        }}
      />
    </DetailCard>
  );
}

/**
 * The member's document vault.
 *
 * The upload button is admin-only because a `restricted` document type is
 * precisely "an admin files this on the member's behalf", that's the one path
 * that exists for a medical someone hands over at the desk.
 */
export function PersonDocuments({
  ou,
  isSelf,
}: {
  ou: OrganizationUser;
  isSelf: boolean;
}) {
  const { isAdmin } = useAuth();
  const [uploadOpen, setUploadOpen] = useState(false);

  const q = useMemberDocuments(ou.id);
  const docs = useMemo(() => (q.data ?? []).filter((d) => !d.archivedAt), [q.data]);

  return (
    <DetailCard
      title="Documents"
      description="Medicals, certificates and signed agreements on file."
      action={
        isAdmin ? (
          <Button variant="outline" size="sm" onClick={() => setUploadOpen(true)}>
            <Upload className="size-4" /> Upload
          </Button>
        ) : isSelf ? (
          <Button variant="outline" size="sm" asChild>
            <Link to="/me/documents">View all</Link>
          </Button>
        ) : undefined
      }
      bodyClassName="px-0 pb-0"
    >
      {q.isPending ? (
        <div className="px-4 pb-4">
          <CardSkeleton rows={2} />
        </div>
      ) : q.isError ? (
        <div className="px-4 pb-4">
          <CardEmpty>Couldn&apos;t load documents.</CardEmpty>
        </div>
      ) : docs.length === 0 ? (
        <div className="px-4 pb-4">
          <CardEmpty>
            Nothing on file{isAdmin ? ", upload a medical, certificate, or agreement." : "."}
          </CardEmpty>
        </div>
      ) : (
        <div className="divide-y divide-border border-t border-border">
          {docs.map((d) => (
            <DocumentRow key={d.id} doc={d} />
          ))}
        </div>
      )}

      <DocumentUploadModal
        open={uploadOpen}
        onOpenChange={setUploadOpen}
        targetOrgUserId={ou.id}
        targetName={memberName(ou)}
      />
    </DetailCard>
  );
}
