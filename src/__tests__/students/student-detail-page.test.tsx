/**
 * STU-201 — StudentDetailPage UI tests
 *
 * Covers:
 *   T-STU-201-5: Render tab "Plăți" with mock payments → table visible
 *   T-STU-201-6: Render with no payments → empty state visible
 *   T-STU-201-7: Student with leadId → origin badge visible
 *   T-STU-201-8: Render without crash (smoke test)
 */
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock("@/hooks/useSession", () => ({
  useSession: () => ({ status: "authenticated", data: { id: "u1", tenantId: "t1" } }),
}));

vi.mock("@/router/HashRouter", () => ({
  useRouter: () => ({ path: "/app/students/stu-001", navigate: vi.fn() }),
}));

vi.mock("@/components/app/AppShell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <div data-testid="app-shell">{children}</div>,
}));

const mockStudent = {
  id: "stu-001",
  tenantId: "t1",
  fullName: "Maria Popescu",
  phone: "+40700000001",
  email: "maria@test.com",
  parentPhone: "+40700000002",
  parentEmail: "mama@test.com",
  birthDate: "2010-05-15",
  status: "active" as const,
  notes: "Notă test",
  debtCents: 0,
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
};

const mockPayments = [
  {
    id: "pay-001",
    amountCents: 5000,
    currency: "RON",
    status: "paid" as const,
    dueDate: null,
    paidAt: "2026-06-01T10:00:00Z",
    description: "Taxă curs",
    createdAt: "2026-05-30T00:00:00Z",
  },
  {
    id: "pay-002",
    amountCents: 3000,
    currency: "RON",
    status: "pending" as const,
    dueDate: "2026-07-01T00:00:00Z",
    paidAt: null,
    description: null,
    createdAt: "2026-05-31T00:00:00Z",
  },
];

vi.mock("@/lib/api/students", () => ({
  getStudent: vi.fn(),
  getStudentPayments: vi.fn(),
  getStudentLessons: vi.fn(),
  getStudentOriginLead: vi.fn(),
  updateStudent: vi.fn(),
}));

import * as studentsApi from "@/lib/api/students";
import { StudentDetailPage } from "@/pages/app/StudentDetailPage";

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("STU-201 — StudentDetailPage", () => {
  beforeEach(() => {
    vi.mocked(studentsApi.getStudent).mockResolvedValue(mockStudent);
    vi.mocked(studentsApi.getStudentPayments).mockResolvedValue({
      items: [],
      totalPaidCents: 0,
    });
    vi.mocked(studentsApi.getStudentLessons).mockResolvedValue({ items: [] });
    vi.mocked(studentsApi.getStudentOriginLead).mockResolvedValue({ lead: null });
    vi.mocked(studentsApi.updateStudent).mockResolvedValue(mockStudent);
  });

  it("T-STU-201-8: Renders without crash — student name visible (multiple instances ok)", async () => {
    render(<StudentDetailPage studentId="stu-001" />);
    // Use getAllByText because name appears in both h1 and page heading
    await waitFor(() => {
      const elements = screen.getAllByText("Maria Popescu");
      expect(elements.length).toBeGreaterThan(0);
    });
  });

  it("T-STU-201-5: Payments tab with 2 payments → table with payment statuses", async () => {
    vi.mocked(studentsApi.getStudentPayments).mockResolvedValue({
      items: mockPayments,
      totalPaidCents: 5000,
    });
    render(<StudentDetailPage studentId="stu-001" />);
    await waitFor(() => {
      const elements = screen.getAllByText("Maria Popescu");
      expect(elements.length).toBeGreaterThan(0);
    });

    const paymentsTab = screen.getByRole("tab", { name: /plăți/i });
    fireEvent.click(paymentsTab);

    await waitFor(() => {
      // Should show payment statuses
      expect(screen.getByText("Plătit")).toBeTruthy();
      expect(screen.getByText("În așteptare")).toBeTruthy();
    });
  });

  it("T-STU-201-6: Payments tab with no payments → empty state", async () => {
    vi.mocked(studentsApi.getStudentPayments).mockResolvedValue({
      items: [],
      totalPaidCents: 0,
    });
    render(<StudentDetailPage studentId="stu-001" />);
    await waitFor(() => {
      const elements = screen.getAllByText("Maria Popescu");
      expect(elements.length).toBeGreaterThan(0);
    });

    const paymentsTab = screen.getByRole("tab", { name: /plăți/i });
    fireEvent.click(paymentsTab);

    await waitFor(() => {
      expect(screen.getByText("Nicio plată înregistrată.")).toBeTruthy();
    });
  });

  it("T-STU-201-7: Origin lead badge visible when lead exists", async () => {
    vi.mocked(studentsApi.getStudentOriginLead).mockResolvedValue({
      lead: { id: "lead-001", fullName: "Ion Popescu", phone: "+40700000001", email: null },
    });
    render(<StudentDetailPage studentId="stu-001" />);
    await waitFor(() => {
      expect(screen.getByText("Lead origine")).toBeTruthy();
    });
  });

  it("T-STU-201-7b: No origin lead badge when lead is null", async () => {
    vi.mocked(studentsApi.getStudentOriginLead).mockResolvedValue({ lead: null });
    render(<StudentDetailPage studentId="stu-001" />);
    await waitFor(() => {
      const elements = screen.getAllByText("Maria Popescu");
      expect(elements.length).toBeGreaterThan(0);
    });
    // Badge should NOT be present
    expect(screen.queryByText("Lead origine")).toBeNull();
  });

  it("T-STU-201-8c: Contact tab shows parent email as link", async () => {
    render(<StudentDetailPage studentId="stu-001" />);
    await waitFor(() => {
      const elements = screen.getAllByText("Maria Popescu");
      expect(elements.length).toBeGreaterThan(0);
    });
    expect(screen.getByRole("link", { name: /mama@test\.com/i })).toBeTruthy();
  });
});
