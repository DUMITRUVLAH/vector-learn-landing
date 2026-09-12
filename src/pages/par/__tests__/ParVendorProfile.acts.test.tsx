/**
 * @vitest-environment jsdom
 *
 * „Direct din furnizori să poți crea diferite documente pe baza lui — vrei să faci un contract, un
 * act de primire-predare" (owner, 2026-09-12). Plus ordinea cerută pe aceeași captură: meniul fișei
 * sus, cifrele subțiri sub el.
 *
 * Ce verifică testele, ca ACȚIUNE, nu ca prezență (CLAUDE.md §3.5.1quater): butonul „Act nou" chiar
 * duce în editorul de acte cu furnizorul și tipul alese, iar actele deja făcute se văd în „Documente".
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import ParVendorProfile from "../ParVendorProfile";

const navigate = vi.fn();

vi.mock("@/router/HashRouter", () => ({
  useRouter: () => ({ path: "/business/par/vendors/v-1", navigate }),
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => <a href={to}>{children}</a>,
}));

vi.mock("@/components/business/BusinessShell", () => ({
  BusinessShell: ({ children, actions }: { children: React.ReactNode; actions?: React.ReactNode }) => (
    <div>
      {actions}
      {children}
    </div>
  ),
}));

vi.mock("@/lib/api/par", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/par")>();
  return { ...actual, getParMe: vi.fn().mockResolvedValue({ roles: ["par_admin"] }) };
});

vi.mock("@/lib/api/docs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/docs")>();
  return {
    ...actual,
    listDocuments: vi.fn().mockResolvedValue([
      {
        id: "doc-1",
        kind: "contract_servicii",
        docNumber: "12",
        docDate: "2026-09-01T00:00:00Z",
        title: "Contract catering conferință",
        status: "final",
        projectId: null,
        counterpartyId: "v-1",
        counterpartyName: "WILDBERRIES GROUP SRL",
        totalCents: 1000000,
        currency: "MDL",
        finalizedAt: "2026-09-02T00:00:00Z",
        cancelledAt: null,
      },
    ]),
  };
});

vi.mock("@/lib/api/parVendorProfile", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/parVendorProfile")>();
  return {
    ...actual,
    getVendorProfile: vi.fn().mockResolvedValue({
      vendor: {
        id: "v-1",
        name: "WILDBERRIES GROUP SRL",
        kind: "company",
        idnp: "1020600003167",
        iban: "MD06ML000000002251467317",
        bank: "BC Moldindconbank S.A.",
        bicSwift: null,
        vatCode: null,
        legalAddress: null,
        contactName: null,
        contactPhone: null,
        contactEmail: null,
        administratorName: null,
        website: null,
        paymentTermsDays: null,
        relationship: "active" as const,
        blockedReason: null,
        companyStatus: null,
        active: true,
        notes: null,
        categories: [],
      },
      kpis: {
        requestCount: 1,
        paidCount: 0,
        paidCents: 0,
        committedCents: 1000000,
        avgRequestCents: 1000000,
        firstRequestAt: null,
        lastPaidAt: null,
        avgDaysApprovalToPayment: null,
        avgDaysSubmitToPayment: null,
      },
      ratings: {
        count: 0,
        avg: null,
        quality: null,
        timeliness: null,
        price: null,
        communication: null,
        wouldUseAgainPct: null,
        distribution: { "1": 0, "2": 0, "3": 0, "4": 0, "5": 0 },
      },
      flags: [],
      requests: [],
    }),
    listVendorRatings: vi.fn().mockResolvedValue({ ratings: [], summary: null }),
    listVendorNotes: vi.fn().mockResolvedValue({ notes: [] }),
    listVendorOffers: vi.fn().mockResolvedValue({ offers: [], quotes: [] }),
    listVendorDocuments: vi.fn().mockResolvedValue({ documents: [] }),
    listVendorCategories: vi.fn().mockResolvedValue({ categories: [] }),
  };
});

beforeEach(() => {
  vi.clearAllMocks();
  navigate.mockClear();
});

describe("fișa furnizorului — acte direct din furnizor", () => {
  it("„Act nou” duce în editorul de acte cu furnizorul și tipul alese", async () => {
    render(<ParVendorProfile />);

    fireEvent.click(await screen.findByRole("button", { name: "Act nou" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: /Contract de prestări servicii/ }));

    expect(navigate).toHaveBeenCalledWith("/business/docs/nou?vendor=v-1&kind=contract_servicii");
  });

  it("actele deja generate se văd în „Documente”, cu număr, tip și stare", async () => {
    render(<ParVendorProfile />);
    fireEvent.click(await screen.findByRole("tab", { name: /Documente/ }));

    const row = (await screen.findByText("Contract catering conferință")).closest("tr")!;
    expect(within(row).getByText("Nr. 12")).toBeInTheDocument();
    expect(within(row).getByText("Contract de prestări servicii")).toBeInTheDocument();
    expect(within(row).getByText("Finalizat")).toBeInTheDocument();
  });

  it("meniul fișei stă DEASUPRA cifrelor, nu sub ele", async () => {
    const { container } = render(<ParVendorProfile />);
    const tabs = await screen.findByRole("tab", { name: "Prezentare" });
    const kpi = screen.getByText("Plătit în total");

    // `compareDocumentPosition` spune cine e primul în ordinea de citire a paginii.
    expect(tabs.compareDocumentPosition(kpi) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(container).toBeTruthy();
  });
});
