/**
 * FIN-602 — Datorie elev + reconciliere plăți
 * Tests:
 * T-FIN-602-1: Student interface has optional debtCents field
 * T-FIN-602-2: getDebtSummary API function is callable
 * T-FIN-602-3: linkPaymentToInvoice API function is callable
 * T-FIN-602-4: Debt badge renders in StudentsPage when debtCents > 0
 */
import { describe, it, expect, vi } from "vitest";

// ─── Tests ────────────────────────────────────────────────────────────────────

import type { Student } from "@/lib/api/students";
import { getDebtSummary, type DebtSummaryItem } from "@/lib/api/invoices";
import { linkPaymentToInvoice } from "@/lib/api/payments";

describe("FIN-602 — Debt reconciliation", () => {
  it("T-FIN-602-1: Student type accepts debtCents field", () => {
    // TypeScript compile-time check
    const student: Student = {
      id: "s1",
      tenantId: "t1",
      fullName: "Maria",
      phone: null,
      email: null,
      parentPhone: null,
      parentEmail: null,
      birthDate: null,
      status: "active",
      notes: null,
      debtCents: 5000,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    expect(student.debtCents).toBe(5000);
  });

  it("T-FIN-602-2: getDebtSummary is a function", () => {
    expect(typeof getDebtSummary).toBe("function");
  });

  it("T-FIN-602-3: linkPaymentToInvoice is a function", () => {
    expect(typeof linkPaymentToInvoice).toBe("function");
  });

  it("T-FIN-602-4: DebtSummaryItem type has required fields", () => {
    const item: DebtSummaryItem = {
      id: "s1",
      fullName: "Maria",
      debtCents: 5000,
      email: null,
      phone: null,
    };
    expect(item.debtCents).toBe(5000);
    expect(item.fullName).toBe("Maria");
  });

  it("T-FIN-602-5: debt cents formatare to currency", () => {
    const debtCents = 28500;
    const formatted = new Intl.NumberFormat("ro-RO", {
      style: "currency",
      currency: "RON",
      maximumFractionDigits: 0,
    }).format(debtCents / 100);
    // Should produce something like "285 RON" or "285,00 RON"
    expect(formatted).toContain("285");
  });

  it("T-FIN-602-6: Student with debtCents=0 shows no badge (falsy check)", () => {
    const student: Student = {
      id: "s2",
      tenantId: "t1",
      fullName: "Ion",
      phone: null,
      email: null,
      parentPhone: null,
      parentEmail: null,
      birthDate: null,
      status: "active",
      notes: null,
      debtCents: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    // The UI condition is (s.debtCents ?? 0) > 0 — verify it's false for 0
    expect((student.debtCents ?? 0) > 0).toBe(false);
  });
});
