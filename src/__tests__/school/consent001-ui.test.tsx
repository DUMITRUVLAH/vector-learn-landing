/**
 * CONSENT-001 — T-CONSENT-001-8: SchoolConsentPage render test
 *
 * Smoke test: pagina se randează fără crash cu date mock.
 * Verifică că:
 * - componenta se randează fără crash
 * - tab-ul Șabloane este afișat implicit
 * - butonul Șablon nou este prezent
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";

// ─── Mock-uri ─────────────────────────────────────────────────────────────────

vi.mock("@/lib/api/consent", () => ({
  listConsentTemplates: vi.fn().mockResolvedValue({
    templates: [
      {
        id: "tmpl-1",
        tenantId: "tenant-1",
        title: "Acord foto/video",
        body: "Subsemnatul/a, sunt de acord cu utilizarea imaginii copilului meu.",
        category: "photo_video",
        isActive: true,
        createdAt: "2026-01-01T00:00:00Z",
        updatedAt: "2026-01-01T00:00:00Z",
      },
    ],
  }),
  listConsentRequests: vi.fn().mockResolvedValue({ requests: [] }),
  createConsentTemplate: vi.fn(),
  updateConsentTemplate: vi.fn(),
  deleteConsentTemplate: vi.fn(),
  createConsentRequests: vi.fn(),
  signConsentRequest: vi.fn(),
  declineConsentRequest: vi.fn(),
}));

vi.mock("@/lib/api/students", () => ({
  listStudents: vi.fn().mockResolvedValue({
    items: [
      {
        id: "s1",
        tenantId: "t1",
        fullName: "Maria Popescu",
        phone: null,
        email: null,
        parentPhone: null,
        parentEmail: null,
        birthDate: null,
        status: "active",
        notes: null,
        createdAt: "2026-01-01T00:00:00Z",
        updatedAt: "2026-01-01T00:00:00Z",
      },
    ],
    total: 1,
    limit: 100,
    offset: 0,
  }),
}));

vi.mock("@/lib/api/guardians", () => ({
  listGuardians: vi.fn().mockResolvedValue({ guardians: [] }),
}));

vi.mock("@/hooks/useSession", () => ({
  useSession: vi.fn().mockReturnValue({
    status: "authenticated",
    data: {
      user: { id: "u1", name: "Admin", role: "admin" },
      tenant: { id: "t1", name: "Demo School" },
    },
  }),
}));

vi.mock("@/router/HashRouter", () => ({
  useRouter: vi.fn().mockReturnValue({ navigate: vi.fn(), path: "/app/school/consent" }),
  Link: ({ to, children }: { to: string; children: React.ReactNode }) => (
    <a href={`#${to}`}>{children}</a>
  ),
}));

vi.mock("@/components/app/AppShell", () => ({
  AppShell: ({
    children,
    pageTitle,
  }: {
    children: React.ReactNode;
    pageTitle: string;
  }) => (
    <div>
      <h1>{pageTitle}</h1>
      {children}
    </div>
  ),
}));

vi.mock("@/components/app/NotificationBell", () => ({
  NotificationBell: () => null,
}));

// Import după mock-uri
import { SchoolConsentPage } from "../../pages/app/SchoolConsentPage";

describe("SchoolConsentPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("[blocant] T-CONSENT-001-8: se randează fără crash", () => {
    const { container } = render(<SchoolConsentPage />);
    expect(container).toBeTruthy();
  });

  it("[normal] afișează titlul paginii", () => {
    render(<SchoolConsentPage />);
    // "Consimțământ" apare în <h1> (AppShell mock) și în header-ul paginii
    expect(screen.getAllByText("Consimțământ").length).toBeGreaterThanOrEqual(1);
  });

  it("[normal] afișează tab-urile principale", () => {
    render(<SchoolConsentPage />);
    expect(screen.getByText("Șabloane")).toBeTruthy();
    expect(screen.getByText("Cereri")).toBeTruthy();
    expect(screen.getByText("Semnare (preview)")).toBeTruthy();
  });

  it("[normal] tab-ul Șabloane este activ implicit și afișează butonul Șablon nou", () => {
    render(<SchoolConsentPage />);
    expect(screen.getByRole("button", { name: /șablon nou/i })).toBeTruthy();
  });
});
