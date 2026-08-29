/**
 * Clasamentul din rapoarte se poate DESCHIDE.
 *
 * Owner: „vizual nu arată bine, iar dacă apeși pe vreun furnizor ar fi bine să se deschidă tot
 * cartonașul, toate plățile către acesta." Testele cer exact acțiunea: rândurile sunt butoane cu
 * nume citibil (nu etichete rotite pe o axă), clicul chiar cheamă drill-down-ul pentru acel
 * furnizor, iar panoul arată cererile lui — nu doar că se deschide ceva.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ParReports } from "@/pages/par/ParReports";
import * as parApi from "@/lib/api/par";

vi.mock("@/components/app/AppShell", () => ({
  AppShell: ({ children, actions }: { children: React.ReactNode; actions?: React.ReactNode }) => (
    <div>{actions}{children}</div>
  ),
}));
vi.mock("@/router/HashRouter", () => ({
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => <a href={`#${to}`}>{children}</a>,
  useRouter: () => ({ path: "/business/par/reports", navigate: vi.fn() }),
}));
vi.mock("@/hooks/useBusinessSession", () => ({
  useBusinessSession: () => ({ status: "authenticated", data: { tenant: { name: "ATIC" }, user: { id: "u1" } } }),
}));
vi.mock("@/lib/api/par", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/par")>();
  return {
    ...actual,
    getParReportByPayer: vi.fn(), getParReportByBudget: vi.fn(), getParReportByDepartment: vi.fn(),
    getParReportByProject: vi.fn(), getParReportByVendor: vi.fn(), getParReportByEvent: vi.fn(),
    getParReportByChargeTo: vi.fn(), getParReportCurrencyBreakdown: vi.fn(),
    getParReportAging: vi.fn(), getParReportCycleTime: vi.fn(), getParReportBreakdown: vi.fn(),
    getParReportUrgent: vi.fn(),
    listPayers: vi.fn(), listProjects: vi.fn(), listDepartments: vi.fn(),
  };
});

const api = vi.mocked(parApi);

const VENDORS = [
  { id: "Explor Tur SRL", label: "Explor Tur SRL", totalCents: 2_400_000, paidCents: 1_000_000, count: 4 },
  { id: "Agenția de Stat pentru Proprietatea Intelectuală", label: "Agenția de Stat pentru Proprietatea Intelectuală", totalCents: 900_000, paidCents: 0, count: 2 },
];

// Node 26 expune un `localStorage` global gol care umbrește jsdom-ul; stub-ul ține testul
// independent de cum e pornit runner-ul (aceeași capcană ca la reportConfig).
const store = new Map<string, string>();
beforeEach(() => {
  vi.clearAllMocks();
  store.clear();
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => { store.set(k, String(v)); },
    removeItem: (k: string) => { store.delete(k); },
    clear: () => store.clear(),
  });
  for (const fn of [api.getParReportByPayer, api.getParReportByBudget, api.getParReportByDepartment,
    api.getParReportByProject, api.getParReportByEvent, api.getParReportByChargeTo]) {
    (fn as ReturnType<typeof vi.fn>).mockResolvedValue({ items: [] });
  }
  api.getParReportByVendor.mockResolvedValue({ items: VENDORS });
  api.getParReportCurrencyBreakdown.mockResolvedValue({ byCurrency: [], totalMdlCents: 3_300_000 });
  // Raportul încarcă toate dimensiunile într-un singur Promise.all: dacă UNA nu e simulată,
  // întregul bloc cade în catch și ecranul rămâne gol — testul ar acuza clasamentul degeaba.
  api.getParReportUrgent.mockResolvedValue({ urgent: { totalUrgent: 0, byRequester: [], byReason: [] } });
  api.getParReportAging.mockResolvedValue({ items: [] });
  api.getParReportCycleTime.mockResolvedValue({ count: 0, avgSubmitToApprovedDays: null, avgSubmitToPaidDays: null });
  api.listPayers.mockResolvedValue({ items: [] });
  api.listProjects.mockResolvedValue({ items: [] });
  api.listDepartments.mockResolvedValue({ items: [] });
  api.getParReportBreakdown.mockResolvedValue({
    items: [
      {
        id: "par-1", requestNo: "PAR-2026-0007", dateOfRequest: "2026-05-04T00:00:00.000Z", status: "paid",
        purpose: "execute_payment", payeeName: "Explor Tur SRL", currency: "MDL",
        nativeTotalCents: 1_000_000, estimatedCents: 1_000_000, paidCents: 1_000_000,
        paymentDate: "2026-05-20T00:00:00.000Z", paymentRef: "OP-118", projectName: "LED",
        payerName: "ATIC", requestorName: "Ana Rusu",
      },
    ],
    totals: { count: 1, estimatedCents: 1_000_000, paidCents: 1_000_000 },
  });
});

async function openVendorTab() {
  render(<ParReports />);
  await waitFor(() => expect(api.getParReportByVendor).toHaveBeenCalled());
  fireEvent.click(screen.getByRole("tab", { name: "Beneficiar" }));
}

describe("clasamentul pe beneficiar", () => {
  it("[blocant] scrie numele întreg al furnizorului, nu îl rotește pe o axă", async () => {
    await openVendorTab();
    const row = await screen.findByRole("button", { name: /Agenția de Stat pentru Proprietatea Intelectuală/ });
    expect(row).toBeInTheDocument();
    // și spune din câte cereri e format rândul
    expect(row.getAttribute("aria-label")).toMatch(/2 cereri/);
  });

  it("[blocant] clicul pe un furnizor cere EXACT cererile lui", async () => {
    await openVendorTab();
    fireEvent.click(await screen.findByRole("button", { name: /Explor Tur SRL/ }));
    await waitFor(() => expect(api.getParReportBreakdown).toHaveBeenCalled());
    const [dimension, value] = api.getParReportBreakdown.mock.calls[0];
    expect(dimension).toBe("vendor");
    expect(value).toBe("Explor Tur SRL");
  });

  it("[blocant] panoul arată plățile către furnizor, cu sumă, status și referință", async () => {
    await openVendorTab();
    fireEvent.click(await screen.findByRole("button", { name: /Explor Tur SRL/ }));
    expect(await screen.findByText("PAR-2026-0007")).toBeInTheDocument();
    expect(screen.getByText("Plătită")).toBeInTheDocument();
    expect(screen.getByText(/OP-118/)).toBeInTheDocument();
    // fiecare cerere duce la cererea întreagă
    expect(screen.getByRole("link", { name: /PAR-2026-0007/ })).toHaveAttribute("href", "#/business/par/par-1");
  });

  it("drill-down-ul primește aceleași filtre ca raportul", async () => {
    await openVendorTab();
    fireEvent.click(await screen.findByRole("button", { name: /Explor Tur SRL/ }));
    await waitFor(() => expect(api.getParReportBreakdown).toHaveBeenCalled());
    const filters = api.getParReportBreakdown.mock.calls[0][2];
    expect(filters).toBeDefined();
    expect(Object.keys(filters ?? {})).toContain("period_from");
  });
});
