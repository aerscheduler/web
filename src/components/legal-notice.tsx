import { PRIVACY_URL, TERMS_URL } from "@/lib/legal";

/**
 * The sign-in-wrap notice under the sign-up controls.
 *
 * Not decoration. US courts enforce terms presented this way only when the notice
 * is conspicuous and sits next to the button that accepts them, so this belongs
 * directly beneath the submit control and must stay legible: no smaller than
 * text-xs, and never muted to the point that the links stop reading as links.
 * Until this shipped, the console formed no contract at all, which put the
 * arbitration clause, the liability cap, and the indemnity out of reach for every
 * customer who signed up on the web rather than in the iOS app.
 *
 * Deliberately not a checkbox. A checkbox is not required in the US, and an extra
 * required click on the signup form costs conversion; what the law asks for is
 * notice, which this gives. `action` names the specific button so the sentence
 * stays true wherever it is used.
 */
export function LegalNotice({ action = "creating an account" }: { action?: string }) {
  return (
    <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
      By {action}, you agree to our{" "}
      <a
        href={TERMS_URL}
        target="_blank"
        rel="noreferrer"
        className="font-medium text-foreground underline underline-offset-2 hover:text-primary"
      >
        Terms of Service
      </a>{" "}
      and{" "}
      <a
        href={PRIVACY_URL}
        target="_blank"
        rel="noreferrer"
        className="font-medium text-foreground underline underline-offset-2 hover:text-primary"
      >
        Privacy Policy
      </a>
      .
    </p>
  );
}
