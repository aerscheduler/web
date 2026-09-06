export type PublicBookingPage = {
  organization: {
    name: string;
    slug: string | null;
    logo: string | null;
    timeZone: string | null;
    embedHosts: string[];
    brand?: {
      accentHex: string | null;
      appearance: "light" | "dark" | "system";
      density: "compact" | "comfortable";
      cornerStyle: "rounded" | "sharp";
    };
  };
  offering: {
    slug: string;
    name: string;
    description: string | null;
    reservationType: string;
    fixedReservationMinutes: number | null;
    allowResourceChoice: boolean;
    collectionStyle?: "close_out" | "prepaid_fixed";
    prepaidAmountCents?: number | null;
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
