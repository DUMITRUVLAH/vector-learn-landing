/**
 * SCHOOL-004 — Test render UI pentru SchoolTuitionPage
 *
 * T-SCHOOL-004-6: pagina se randează fără crash cu date mock
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { SchoolTuitionPage } from "../../pages/app/SchoolTuitionPage";

vi.mock("@/hooks/useSession", () => ({
  useSession: () => ({ status: "authenticated", user: { id: "u1", tenantId: "t1" } }),
}));

vi.mock("@/router/HashRouter", () => ({
  useRouter: () => ({ navigate: vi.fn(), path: "/app/school/tuition" }),
  HashRouter: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => <a href={`#${to}`}>{children}</a>,
}));

vi.mock("@/components/app/AppShell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <div data-testid="app-shell">{children}</div>,
}));

vi.mock("@/lib/api/school", () => ({
  listAcademicYears: vi.fn().mockResolvedValue({ years: [] }),
}));

vi.mock("@/lib/api/tuition", () => ({
  listTuitionPlans: vi.fn().mockResolvedValue([]),
  createTuitionPlan: vi.fn().mockResolvedValue({}),
  listInstallments: vi.fn().mockResolvedValue([]),
  addInstallment: vi.fn().mockResolvedValue({}),
  listStudentTuitions: vi.fn().mockResolvedValue([]),
  assignStudentToPlan: vi.fn().mockResolvedValue({}),
  generateInvoicesForStudent: vi.fn().mockResolvedValue({ invoices: [], count: 0 }),
}));

vi.mock("@/lib/api/students", () => ({
  listStudents: vi.fn().mockResolvedValue({ items: [] }),
}));

describe("[T-SCHOOL-004-6] SchoolTuitionPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders without crash and shows title", async () => {
    const { findByText } = render(<SchoolTuitionPage />);
    const title = await findByText("Taxe școlare");
    expect(title).toBeTruthy();
  });

  it("renders year selector", async () => {
    render(<SchoolTuitionPage />);
    await screen.findByText("Taxe școlare");
    expect(document.querySelector("#tuition-year")).toBeTruthy();
  });

  it("shows empty state when no plans", async () => {
    const { findByText } = render(<SchoolTuitionPage />);
    const msg = await findByText(/Niciun plan de taxă definit/i);
    expect(msg).toBeTruthy();
  });
});
