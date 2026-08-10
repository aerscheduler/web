/**
 * Client-side helpers for cancel/edit lock UX. Mirror server bookingPolicy.ts so the
 * cancel dialog can explain the fee before the request is sent.
 */
export function hoursUntilStart(start: Date | string, now: Date = new Date()): number {
  return (new Date(start).getTime() - now.getTime()) / (1000 * 60 * 60);
}

export function formatFeeCents(cents: number): string {
  const dollars = cents / 100;
  return dollars % 1 === 0 ? `$${dollars.toFixed(0)}` : `$${dollars.toFixed(2)}`;
}

export type MemberCancelLockInfo = {
  locked: boolean;
  lockHours: number;
  feeCents: number | null;
  /** Staff always override; pass true when the caller is staff. */
  staffOverride: boolean;
};

export function memberCancelLockInfo(args: {
  start: Date | string;
  cancelEditLockHours?: number | null;
  lateCancelFeeCents?: number | null;
  staffOverride: boolean;
  now?: Date;
}): MemberCancelLockInfo {
  const lockHours = args.cancelEditLockHours ?? null;
  if (lockHours == null || lockHours <= 0) {
    return { locked: false, lockHours: 0, feeCents: null, staffOverride: args.staffOverride };
  }
  const hoursUntil = hoursUntilStart(args.start, args.now ?? new Date());
  const locked = hoursUntil < lockHours;
  return {
    locked,
    lockHours,
    feeCents: locked ? args.lateCancelFeeCents ?? null : null,
    staffOverride: args.staffOverride,
  };
}
