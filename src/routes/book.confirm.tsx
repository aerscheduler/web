import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { CheckCircle2, Loader2, XCircle } from "lucide-react";
import { LogoMark } from "@/components/logo";
import { ApiError } from "@/lib/api";
import { confirmPublicBookingRequest } from "@/features/public-booking";
import { clearBookConfirmToken, peekBookConfirmToken } from "@/lib/analytics";

type ConfirmSearch = { token?: string };

export const Route = createFileRoute("/book/confirm")({
  validateSearch: (s: Record<string, unknown>): ConfirmSearch => ({
    token: typeof s.token === "string" ? s.token : undefined,
  }),
  component: PublicBookConfirmPage,
});

function stripConfirmTokenFromUrl() {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  if (!url.searchParams.has("token")) return;
  url.searchParams.delete("token");
  window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
}

function PublicBookConfirmPage() {
  const { token: searchToken } = Route.useSearch();
  const [state, setState] = React.useState<"working" | "ok" | "already" | "error">("working");
  const [message, setMessage] = React.useState("Confirming your request…");
  const tokenRef = React.useRef(searchToken ?? peekBookConfirmToken() ?? undefined);
  if (searchToken) tokenRef.current = searchToken;

  React.useEffect(() => {
    const t = tokenRef.current;
    if (!t) {
      setState("error");
      setMessage("This confirmation link is missing its token. Open the link from your email.");
      return;
    }
    stripConfirmTokenFromUrl();
    let cancelled = false;
    confirmPublicBookingRequest(t)
      .then((result) => {
        if (cancelled) return;
        clearBookConfirmToken();
        if (result.alreadyConfirmed) {
          setState("already");
          setMessage("This request is already confirmed. The front desk has it in their queue.");
        } else {
          setState("ok");
          setMessage(
            "Your request is in. The front desk will review it and email you when they approve or decline it. This is not a booking until they approve."
          );
        }
      })
      .catch((err) => {
        if (cancelled) return;
        clearBookConfirmToken();
        setState("error");
        setMessage(
          err instanceof ApiError ? err.message : "This confirmation link is invalid or has expired."
        );
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const ok = state === "ok" || state === "already";

  return (
    <div className="grid min-h-svh place-items-center bg-muted/30 px-4 py-10">
      <div className="w-full max-w-md rounded-xl border bg-card p-8 text-center shadow-sm">
        <div className="mb-5 flex justify-center">
          <LogoMark className="h-9" />
        </div>
        {state === "working" ? (
          <Loader2 className="mx-auto size-8 animate-spin text-muted-foreground" />
        ) : ok ? (
          <div className="mx-auto grid size-12 place-items-center rounded-full bg-[color-mix(in_oklch,var(--success)_15%,transparent)] text-success">
            <CheckCircle2 className="size-6" />
          </div>
        ) : (
          <div className="mx-auto grid size-12 place-items-center rounded-full bg-destructive/10 text-destructive">
            <XCircle className="size-6" />
          </div>
        )}
        <h1 className="mt-4 text-xl font-semibold tracking-tight">
          {state === "working"
            ? "Confirming"
            : ok
              ? "Request confirmed"
              : "Could not confirm"}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">{message}</p>
      </div>
    </div>
  );
}
