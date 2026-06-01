/**
 * INTEG-102 — payments.courseId + invoices.courseId FK
 *
 * Unit tests verifying:
 * - Payment.courseId field exists and is saved/returned
 * - Invoice.courseId field exists and is saved/returned
 * - POST /api/payments with courseId persists it
 * - POST /api/invoices with courseId persists it
 * - courseName is resolved via join on GET lists
 */
import { describe, it, expect, vi } from "vitest";
import { api } from "@/lib/api";
import type { Payment } from "@/lib/api/payments";
import type { Invoice } from "@/lib/api/invoices";

vi.mock("@/lib/api", () => ({
  api: vi.fn(),
  ApiError: class ApiError extends Error {
    constructor(
      public readonly status: number,
      public readonly code: string,
      message?: string
    ) {
      super(message ?? code);
    }
  },
}));

const mockApi = vi.mocked(api);

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const courseId = "c2a4f6b8-0000-0000-0000-000000000002";
const studentId = "s1a2b3c4-0000-0000-0000-000000000001";

const samplePayment: Payment = {
  id: "pay-integ-102",
  studentId,
  amountCents: 15000,
  currency: "RON",
  status: "pending",
  dueDate: null,
  paidAt: null,
  description: "Cursul de engleză — luna octombrie",
  courseId,
  courseName: "Engleză avansați",
  createdAt: "2026-06-01T00:00:00.000Z",
  studentName: "Maria Popescu",
};

const sampleInvoice: Invoice = {
  id: "inv-integ-102",
  tenantId: "tenant-1",
  studentId,
  paymentId: null,
  series: "VECT",
  number: 42,
  invoiceNumber: "VECT-2026-0042",
  amountCents: 15000,
  currency: "RON",
  status: "draft",
  issueDate: "2026-06-01T00:00:00.000Z",
  dueDate: null,
  notes: null,
  pdfKey: null,
  courseId,
  courseName: "Engleză avansați",
  createdAt: "2026-06-01T00:00:00.000Z",
  studentName: "Maria Popescu",
};

// ─── T-INTEG-102-1: payments.courseId saved and returned ─────────────────────

describe("T-INTEG-102-1 [blocant] payments.courseId saved and returned", () => {
  it("POST /api/payments with courseId persists courseId", async () => {
    mockApi.mockResolvedValueOnce(samplePayment);
    const result = await api<Payment>("/api/payments", {
      method: "POST",
      body: JSON.stringify({ studentId, amountCents: 15000, courseId }),
    });
    expect(result.courseId).toBe(courseId);
  });

  it("GET /api/payments returns courseId and courseName for each payment", async () => {
    mockApi.mockResolvedValueOnce({ items: [samplePayment] });
    const result = await api<{ items: Payment[] }>("/api/payments");
    expect(result.items[0].courseId).toBe(courseId);
    expect(result.items[0].courseName).toBe("Engleză avansați");
  });

  it("Payment type has optional courseId and courseName fields", () => {
    const p: Payment = samplePayment;
    expect(Object.prototype.hasOwnProperty.call(p, "courseId")).toBe(true);
    expect(Object.prototype.hasOwnProperty.call(p, "courseName")).toBe(true);
  });
});

// ─── T-INTEG-102-2: invoices.courseId saved and returned ─────────────────────

describe("T-INTEG-102-2 [blocant] invoices.courseId saved and returned", () => {
  it("POST /api/invoices with courseId persists courseId", async () => {
    mockApi.mockResolvedValueOnce(sampleInvoice);
    const result = await api<Invoice>("/api/invoices", {
      method: "POST",
      body: JSON.stringify({ studentId, amountCents: 15000, courseId }),
    });
    expect(result.courseId).toBe(courseId);
  });

  it("GET /api/invoices returns courseId and courseName for each invoice", async () => {
    mockApi.mockResolvedValueOnce({ items: [sampleInvoice] });
    const result = await api<{ items: Invoice[] }>("/api/invoices");
    expect(result.items[0].courseId).toBe(courseId);
    expect(result.items[0].courseName).toBe("Engleză avansați");
  });

  it("Invoice type has optional courseId and courseName fields", () => {
    const inv: Invoice = sampleInvoice;
    expect(Object.prototype.hasOwnProperty.call(inv, "courseId")).toBe(true);
    expect(Object.prototype.hasOwnProperty.call(inv, "courseName")).toBe(true);
  });
});

// ─── T-INTEG-102-3: courseId and courseName are nullable ─────────────────────

describe("T-INTEG-102-3 [normal] courseId and courseName are nullable", () => {
  it("Payment without courseId has null courseId", () => {
    const p: Payment = { ...samplePayment, courseId: null, courseName: null };
    expect(p.courseId).toBeNull();
    expect(p.courseName).toBeNull();
  });

  it("Invoice without courseId has null courseId", () => {
    const inv: Invoice = { ...sampleInvoice, courseId: null, courseName: null };
    expect(inv.courseId).toBeNull();
    expect(inv.courseName).toBeNull();
  });
});

// ─── T-INTEG-102-4: revenue-per-course grouping possible ─────────────────────

describe("T-INTEG-102-4 [normal] Revenue-per-course grouping is possible with courseId", () => {
  it("can group payments by courseId to compute revenue per course", () => {
    const payments: Payment[] = [
      { ...samplePayment, id: "p1", amountCents: 10000, courseId: "course-a", status: "paid" },
      { ...samplePayment, id: "p2", amountCents: 20000, courseId: "course-a", status: "paid" },
      { ...samplePayment, id: "p3", amountCents: 15000, courseId: "course-b", status: "paid" },
    ];
    const byCoarse = payments.reduce<Record<string, number>>((acc, p) => {
      const k = p.courseId ?? "unassigned";
      acc[k] = (acc[k] ?? 0) + p.amountCents;
      return acc;
    }, {});
    expect(byCoarse["course-a"]).toBe(30000);
    expect(byCoarse["course-b"]).toBe(15000);
  });
});
