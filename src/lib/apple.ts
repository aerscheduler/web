// Sign in with Apple for the web app (app.aerscheduler.com).
//
// Uses Apple's "Sign in with Apple JS" (usePopup) to obtain an authorization CODE,
// which we POST to the server's /auth/apple with `web:true`. The server exchanges
// the code using the web Services ID (com.aerscheduler.web). Auth codes are
// audience-bound, which is why web needs its own Services ID + return URL.

const APPLE_CLIENT_ID =
  (import.meta.env.VITE_APPLE_CLIENT_ID as string | undefined) || "com.aerscheduler.web";
const APPLE_REDIRECT_URI =
  (import.meta.env.VITE_APPLE_REDIRECT_URI as string | undefined) ||
  "https://app.aerscheduler.com/auth/apple/callback";
const APPLE_JS =
  "https://appleid.cdn-apple.com/appleauth/static/jsapi/appleid/1/en_US/appleid.auth.js";

/** Show the Apple button unless explicitly disabled. */
export const APPLE_ENABLED =
  ((import.meta.env.VITE_APPLE_ENABLED as string | undefined) ?? "true") !== "false";

type AppleAuthResponse = {
  authorization?: { code?: string; id_token?: string; state?: string };
  user?: { name?: { firstName?: string; lastName?: string }; email?: string };
};
type AppleID = {
  auth: {
    init: (cfg: {
      clientId: string;
      scope: string;
      redirectURI: string;
      usePopup: boolean;
    }) => void;
    signIn: () => Promise<AppleAuthResponse>;
  };
};

function appleId(): AppleID | undefined {
  return (window as unknown as { AppleID?: AppleID }).AppleID;
}

let loader: Promise<void> | null = null;
function loadApple(): Promise<void> {
  if (loader) return loader;
  loader = new Promise<void>((resolve, reject) => {
    const done = () => {
      const a = appleId();
      if (!a) return reject(new Error("Apple sign-in failed to load."));
      a.auth.init({
        clientId: APPLE_CLIENT_ID,
        scope: "name email",
        redirectURI: APPLE_REDIRECT_URI,
        usePopup: true,
      });
      resolve();
    };
    if (appleId()) return done();
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${APPLE_JS}"]`);
    if (existing) {
      existing.addEventListener("load", done);
      existing.addEventListener("error", () => reject(new Error("Apple sign-in failed to load.")));
      return;
    }
    const s = document.createElement("script");
    s.src = APPLE_JS;
    s.async = true;
    s.onload = done;
    s.onerror = () => reject(new Error("Apple sign-in failed to load."));
    document.head.appendChild(s);
  });
  return loader;
}

export type AppleProfile = { authCode: string; name?: string };

/** Opens the Apple sign-in popup and resolves with an authorization code (+ name on first sign-in). */
export async function signInWithApple(): Promise<AppleProfile> {
  await loadApple();
  const a = appleId();
  if (!a) throw new Error("Apple sign-in is unavailable right now.");

  const resp = await a.auth.signIn();
  const code = resp.authorization?.code;
  if (!code) throw new Error("Apple sign-in was cancelled.");

  let name: string | undefined;
  if (resp.user?.name) {
    name = [resp.user.name.firstName, resp.user.name.lastName].filter(Boolean).join(" ") || undefined;
  }
  return { authCode: code, name };
}
