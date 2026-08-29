/**
 * DG-120/121 — dosarele, în interfață.
 *
 * Testele urmăresc exact ce vede omul care întreabă: totalul contractat vs. plătit, actele grupate
 * pe contraparte, și — cel mai important — avertismentul că furnizorul și-a schimbat IBAN-ul de la
 * ultimul act semnat. Ăsta e ecranul care oprește o plată pe cont vechi.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";

const navigate = vi.fn();
let currentPath = "/business/docs/proiect/p1";

vi.mock("@/hooks/useBusinessSession", () => ({
  useBusinessSession: () => ({
    status: "authenticated",
    data: {
      user: { name: "Ana", role: "owner" },
      tenant: { name: "ATIC", slug: "atic", appKind: "business" },
    },
    logout: vi.fn(),
    refresh: vi.fn(),
    error: null,
  }),
}));

vi.mock("@/router/HashRouter", () => ({
  useRouter: () => ({ path: currentPath, navigate }),
  Link: ({ to, children, ...rest }: { to: string; children: React.ReactNode; [k: string]: unknown }) => (
    <a href={`#${to}`} {...rest}>
      {children}
    </a>
  ),
}));

vi.mock("@/lib/api/par", () => ({
  listProjects: vi.fn().mockResolvedValue({ items: [{ id: "p1", name: "Digital Skills 2026" }] }),
  listVendors: vi.fn().mockResolvedValue({ items: [{ id: "v1", name: "SRL Alfa" }] }),
}));

const getProjectDossier = vi.fn();
const getCounterpartyDossier = vi.fn();

vi.mock("@/lib/api/docs", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api/docs")>("@/lib/api/docs");
  return {
    ...actual,
    getProjectDossier: (...a: unknown[]) => getProjectDossier(...a),
    getCounterpartyDossier: (...a: unknown[]) => getCounterpartyDossier(...a),
  };
});

const { DocDossierPage } = await import("@/pages/business/docs/DocDossierPage");

const DOC = {
  id: "d1",
  kind: "act_primire_predare",
  docNumber: "ACT-2026-0001",
  docDate: "2026-03-12T00:00:00.000Z",
  title: "Act — echipament",
  status: "final" as const,
  projectId: "p1",
  counterpartyId: "v1",
  counterpartyName: "SRL Alfa",
  totalCents: 2450000,
  currency: "MDL",
  finalizedAt: null,
  cancelledAt: null,
  paymentRequests: [
    { id: "par-1", requestNo: "PAR-2026-0004", status: "paid", totalEstimatedCents: 2450000, paidAt: "2026-03-20T00:00:00.000Z" },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
  currentPath = "/business/docs/proiect/p1";
});

describe("DG-120 — dosarul proiectului", () => {
  it("[blocant] arată contractat vs plătit și actele grupate pe contraparte", async () => {
    getProjectDossier.mockResolvedValue({
      documents: [DOC],
      totals: { MDL: { contractedCents: 2450000, paidCents: 2450000 } },
      byCounterparty: [
        { counterpartyId: "v1", counterpartyName: "SRL Alfa", documents: [DOC], totals: { MDL: { contractedCents: 2450000, paidCents: 2450000 } } },
      ],
    });
    render(<DocDossierPage />);

    expect(await screen.findByText("SRL Alfa")).toBeInTheDocument();
    expect(screen.getByText(/Contractat \(MDL\)/)).toBeInTheDocument();
    expect(screen.getAllByText(/24\.500,00 MDL/).length).toBeGreaterThan(0);
    // Cererea plătită se vede pe rândul actului — nu trebuie deschis PAR-ul ca să afli.
    expect(screen.getByText(/PAR-2026-0004 \(plătită\)/)).toBeInTheDocument();
  });

  it("[normal] un proiect fără acte spune asta, nu arată un tabel gol", async () => {
    getProjectDossier.mockResolvedValue({ documents: [], totals: {}, byCounterparty: [] });
    render(<DocDossierPage />);
    expect(await screen.findByText(/Niciun act pe acest proiect/)).toBeInTheDocument();
  });
});

describe("DG-121 — dosarul contrapărții", () => {
  it("[blocant] avertizează când IBAN-ul din registru diferă de cel de pe ultimul act", async () => {
    currentPath = "/business/docs/contraparte/v1";
    getCounterpartyDossier.mockResolvedValue({
      documents: [DOC],
      totals: { MDL: { contractedCents: 2450000, paidCents: 0 } },
      requisiteChanges: [
        { field: "iban", label: "IBAN", onLastAct: "MD24AG000225100013104168", inRegistry: "MD11AG000000000000000000" },
      ],
    });
    render(<DocDossierPage />);

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Rechizitele s-au schimbat");
    expect(within(alert).getByText(/MD24AG000225100013104168/)).toBeInTheDocument();
    expect(within(alert).getByText(/MD11AG000000000000000000/)).toBeInTheDocument();
  });

  it("[blocant] fără schimbări, nu apare niciun avertisment fals", async () => {
    currentPath = "/business/docs/contraparte/v1";
    getCounterpartyDossier.mockResolvedValue({
      documents: [DOC],
      totals: { MDL: { contractedCents: 2450000, paidCents: 0 } },
      requisiteChanges: [],
    });
    render(<DocDossierPage />);

    expect(await screen.findByText("Act — echipament")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
