/**
 * GAP-006: Students page — lesson package badge smoke test
 *
 * T-GAP-006-badge-1 [blocant] Page renders without crash when packages exist
 * T-GAP-006-badge-2 [normal]  Badge shows correct unit count
 * T-GAP-006-badge-3 [normal]  Low-balance badge uses warning color token
 */
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

vi.mock("@/hooks/useSession", () => ({
  useSession: () => ({ status: "authenticated", data: { id: "u1", tenantId: "t1" } }),
}));

vi.mock("@/router/HashRouter", () => ({
  useRouter: () => ({ path: "/app/students", navigate: vi.fn() }),
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => <a href={`#${to}`}>{children}</a>,
}));

vi.mock("@/lib/api/students", () => ({
  listStudents: vi.fn().mockResolvedValue({
    items: [
      {
        id: "s1",
        fullName: "Ana Pop",
        email: "ana@test.com",
        phone: "0701234567",
        parentEmail: null,
        parentPhone: null,
        status: "active",
        debtCents: 0,
        familyId: null,
        createdAt: "2026-06-01T00:00:00Z",
        updatedAt: "2026-06-01T00:00:00Z",
      },
      {
        id: "s2",
        fullName: "Mihai Ion",
        email: "mihai@test.com",
        phone: "0707654321",
        parentEmail: null,
        parentPhone: null,
        status: "active",
        debtCents: 0,
        familyId: null,
        createdAt: "2026-06-01T00:00:00Z",
        updatedAt: "2026-06-01T00:00:00Z",
      },
    ],
    total: 2,
  }),
  archiveStudent: vi.fn(),
}));

vi.mock("@/lib/api/feedback", () => ({
  listFeedbackForms: vi.fn().mockResolvedValue({ forms: [] }),
  sendFeedbackToStudent: vi.fn(),
}));

vi.mock("@/lib/api/lessonPackages", () => ({
  listLessonPackages: vi.fn().mockResolvedValue({
    items: [
      {
        id: "pkg-1",
        tenantId: "t1",
        studentId: "s1",
        courseId: "c1",
        invoiceId: null,
        unitsTotal: 10,
        unitsRemaining: 7,
        autoRenew: false,
        recoveryIncludedInPackage: true,
        validFrom: "2026-06-01",
        validUntil: null,
        status: "active",
        createdAt: "2026-06-01T00:00:00Z",
        updatedAt: "2026-06-01T00:00:00Z",
      },
      {
        id: "pkg-2",
        tenantId: "t1",
        studentId: "s2",
        courseId: "c1",
        invoiceId: null,
        unitsTotal: 10,
        unitsRemaining: 1,
        autoRenew: false,
        recoveryIncludedInPackage: true,
        validFrom: "2026-06-01",
        validUntil: null,
        status: "active",
        createdAt: "2026-06-01T00:00:00Z",
        updatedAt: "2026-06-01T00:00:00Z",
      },
    ],
  }),
}));

vi.mock("@/components/app/AppShell", () => ({
  AppShell: ({ children, pageTitle, actions }: { children: React.ReactNode; pageTitle: string; actions?: React.ReactNode }) => (
    <div>
      <h1>{pageTitle}</h1>
      {actions}
      {children}
    </div>
  ),
}));

vi.mock("@/components/app/StudentForm", () => ({
  StudentForm: () => <form data-testid="student-form" />,
}));

import { StudentsPage } from "@/pages/app/StudentsPage";

describe("T-GAP-006: StudentsPage package badge", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("T-GAP-006-badge-1 [blocant] renders without crash when packages exist", async () => {
    const { container } = render(<StudentsPage />);

    await waitFor(() => {
      expect(screen.getByText("Ana Pop")).toBeInTheDocument();
    });

    expect(container.querySelector("h1")).toHaveTextContent("Elevi");
  });

  it("T-GAP-006-badge-2 [normal] badge displays correct remaining unit count", async () => {
    render(<StudentsPage />);

    await waitFor(() => {
      expect(screen.getByText(/7 lecții/)).toBeInTheDocument();
    });
  });

  it("T-GAP-006-badge-3 [normal] low-balance badge (unitsRemaining ≤ 2) uses warning color token", async () => {
    render(<StudentsPage />);

    await waitFor(() => {
      const badge = screen.getByText(/1 lecții/);
      // Check warning token via class
      expect(badge.closest("span")).toHaveClass("text-warning");
    });
  });
});
