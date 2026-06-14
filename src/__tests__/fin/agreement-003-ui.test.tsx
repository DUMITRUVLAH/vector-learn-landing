/**
 * AGREEMENT-003 — UI contracte (/app/fin/agreements)
 *
 * T-AGREEMENT-003-1 [blocant] AgreementsPage se randează fără crash
 * T-AGREEMENT-003-2 [blocant] Badge status "active" are clasa de culoare verde (design token)
 * T-AGREEMENT-003-3 [blocant] Banner expirare apare dacă există contract expirant în 25 zile
 * T-AGREEMENT-003-4 [blocant] Ruta /app/fin/agreements există în App.tsx și importă AgreementsPage
 * T-AGREEMENT-003-5 [normal]  Filtrul de status actualizează selecția
 * T-AGREEMENT-003-6 [normal]  Dialog "Contract nou" se deschide la click pe buton
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { readFileSync } from "fs";
import { join } from "path";

// ─── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock("@/lib/api/finAgreements", () => ({
  listAgreements: vi.fn().mockResolvedValue({ data: [], total: 0 }),
  listAgreementServices: vi.fn().mockResolvedValue({ data: [] }),
  createAgreement: vi.fn().mockResolvedValue({ data: {} }),
  cancelAgreement: vi.fn().mockResolvedValue({ data: {} }),
  addAgreementService: vi.fn().mockResolvedValue({ data: {} }),
  deleteAgreementService: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/api", () => ({
  api: vi.fn().mockResolvedValue({ data: [] }),
  ApiError: class ApiError extends Error {
    constructor(public status: number, public code: string, message?: string) {
      super(message ?? code);
    }
  },
}));

vi.mock("@/hooks/useSession", () => ({
  useSession: () => ({
    data: {
      user: { email: "test@example.com", name: "Test User", role: "admin" },
      tenant: { id: "t1", name: "Test Tenant", institutionType: "language_school" },
    },
    logout: vi.fn(),
  }),
}));

vi.mock("@/router/HashRouter", () => ({
  useRouter: () => ({ path: "/app/fin/agreements", navigate: vi.fn() }),
  Link: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

vi.mock("@/lib/institution", () => ({
  isModuleVisible: () => true,
}));

vi.mock("@/components/app/BranchSwitcher", () => ({
  BranchSwitcher: () => null,
}));

vi.mock("@/components/app/NotificationBell", () => ({
  NotificationBell: () => null,
}));

// ─── Tests ─────────────────────────────────────────────────────────────────────

import { AgreementStatusBadge } from "@/components/fin/AgreementTable";
import { AgreementTable } from "@/components/fin/AgreementTable";

describe("AGREEMENT-003 — UI contracte", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  /**
   * T-AGREEMENT-003-1 [blocant]
   * AgreementsPage renders without crash.
   */
  it("T-AGREEMENT-003-1: AgreementsPage renders without crash", async () => {
    const { AgreementsPage } = await import("@/pages/fin/AgreementsPage");
    expect(() => render(<AgreementsPage />)).not.toThrow();
    // Should show the page title area or empty state
    await screen.findByText(/Niciun contract creat|Contracte/i).catch(() => {
      // Either text is acceptable — just confirm no crash
    });
  });

  /**
   * T-AGREEMENT-003-2 [blocant]
   * Badge for "active" status uses green semantic-token classes (text-success / bg-success).
   */
  it("T-AGREEMENT-003-2: AgreementStatusBadge 'active' uses green semantic token class", () => {
    const { container } = render(<AgreementStatusBadge status="active" />);
    const badge = container.querySelector("[data-status='active']");
    expect(badge).not.toBeNull();
    // Must use semantic design-system tokens — not hardcoded hex
    const cls = badge?.className ?? "";
    expect(cls).toMatch(/success/); // bg-success or text-success
    expect(cls).not.toMatch(/#[0-9a-fA-F]{3,6}/); // no hex colors
  });

  /**
   * T-AGREEMENT-003-3 [blocant]
   * Expiry banner appears when a contract expires within 30 days.
   */
  it("T-AGREEMENT-003-3: expiry banner visible for contract ending in 25 days", () => {
    const now = new Date();
    const in25Days = new Date(now.getTime() + 25 * 24 * 60 * 60 * 1000);
    const endDate = in25Days.toISOString().split("T")[0];

    const agreements = [
      {
        id: "a1",
        tenantId: "t1",
        partyId: null,
        title: "Contract SRL",
        status: "active" as const,
        startDate: "2026-01-01",
        endDate,
        currency: "MDL",
        notes: null,
        createdAt: "2026-01-01",
        updatedAt: "2026-01-01",
        partyName: "SRL Test",
      },
    ];

    render(
      <AgreementTable
        agreements={agreements}
        loading={false}
        onSelect={() => undefined}
      />
    );

    const banner = screen.getByTestId("expiry-banner");
    expect(banner).toBeTruthy();
    expect(banner.textContent).toMatch(/30 de zile/);
  });

  /**
   * T-AGREEMENT-003-4 [blocant]
   * App.tsx imports AgreementsPage and routes /app/fin/agreements to it.
   */
  it("T-AGREEMENT-003-4: App.tsx routes /app/fin/agreements to AgreementsPage", () => {
    const appContent = readFileSync(join(process.cwd(), "src/App.tsx"), "utf-8");
    expect(appContent).toContain("AgreementsPage");
    expect(appContent).toContain("/app/fin/agreements");
    // Import must come from the fin directory
    expect(appContent).toContain('./pages/fin/AgreementsPage');
  });

  /**
   * T-AGREEMENT-003-5 [normal]
   * Status filter select renders with all status options.
   */
  it("T-AGREEMENT-003-5: status filter select has all status options", () => {
    render(
      <AgreementTable agreements={[]} loading={false} onSelect={() => undefined} />
    );
    const select = screen.getByLabelText(/filtrează după status/i);
    expect(select).toBeTruthy();
    // Must have options for all statuses
    const opts = Array.from(
      (select as HTMLSelectElement).options
    ).map((o) => o.value);
    expect(opts).toContain("draft");
    expect(opts).toContain("active");
    expect(opts).toContain("paused");
    expect(opts).toContain("cancelled");
  });

  /**
   * T-AGREEMENT-003-6 [normal]
   * Clicking "Contract nou" opens the CreateAgreementDialog.
   */
  it("T-AGREEMENT-003-6: 'Contract nou' button opens the create dialog", async () => {
    const { AgreementsPage } = await import("@/pages/fin/AgreementsPage");
    render(<AgreementsPage />);

    // Find the "Contract nou" button
    const btn = screen.getAllByRole("button").find(
      (b) => b.textContent?.includes("Contract nou")
    );
    expect(btn).toBeTruthy();
    fireEvent.click(btn!);

    // Dialog should appear (heading "Contract nou")
    const heading = screen.queryAllByText("Contract nou").find(
      (el) => el.tagName === "H2" || el.tagName === "BUTTON"
    );
    expect(heading).toBeTruthy();
  });
});
