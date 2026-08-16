// Google Sign-In for the web console.
//
// The AerScheduler server's POST /auth/google verifies an **OAuth access token**
// (via google-auth-library getTokenInfo → tokeninfo endpoint) and reads the email.
// it does NOT verify an ID token / One-Tap credential. So we use Google Identity
// Services' OAuth 2.0 *token* model (implicit flow) to obtain an access_token,
// then fetch the profile name/picture the server also wants.

const GOOGLE_CLIENT_ID =
  (import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined) ||
  "883238459763-7cmbpg2uk7g7933khl0vu0itdr2eu6n1.apps.googleusercontent.com";

const GSI_SRC = "https://accounts.google.com/gsi/client";

type TokenResponse = { access_token?: string; error?: string };
type TokenClient = { requestAccessToken: () => void };
type CodeResponse = { code?: string; error?: string };
type CodeClient = { requestCode: () => void };
type GoogleGsi = {
  accounts: {
    oauth2: {
      initTokenClient: (cfg: {
        client_id: string;
        scope: string;
        callback: (resp: TokenResponse) => void;
        error_callback?: (err: { type?: string; message?: string }) => void;
      }) => TokenClient;
      initCodeClient: (cfg: {
        client_id: string;
        scope: string;
        ux_mode?: "popup" | "redirect";
        callback: (resp: CodeResponse) => void;
        error_callback?: (err: { type?: string; message?: string }) => void;
      }) => CodeClient;
    };
  };
};

function gsi(): GoogleGsi | undefined {
  return (window as unknown as { google?: GoogleGsi }).google;
}

let loader: Promise<void> | null = null;
function loadGis(): Promise<void> {
  if (gsi()?.accounts?.oauth2) return Promise.resolve();
  if (loader) return loader;
  loader = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${GSI_SRC}"]`);
    if (existing) {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () => reject(new Error("Failed to load Google sign-in")));
      return;
    }
    const s = document.createElement("script");
    s.src = GSI_SRC;
    s.async = true;
    s.defer = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("Failed to load Google sign-in"));
    document.head.appendChild(s);
  });
  return loader;
}

export type GoogleProfile = { accessToken: string; name: string; profileImage?: string };

/** Opens the Google account chooser and resolves with an access token + profile. */
export async function signInWithGoogle(): Promise<GoogleProfile> {
  await loadGis();
  const g = gsi();
  if (!g) throw new Error("Google sign-in is unavailable right now.");

  return new Promise<GoogleProfile>((resolve, reject) => {
    const client = g.accounts.oauth2.initTokenClient({
      client_id: GOOGLE_CLIENT_ID,
      scope: "openid email profile",
      callback: (resp) => {
        if (resp.error || !resp.access_token) {
          reject(new Error(resp.error || "Google sign-in failed."));
          return;
        }
        const token = resp.access_token;
        fetch("https://openidconnect.googleapis.com/v1/userinfo", {
          headers: { Authorization: `Bearer ${token}` },
        })
          .then((r) => (r.ok ? r.json() : Promise.reject(new Error("Couldn't read your Google profile."))))
          .then((info: { name?: string; email?: string; picture?: string }) => {
            resolve({
              accessToken: token,
              name: info.name || info.email || "Pilot",
              profileImage: info.picture,
            });
          })
          .catch(reject);
      },
      error_callback: (err) => reject(new Error(err?.message || "Google sign-in was cancelled.")),
    });
    client.requestAccessToken();
  });
}

/**
 * Opens Google's consent popup for Calendar access and resolves with a
 * server auth **code** (offline). The AerScheduler server exchanges it for a
 * refresh token (POST /integrations/googleCalendar with { serverAuthCode, web:true },
 * which exchanges against redirect_uri "postmessage").
 */
export async function requestGoogleCalendarCode(): Promise<string> {
  await loadGis();
  const g = gsi();
  if (!g?.accounts?.oauth2?.initCodeClient) {
    throw new Error("Google is unavailable right now.");
  }

  return new Promise<string>((resolve, reject) => {
    const client = g.accounts.oauth2.initCodeClient({
      client_id: GOOGLE_CLIENT_ID,
      // Must match the scopes Google has verified on the OAuth consent screen
      // (Data Access → sensitive scopes). calendar.events covers the
      // insert/update/delete the server does; calendar.calendarlist.readonly is
      // what lets a member pick which calendar to write to. Requesting the broader
      // ".../auth/calendar" instead would be an *unapproved* scope, which is what
      // triggers the "Google hasn't verified this app" screen.
      scope:
        "https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/calendar.calendarlist.readonly",
      ux_mode: "popup",
      callback: (resp) => {
        if (resp.error || !resp.code) {
          reject(new Error(resp.error || "Google Calendar connection was cancelled."));
          return;
        }
        resolve(resp.code);
      },
      error_callback: (err) =>
        reject(new Error(err?.message || "Google Calendar connection was cancelled.")),
    });
    client.requestCode();
  });
}
