import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { Reservation } from "@/types/api";
import { hasInstruction, isRampedIn, isRampedOut, usesBriefingNotMeters } from "./close-out";

/**
 * The console's real rules, against a real API payload.
 *
 * `/tmp/res127347.json` is `GET /reservations/:id` for a ground lesson in a room with two
 * students and no instructor, captured from a running server. This is the exact booking the
 * phone and the console disagreed about, so this asserts the fix on the wire format rather
 * than on a hand-built fixture that might not match it.
 *
 * Skips itself when the capture is absent, so it never fails a clean checkout. Regenerate:
 *   curl -s localhost:5001/reservations/<id> -H "Authorization: Bearer $TOK" \
 *     | python3 -c "import sys,json;open('/tmp/res127347.json','w').write(json.dumps(json.load(sys.stdin)['data']))"
 */
function load(): Reservation | null {
  try {
    return JSON.parse(readFileSync("/tmp/res127347.json", "utf8")) as Reservation;
  } catch {
    return null;
  }
}

const r = load();

describe.skipIf(r == null)("a real ground booking with students and no instructor", () => {
  it("is the shape we think it is", () => {
    expect(r!.type).toBe("ground");
    expect(r!.personnel?.instructors?.length ?? 0).toBe(0);
    expect((r!.personnel?.students?.length ?? 0) > 0).toBe(true);
    expect(r!.review?.briefing ?? null).toBeNull();
  });

  it("bills no instruction, so there is nothing to record", () => {
    expect(hasInstruction(r!)).toBe(false);
    expect(usesBriefingNotMeters(r!)).toBe(true);
  });

  it("is ready to sign, which is what the phone has always said", () => {
    // Both of these returned false before the fix, so the console asked for an
    // instruction time that no one could ever supply.
    expect(isRampedOut(r!)).toBe(true);
    expect(isRampedIn(r!)).toBe(true);
  });
});
