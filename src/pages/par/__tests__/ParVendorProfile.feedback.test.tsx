/**
 * @vitest-environment jsdom
 *
 * „Aici să apară și feedback-ul și steluțele date de cei de la PAR-uri" (owner, 2026-08-31, peste
 * captura cu tabul „Prezentare" al furnizorului).
 *
 * Părerile existau, dar doar în tabul „Evaluări" — pe ecranul pe care se deschide fișa nu se vedea
 * nici nota, nici un cuvânt scris de cineva. Testele cer ce cerea owner-ul: comentariul și stelele
 * pe „Prezentare", și nota lângă cererea care a generat-o, în „Cereri și plăți".
 *
 * Se verifică și ACȚIUNEA (CLAUDE.md §3.5.1quater): butonul „Evaluează" de pe o cerere plătită
 * neevaluată chiar deschide dialogul pentru acea cerere.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import ParVendorProfile from "../ParVendorProfile";

vi.mock("@/router/HashRouter", () => ({
  useRouter: () => ({ path: "/business/par/vendors/v-1", navigate: vi.fn() }),
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

vi.mock("@/lib/api/parVendorProfile", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/parVendorProfile")>();
  const vendor = {
    id: "v-1",
    name: "Centrul de Resurse Juridice",
    kind: "company",
    idnp: "1010620008129",
    iban: "MD80VI000002224217675MDL",
    bank: "VictoriaBank S.A.",
    bicSwift: "VICBMD2X457",
    vatCode: "32323232",
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
  };
  return {
    ...actual,
    getVendorProfile: vi.fn().mockResolvedValue({
      vendor,
      kpis: {
        requestCount: 2,
        paidCount: 1,
        paidCents: 600000,
        committedCents: 3000000,
        avgRequestCents: 600000,
        firstRequestAt: "2026-07-16T00:00:00Z",
        lastPaidAt: "2026-08-30T00:00:00Z",
        avgDaysApprovalToPayment: 3,
        avgDaysSubmitToPayment: 5,
      },
      ratings: {
        count: 1,
        avg: 4,
        quality: 4,
        timeliness: 5,
        price: 3,
        communication: 4,
        wouldUseAgainPct: 100,
        distribution: { "1": 0, "2": 0, "3": 0, "4": 1, "5": 0 },
      },
      flags: [],
      requests: [
        {
          id: "par-rated",
          requestNo: "PAR-2026-0025",
          status: "paid",
          purpose: "execute_payment",
          currency: "MDL",
          totalEstimatedCents: 600000,
          totalMdlCents: 600000,
          actualAmountCents: 600000,
          dateOfRequest: "2026-08-20T00:00:00Z",
          paidAt: "2026-08-30T00:00:00Z",
          endUse: "Consultanță juridică",
        },
        {
          id: "par-unrated",
          requestNo: "PAR-2026-0031",
          status: "paid",
          purpose: "execute_payment",
          currency: "MDL",
          totalEstimatedCents: 300000,
          totalMdlCents: 300000,
          actualAmountCents: 300000,
          dateOfRequest: "2026-08-25T00:00:00Z",
          paidAt: "2026-08-31T00:00:00Z",
          endUse: "Instruire",
        },
      ],
    }),
    listVendorRatings: vi.fn().mockResolvedValue({
      ratings: [
        {
          id: "r-1",
          vendorId: "v-1",
          parId: "par-rated",
          authorUserId: "u-1",
          authorName: "Violeta",
          requestNo: "PAR-2026-0025",
          stars: 4,
          qualityStars: 4,
          timelinessStars: 5,
          priceStars: 3,
          communicationStars: 4,
          comment: "Au livrat la timp, dar factura a venit greu.",
          wouldUseAgain: true,
          createdAt: "2026-08-30T10:00:00Z",
        },
      ],
      summary: null,
    }),
    listVendorNotes: vi.fn().mockResolvedValue({ notes: [] }),
    listVendorOffers: vi.fn().mockResolvedValue({ offers: [], quotes: [] }),
    listVendorDocuments: vi.fn().mockResolvedValue({ documents: [] }),
    listVendorCategories: vi.fn().mockResolvedValue({ categories: [] }),
    rateVendor: vi.fn().mockResolvedValue({}),
  };
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe("fișa furnizorului — părerile la vedere", () => {
  it("arată nota, criteriile și comentariul chiar pe „Prezentare”", async () => {
    render(<ParVendorProfile />);

    // Comentariul scris de coleg, cu tot cu cine l-a scris și de la ce cerere vine.
    expect(await screen.findByText("Au livrat la timp, dar factura a venit greu.")).toBeInTheDocument();
    expect(screen.getByText("Violeta")).toBeInTheDocument();
    expect(screen.getByText(/la cererea PAR-2026-0025/)).toBeInTheDocument();
    // Stelele: media, ca text accesibil, nu doar ca desen.
    expect(screen.getAllByLabelText(/4[.,]0 din 5/).length).toBeGreaterThan(0);
    expect(screen.getByText(/ar mai lucra cu acest furnizor/)).toBeInTheDocument();
  });

  it("pune nota lângă cererea care a generat-o, în „Cereri și plăți”", async () => {
    render(<ParVendorProfile />);
    fireEvent.click(await screen.findByRole("tab", { name: /Cereri și plăți/ }));

    const rated = (await screen.findByText("PAR-2026-0025")).closest("tr")!;
    expect(within(rated).getByText("Au livrat la timp, dar factura a venit greu.")).toBeInTheDocument();
    expect(within(rated).queryByRole("button", { name: /Evaluează/ })).not.toBeInTheDocument();
  });

  it("o cerere plătită și neevaluată are buton care deschide dialogul pentru EA", async () => {
    render(<ParVendorProfile />);
    fireEvent.click(await screen.findByRole("tab", { name: /Cereri și plăți/ }));

    const unrated = (await screen.findByText("PAR-2026-0031")).closest("tr")!;
    fireEvent.click(within(unrated).getByRole("button", { name: /Evaluează/ }));

    const dialog = await screen.findByRole("dialog");
    // Dialogul trebuie să știe DESPRE CE cerere e vorba — altfel nota se leagă de nimic.
    expect(within(dialog).getByText(/PAR-2026-0031/)).toBeInTheDocument();
  });

  it("fără nicio evaluare, „Prezentare” explică de ce e gol și oferă butonul de evaluat", async () => {
    const api = await import("@/lib/api/parVendorProfile");
    vi.mocked(api.listVendorRatings).mockResolvedValueOnce({ ratings: [], summary: null } as never);
    const profile = await vi.mocked(api.getVendorProfile).getMockImplementation()!("v-1");
    vi.mocked(api.getVendorProfile).mockResolvedValueOnce({
      ...profile,
      ratings: { ...profile.ratings, count: 0, avg: null, wouldUseAgainPct: null },
    });

    render(<ParVendorProfile />);
    expect(await screen.findByText(/Nicio evaluare încă/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Evaluează acum/ }));
    await waitFor(() => expect(screen.getByRole("dialog")).toBeInTheDocument());
  });
});
