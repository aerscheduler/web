import { useMemo } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { AlertTriangle, Building2, CheckCircle2, Clock, ShieldCheck } from "lucide-react";
import { useMyCurrencies } from "@/features/queries";
import { useAuth } from "@/lib/auth";
import type { Currency } from "@/types/api";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { EmptyState, ErrorState, CardGridSkeleton, StatSkeleton } from "@/components/states";
import { CurrencyCard } from "@/components/me-money/currency-card";
import { currencyStatus } from "@/components/me-money/currency-status";
import { Card } from "@/components/ui/card";

export const Route = createFileRoute("/_authed/me/currencies")({
  component: MyCurrenciesPage,
});

const EMPTY_COPY =
  "No currencies tracked yet — your school adds these (medicals, flight reviews, checkouts) so you always know you're legal to fly.";

function MyCurrenciesPage() {
  const { organization } = useAuth();
  const currenciesQ = useMyCurrencies();

  const currencies = useMemo(
    () => (currenciesQ.data ?? []).filter((c) => c.archivedAt == null),
    [currenciesQ.data]
  );

  const { current, expiring, expired, sorted } = useMemo(() => {
    let cur = 0;
    let exp = 0;
    let dead = 0;
    const weight: Record<string, number> = { expired: 0, expiring: 1, current: 2 };
    const ordered = [...currencies].sort(
      (a, b) => weight[currencyStatus(a).key] - weight[currencyStatus(b).key]
    );
    for (const c of currencies) {
      const k = currencyStatus(c).key;
      if (k === "current") cur += 1;
      else if (k === "expiring") exp += 1;
      else dead += 1;
    }
    return { current: cur, expiring: exp, expired: dead, sorted: ordered };
  }, [currencies]);

  if (!organization) {
    return (
      <div>
        <PageHeader title="Currencies" subtitle="Your medicals, reviews & checkouts." />
        <Card className="p-0">
          <EmptyState
            icon={Building2}
            title="No active school"
            body="Join or pick a flight school and the currencies they track for you will show up here."
          />
        </Card>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Currencies"
        subtitle="Medicals, flight reviews and checkouts — so you always know you're legal to fly."
      />

      {currenciesQ.isLoading ? (
        <StatSkeleton count={3} />
      ) : (
        <div className="grid grid-cols-3 gap-4">
          <StatCard label="Current" value={current} icon={CheckCircle2} accent="success" />
          <StatCard
            label="Expiring soon"
            value={expiring}
            icon={Clock}
            accent="warning"
            hint="Within 30 days"
          />
          <StatCard label="Expired" value={expired} icon={AlertTriangle} accent="warning" />
        </div>
      )}

      <div className="mt-5">
        {currenciesQ.isLoading ? (
          <CardGridSkeleton count={6} />
        ) : currenciesQ.isError ? (
          <Card className="p-0">
            <ErrorState error={currenciesQ.error} onRetry={() => currenciesQ.refetch()} />
          </Card>
        ) : sorted.length === 0 ? (
          <Card className="p-0">
            <EmptyState icon={ShieldCheck} title="Nothing tracked yet" body={EMPTY_COPY} />
          </Card>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {sorted.map((c: Currency) => (
              <CurrencyCard key={c.id} currency={c} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
