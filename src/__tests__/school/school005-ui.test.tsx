/**
 * SCHOOL-005 — Test render UI pentru SchoolAdmissionsPage
 *
 * T-SCHOOL-005-5: pagina se randează fără crash cu date mock
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { SchoolAdmissionsPage } from "../../pages/app/SchoolAdmissionsPage";

vi.mock("@/hooks/useSession", () => ({
  useSession: () => ({ status: "authenticated", user: { id: "u1", tenantId: "t1" } }),
}));

vi.mock("@/router/HashRouter", () => ({
  useRouter: () => ({ navigate: vi.fn(), path: "/app/school/admissions" }),
  HashRouter: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => <a href={`#${to}`}>{children}</a>,
}));

vi.mock("@/components/app/AppShell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <div data-testid="app-shell">{children}</div>,
}));

vi.mock("@/lib/api/school", () => ({
  listAcademicYears: vi.fn().mockResolvedValue({ years: [] }),
}));

vi.mock("@/lib/api/admissions", () => ({
  listApplications: vi.fn().mockResolvedValue([]),
  createApplication: vi.fn().mockResolvedValue({}),
  updateApplication: vi.fn().mockResolvedValue({}),
  listDocuments: vi.fn().mockResolvedValue([]),
  addDocument: vi.fn().mockResolvedValue({}),
  updateDocument: vi.fn().mockResolvedValue({}),
  enrollApplication: vi.fn().mockResolvedValue({ studentId: "s1", enrollmentId: null }),
}));

describe("[T-SCHOOL-005-5] SchoolAdmissionsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders without crash and shows title", async () => {
    const { findByText } = render(<SchoolAdmissionsPage />);
    const title = await findByText("Admitere");
    expect(title).toBeTruthy();
  });

  it("renders year selector", async () => {
    render(<SchoolAdmissionsPage />);
    await screen.findByText("Admitere");
    expect(document.querySelector("#adm-year")).toBeTruthy();
  });

  it("shows empty state when no applications", async () => {
    const { findByText } = render(<SchoolAdmissionsPage />);
    const msg = await findByText(/Nicio aplicație de admitere/i);
    expect(msg).toBeTruthy();
  });
});
