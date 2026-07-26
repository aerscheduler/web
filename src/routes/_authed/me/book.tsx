import { createFileRoute } from "@tanstack/react-router";
import { Building2, CalendarPlus } from "lucide-react";

import { useAuth } from "@/lib/auth";
import { isTechnician, selfBookableTypes } from "@/lib/permissions";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/states";
import { Card, CardContent } from "@/components/ui/card";
import { BookingForm } from "@/components/book/booking-form";

export const Route = createFileRoute("/_authed/me/book")({
  component: Book,
});

function Book() {
  const { organization, roles, orgUserId, userId } = useAuth();

  // Only the roles that seat you on a flight count here — see `selfBookableTypes`.
  const bookable = selfBookableTypes(roles);
  const canBook = bookable.length > 0;
  // A technician's only booking is taking an aircraft off the line, so the page
  // shouldn't call it "reserving an aircraft for yourself".
  const maintenanceOnly = isTechnician(roles) && bookable.length === 1;

  return (
    <div>
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
              title="Nothing to book yet"
              body="Your account doesn't have a role that can book. Ask your school to add one so you can book yourself."
            />
          </CardContent>
        </Card>
      ) : (
        <BookingForm orgUserId={orgUserId} userId={userId} />
      )}
    </div>
  );
}
