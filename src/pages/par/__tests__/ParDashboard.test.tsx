/**
 * PAR-106: Dashboard + list /app/par
 * Tests: T-PAR-106-1, T-PAR-106-2, T-PAR-106-3
 *
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { ParDashboard } from "../ParDashboard";
import * as parApi from "@/lib/api/par";
import type { ParRequest } from "@/lib/api/par";

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock("@/router/HashRouter", () => ({
  useRouter: () => ({
    path: "/app/par",
    navigate: vi.fn(),
  }),
}));

vi.mock("@/components/app/AppShell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="app-shell">{children}</div>
  ),
}));

const makeRequest = (overrides: Partial<ParRequest & { above_micro_threshold: boolean }> = {}) => ({
  id: `par-${Math.random().toString(36).slice(2)}`,
  tenantId: "tenant-1",
  requestNo: "PAR-2026-0001",
  dateOfRequest: new Date().toISOString(),
  requestedByUserId: "user-1",
  requestorTitle: null,
  departmentId: null,
  dateNeeded: null,
  projectId: null,
  budgetCodeId: null,
  budgetCodeNote: null,
  purpose: "execute_payment" as const,
  chargeTo: "program" as const,
  chargeBillingCode: null,
  endUse: null,
  vendorId: null,
  payeeName: null,
  payeeIdnp: null,
  payeeIban: null,
  payeeBank: null,
  attachmentsPresent: false,
  attachmentsNote: null,
  currency: "MDL",
  totalEstimatedCents: 700000,
  above_micro_threshold: false,
  status: "draft" as const,
  submittedAt: null,
  approvedAt: null,
  paidAt: null,
  cancelledAt: null,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  ...overrides,
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("PAR-106: ParDashboard render without crash (T-PAR-106-1)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(parApi, "listPar").mockResolvedValue({
      requests: [
        makeRequest({ requestNo: "PAR-2026-0001", status: "draft" }),
        makeRequest({ requestNo: "PAR-2026-0002", status: "pending_approval", id: "par-2" }),
        makeRequest({ requestNo: "PAR-2026-0003", status: "paid", totalEstimatedCents: 1400000, id: "par-3" }),
      ],
      total: 3,
    });
  });

  it("T-PAR-106-1 [blocant] renders without crash", () => {
    const { container } = render(<ParDashboard />);
    expect(container).toBeTruthy();
  });

  it("T-PAR-106-1 [blocant] shows the page heading", () => {
    render(<ParDashboard />);
    expect(screen.getByText("Cereri de plată (PAR)")).toBeInTheDocument();
  });

  it("T-PAR-106-1 [blocant] shows New request button", () => {
    render(<ParDashboard />);
    expect(screen.getByRole("button", { name: /Cerere PAR nouă|Cerere nouă/ })).toBeInTheDocument();
  });

  it("T-PAR-106-1 [blocant] shows Cererile mele section", async () => {
    render(<ParDashboard />);
    // Wait for data to load
    await screen.findByText("Cererile mele");
    expect(screen.getByText("Cererile mele")).toBeInTheDocument();
  });

  it("T-PAR-106-1 [blocant] renders status chips after loading", async () => {
    render(<ParDashboard />);
    // Wait for data to load then check for status chip (via aria-label)
    await screen.findByText("Cererile mele");
    const chip = document.querySelector('[aria-label^="Status:"]');
    expect(chip).toBeTruthy();
  });
});

describe("PAR-106: Status filter (T-PAR-106-2)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(parApi, "listPar").mockImplementation(async (filters) => {
      if (filters.status === "draft") {
        return {
          requests: [makeRequest({ status: "draft", requestNo: "PAR-2026-0001" })],
          total: 1,
        };
      }
      return {
        requests: [
          makeRequest({ status: "draft", requestNo: "PAR-2026-0001" }),
          makeRequest({ status: "pending_approval", requestNo: "PAR-2026-0002", id: "par-2" }),
        ],
        total: 2,
      };
    });
  });

  it("T-PAR-106-2 [normal] status filter select is rendered", () => {
    render(<ParDashboard />);
    const select = screen.getByRole("combobox", { name: /Filtrează după status/ });
    expect(select).toBeInTheDocument();
  });

  it("T-PAR-106-2 [normal] purpose filter select is rendered", () => {
    render(<ParDashboard />);
    const select = screen.getByRole("combobox", { name: /Filtrează după scop/ });
    expect(select).toBeInTheDocument();
  });

  it("T-PAR-106-2 [normal] search input is rendered with correct label", () => {
    render(<ParDashboard />);
    const search = screen.getByRole("searchbox", { name: /Caută cereri PAR/ });
    expect(search).toBeInTheDocument();
  });
});

describe("PAR-106: Role-aware sections (T-PAR-106-3)", () => {
  it("T-PAR-106-3 [normal] shows Pending my approval section when approvals exist", async () => {
    vi.spyOn(parApi, "listPar").mockResolvedValue({
      requests: [
        makeRequest({ status: "pending_approval", requestNo: "PAR-2026-0001" }),
      ],
      total: 1,
    });
    render(<ParDashboard />);
    await screen.findByText("În așteptarea aprobării mele");
    expect(screen.getByText("În așteptarea aprobării mele")).toBeInTheDocument();
  });

  it("T-PAR-106-3 [normal] shows finance section when in_finance PAR exists", async () => {
    vi.spyOn(parApi, "listPar").mockResolvedValue({
      requests: [
        makeRequest({ status: "in_finance", requestNo: "PAR-2026-0005" }),
      ],
      total: 1,
    });
    render(<ParDashboard />);
    await screen.findByText("La finanțe — în așteptarea plății");
    expect(screen.getByText("La finanțe — în așteptarea plății")).toBeInTheDocument();
  });

  it("T-PAR-106-3 [normal] summary cards show correct labels", () => {
    vi.spyOn(parApi, "listPar").mockResolvedValue({ requests: [], total: 0 });
    render(<ParDashboard />);
    expect(screen.getByText("Total cereri")).toBeInTheDocument();
    expect(screen.getByText("Activ (estimat)")).toBeInTheDocument();
    expect(screen.getByText("Total plătit")).toBeInTheDocument();
  });
});

describe("PAR-106: A11y (no hardcoded hex)", () => {
  it("T-PAR-106-1 [blocant] no hardcoded hex colors in component source", async () => {
    const { readFileSync } = await import("fs");
    const { resolve } = await import("path");
    const content = readFileSync(
      resolve(process.cwd(), "src/pages/par/ParDashboard.tsx"),
      "utf-8"
    );
    const inCode = (content.match(/className="[^"]*#[0-9A-Fa-f]{6}[^"]*"/g) ?? []).concat(
      content.match(/style=\{[^}]*#[0-9A-Fa-f]{6}[^}]*\}/g) ?? []
    );
    expect(inCode.length).toBe(0);
  });

  it("T-PAR-106-1 [blocant] ParStatusChip uses semantic token classes", async () => {
    const { readFileSync } = await import("fs");
    const { resolve } = await import("path");
    const content = readFileSync(
      resolve(process.cwd(), "src/components/par/ParStatusChip.tsx"),
      "utf-8"
    );
    expect(content).not.toMatch(/className="[^"]*#[0-9A-Fa-f]{6}[^"]*"/);
  });
});
