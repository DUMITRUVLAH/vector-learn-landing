/**
 * BILL-005 — UI facturi B2B: FinInvoicesPage + FinInvoiceCreateModal
 *
 * T-BILL-005-1 [blocant] FinInvoicesPage randează fără crash (render smoke test)
 * T-BILL-005-2 [blocant] 4 carduri rezumat sunt prezente în DOM
 * T-BILL-005-3 [blocant] Tabelul are coloane: Nr., Partener, Sumă, Status
 * T-BILL-005-4 [blocant] Badge status "issued" are clasa de culoare albastru
 * T-BILL-005-5 [normal]  Buton "Factură nouă" există
 * T-BILL-005-6 [normal]  FinInvoiceCreateModal randează cu secțiunea linii dinamice
 * T-BILL-005-7 [normal]  Zero hardcoded hex în fișierele tsx
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";
import { readFileSync } from "fs";
import { join } from "path";

// ─── Mock dependencies that require network/DOM APIs ─────────────────────────

vi.mock("@/lib/api/finInvoices", () => ({
  listFinInvoices: vi.fn().mockResolvedValue({ data: [], total: 0 }),
  getFinInvoiceAging: vi.fn().mockResolvedValue({
    data: {
      buckets: {
        current: { count: 0, totalCents: 0 },
        overdue_0_30: { count: 0, totalCents: 0 },
        overdue_31_60: { count: 0, totalCents: 0 },
        overdue_60_plus: { count: 0, totalCents: 0 },
      },
      overdueInvoices: [],
    },
  }),
  createFinInvoice: vi.fn(),
  updateFinInvoice: vi.fn(),
  getFinInvoicePdfHtml: vi.fn(),
  formatFinMoney: vi.fn((cents: number, cur = "MDL") => `L ${Math.floor(cents / 100)}`),
}));

vi.mock("@/lib/finInvoicePdf", () => ({
  downloadFinInvoicePdf: vi.fn(),
  buildFinInvoiceHtml: vi.fn(() => "<html></html>"),
}));

vi.mock("@/components/app/AppShell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="app-shell">{children}</div>
  ),
}));

vi.mock("@/router/HashRouter", () => ({
  useRouter: () => ({ path: "/app/fin/invoices", navigate: vi.fn() }),
}));

vi.mock("@/hooks/useSession", () => ({
  useSession: () => ({
    session: { user: { tenantId: "tenant-1", role: "admin" } },
    loading: false,
  }),
}));

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("BILL-005 — UI facturi B2B", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  /**
   * T-BILL-005-1 [blocant]
   * FinInvoicesPage renders without crashing.
   */
  it("T-BILL-005-1: FinInvoicesPage renders without crash", async () => {
    const { FinInvoicesPage } = await import("../../pages/app/FinInvoicesPage");
    let container!: HTMLElement;
    await act(async () => {
      ({ container } = render(<FinInvoicesPage />));
    });
    expect(container).toBeTruthy();
    expect(container.firstChild).not.toBeNull();
  });

  /**
   * T-BILL-005-2 [blocant]
   * 4 summary cards (Total emis / Încasat / Restant / Facturi scadente) are rendered.
   */
  it("T-BILL-005-2: 4 summary cards present in DOM", async () => {
    const { FinInvoicesPage } = await import("../../pages/app/FinInvoicesPage");
    await act(async () => {
      render(<FinInvoicesPage />);
    });
    // Cards contain labels (rendered before data loads)
    expect(screen.getByText("Total emis")).toBeInTheDocument();
    expect(screen.getByText("Încasat")).toBeInTheDocument();
    expect(screen.getByText("Restant")).toBeInTheDocument();
    expect(screen.getByText(/Facturi scadente/)).toBeInTheDocument();
  });

  /**
   * T-BILL-005-3 [blocant]
   * Table header columns: Nr. factură, Partener, Sumă, Status.
   * The table is in the source even when empty (verified via source code).
   */
  it("T-BILL-005-3: table has required header columns in source", () => {
    const pageContent = readFileSync(
      join(process.cwd(), "src/pages/app/FinInvoicesPage.tsx"),
      "utf-8"
    );
    expect(pageContent).toContain("Nr. factură");
    expect(pageContent).toContain("Partener");
    expect(pageContent).toContain("Sumă");
    expect(pageContent).toContain("Status");
    // table element with aria-label
    expect(pageContent).toContain("aria-label");
    expect(pageContent).toContain("Tabel facturi B2B");
  });

  /**
   * T-BILL-005-4 [blocant]
   * Status badge "issued" has blue color class from design system.
   */
  it("T-BILL-005-4: STATUS_META issued badge has blue token class", () => {
    // Verify the page source uses the correct design-system class for 'issued'
    const pageContent = readFileSync(
      join(process.cwd(), "src/pages/app/FinInvoicesPage.tsx"),
      "utf-8"
    );
    // issued must use blue-100/blue-800 tokens (not hardcoded hex)
    expect(pageContent).toContain("bg-blue-100");
    expect(pageContent).toContain("text-blue-800");
    expect(pageContent).toContain("dark:bg-blue-900");
    expect(pageContent).toContain("dark:text-blue-200");
  });

  /**
   * T-BILL-005-5 [normal]
   * "Factură nouă" button exists in the page.
   */
  it("T-BILL-005-5: Factură nouă button is present", async () => {
    const { FinInvoicesPage } = await import("../../pages/app/FinInvoicesPage");
    await act(async () => {
      render(<FinInvoicesPage />);
    });
    expect(screen.getByText("Factură nouă")).toBeInTheDocument();
  });

  /**
   * T-BILL-005-6 [normal]
   * FinInvoiceCreateModal renders with dynamic line items section.
   */
  it("T-BILL-005-6: FinInvoiceCreateModal renders with line items UI", async () => {
    const { FinInvoiceCreateModal } = await import(
      "../../components/fin/FinInvoiceCreateModal"
    );
    const onClose = vi.fn();
    const onCreated = vi.fn();
    render(<FinInvoiceCreateModal onClose={onClose} onCreated={onCreated} />);

    // Modal title
    expect(screen.getByText("Factură B2B nouă")).toBeInTheDocument();
    // Line items section label
    expect(screen.getByText(/Linii factură/)).toBeInTheDocument();
    // Add line button
    expect(screen.getByText("Adaugă linie")).toBeInTheDocument();
    // Valută label
    expect(screen.getByLabelText("Valută")).toBeInTheDocument();
  });

  /**
   * T-BILL-005-7 [normal]
   * No hardcoded hex colors in the .tsx source files.
   */
  it("T-BILL-005-7: zero hardcoded hex in FinInvoicesPage.tsx and FinInvoiceCreateModal.tsx", () => {
    const pageContent = readFileSync(
      join(process.cwd(), "src/pages/app/FinInvoicesPage.tsx"),
      "utf-8"
    );
    const modalContent = readFileSync(
      join(process.cwd(), "src/components/fin/FinInvoiceCreateModal.tsx"),
      "utf-8"
    );

    // Regex: hex color codes (#xxx or #xxxxxx)
    const hexColorRegex = /#[0-9a-fA-F]{3,6}\b/g;
    const pageHexMatches = pageContent.match(hexColorRegex) ?? [];
    const modalHexMatches = modalContent.match(hexColorRegex) ?? [];

    expect(pageHexMatches).toHaveLength(0);
    expect(modalHexMatches).toHaveLength(0);
  });

  /**
   * Route registration check — /app/fin/invoices is in App.tsx.
   */
  it("Route /app/fin/invoices registered in App.tsx", () => {
    const appContent = readFileSync(
      join(process.cwd(), "src/App.tsx"),
      "utf-8"
    );
    expect(appContent).toContain("/app/fin/invoices");
    expect(appContent).toContain("FinInvoicesPage");
  });
});
