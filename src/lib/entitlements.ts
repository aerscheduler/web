import type { Organization } from "@/types/api";

/**
 * Plans, and what they grant. Mirrors `server/src/services/entitlements.ts`.
 *
 * Everything here is COSMETIC. It decides what to render, never what is allowed: the
 * server refuses the endpoints outright and stops honouring an existing API key the
 * moment its school leaves the plan. Hiding a settings tab has never been what keeps
 * anyone out, and drifting from the server's copy only ever costs somebody a hidden
 * menu item, never access. (Same arrangement as DEVELOPER_EMAILS in `lib/developer.ts`,
 * and for the same reason.)
 *
 * Ask `orgCan(org, "api")`, not `plan === "enterprise"`. The two are the same thing
 * today; they stop being the same thing the first time one account is granted the API
 * off-plan, and at that point every call site phrased the first way is already right.
 */
export const PLANS = ["standard", "enterprise"] as const;
export type Plan = (typeof PLANS)[number];

/** One entry per thing the UI gates. Short on purpose, see the server's note. */
export type Capability = "api";

const CAPABILITIES: Record<Plan, readonly Capability[]> = {
  standard: [],
  enterprise: ["api"],
};

/** Unknown or missing reads as `standard`: an unrecognised plan must grant nothing. */
export function planOf(organization?: Organization | null): Plan {
  const plan = organization?.plan;
  return (PLANS as readonly string[]).includes(plan ?? "") ? (plan as Plan) : "standard";
}

export function orgCan(organization: Organization | null | undefined, capability: Capability): boolean {
  return CAPABILITIES[planOf(organization)].includes(capability);
}

/**
 * Where an admin is sent to ask for a plan they do not have.
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
