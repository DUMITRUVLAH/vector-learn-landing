/**
 * CRM — ecranul de rapoarte.
 *
 * Trei lucruri care erau rupte și pe care testele nu le prindeau, fiindcă TypeScript verifică
 * tipul DECLARAT, nu ce vine pe fir: tabelele citeau câmpuri inexistente (`entered`, `ratePct`,
 * `productName`, `wonValueCents`) și afișau „undefined%" în producție.
 *
 * Plus cele două cerințe din caietul de sarcini care lipseau: perioada aleasă de utilizator
 * (57) și exportul PDF (58).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import type { CrmReportsResponse } from "@/lib/api/crmReports";

beforeEach(() => {
  vi.clearAllMocks();
});

vi.mock("@/hooks/useBusinessSession", () => ({
  useBusinessSession: () => ({
    status: "authenticated",
    data: { user: { id: "u1", name: "Admin", role: "owner" }, tenant: { name: "Ecosolar", slug: "eco", appKind: "business" } },
    logout: vi.fn(),
    refresh: vi.fn(),
    error: null,
  }),
}));

vi.mock("@/router/HashRouter", () => ({
  useRouter: () => ({ path: "/business/crm/rapoarte", navigate: vi.fn() }),
  Link: ({ to, children, ...rest }: { to: string; children: React.ReactNode; [key: string]: unknown }) => (
    <a href={`#${to}`} {...rest}>{children}</a>
  ),
}));

// Graficele nu se randează în jsdom (recharts are nevoie de dimensiuni reale) — le înlocuim cu
// marcaje, ca testul să verifice CE date primesc, nu cum arată.
vi.mock("@/components/crm/ReportsCharts", () => ({
  TimelineChart: ({ data }: { data: unknown[] }) => <div data-testid="timeline">{data.length} puncte</div>,
  ConversionChart: () => <div data-testid="conversion-chart" />,
  LostReasonsChart: () => <div data-testid="lost-chart" />,
}));

const downloadCrmReportPdf = vi.fn().mockResolvedValue(undefined);
vi.mock("@/lib/crmReportPdf", () => ({
  downloadCrmReportPdf: (...a: unknown[]) => downloadCrmReportPdf(...a),
}));

const getCrmReports = vi.fn();
vi.mock("@/lib/api/crmReports", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/crmReports")>();
  return { ...actual, getCrmReports: (...a: unknown[]) => getCrmReports(...a) };
});

const { CrmReportsPage } = await import("@/pages/business/crm/CrmReportsPage");

function makeReports(): CrmReportsResponse {
  return {
    range: { from: null, to: null },
    owner: null,
    stages: [],
    owners: [{ id: "u1", name: "Ana Ionescu" }],
    kpis: {
      leadsAllocated: 12,
      callsMade: 30,
      successfulContacts: 18,
      meetings: 4,
      offersSent: 7,
      contractsSigned: 3,
      salesValueCents: 1_250_00,
      tasksDone: 9,
      tasksOverdue: 2,
    },
    conversion: [
      { fromKey: "contacted", fromLabel: "Contactat", toKey: "oferta", toLabel: "Ofertă transmisă", reached: 10, advanced: 7, conversionPct: 70 },
    ],
    cycleDays: 12.4,
    perOwner: [
      {
        ownerKey: "u1",
        ownerName: "Ana Ionescu",
        leadsAllocated: 12,
        callsMade: 30,
        successfulContacts: 18,
        meetings: 4,
        offersSent: 7,
        contractsSigned: 3,
        salesValueCents: 1_250_00,
        tasksDone: 9,
        tasksOverdue: 2,
      },
    ],
    perProduct: [{ product: "Panouri 10kW", total: 8, won: 3, lost: 2, valueCents: 900_00, winRatePct: 60 }],
    lostReasons: [{ reason: "Preț prea mare", count: 4, valueCents: 400_00, pct: 57 }],
    taskCompliance: { done: 9, overdue: 2, openNotYetDue: 3, totalPct: 64 },
    timeline: [
      { bucket: "2026-09-01", leadsCreated: 5, offersSent: 2, contractsSigned: 1, salesValueCents: 500_00 },
      { bucket: "2026-09-02", leadsCreated: 7, offersSent: 5, contractsSigned: 2, salesValueCents: 750_00 },
    ],
    bucketSize: "day",
  };
}

describe("Tabelele arată cifre, nu „undefined”", () => {
  it("[blocant] conversia, produsele și pierderile citesc câmpurile REALE ale serverului", async () => {
    getCrmReports.mockResolvedValue(makeReports());

    render(<CrmReportsPage />);
    await screen.findByText("Conversia între etape");

    // Conversie: `reached` + `conversionPct`, nu `entered`/`ratePct`.
    expect(screen.getByText("70%")).toBeInTheDocument();
    // Produs: `product` + `valueCents`, nu `productName`/`wonValueCents`.
    expect(screen.getByText("Panouri 10kW")).toBeInTheDocument();
    expect(screen.getByText("60%")).toBeInTheDocument();
    // Pierderi: procentul chiar există acum.
    expect(screen.getByText("57%")).toBeInTheDocument();

    expect(screen.queryByText(/undefined/)).not.toBeInTheDocument();
    expect(screen.queryByText("undefined%")).not.toBeInTheDocument();
  });

  it("[blocant] evoluția perioadei ajunge la grafic", async () => {
    getCrmReports.mockResolvedValue(makeReports());

    render(<CrmReportsPage />);

    expect(await screen.findByTestId("timeline")).toHaveTextContent("2 puncte");
  });
});

describe("Cerința 57 — perioada aleasă de utilizator", () => {
  it("[blocant] „Interval ales” cere serverului exact zilele alese, cu ultima zi inclusă", async () => {
    getCrmReports.mockResolvedValue(makeReports());

    render(<CrmReportsPage />);
    await screen.findByText("Conversia între etape");

    fireEvent.change(screen.getByLabelText("Perioadă"), { target: { value: "custom" } });
    fireEvent.change(await screen.findByLabelText("De la"), { target: { value: "2026-09-01" } });
    fireEvent.change(screen.getByLabelText("Până la"), { target: { value: "2026-09-30" } });

    await waitFor(() => {
      const last = getCrmReports.mock.calls.at(-1)?.[0] as { from: string; to: string };
      expect(new Date(last.from).getDate()).toBe(1);
      // Intervalul e [from, to): 30 septembrie se include mutând limita la 1 octombrie.
      expect(new Date(last.to).getDate()).toBe(1);
      expect(new Date(last.to).getMonth()).toBe(9); // octombrie
    });
  });
});

describe("Cerința 58 — export Excel și PDF", () => {
  it("[blocant] PDF-ul primește cifrele de pe ecran, cu perioada și agentul în antet", async () => {
    getCrmReports.mockResolvedValue(makeReports());

    render(<CrmReportsPage />);
    await screen.findByText("Conversia între etape");

    fireEvent.click(screen.getByRole("button", { name: /Export PDF/i }));

    await waitFor(() => expect(downloadCrmReportPdf).toHaveBeenCalled());
    const [input] = downloadCrmReportPdf.mock.calls[0] as [
      { orgName: string; periodLabel: string; ownerLabel: string; kpis: { label: string; value: string }[]; tables: { title: string }[] },
    ];
    expect(input.orgName).toBe("Ecosolar");
    expect(input.ownerLabel).toBe("toată echipa");
    expect(input.periodLabel).toBe("luna aceasta");
    expect(input.kpis.find((k) => k.label === "Contracte semnate")?.value).toBe("3");
    expect(input.tables.map((t) => t.title)).toEqual([
      "Conversia între etape",
      "Rezultate pe agent",
      "De ce pierdem",
      "Rezultate pe produs",
    ]);
  });

  it("[normal] butonul de Excel rămâne acolo — cerința cere ambele formate", async () => {
    getCrmReports.mockResolvedValue(makeReports());

    render(<CrmReportsPage />);

    expect(await screen.findByRole("button", { name: /Export Excel/i })).toBeInTheDocument();
  });
});
