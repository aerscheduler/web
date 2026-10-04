import { describe, expect, it } from "vitest";
import { invoiceStatus, isOwed } from "@/components/billing/invoice-status";
import type { Invoice } from "@/types/api";
import { dateKeyOf, formatDateKey, isPastDue, paidByWords, paymentSummary, todayKeyIn } from "./payment-methods";

const NOW = new Date("2026-10-05T18:00:00Z");

const inv = (over: Partial<Invoice> = {}): Invoice =>
  ({ id: 812, createdAt: "2026-09-20T00:00:00Z", voidedAt: null, paidAt: null, dueAt: null, total: 41250, subtotal: 41250, tax: null, memo: null, ...over }) as Invoice;

describe("past due", () => {
  it("is unpaid, not voided, and past a due date it has: the server's overdue rule", () => {
    expect(isPastDue(inv({ dueAt: "2026-10-01T00:00:00Z" }), NOW)).toBe(true);
    expect(isPastDue(inv({ dueAt: "2026-10-09T00:00:00Z" }), NOW)).toBe(false);
    // No due date is never past due: there is no moment it passed.
    expect(isPastDue(inv({ dueAt: null }), NOW)).toBe(false);
    expect(isPastDue(inv({ dueAt: "2026-10-01T00:00:00Z", paidAt: "2026-10-04T00:00:00Z" }), NOW)).toBe(false);
    expect(isPastDue(inv({ dueAt: "2026-10-01T00:00:00Z", voidedAt: "2026-10-04T00:00:00Z" }), NOW)).toBe(false);
  });

  it("is a status of its own on every badge, and still owed", () => {
    const late = invoiceStatus(inv({ dueAt: "2026-10-01T00:00:00Z" }), NOW);
    expect(late).toMatchObject({ key: "past_due", label: "Past due" });
    // Amber, never red: a status is not an action, and a late date is amber.
    expect(late.variant).toBe("warning");
    expect(isOwed(late)).toBe(true);
    expect(invoiceStatus(inv({ dueAt: "2026-10-09T00:00:00Z" }), NOW).key).toBe("outstanding");
    expect(isOwed(invoiceStatus(inv({ paidAt: "2026-10-04T00:00:00Z" }), NOW))).toBe(false);
  });
});

describe("saying how it was paid", () => {
  const fmt = (iso: string) => `instant ${iso.slice(0, 10)}`;

  it("says a desk payment's method and the day it arrived", () => {
    expect(
      paymentSummary(inv({ paidAt: "2026-10-05T17:00:00Z", paymentMethod: "check", checkNumber: "1234", paymentReceivedOn: "2026-10-03T00:00:00.000Z" }), fmt, NOW)
    ).toBe("Paid by check #1234 on Oct 3");
    expect(paymentSummary(inv({ paidAt: "2026-10-05T17:00:00Z", paymentMethod: "cash", paymentReceivedOn: "2025-12-30T00:00:00.000Z" }), fmt, NOW)).toBe(
      "Paid in cash on Dec 30, 2025"
    );
  });

  it("says when a card payment was paid, in the zone it is given", () => {
    expect(paymentSummary(inv({ paidAt: "2026-10-05T17:00:00Z" }), fmt, NOW)).toBe("Paid on instant 2026-10-05");
  });

  it("says nothing for an unpaid bill", () => {
    expect(paymentSummary(inv({ paymentMethod: "check" }), fmt, NOW)).toBeNull();
  });

  it("words each method the way a person would", () => {
    expect(paidByWords({ paymentMethod: "check", checkNumber: null })).toBe("Paid by check");
    expect(paidByWords({ paymentMethod: "card_in_person" })).toBe("Paid by card in person");
    expect(paidByWords({ paymentMethod: "bank_transfer" })).toBe("Paid by bank transfer");
    expect(paidByWords({ paymentMethod: "manual" })).toBe("Marked paid in Stripe");
    expect(paidByWords({ paymentMethod: null })).toBeNull();
  });
});

describe("calendar days", () => {
  it("reads the day received as text, never shifted into the browser's zone", () => {
    // In Denver this instant is October 2nd; the payment arrived on the 3rd.
    expect(dateKeyOf("2026-10-03T00:00:00.000Z")).toBe("2026-10-03");
    expect(formatDateKey("2026-10-03", NOW)).toBe("Oct 3");
  });

  it("knows today in the organization's zone, not the laptop's", () => {
    // 03:30 UTC on the 5th is still the evening of the 4th in Idaho.
    const lateEvening = new Date("2026-10-05T03:30:00Z");
    expect(todayKeyIn("America/Boise", lateEvening)).toBe("2026-10-04");
    expect(todayKeyIn("UTC", lateEvening)).toBe("2026-10-05");
  });
});
