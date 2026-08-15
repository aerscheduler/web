import type { Organization } from "@/types/api";

/**
 * The Enterprise plan, as far as the console is concerned.
 *
 * Enterprise is quoted rather than checked out: an account signs, and we flip
 * `Organization.isEnterprise` in the database by hand. There is deliberately no
 * endpoint that sets it, so nothing here writes it either.
 *
 * The only thing gated in code today is the public REST API, custom integrations,
 * staff training and dedicated support are things we do, not switches. Everything in
 * this file is COSMETIC: hiding a settings tab keeps a school from finding a screen
 * they cannot use, it is never what keeps them out. The server refuses /apiKeys to a
 * non-Enterprise org and stops honouring that org's existing keys, which is the gate.
 */
export function isEnterpriseOrg(organization?: Organization | null): boolean {
  return organization?.isEnterprise === true;
}

/**
 * Where an admin is sent to ask for it.
 *
 * The marketing contact form rather than a mailto: it is the same destination the
 * pricing page and the API documentation point at, and it cannot bounce.
 */
export const ENTERPRISE_CONTACT_URL = "https://www.aerscheduler.com/contact";

/** What Enterprise includes, in the order the marketing site lists them. */
export const ENTERPRISE_FEATURES: { title: string; body: string; soon?: boolean }[] = [
  {
    title: "The AerScheduler API",
    body: "Create API keys and drive your schedule, fleet and billing from your own software.",
  },
  {
    title: "Custom integrations",
    body: "We build the connection to the system you already run, rather than leaving you to it.",
  },
  {
    title: "Training for your team",
    body: "Onboarding sessions for your instructors, dispatchers and office staff.",
  },
  {
    title: "Dedicated support",
    body: "A named contact, and a support channel that is not a shared inbox.",
  },
  { title: "Single sign-on", body: "SAML and SCIM provisioning.", soon: true },
];
