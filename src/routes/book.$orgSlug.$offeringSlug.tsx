import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { GuestScheduler, GuestPageSkeleton } from "@/components/public-booking/guest-scheduler";
import { ApiError } from "@/lib/api";
import { fetchPublicBookingPage } from "@/features/public-booking";
import type { PublicBookingPage } from "@/types/public-booking";
import { cn } from "@/lib/utils";
import { postEmbedError } from "@/lib/public-booking-embed-hosts";

export const Route = createFileRoute("/book/$orgSlug/$offeringSlug")({
  component: PublicBookPage,
  validateSearch: (
    search: Record<string, unknown>
  ): { embed?: boolean; parentOrigin?: string } => ({
    embed:
      search.embed === "1" ||
      search.embed === "true" ||
      search.embed === true ||
      search.embed === 1,
    parentOrigin: typeof search.parentOrigin === "string" ? search.parentOrigin : undefined,
  }),
});

function PublicBookPage() {
  const { orgSlug, offeringSlug } = Route.useParams();
  const { embed } = Route.useSearch();
  const [page, setPage] = React.useState<PublicBookingPage | null>(null);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchPublicBookingPage(orgSlug, offeringSlug)
      .then((data) => {
        if (!cancelled) {
          setPage(data);
          setLoadError(null);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setPage(null);
          setLoadError(
            err instanceof ApiError ? err.message : "This booking page is not available."
          );
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [orgSlug, offeringSlug]);

  React.useEffect(() => {
    if (!embed || !loadError) return;
    postEmbedError({ code: "page_unavailable", message: loadError });
  }, [embed, loadError]);

  return (
    <div
      className={cn(
        embed ? "min-h-0" : "min-h-svh bg-background pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] md:bg-muted/30"
      )}
    >
      {loading ? (
        <GuestPageSkeleton embedded={!!embed} />
      ) : loadError || !page ? (
        <div className="flex min-h-svh flex-col items-center justify-center px-4">
          <div className="w-full max-w-lg rounded-xl border bg-card p-8 text-center">
            <h1 className="text-lg font-semibold">This page is not available</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              {loadError ??
                "The school may have paused public requests, or this offering is no longer listed."}
            </p>
          </div>
        </div>
      ) : (
        <GuestScheduler
          orgSlug={orgSlug}
          offeringSlug={offeringSlug}
          page={page}
          embedded={!!embed}
        />
      )}
    </div>
  );
}
