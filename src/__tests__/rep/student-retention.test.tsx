/**
 * REP-303 — Student LTV + retention table
 *
 * T-REP-303-1: GET /api/analytics/student-ltv → 200
 * T-REP-303-2: Tabel sort pe LTV desc
 * T-REP-303-3: Search filtrează după nume
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import type { StudentLtv } from "@/lib/api/analytics";

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock("@/router/HashRouter", () => ({
  useRouter: () => ({ navigate: vi.fn(), path: "/app/analytics/students" }),
  Link: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
}));

vi.mock("@/hooks/useSession", () => ({
  useSession: () => ({
    status: "authenticated",
    data: { user: { name: "Admin", role: "owner" }, tenant: { name: "Test" } },
  }),
}));

vi.mock("@/lib/api/analytics", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/api/analytics")>();
  return { ...original, getStudentLtv: vi.fn() };
});

import * as analyticsApi from "@/lib/api/analytics";
import { StudentRetentionPage } from "@/pages/app/StudentRetentionPage";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const makeStudents = (): StudentLtv[] => [
  { studentId: "s1", fullName: "Maria Popescu", status: "active", ltvCents: 50000, paymentCount: 5, lessonsAttended: 20, lastLessonAt: "2026-05-01T00:00:00Z" },
  { studentId: "s2", fullName: "Ion Ionescu", status: "active", ltvCents: 30000, paymentCount: 3, lessonsAttended: 12, lastLessonAt: "2026-04-15T00:00:00Z" },
  { studentId: "s3", fullName: "Ana Vlad", status: "trial", ltvCents: 0, paymentCount: 0, lessonsAttended: 2, lastLessonAt: null },
];

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("REP-303 — StudentRetentionPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(analyticsApi.getStudentLtv).mockResolvedValue({ items: makeStudents() });
  });

  /**
   * T-REP-303-1: tabel afișat cu date
   */
  it("T-REP-303-1: afișează tabelul cu elevi", async () => {
    render(<StudentRetentionPage />);
    await waitFor(() => {
      expect(screen.getByTestId("student-ltv-table")).toBeInTheDocument();
    });
    expect(screen.getByText("Maria Popescu")).toBeInTheDocument();
    expect(screen.getByText("Ion Ionescu")).toBeInTheDocument();
  });

  /**
   * T-REP-303-2: sort LTV desc implicit
   */
  it("T-REP-303-2: sortare LTV desc implicit — Maria (50k) înainte de Ion (30k)", async () => {
    render(<StudentRetentionPage />);
    await waitFor(() => {
      expect(screen.getByTestId("student-ltv-table")).toBeInTheDocument();
    });
    const rows = screen.getAllByRole("row");
    // Row index 0 = header, row 1 = first data row
    expect(rows[1].textContent).toContain("Maria Popescu");
    expect(rows[2].textContent).toContain("Ion Ionescu");
  });

  /**
   * T-REP-303-3: search filtrează după nume
   */
  it("T-REP-303-3: search 'Ana' afișează doar Ana Vlad", async () => {
    render(<StudentRetentionPage />);
    await waitFor(() => {
      expect(screen.getByTestId("student-ltv-table")).toBeInTheDocument();
    });

    const searchInput = screen.getByLabelText("Caută elev");
    fireEvent.change(searchInput, { target: { value: "Ana" } });

    expect(screen.getByText("Ana Vlad")).toBeInTheDocument();
    expect(screen.queryByText("Maria Popescu")).not.toBeInTheDocument();
    expect(screen.queryByText("Ion Ionescu")).not.toBeInTheDocument();
  });

  it("afișează heading-ul paginii", async () => {
    render(<StudentRetentionPage />);
    await waitFor(() => {
      expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(/LTV/i);
    });
  });
});

describe("REP-303 — getStudentLtv API shape", () => {
  it("T-REP-303-1: getStudentLtv returnează items cu câmpurile corecte", async () => {
    vi.mocked(analyticsApi.getStudentLtv).mockResolvedValue({
      items: [{ studentId: "s1", fullName: "Maria", status: "active", ltvCents: 10000, paymentCount: 1, lessonsAttended: 5, lastLessonAt: null }],
    });
    const result = await analyticsApi.getStudentLtv(10);
    expect(result.items[0]).toHaveProperty("studentId");
    expect(result.items[0]).toHaveProperty("ltvCents");
    expect(result.items[0]).toHaveProperty("lessonsAttended");
  });
});
