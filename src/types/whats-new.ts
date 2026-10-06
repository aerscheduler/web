/**
 * "What's new": AerScheduler's own product updates, NOT the organization announcements a school
 * posts to its members. Written as typed files in the server (`server/src/whatsNew/entries`) and
 * served by `GET /whats-new`, already filtered to the caller's roles.
 */

/** Icon names the server may send. Must match `WHATS_NEW_ICONS` in server/src/whatsNew/types.ts. */
export type WhatsNewIcon =
  | "bell"
  | "calendar"
  | "chart"
  | "check"
  | "clock"
  | "document"
  | "mail"
  | "money"
  | "people"
  | "person"
  | "plane"
  | "receipt"
  | "search"
  | "settings"
  | "shield"
  | "sparkles"
  | "sync"
  | "wrench";

export type WhatsNewImage = { light: string; dark: string | null; alt: string };

export type WhatsNewBlock =
  | { type: "lede"; text: string }
  | { type: "features"; items: { icon: WhatsNewIcon; title: string; body: string }[] }
  | { type: "screenshot"; image: WhatsNewImage; caption: string | null }
  | { type: "steps"; title: string | null; items: string[] }
  | { type: "note"; text: string }
  | { type: "section"; title: string; body: string }
  | { type: "list"; items: string[] };

export type WhatsNewEntry = {
  id: string;
  publishedAt: string;
  /** Only developers ever receive a draft. */
  draft: boolean;
  title: string;
  summary: string;
  /** "For owners, admins and technicians". */
  audienceLabel: string;
  hero: WhatsNewImage | null;
  blocks: WhatsNewBlock[];
  /** The in-product button, already resolved for the console. */
  action: { label: string; to: string; minAppVersion: string | null } | null;
  /** The public page: the card's arrow and "Read the guide". */
  readMore: string | null;
  /**
   * Opened or read on the public site (on any device), or old news to this person: published
   * before they joined or more than 30 days ago. Drives the blue dots and "New".
   */
  read: boolean;
};

export type WhatsNewFeed = {
  /** Newest first. */
  entries: WhatsNewEntry[];
  /** The update the rail card shows, or null for no card. */
  cardId: string | null;
  unreadCount: number;
  /** Cards still to come after this one, drawn as an edge peeking out under the card. */
  waitingCount: number;
};

export type WhatsNewEvent = "shown" | "opened" | "dismissed" | "action" | "link";
export type WhatsNewSurface = "console_rail" | "console_menu";

/** One row of the developer page. */
export type WhatsNewStat = {
  entry: WhatsNewEntry;
  audience: { roles: string[] | "all"; outsideOwners?: boolean; platforms?: ("web" | "app")[] };
  status: "draft" | "scheduled" | "live" | "listed";
  audienceSize: number;
  shown: number;
  opened: number;
  action: number;
  link: number;
  dismissed: number;
};

export type WhatsNewPerson = {
  firstSurface: string | null;
  roles: string[];
  shownAt: string | null;
  openedAt: string | null;
  actionClickedAt: string | null;
  linkClickedAt: string | null;
  dismissedAt: string | null;
  user: { id: number; name: string; email: string };
  organization: { id: number; name: string; isDemo: boolean } | null;
};
