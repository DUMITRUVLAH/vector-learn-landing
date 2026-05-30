/**
 * FIN-603 — Abonamente recurente (facturare lunară)
 * Tests:
 * T-FIN-603-1: Tab "Abonamente" renders in InvoicesPage without crash
 * T-FIN-603-2: SubscriptionTable empty state renders correctly
 * T-FIN-603-3: SubscriptionTable renders subscription rows
 * T-FIN-603-4: AddSubscriptionModal renders with student selector + billing day
 * T-FIN-603-5: computeNextBillingDate logic — billing_day=1, today=May 30 → June 1
 * T-FIN-603-6: computeNextBillingDate — billing_day=15, today=May 10 → May 15 (same month)
 * T-FIN-603-7: API runBilling is called when "Rulează facturare" button is clicked
 * T-FIN-603-8: listSubscriptions API client returns items array
 */
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { SubscriptionTable } from "@/components/invoices/SubscriptionTable";
import { AddSubscriptionModal } from "@/components/invoices/AddSubscriptionModal";

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock("@/hooks/useSession", () => ({
  useSession: () => ({ status: "authenticated", data: { id: "u1", tenantId: "t1" } }),
}));

vi.mock("@/router/HashRouter", () => ({
  useRouter: () => ({ path: "/app/invoices", navigate: vi.fn() }),
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => (
    <a href={`#${to}`}>{children}</a>
  ),
}));

vi.mock("@/lib/api/invoices", () => ({
  listInvoices: vi.fn().mockResolvedValue({ items: [] }),
  listSubscriptions: vi.fn().mockResolvedValue({ items: [] }),
  createInvoice: vi.fn(),
  createSubscription: vi.fn(),
  getInvoicePdf: vi.fn(),
  updateInvoiceStatus: vi.fn(),
  updateSubscription: vi.fn(),
  runBilling: vi.fn().mockResolvedValue({ processed: 2, invoicesCreated: ["id1", "id2"] }),
}));

vi.mock("@/lib/api/students", () => ({
  listStudents: vi.fn().mockResolvedValue({ items: [] }),
}));

vi.mock("@/lib/api/payments", () => ({
  listPayments: vi.fn().mockResolvedValue({ items: [] }),
}));

vi.mock("@/components/app/AppShell", () => ({
  AppShell: ({
    children,
    pageTitle,
    actions,
  }: {
    children: React.ReactNode;
    pageTitle: string;
    actions?: React.ReactNode;
  }) => (
    <div>
      <h1>{pageTitle}</h1>
      {actions}
      {children}
    </div>
  ),
}));

// ─── Data fixtures ────────────────────────────────────────────────────────────

import type { Subscription } from "@/lib/api/invoices";
import type { Student } from "@/lib/api/students";

const mockSub: Subscription = {
  id: "sub-001",
  tenantId: "t1",
  studentId: "stu-001",
  amountCents: 28000,
  currency: "RON",
  billingDay: 1,
  description: "Curs engleza",
  status: "active",
  nextBillingDate: "2026-06-01",
  createdAt: "2026-05-01T10:00:00Z",
  studentName: "Ion Popescu",
};

const mockStudent: Student = {
  id: "stu-001",
  tenantId: "t1",
  fullName: "Ion Popescu",
  email: "ion@test.com",
  phone: null,
  parentPhone: null,
  parentEmail: null,
  birthDate: null,
  status: "active",
  notes: null,
  debtCents: 0,
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
};

// ─── Tests ────────────────────────────────────────────────────────────────────

import { InvoicesPage } from "@/pages/app/InvoicesPage";
import * as invoicesApi from "@/lib/api/invoices";

describe("FIN-603 — Recurring billing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(invoicesApi.listInvoices).mockResolvedValue({ items: [] });
    vi.mocked(invoicesApi.listSubscriptions).mockResolvedValue({ items: [] });
  });

  it("T-FIN-603-1: InvoicesPage renders both tabs without crash", async () => {
    render(<InvoicesPage />);
    // h1 title is rendered immediately
    expect(screen.getByRole("heading", { level: 1 })).toBeDefined();
    // Tab Abonamente is rendered in the tab bar
    await waitFor(() => {
      expect(screen.getAllByText("Abonamente").length).toBeGreaterThan(0);
    });
  });

  it("T-FIN-603-2: SubscriptionTable empty state", () => {
    render(<SubscriptionTable items={[]} onStatusChange={vi.fn()} />);
    expect(screen.getByText("Niciun abonament activ.")).toBeDefined();
  });

  it("T-FIN-603-3: SubscriptionTable renders subscription rows", () => {
    render(<SubscriptionTable items={[mockSub]} onStatusChange={vi.fn()} />);
    expect(screen.getByText("Ion Popescu")).toBeDefined();
    expect(screen.getByText("Curs engleza")).toBeDefined();
    expect(screen.getByText("Activ")).toBeDefined();
  });

  it("T-FIN-603-4: AddSubscriptionModal renders with student selector and billing day", () => {
    render(
      <AddSubscriptionModal
        students={[mockStudent]}
        onClose={vi.fn()}
        onSaved={vi.fn()}
        onError={vi.fn()}
      />
    );
    expect(screen.getByText("Abonament nou")).toBeDefined();
    expect(screen.getByLabelText("Zi facturare (1–28)")).toBeDefined();
    expect(screen.getByText("Ion Popescu")).toBeDefined();
  });

  it("T-FIN-603-7: Clicking 'Rulează facturare' calls runBilling API", async () => {
    render(<InvoicesPage />);
    // Switch to Abonamente tab
    await waitFor(() => screen.getByText("Abonamente"));
    fireEvent.click(screen.getByText("Abonamente"));
    await waitFor(() => screen.getByText("Rulează facturare"));
    fireEvent.click(screen.getByText("Rulează facturare"));
    await waitFor(() => {
      expect(invoicesApi.runBilling).toHaveBeenCalled();
    });
  });

  it("T-FIN-603-8: listSubscriptions API maps items correctly", async () => {
    vi.mocked(invoicesApi.listSubscriptions).mockResolvedValue({ items: [mockSub] });
    render(<InvoicesPage />);
    await waitFor(() => screen.getByText("Abonamente"));
    fireEvent.click(screen.getByText("Abonamente"));
    await waitFor(() => {
      expect(screen.getByText("Ion Popescu")).toBeDefined();
    });
  });
});

describe("FIN-603 — computeNextBillingDate logic (server-side parity)", () => {
  // Replicate the server logic inline for unit testing
  function computeNextBillingDate(billingDay: number, from: Date = new Date()): string {
    const day = Math.min(billingDay, 28);
    const year = from.getFullYear();
    const month = from.getMonth();
    const todayDay = from.getDate();

    let targetYear = year;
    let targetMonth = month;

    if (day < todayDay) {
      targetMonth = month + 1;
      if (targetMonth > 11) {
        targetMonth = 0;
        targetYear += 1;
      }
    }

    const mm = String(targetMonth + 1).padStart(2, "0");
    const dd = String(day).padStart(2, "0");
    return `${targetYear}-${mm}-${dd}`;
  }

  it("T-FIN-603-5: billing_day=1, today=May 30 → June 1", () => {
    const today = new Date(2026, 4, 30); // May 30
    const result = computeNextBillingDate(1, today);
    expect(result).toBe("2026-06-01");
  });

  it("T-FIN-603-6: billing_day=15, today=May 10 → May 15 (same month)", () => {
    const today = new Date(2026, 4, 10); // May 10
    const result = computeNextBillingDate(15, today);
    expect(result).toBe("2026-05-15");
  });

  it("T-FIN-603-5b: billing_day=28, today=Dec 31 → Jan 28 next year", () => {
    const today = new Date(2026, 11, 31); // Dec 31
    const result = computeNextBillingDate(28, today);
    expect(result).toBe("2027-01-28");
  });
});
