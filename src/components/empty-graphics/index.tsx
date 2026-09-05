import { DocumentsEmptyGraphic } from "./documents";
import { CurrenciesEmptyGraphic } from "./currencies";
import { MyScheduleEmptyGraphic } from "./my-schedule";
import { InvoicesEmptyGraphic } from "./invoices";
import { MyLedgerEmptyGraphic } from "./my-ledger";
import { PaymentsEmptyGraphic } from "./payments";
import { MyTrainingEmptyGraphic } from "./my-training";
import { EndorsementsEmptyGraphic } from "./endorsements";
import { BookEmptyGraphic } from "./book";
import { NotificationsEmptyGraphic } from "./notifications";
import { AircraftEmptyGraphic } from "./aircraft";
import { SimulatorsEmptyGraphic } from "./simulators";
import { RoomsEmptyGraphic } from "./rooms";
import { LocationsEmptyGraphic } from "./locations";
import { InspectionsEmptyGraphic } from "./inspections";
import { SquawksOpenEmptyGraphic } from "./squawks-open";
import { SquawksResolvedEmptyGraphic } from "./squawks-resolved";
import { MaintenanceEmptyGraphic } from "./maintenance";
import { ComplianceClearEmptyGraphic } from "./compliance-clear";
import { PeopleYouEmptyGraphic } from "./people-you";
import { InstructorsEmptyGraphic } from "./instructors";
import { StudentsEmptyGraphic } from "./students";
import { PeopleRolesEmptyGraphic } from "./people-roles";
import { InTrainingEmptyGraphic } from "./in-training";
import { RequirementsEmptyGraphic } from "./requirements";
import { BookingOfferingsEmptyGraphic } from "./booking-offerings";
import { PeopleGroupsEmptyGraphic } from "./people-groups";
import { RatingsEmptyGraphic } from "./ratings";
import { MembershipsEmptyGraphic } from "./memberships";
import { ApiKeysEmptyGraphic } from "./api-keys";
import { AnnouncementsEmptyGraphic } from "./announcements";
import { DispatchEmptyGraphic } from "./dispatch";
import { CancellationsEmptyGraphic } from "./cancellations";
import { ReportSchedulesEmptyGraphic } from "./report-schedules";
import { ReportsEmptyGraphic } from "./reports";
import type { ComponentType } from "react";
import { cn } from "@/lib/utils";

const UNIQUE = {
  documents: DocumentsEmptyGraphic,
  currencies: CurrenciesEmptyGraphic,
  "my-schedule": MyScheduleEmptyGraphic,
  invoices: InvoicesEmptyGraphic,
  "my-ledger": MyLedgerEmptyGraphic,
  payments: PaymentsEmptyGraphic,
  "my-training": MyTrainingEmptyGraphic,
  endorsements: EndorsementsEmptyGraphic,
  book: BookEmptyGraphic,
  notifications: NotificationsEmptyGraphic,
  aircraft: AircraftEmptyGraphic,
  simulators: SimulatorsEmptyGraphic,
  rooms: RoomsEmptyGraphic,
  locations: LocationsEmptyGraphic,
  inspections: InspectionsEmptyGraphic,
  "squawks-open": SquawksOpenEmptyGraphic,
  "squawks-resolved": SquawksResolvedEmptyGraphic,
  maintenance: MaintenanceEmptyGraphic,
  "compliance-clear": ComplianceClearEmptyGraphic,
  "people-you": PeopleYouEmptyGraphic,
  instructors: InstructorsEmptyGraphic,
  students: StudentsEmptyGraphic,
  "people-roles": PeopleRolesEmptyGraphic,
  "in-training": InTrainingEmptyGraphic,
  requirements: RequirementsEmptyGraphic,
  "booking-offerings": BookingOfferingsEmptyGraphic,
  "people-groups": PeopleGroupsEmptyGraphic,
  ratings: RatingsEmptyGraphic,
  memberships: MembershipsEmptyGraphic,
  "api-keys": ApiKeysEmptyGraphic,
  announcements: AnnouncementsEmptyGraphic,
  dispatch: DispatchEmptyGraphic,
  cancellations: CancellationsEmptyGraphic,
  "report-schedules": ReportSchedulesEmptyGraphic,
  reports: ReportsEmptyGraphic,
} as const;

/** Page-level empty-state drawings. Aliases reuse one silhouette. */
export const EMPTY_GRAPHICS = {
  ...UNIQUE,
  "document-types": UNIQUE.documents,
  courses: UNIQUE.documents,
  "compliance-log": UNIQUE.documents,
  "currency-rules": UNIQUE.currencies,
  "compliance-setup": UNIQUE.currencies,
  "aircraft-groups": UNIQUE.aircraft,
  credited: UNIQUE.requirements,
  renters: UNIQUE["people-groups"],
  technicians: UNIQUE["people-groups"],
  dispatchers: UNIQUE["people-groups"],
  admins: UNIQUE["people-groups"],
  guests: UNIQUE["people-groups"],
  enrolled: UNIQUE.students,
  stages: UNIQUE.students,
  billed: UNIQUE.invoices,
  "member-accounts": UNIQUE["my-ledger"],
} as const;

export type EmptyGraphicId = keyof typeof EMPTY_GRAPHICS;

export function EmptyGraphic({
  id,
  className,
}: {
  id: EmptyGraphicId;
  className?: string;
}) {
  const Graphic: ComponentType<{ className?: string }> = EMPTY_GRAPHICS[id];
  return <Graphic className={cn(className)} />;
}
