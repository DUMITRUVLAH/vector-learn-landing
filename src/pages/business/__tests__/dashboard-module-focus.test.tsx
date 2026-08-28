/**
 * Tabloul de bord se potrivește cu modulele pe care le are workspace-ul.
 *
 * Bug raportat de owner: o organizație care are DOAR PAR vedea „Tablou de bord — FinDesk · PAR ·
 * ITPark", cu dale de cheltuieli, facturi și rezidenți IT Park — cifre din module la care n-are
 * acces. Testele cer randarea paginii și verifică ce vede omul, nu ce hook s-a chemat.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { useEnabledModules, type ModuleKey } from "@/hooks/useEnabledModules";
import { useParRoles } from "@/hooks/useParRoles";
import { getParInbox, getFinanceQueue, listParActivity } from "@/lib/api/par";
import { BusinessDashboardPage } from "@/pages/business/BusinessDashboardPage";

vi.mock("@/hooks/useParRoles");
vi.mock("@/hooks/useEnabledModules", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/hooks/useEnabledModules")>();
  return { ...actual, useEnabledModules: vi.fn() };
});
vi.mock("@/lib/api/par", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/par")>();
  return {
    ...actual,
    getParInbox: vi.fn(),
    getFinanceQueue: vi.fn(),
    listParActivity: vi.fn(),
  };
});
vi.mock("@/hooks/useBusinessDashboard", () => ({
  useBusinessDashboard: () => ({
    data: {
      findesk: { totalExpensesCents: 0, totalInvoicesCents: 0, netCents: 0 },
      par: { pendingCount: 4, pendingValueCents: 3_431_300 },
      itpark: { activeCount: 0, inProgressCount: 0 },
    },
    loading: false,
    error: null,
    refetch: vi.fn(),
  }),
}));
vi.mock("@/hooks/useBusinessSession", () => ({
  useBusinessSession: () => ({
    status: "authenticated",
    data: {
      user: { id: "u1", email: "violeta@atic.md", name: "Violeta Popescu", role: "teacher" },
      tenant: { id: "t1", name: "ATIC", slug: "atic", appKind: "business" },
    },
    error: null,
    logout: vi.fn(),
    refresh: vi.fn(),
  }),
}));
vi.mock("@/router/HashRouter", () => ({
  Link: ({ children, to, ...rest }: { children: React.ReactNode; to: string; [key: string]: unknown }) => (
    <a href={`#${to}`} {...rest}>{children}</a>
  ),
  useRouter: () => ({ path: "/business/dashboard", navigate: vi.fn() }),
}));
vi.mock("@/components/app/NotificationBell", () => ({ NotificationBell: () => null }));

const mockModules = vi.mocked(useEnabledModules);
const mockRoles = vi.mocked(useParRoles);
const mockInbox = vi.mocked(getParInbox);
const mockFinance = vi.mocked(getFinanceQueue);
const mockActivity = vi.mocked(listParActivity);

function setEnabled(keys: ModuleKey[]) {
  mockModules.mockReturnValue({
    enabled: keys,
    isEnabled: (key: ModuleKey) => keys.includes(key),
    status: "resolved",
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRoles.mockReturnValue({ status: "resolved", roles: ["approver", "par_admin"] });
  mockInbox.mockResolvedValue({
    total: 3,
    inbox: [
      {
        id: "par-1",
        requestNo: "PAR-2026-0007",
        payeeName: "Orange Moldova",
        requestedByName: "Ana Rusu",
        totalEstimatedCents: 120_000,
        currency: "MDL",
        my_step: 1,
        my_step_label: "Pasul 1 — Coordonator",
      } as never,
    ],
  });
  mockFinance.mockResolvedValue({ total: 1, items: [] } as never);
  mockActivity.mockResolvedValue({
    items: [
      {
        id: "c_1",
        kind: "comment",
        event: null,
        text: "Am atașat factura corectată.",
        createdAt: new Date().toISOString(),
        actorName: "Ion Barbu",
        parId: "par-1",
        requestNo: "PAR-2026-0007",
        payerName: "ATIC",
        projectName: "LED",
      },
    ],
  });
});

describe("workspace cu un singur modul (PAR)", () => {
  it("arată tabloul PAR: ce așteaptă decizia ta și cine a comentat", async () => {
    setEnabled(["par"]);
    render(<BusinessDashboardPage />);

    expect(await screen.findByText("Tablou de bord — cereri de plată")).toBeInTheDocument();
    expect(await screen.findByTestId("par-kpi-inbox")).toBeInTheDocument();
    expect(await screen.findByText(/PAR-2026-0007 · Orange Moldova/)).toBeInTheDocument();
    expect(await screen.findByText(/Cerut de Ana Rusu/)).toBeInTheDocument();
    expect(await screen.findByText(/a comentat la/)).toBeInTheDocument();
    expect(await screen.findByText(/Am atașat factura corectată/)).toBeInTheDocument();
  });

  it("nu mai arată nimic din FinDesk / ITPark", async () => {
    setEnabled(["par"]);
    render(<BusinessDashboardPage />);

    await screen.findByTestId("par-kpi-inbox");
    expect(screen.queryByText("Cheltuieli totale")).not.toBeInTheDocument();
    expect(screen.queryByText("Rezidenți ITPark activi")).not.toBeInTheDocument();
    expect(screen.queryByText("Facturi luna")).not.toBeInTheDocument();
    // Un singur modul → n-are rost un lansator „alege un modul".
    expect(screen.queryByText("Alege un modul")).not.toBeInTheDocument();
  });
});

describe("workspace cu mai multe module", () => {
  it("păstrează grila de widget-uri, dar ascunde widget-urile modulelor oprite", async () => {
    setEnabled(["par", "itpark"]);
    render(<BusinessDashboardPage />);

    expect(await screen.findByTestId("widget-grid")).toBeInTheDocument();
    expect(await screen.findByTestId("widget-card-itpark")).toBeInTheDocument();
    // FinDesk e oprit: nici widget-ul lui, nici cel de facturi (tot FinDesk) nu apar.
    await waitFor(() => {
      expect(screen.queryByText("Cheltuieli totale")).not.toBeInTheDocument();
    });
    expect(screen.queryByText("Facturi luna")).not.toBeInTheDocument();
    expect(screen.getByText("Alege un modul")).toBeInTheDocument();
  });
});
