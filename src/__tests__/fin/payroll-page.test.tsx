/**
 * PAY-002 — Smoke test pagina PayrollFINPage
 *
 * T-PAY-002-3 [blocant]: Given pagina /app/fin/payroll, When render, Then nu crash
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { PayrollFINPage } from "../../pages/fin/PayrollPage";

vi.mock("@/components/app/AppShell", () => ({
  AppShell: ({
    children,
    pageTitle,
  }: {
    children: React.ReactNode;
    pageTitle: string;
  }) => (
    <div data-testid="app-shell" data-title={pageTitle}>
      {children}
    </div>
  ),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe("PayrollFINPage — smoke", () => {
  // T-PAY-002-3 [blocant]
  it("se randează fără crash când API returnează runs vide", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ runs: [] }),
    } as Response);

    render(<PayrollFINPage />);

    // Titlul paginii trebuie afişat
    expect(screen.getByText("Salarizare")).toBeInTheDocument();

    // Aşteaptă finalizarea loading-ului
    await waitFor(() => {
      expect(
        screen.getByText(/Niciun rulaj de salarizare/i)
      ).toBeInTheDocument();
    });
  });

  it("afişează lista de rulaje când API returnează date", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        runs: [
          {
            id: "run-1",
            periodMonth: "2025-01",
            status: "draft",
            confirmedAt: null,
            paidAt: null,
            notes: null,
            totalGrossCents: 1_000_000,
            totalNetCents: 589_600,
            totalEmployerCostCents: 1_280_000,
            itemCount: 2,
            createdAt: new Date().toISOString(),
          },
        ],
      }),
    } as Response);

    render(<PayrollFINPage />);

    await waitFor(() => {
      expect(screen.getByText("2025-01")).toBeInTheDocument();
      // Status "Ciornă"
      expect(screen.getByText("Ciornă")).toBeInTheDocument();
    });
  });

  it("afişează eroarea când API returnează non-OK", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ error: "Neautorizat" }),
    } as unknown as Response);

    render(<PayrollFINPage />);

    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeInTheDocument();
    });
  });
});
