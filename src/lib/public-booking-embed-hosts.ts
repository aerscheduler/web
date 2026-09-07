const MAX_HOSTS = 20;
const DNS_HOST =
  /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/;
const ALL_NUMERIC_LABELS = /^[0-9.]+$/;
const SAFE_HTTPS_ORIGIN = /^https:\/\/[a-z0-9.-]+(?::\d+)?$/;
const SAFE_LOCAL_ORIGIN = /^http:\/\/(localhost|127\.0\.0\.1)(?::\d+)?$/;

export function parsePublicBookingEmbedHosts(input: unknown): { origins: string[] } | { error: string } {
  let lines: string[] = [];
  if (input == null) return { origins: [] };
  if (Array.isArray(input)) {
    for (const row of input) {
      if (typeof row !== "string") {
        return { error: "Embed websites must be a list of hosts." };
      }
    }
    lines = input;
  } else if (typeof input === "string") {
    lines = input.split(/\r?\n|,/);
  } else {
    return { error: "Embed websites must be a list of hosts." };
  }

  const origins: string[] = [];
  const seen = new Set<string>();
  for (const line of lines) {
    const parsed = parseOneEmbedHost(line);
    if (parsed === "empty") continue;
    if ("error" in parsed) return parsed;
    if (seen.has(parsed.origin)) continue;
    seen.add(parsed.origin);
    origins.push(parsed.origin);
    if (origins.length > MAX_HOSTS) {
      return { error: "Add at most 20 websites." };
    }
  }
  return { origins };
}

function parseOneEmbedHost(raw: string): { origin: string } | { error: string } | "empty" {
  const trimmed = raw.trim();
  if (!trimmed) return "empty";
  if (/[\s;,'"]/.test(trimmed)) {
    return { error: `Each website must be on its own line (${trimmed}).` };
  }
  if (trimmed.includes("*")) {
    return { error: "Wildcards are not allowed. Use the exact host, like www.yourschool.com." };
  }
  if (trimmed.startsWith("//")) {
    return { error: `"${trimmed}" is not a website host.` };
  }

  let toParse: string;
  if (/^https:\/\//i.test(trimmed)) {
    toParse = trimmed;
  } else if (/^http:\/\//i.test(trimmed)) {
    toParse = trimmed;
  } else if (trimmed.includes("://")) {
    return { error: `"${trimmed}" is not a website host.` };
  } else {
    toParse = `https://${trimmed}`;
  }

  const rest = toParse.replace(/^https?:\/\//i, "");
  if (!rest || rest.startsWith("/")) {
    return { error: `"${trimmed}" is not a website host.` };
  }
  if (rest.includes("@")) {
    return { error: "Do not include a username or password in the website." };
  }

  const hostPort = rest.split(/[/?#]/)[0] || "";
  if (!hostPort || hostPort.startsWith("[")) {
    return { error: `"${trimmed}" is not a website host.` };
  }

  let typedHost = hostPort.toLowerCase();
  if (typedHost.includes(":")) {
    const idx = typedHost.lastIndexOf(":");
    const portPart = typedHost.slice(idx + 1);
    typedHost = typedHost.slice(0, idx);
    if (!typedHost || !/^\d{1,5}$/.test(portPart)) {
      return { error: `"${trimmed}" is not a website host.` };
    }
  }

  const local = typedHost === "localhost" || typedHost === "127.0.0.1";
  if (!local) {
    if (ALL_NUMERIC_LABELS.test(typedHost) || !DNS_HOST.test(typedHost)) {
      return { error: `"${trimmed}" is not a website host.` };
    }
  }

  let url: URL;
  try {
    url = new URL(toParse);
  } catch {
    return { error: `"${trimmed}" is not a website host.` };
  }
  if (url.hostname.toLowerCase() !== typedHost) {
    return { error: `"${trimmed}" is not a website host.` };
  }
  if (url.username || url.password) {
    return { error: "Do not include a username or password in the website." };
  }
  if ((url.pathname && url.pathname !== "/") || url.search || url.hash) {
    return { error: "Use the site host only, like www.yourschool.com, not a full page URL." };
  }
  if (!local && url.protocol !== "https:") {
    return { error: "Public websites must use https." };
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { error: `"${trimmed}" is not a website host.` };
  }

  const protocol = local ? (url.protocol === "https:" ? "https:" : "http:") : "https:";
  const defaultPort = protocol === "https:" ? "443" : "80";
  const port = url.port && url.port !== defaultPort ? `:${url.port}` : "";
  const origin = `${protocol}//${typedHost}${port}`;
  if (!SAFE_HTTPS_ORIGIN.test(origin) && !SAFE_LOCAL_ORIGIN.test(origin) && origin !== `https://127.0.0.1${port}`) {
    return { error: `"${trimmed}" is not a website host.` };
  }
  return { origin };
}

export function sanitizeStoredPublicBookingEmbedHosts(stored: unknown): string[] {
  if (!Array.isArray(stored)) return [];
  const origins: string[] = [];
  const seen = new Set<string>();
  for (const row of stored) {
    if (typeof row !== "string") continue;
    const parsed = parsePublicBookingEmbedHosts([row]);
    if ("error" in parsed || parsed.origins.length !== 1) continue;
    const origin = parsed.origins[0];
    if (seen.has(origin)) continue;
    seen.add(origin);
    origins.push(origin);
    if (origins.length >= MAX_HOSTS) break;
  }
  return origins;
}

export function frameAncestorsCsp(allowedOrigins: string[]): string {
  const safe = allowedOrigins.filter(
    (origin) =>
      SAFE_HTTPS_ORIGIN.test(origin) ||
      SAFE_LOCAL_ORIGIN.test(origin) ||
      /^https:\/\/127\.0\.0\.1(?::\d+)?$/.test(origin)
  );
  return `frame-ancestors ${["'self'", ...safe].join(" ")}`;
}

export function isFramedWindow(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
}

export function parentFrameOrigin(): string | null {
  try {
    const ancestor = window.location.ancestorOrigins?.[0];
    if (ancestor) return new URL(ancestor).origin;
  } catch {
    // Ignore malformed ancestor origins.
  }
  try {
    return window.parent.location.origin;
  } catch {
    // Cross-origin parent: the browser throws. Do not fall back to document.referrer;
    // an open redirect on a listed host can make referrer look allowlisted.
  }
  return null;
}

export function parentMayEmbed(args: {
  framed: boolean;
  parentOrigin: string | null;
  allowedOrigins: string[];
  selfOrigin: string;
  /** False when this SPA document was not loaded as /book (framed login then client route). */
  htmlDocumentIsGuestBook?: boolean;
}): boolean {
  if (!args.framed) return true;
  if (args.parentOrigin === args.selfOrigin) return true;
  if (args.htmlDocumentIsGuestBook === false) return false;
  // Unknown parent: only defer to CSP when some site is actually allowed to embed.
  // An empty list is share-link only; a no-referrer iframe must not see the picker
  // just because the header was missing or stale.
  // Do not read parentOrigin from the query string. That param is only a
  // postMessage target after this gate (and CSP) have already allowed the picker.
  if (!args.parentOrigin) return args.allowedOrigins.length > 0;
  return args.allowedOrigins.includes(args.parentOrigin);
}

export const PUBLIC_BOOKING_EMBED_SOURCE = "aerscheduler-book";

/** Validated `parentOrigin` query value, or null if missing or not a stored host origin. */
export function parseEmbedParentOriginQuery(search: string): string | null {
  const raw = search.startsWith("?") ? search.slice(1) : search;
  let value: string | null = null;
  try {
    value = new URLSearchParams(raw).get("parentOrigin");
  } catch {
    return null;
  }
  if (!value) return null;
  const parsed = parsePublicBookingEmbedHosts([value]);
  if ("error" in parsed || parsed.origins.length !== 1) return null;
  return parsed.origins[0] ?? null;
}

/**
 * postMessage targetOrigin. Never "*".
 * Prefer the discovered parent. The query param is a fallback for browsers that
 * hide ancestorOrigins; it is used only when it is this app origin or a listed host.
 */
export function embedPostTargetOrigin(args: {
  discoveredParent: string | null;
  queryParentOrigin: string | null;
  allowedOrigins: string[];
  selfOrigin: string;
}): string | null {
  if (args.discoveredParent) return args.discoveredParent;
  if (!args.queryParentOrigin) return null;
  if (args.queryParentOrigin === args.selfOrigin) return args.queryParentOrigin;
  if (args.allowedOrigins.includes(args.queryParentOrigin)) return args.queryParentOrigin;
  return null;
}

export function postEmbedMessage(args: {
  type: string;
  extra?: Record<string, unknown>;
  allowedOrigins: string[];
}): void {
  if (typeof window === "undefined" || window.parent === window) return;
  const target = embedPostTargetOrigin({
    discoveredParent: parentFrameOrigin(),
    queryParentOrigin: parseEmbedParentOriginQuery(window.location.search),
    allowedOrigins: args.allowedOrigins,
    selfOrigin: window.location.origin,
  });
  if (!target) return;
  window.parent.postMessage(
    { source: PUBLIC_BOOKING_EMBED_SOURCE, type: args.type, ...args.extra },
    target
  );
}

/** Load/slots/submit failures. Same target rules as success events. When the public
 *  page never loaded (empty allowlist), a validated query parentOrigin is still a
 *  legal targetOrigin: postMessage only delivers if it matches the real parent. */
export function postEmbedError(
  extra: { code: string; message: string },
  allowedOrigins: string[] = []
): void {
  if (typeof window === "undefined") return;
  const query = parseEmbedParentOriginQuery(window.location.search);
  const origins =
    allowedOrigins.length > 0 ? allowedOrigins : query ? [query] : [];
  postEmbedMessage({ type: "error", extra, allowedOrigins: origins });
}

let htmlDocumentIsGuestBook = false;

/** Call once at boot from the document URL, before the router changes the path. */
export function rememberGuestBookingHtmlDocument(): void {
  if (typeof window === "undefined") return;
  const path = window.location.pathname;
  htmlDocumentIsGuestBook = path === "/book" || path.startsWith("/book/");
}

export function guestBookingHtmlWasLoaded(): boolean {
  return htmlDocumentIsGuestBook;
}
