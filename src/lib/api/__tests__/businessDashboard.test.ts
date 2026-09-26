/**
 * NAV-06 — „Facturi emise" de pe tabloul general era mereu 0.
 *
 * Cauza: clientul citea `invoices[].totalAmountCents` dintr-un API care întoarce `data[].totalCents`.
 * Nicio eroare, doar un zero credibil. Testul fixează că cifra vine din agregatul de server și că
 * soldul net scade cheltuielile din facturat, nu din zero.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const api = vi.fn();
vi.mock("../../api", () => ({ api: (url: string) => api(url) }));

import { fetchBusinessDashboardKPI } from "../businessDashboard";

beforeEach(() => {
  api.mockReset();
  api.mockImplementation(async (url: string) => {
    if (url.startsWith("/api/fin/expenses/summary")) return { grandTotalCents: 40_000 };
    if (url.startsWith("/api/analytics/fin/metrics")) {
      return { metrics: [{ revenue: 100_000, receivable: 20_000 }, { revenue: 30_000, receivable: 0 }] };
    }
    if (url.startsWith("/api/par")) return { requests: [], total: 0 };
    if (url.startsWith("/api/itpark")) return { engagements: [] };
    throw new Error(`neașteptat: ${url}`);
  });
});

describe("fetchBusinessDashboardKPI — FinDesk", () => {
  it("[blocant] facturat = încasat + de încasat, din agregatul serverului", async () => {
    const kpi = await fetchBusinessDashboardKPI();
    expect(kpi.findesk).toEqual({ totalExpensesCents: 40_000, totalInvoicesCents: 150_000, netCents: 110_000 });
  });

  it("[blocant] cheltuielile se citesc pe aceeași fereastră de 12 luni ca facturile", async () => {
    await fetchBusinessDashboardKPI();
    const expUrl = api.mock.calls.map(([u]) => u as string).find((u) => u.startsWith("/api/fin/expenses/summary"));
    expect(expUrl).toMatch(/dateFrom=\d{4}-\d{2}-01$/);
    expect(api).toHaveBeenCalledWith("/api/analytics/fin/metrics?period=ytd");
  });

  it("[normal] dacă FinDesk pică, restul tabloului rămâne", async () => {
    api.mockImplementation(async (url: string) => {
      if (url.startsWith("/api/fin") || url.startsWith("/api/analytics")) throw new Error("500");
      if (url.startsWith("/api/par")) return { requests: [], total: 3 };
      return { engagements: [] };
    });
    const kpi = await fetchBusinessDashboardKPI();
    expect(kpi.findesk).toBeNull();
    expect(kpi.par?.pendingCount).toBe(3);
  });
});
