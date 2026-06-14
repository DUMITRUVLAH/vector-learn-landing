/**
 * FISC-004 — Smoke test UI TaxDashboardPage
 *
 * T-FISC-004-3 [blocant]: Given pagina /app/fin/tax/dashboard, When render, Then nu crash
 * T-FISC-004-5 [normal]:  Given upcoming_alerts cu days_until=5, When render, Then badge vizibil
 * T-FISC-004-6 [normal]:  Given dark mode, Then zero culori hex hardcodate (verificat în build)
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { TaxDashboardPage } from "../../pages/fin/TaxDashboardPage";

// Mock AppShell
vi.mock("@/components/app/AppShell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

const emptyDashboard = {
  upcoming_deadlines: [],
  upcoming_alerts: [],
  overdue_alerts: [],
  recent_filings: [],
  generated_at: new Date().toISOString(),
};

const alertsDashboard = {
  ...emptyDashboard,
  upcoming_alerts: [
    {
      declarationType: "tva12_md",
      periodId: "p1",
      periodLabel: "2025-01",
      deadline: "2025-02-25",
      daysUntil: 5,
      declarationId: null,
      declarationStatus: null,
      filedAt: null,
      isOverdue: false,
      isUrgent: true,
    },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("TaxDashboardPage — smoke", () => {
  // T-FISC-004-3 [blocant]
  it("se randează fără crash când API returnează dashboard gol", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => emptyDashboard,
    } as Response);

    render(<TaxDashboardPage />);

    // Titlul principal trebuie să fie vizibil
    expect(screen.getByText("Dashboard fiscal")).toBeInTheDocument();

    // Aşteaptă finalizarea loading-ului
    await waitFor(() => {
      expect(screen.queryByText("Se încarcă…")).not.toBeInTheDocument();
    });
  });

  // T-FISC-004-5 [normal]
  it("afişează badge-ul de alertă când isUrgent=true (days_until=5)", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => alertsDashboard,
    } as Response);

    render(<TaxDashboardPage />);

    await waitFor(() => {
      // Badge cu "5 zile"
      expect(screen.getByText("5 zile")).toBeInTheDocument();
    });

    // Secţiunea "De depus în curând" trebuie să apară
    expect(screen.getByText(/De depus în curând/i)).toBeInTheDocument();
  });

  it("afişează eroarea când API returnează non-OK", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ error: "Neautorizat" }),
    } as unknown as Response);

    render(<TaxDashboardPage />);

    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeInTheDocument();
      expect(screen.getByText(/Neautorizat/i)).toBeInTheDocument();
    });
  });

  it("afişează mesaj OK când nu sunt alerte", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => emptyDashboard,
    } as Response);

    render(<TaxDashboardPage />);

    await waitFor(() => {
      expect(
        screen.getByText(/Nicio alertă fiscală/i)
      ).toBeInTheDocument();
    });
  });
});
