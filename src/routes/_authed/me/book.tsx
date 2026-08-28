import { Link, createFileRoute } from "@tanstack/react-router";
import { Building2, CalendarPlus } from "lucide-react";

import { useAuth } from "@/lib/auth";
import { isStaff, isTechnician, selfBookableTypes } from "@/lib/permissions";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/states";
import { DocsLink } from "@/components/docs-hint";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { BookingForm } from "@/components/book/booking-form";

export const Route = createFileRoute("/_authed/me/book")({
  component: Book,
});

function Book() {
  const { organization, roles, orgUserId, userId } = useAuth();

  // Staff-only accounts land here with nothing to book, and that is correct: this
  // page seats YOU on a flight, and billing, currency, approved aircraft and
  // training all key off the seated person. An owner who only runs the school has
  // no rate and no currency to check.
  //
  // The copy has to be precise about WHY, because the obvious phrasings are both
  // wrong. "Your account doesn't have a role that can book" is false, staff book
  // constantly, from the board. But "book yourself from the board instead" is also
  // false: the board's pickers are role-filtered rosters, so a staff-only account
  // is on none of them and cannot be seated there either. The Flutter app reaches
  // the same place by a different route, its staff branch always picks somebody
  // else and offers no "for myself" checkbox. So on every surface the honest answer
  // is the same, a seat needs a flying role, and the fix is to grant yourself one.
  const staffOnly = isStaff(roles);

  // Only the roles that seat you on a flight count here, see `selfBookableTypes`.
  const bookable = selfBookableTypes(roles);
  const canBook = bookable.length > 0;
  // A technician's only booking is taking an aircraft off the line, so the page
  // shouldn't call it "reserving an aircraft for yourself".
  const maintenanceOnly = isTechnician(roles) && bookable.length === 1;

  return (
    <div data-doc-shot={maintenanceOnly ? "me-book-maintenance" : undefined}>
      <PageHeader
        title="Book"
        subtitle={
          maintenanceOnly
            ? "Schedule maintenance and take an aircraft off the line."
            : "Reserve an aircraft for yourself."
        }
      />

      {!organization || orgUserId == null || userId == null ? (
        <Card>
          <CardContent className="p-0">
            <EmptyState
              icon={Building2}
              title="No active organization"
              body="Join or select a flight school to book a reservation."
            />
          </CardContent>
        </Card>
      ) : !canBook ? (
        <Card>
          <CardContent className="p-0">
            <EmptyState
              icon={CalendarPlus}
              title={staffOnly ? "Add a flying role to book yourself" : "Nothing to book yet"}
              body={
                staffOnly
                  ? "Booking yourself puts you in the seat, which needs a flying role. Add renter, student or instructor to your own account, then book here. Until then you can book other people from the schedule board."
                  : "Your account doesn't have a role that can book. Ask your school to add one so you can book yourself."
              }
              action={
                staffOnly ? (
                  <Button asChild>
                    <Link to="/people">Add a role to your account</Link>
                  </Button>
                ) : (
                  <DocsLink topic="what-you-can-book" />
                )
              }
            />
          </CardContent>
        </Card>
      ) : (
        <BookingForm orgUserId={orgUserId} userId={userId} />
      )}
    </div>
  );
}
