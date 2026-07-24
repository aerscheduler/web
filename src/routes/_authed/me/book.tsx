import { createFileRoute } from "@tanstack/react-router";
import { Building2, CalendarPlus } from "lucide-react";

import { useAuth } from "@/lib/auth";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/states";
import { Card, CardContent } from "@/components/ui/card";
import { BookingForm } from "@/components/book/booking-form";
import type { BookMode } from "@/components/book/booking-form";

export const Route = createFileRoute("/_authed/me/book")({
  component: Book,
});

function Book() {
  const { organization, roles, orgUserId, userId } = useAuth();

  // Which self-booking modes does this member's roles unlock?
  const modes: BookMode[] = [];
  if (roles.includes("renter")) modes.push("renter");
  if (roles.includes("student")) modes.push("student");
  if (roles.includes("instructor")) modes.push("instructor");

  return (
    <div>
      <PageHeader title="Book" subtitle="Reserve an aircraft for yourself." />

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
      ) : modes.length === 0 ? (
        <Card>
          <CardContent className="p-0">
            <EmptyState
              icon={CalendarPlus}
              title="Nothing to book yet"
              body="Your account isn't set up as a renter, student, or instructor. Ask your school to add one of those roles so you can book yourself."
            />
          </CardContent>
        </Card>
      ) : (
        <div className="max-w-3xl">
          <BookingForm modes={modes} orgUserId={orgUserId} userId={userId} />
        </div>
      )}
    </div>
  );
}
