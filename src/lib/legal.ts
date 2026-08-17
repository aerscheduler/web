/**
 * The published legal documents, and the version of them a new account accepts.
 *
 * `TERMS_VERSION` is the date stamp shown as "Last updated" on both documents.
 * It is sent with every sign-up and stored on the user row, so that we can later
 * answer "which version did this customer agree to?" without guessing from
 * `createdAt`. Bump it in the SAME commit that changes the published wording,
 * and never retroactively: an account that accepted 2026-08-15 accepted the text
 * that was live on 2026-08-15, whatever the page says today.
 *
 * Section 20 of the Terms promises 30 days' notice before a material change takes
 * effect, so bumping this is not on its own enough. Send the notice too.
 */
export const TERMS_VERSION = "2026-08-17";

export const TERMS_URL = "https://www.aerscheduler.com/terms-and-conditions";
export const PRIVACY_URL = "https://www.aerscheduler.com/privacy";
