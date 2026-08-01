/**
 * Checklist item → its mini-wizard.
 *
 * Kept here rather than on the item itself so `lib/onboarding-checklist.ts` stays a
 * plain data module: the registry describes outcomes, this file says how each one is
 * carried out. An item with no entry here just navigates, which is the right answer
 * whenever the destination page IS the focused experience (adding an aircraft, opening
 * the schedule) rather than a settings screen full of unrelated switches.
 */

import type { ComponentType } from "react";
import type { FlowProps } from "./flow-shell";
import { BillingFlow } from "./billing-flow";
import { InviteFlow } from "./invite-flow";
import { MaintenanceFlow } from "./maintenance-flow";
import { OrganizationFlow } from "./organization-flow";
import { RatesFlow } from "./rates-flow";
import { RulesFlow } from "./rules-flow";

export type { FlowProps };

export const FLOWS: Record<string, ComponentType<FlowProps>> = {
  billing: BillingFlow,
  maintenance: MaintenanceFlow,
  rules: RulesFlow,
  rates: RatesFlow,
  profile: OrganizationFlow,
  // Same flow, different starting answer — the question it opens on is the only
  // difference between "invite your instructors" and "invite your students".
  instructors: (props) => <InviteFlow {...props} defaultWho="instructor" />,
  students: (props) => <InviteFlow {...props} defaultWho="student" />,
};

export const flowFor = (itemId: string): ComponentType<FlowProps> | undefined => FLOWS[itemId];
