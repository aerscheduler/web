import * as React from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  ReservationForm,
  type ReservationDraft,
} from "@/components/schedule/reservation-form";

/**
 * Global quick-create, a Stripe-style "+" in the top bar can open the ", New
 * reservation" modal from anywhere, not just the schedule board. The modal is
 * mounted once here at the shell level and driven by context so any descendant
 * (the topbar button, a command-palette action, an empty-state CTA) can open it.
 *
 * The heavy option queries inside <ReservationForm> are gated on `open`, so
 * mounting it here costs nothing until the user actually opens it.
 */
type QuickCreateContextValue = {
  /** Open the "New reservation" modal (seeded to today). */
  openNewReservation: () => void;
};

const QuickCreateContext = React.createContext<QuickCreateContextValue | null>(null);

export function useQuickCreate(): QuickCreateContextValue {
  const ctx = React.useContext(QuickCreateContext);
  if (!ctx) {
    throw new Error("useQuickCreate must be used within a <QuickCreateProvider>");
  }
  return ctx;
}

export function QuickCreateProvider({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();
  const [open, setOpen] = React.useState(false);
  const [draft, setDraft] = React.useState<ReservationDraft>(() => ({
    date: new Date(),
  }));

  const openNewReservation = React.useCallback(() => {
    // Re-seed to "now" each open so a stale date isn't carried between sessions.
    setDraft({ date: new Date() });
    setOpen(true);
  }, []);

  const value = React.useMemo(() => ({ openNewReservation }), [openNewReservation]);

  return (
    <QuickCreateContext.Provider value={value}>
      {children}
      <ReservationForm
        open={open}
        onOpenChange={setOpen}
        draft={draft}
        // After booking, drop them on the dispatch board where it now appears.
        onCreated={() => void navigate({ to: "/schedule" })}
      />
    </QuickCreateContext.Provider>
  );
}
