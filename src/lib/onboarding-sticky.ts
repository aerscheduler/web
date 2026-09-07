/**
 * Tab-local wizard step so a refresh on billing stays on billing. A new login has
 * no sessionStorage, so `newOrgOnboardingComplete` still sends them to AllSet.
 *
 * Keyed by org so a leftover step from school A cannot skip school B's aircraft.
 */
const STICKY_STEP_KEY = "aer.onboarding.step";

export function readStickyStep(orgId: number | undefined): 1 | 2 | 3 | null {
  if (!orgId) return null;
  try {
    const raw = sessionStorage.getItem(STICKY_STEP_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { orgId?: number; step?: number };
    if (parsed.orgId !== orgId) return null;
    if (parsed.step === 1 || parsed.step === 2 || parsed.step === 3) return parsed.step;
    return null;
  } catch {
    return null;
  }
}

export function writeStickyStep(orgId: number | undefined, step: number) {
  if (!orgId || (step !== 1 && step !== 2 && step !== 3)) return;
  try {
    sessionStorage.setItem(STICKY_STEP_KEY, JSON.stringify({ orgId, step }));
  } catch {
    /* private mode */
  }
}

export function clearOnboardingSticky() {
  try {
    sessionStorage.removeItem(STICKY_STEP_KEY);
  } catch {
    /* private mode */
  }
}
