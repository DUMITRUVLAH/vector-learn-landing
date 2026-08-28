/**
 * Ecranul cererii PAR când accesul pică — trebuie să spună DE CE.
 *
 * Regresia (incident 2026-08-28): linkul din emailul „ready for payment" deschis într-o sesiune
 * logată în alt workspace afișa un banner cu textul `not_found`. Testul cere ca ecranul să arate
 * explicația și contul curent, și să NU mai arate codul brut.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { ApiError } from "@/lib/api";

const mockGetPar = vi.fn();
const mockGetParMe = vi.fn();

vi.mock("@/router/HashRouter", () => ({
  useRouter: () => ({ path: "/business/par/675c33af-b475-463f-9f4e-23becff5c694", navigate: vi.fn() }),
}));

vi.mock("@/components/app/AppShell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <div data-testid="app-shell">{children}</div>,
}));

vi.mock("@/lib/api/par", () => ({
  getPar: (...args: unknown[]) => mockGetPar(...args),
  getParMe: (...args: unknown[]) => mockGetParMe(...args),
  uploadAttachment: vi.fn(),
  approvePar: vi.fn(),
  rejectPar: vi.fn(),
  requestParChanges: vi.fn(),
  submitPar: vi.fn(),
  reapproveOverage: vi.fn(),
  duplicatePar: vi.fn(),
  reopenPar: vi.fn(),
  getPurchaseOrder: vi.fn(),
  issuePurchaseOrder: vi.fn(),
  downloadDosar: vi.fn(),
  formatMDL: (c: number) => `${c} MDL`,
  PAR_STATUS_LABELS: {},
}));

function denial(body: Record<string, unknown>) {
  return new ApiError(404, "not_found", undefined, [], { error: "not_found", ...body });
}

describe("ParDetailPage — mesajul de acces refuzat", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetParMe.mockResolvedValue({ roles: [], userId: "u1", tenantId: "t1" });
  });

  it("[blocant] link din alt workspace → explică situația și contul, nu «not_found»", async () => {
    mockGetPar.mockRejectedValue(
      denial({
        reason: "other_workspace_no_account",
        currentEmail: "vlah.business@gmail.com",
        currentWorkspace: "Vlah Dumitru",
      })
    );
    const { default: ParDetailPage } = await import("../ParDetail");
    render(<ParDetailPage />);

    const alert = await waitFor(() => screen.getByRole("alert"));
    expect(alert.textContent).toContain("alt workspace");
    expect(alert.textContent).toContain("vlah.business@gmail.com");
    expect(alert.textContent).toContain("Vlah Dumitru");
    expect(alert.textContent).not.toContain("not_found");
    // Remediul e „intră cu alt cont", deci linkul trebuie să existe.
    expect(screen.getByText("Intră cu alt cont").getAttribute("href")).toBe("#/business/login");
  });

  it("[normal] lipsă de drepturi în workspace-ul curent → explicație, fără link de re-autentificare", async () => {
    mockGetPar.mockRejectedValue(
      denial({ reason: "out_of_scope", currentEmail: "ana@atic.md", currentWorkspace: "ATIC" })
    );
    const { default: ParDetailPage } = await import("../ParDetail");
    render(<ParDetailPage />);

    const alert = await waitFor(() => screen.getByRole("alert"));
    expect(alert.textContent).toContain("proiect");
    expect(alert.textContent).toContain("ana@atic.md");
    expect(screen.queryByText("Intră cu alt cont")).toBeNull();
  });

  it("[normal] eroare fără motiv (server vechi / rețea) → mesajul vechi, fără crash", async () => {
    mockGetPar.mockRejectedValue(new Error("Failed to fetch"));
    const { default: ParDetailPage } = await import("../ParDetail");
    render(<ParDetailPage />);

    const alert = await waitFor(() => screen.getByRole("alert"));
    expect(alert.textContent).toContain("Failed to fetch");
  });
});
