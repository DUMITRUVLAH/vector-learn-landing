/**
 * SCHOOL-002 — Test render UI pentru SchoolGradebookPage
 *
 * T-SCHOOL-002-6: pagina se randează fără crash cu date mock
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { SchoolGradebookPage } from "../../pages/app/SchoolGradebookPage";

// Mock hooks and API
vi.mock("@/hooks/useSession", () => ({
  useSession: () => ({ status: "authenticated", user: { id: "u1", tenantId: "t1" } }),
}));

vi.mock("@/router/HashRouter", () => ({
  useRouter: () => ({ navigate: vi.fn(), path: "/app/school/gradebook" }),
  HashRouter: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => <a href={`#${to}`}>{children}</a>,
}));

vi.mock("@/components/app/AppShell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <div data-testid="app-shell">{children}</div>,
}));

vi.mock("@/lib/api/school", () => ({
  listAcademicYears: vi.fn().mockResolvedValue({ years: [] }),
  listAcademicTerms: vi.fn().mockResolvedValue({ terms: [] }),
  listSchoolClasses: vi.fn().mockResolvedValue({ classes: [] }),
}));

vi.mock("@/lib/api/gradebook", () => ({
  listSubjects: vi.fn().mockResolvedValue([]),
  listGrades: vi.fn().mockResolvedValue([]),
  createGrade: vi.fn().mockResolvedValue({}),
}));

vi.mock("@/lib/api/students", () => ({
  listStudents: vi.fn().mockResolvedValue({ items: [] }),
}));

describe("[T-SCHOOL-002-6] SchoolGradebookPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders without crash and shows title", async () => {
    const { findByText } = render(<SchoolGradebookPage />);
    const title = await findByText("Catalog Note");
    expect(title).toBeTruthy();
  });

  it("renders selector labels", async () => {
    render(<SchoolGradebookPage />);
    // Selectors appear as labels
    await screen.findByText("Catalog Note");
    expect(document.querySelector("#year-select")).toBeTruthy();
    expect(document.querySelector("#term-select")).toBeTruthy();
    expect(document.querySelector("#class-select")).toBeTruthy();
  });

  it("shows empty state message when no class selected", async () => {
    const { findByText } = render(<SchoolGradebookPage />);
    const msg = await findByText(/Selectează un an, termen și clasă/i);
    expect(msg).toBeTruthy();
  });
});
