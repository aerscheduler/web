import { ApiError } from "@/lib/api";

/**
 * Pull the desk-facing sentences out of a 409 `METER_ANOMALY` refusal.
 *
 * `POST /reservations/:id/rampIn` and `.../updateReviewTimes` answer this way when a
 * reading looks like a typo (a Hobbs jump far past what the booking could have flown, an
 * extra digit, and so on) rather than hard-refusing it: the desk can look at the aircraft
 * and confirm the number is real by resubmitting with `confirmMeterAnomaly: true`.
 *
 * Returns null for anything else (network failure, a different 409, a plain validation
 * error), so the caller's normal error toast still fires for those.
 */
export function meterAnomalyMessages(err: unknown): string[] | null {
  if (!(err instanceof ApiError) || err.status !== 409) return null;
  const body = err.body;
  if (!body || typeof body !== "object") return null;
  const record = body as Record<string, unknown>;
  if (record.code !== "METER_ANOMALY") return null;

  const details = record.details;
  const anomalies =
    details && typeof details === "object"
      ? (details as Record<string, unknown>).anomalies
      : undefined;
  if (!Array.isArray(anomalies)) return err.message ? [err.message] : [];

  const messages = anomalies
    .map((a) => (a && typeof a === "object" ? (a as Record<string, unknown>).message : null))
    .filter((m): m is string => typeof m === "string" && m.length > 0);

  return messages.length > 0 ? messages : err.message ? [err.message] : [];
}

/**
 * Is this the refusal that says saving the reading will ground the aircraft?
 *
 * Same 409-confirm shape as `METER_ANOMALY`, on purpose: the correction path already spoke
 * it, so a second confirmable refusal costs no new plumbing.
 *
 * Only ever raised on a CORRECTION, never on ramp-in. A pilot typing the reading for the
 * flight they just landed is reporting a fact, not making a decision, and asking them to
 * approve one they cannot decline would be theatre. Changing a reading that already exists
 * is a different act, done by somebody with authority over the fleet.
 */
export function maintenanceTriggerMessage(err: unknown): string | null {
  if (!(err instanceof ApiError) || err.status !== 409) return null;
  const body = err.body;
  if (!body || typeof body !== "object") return null;
  if ((body as Record<string, unknown>).code !== "MAINTENANCE_TRIGGER") return null;
  return err.message || "Saving this reading will ground the aircraft.";
}

/** What the meter log asks before a reading saves, and how the person answered. */
export type MeterAnswers = { confirmLower?: boolean; confirmMaintenanceTrigger?: boolean };

type Confirm = (opts: { title: string; description: string; confirmLabel: string; cancelLabel?: string; destructive?: boolean }) => Promise<boolean>;

/**
 * Send something that puts a reading on an aircraft's meter log (a job's readings in or out, an
 * inspection's sign-off), answering the log's two questions as they come: a reading lower than
 * the aircraft's (save it as a correction) and one that grounds it (save and ground it). Null
 * when the person backed out; any other error is thrown as it was.
 */
export async function withMeterAnswers<T>(send: (answers: MeterAnswers) => Promise<T>, confirm: Confirm, answers: MeterAnswers = {}): Promise<T | null> {
  try {
    return await send(answers);
  } catch (e) {
    const code = e instanceof ApiError && e.status === 409 ? ((e.body as { code?: string } | null)?.code ?? null) : null;
    if (code === "METER_LOWER" && !answers.confirmLower) {
      const ok = await confirm({
        title: "Lower than the aircraft's times",
        description: (e as Error).message,
        confirmLabel: "Save as a correction",
        cancelLabel: "Fix it",
      });
      return ok ? withMeterAnswers(send, confirm, { ...answers, confirmLower: true }) : null;
    }
    const trigger = maintenanceTriggerMessage(e);
    if (trigger && !answers.confirmMaintenanceTrigger) {
      const ok = await confirm({ title: "This reading grounds the aircraft", description: trigger, confirmLabel: "Save and ground it", destructive: true });
      return ok ? withMeterAnswers(send, confirm, { ...answers, confirmMaintenanceTrigger: true }) : null;
    }
    throw e;
  }
}
