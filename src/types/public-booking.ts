export type PublicBookingPage = {
  organization: {
    name: string;
    slug: string | null;
    logo: string | null;
    timeZone: string | null;
    embedHosts: string[];
  };
  offering: {
    slug: string;
    name: string;
    description: string | null;
    reservationType: string;
    fixedReservationMinutes: number | null;
    allowResourceChoice: boolean;
    location: { name: string; timeZone?: string | null } | null;
  };
};

export type PublicBookableSlot = {
  start: string;
  end: string;
  timeZone: string;
  resourceId?: number | null;
  resourceLabel?: string | null;
};
