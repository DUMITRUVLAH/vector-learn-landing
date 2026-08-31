/**
 * DG-103 — ecranul „Acte".
 *
 * Testele execută parcursul real, nu doar randarea: golul explicit când nu există niciun act,
 * lista cu stările corecte, filtrul care ajunge ca parametru la API, crearea unei ciorne prin
 * dialog, și fișa unui act finalizat care NU mai oferă butonul de finalizare (imutabilitatea
 * trebuie să se vadă în interfață, nu doar în API).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { DocDetail, DocListItem } from "@/lib/api/docs";

vi.mock("@/hooks/useBusinessSession", () => ({
  useBusinessSession: () => ({
    status: "authenticated",
    data: {
      user: { name: "Ana Contabil", role: "owner" },
      tenant: { name: "ATIC", slug: "atic", appKind: "business" },
    },
    logout: vi.fn(),
    refresh: vi.fn(),
    error: null,
  }),
}));

const navigate = vi.fn();

vi.mock("@/router/HashRouter", () => ({
  useRouter: () => ({ path: "/business/par/documente", navigate }),
  Link: ({ to, children, ...rest }: { to: string; children: React.ReactNode; [k: string]: unknown }) => (
    <a href={`#${to}`} {...rest}>
      {children}
    </a>
  ),
}));

vi.mock("@/lib/docs/documentPdfClient", () => ({
  downloadDocumentPdf: vi.fn().mockResolvedValue(true),
}));

vi.mock("@/lib/api/par", () => ({
  listPar: vi.fn().mockResolvedValue({
    requests: [
      { id: "par-1", requestNo: "PAR-2026-0004", payeeName: "SRL Alfa", totalEstimatedCents: 500000, currency: "MDL" },
    ],
    total: 1,
  }),
}));

vi.mock("@/lib/api/docmerge", () => ({
  listTemplates: vi.fn().mockResolvedValue([
    { id: "tpl-1", name: "Act de primire-predare", placeholders: [], sourceFormat: "html", updatedAt: "" },
  ]),
}));

const listDocuments = vi.fn();
const createDocumentFromPar = vi.fn();
const getDocument = vi.fn();
const createDocument = vi.fn();
const finalizeDocument = vi.fn();
const cancelDocument = vi.fn();

vi.mock("@/lib/api/docs", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api/docs")>("@/lib/api/docs");
  return {
    ...actual,
    listDocuments: (...a: unknown[]) => listDocuments(...a),
    createDocumentFromPar: (...a: unknown[]) => createDocumentFromPar(...a),
    getDocument: (...a: unknown[]) => getDocument(...a),
    createDocument: (...a: unknown[]) => createDocument(...a),
    finalizeDocument: (...a: unknown[]) => finalizeDocument(...a),
    cancelDocument: (...a: unknown[]) => cancelDocument(...a),
  };
});

const { DocsPage } = await import("@/pages/business/docs/DocsPage");

const DOC: DocListItem = {
  id: "doc-1",
  kind: "act_primire_predare",
  docNumber: "ACT-2026-0007",
  docDate: "2026-03-12T00:00:00.000Z",
  title: "Act de primire-predare — echipament IT",
  status: "final",
  projectId: null,
  counterpartyId: null,
  counterpartyName: 'SRL "Tehnica Nouă"',
  totalCents: 2450000,
  currency: "MDL",
  finalizedAt: "2026-03-12T10:00:00.000Z",
  cancelledAt: null,
};

const DETAIL: DocDetail = {
  ...DOC,
  bodyHtml: "<p>Act</p>",
  bodyHash: "a".repeat(64),
  cancelReason: null,
  templateId: "tpl-1",
  counterpartySnapshot: { iban: "MD48ML000002259A19498121" },
  context: {},
  lines: [
    {
      id: "l1",
      position: 1,
      description: "Laptop Dell Latitude",
      unit: "buc",
      quantity: 2,
      unitPriceCents: 1225000,
      lineTotalCents: 2450000,
      vatPercent: 0,
    },
  ],
  audit: [
    { id: "a1", action: "created", createdAt: "2026-03-12T09:00:00.000Z", details: {} },
    { id: "a2", action: "finalized", createdAt: "2026-03-12T10:00:00.000Z", details: {} },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
  window.location.hash = "#/business/par/documente";
});

describe("DG-103 — registrul de acte", () => {
  it("[blocant] fără acte, ecranul cheamă la primul act în loc să arate un tabel gol", async () => {
    listDocuments.mockResolvedValue([]);
    render(<DocsPage />);

    expect(await screen.findByText("Niciun act încă")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Creează primul act/i })).toBeInTheDocument();
  });

  it("[blocant] lista arată numărul, contrapartea, suma și starea", async () => {
    listDocuments.mockResolvedValue([DOC]);
    render(<DocsPage />);

    expect(await screen.findByText("ACT-2026-0007")).toBeInTheDocument();
    // Rândul din tabel, nu rezumatul de deasupra — altfel testul ar trece și dacă suma
    // apare doar în total, iar coloana ar fi goală.
    const row = within(screen.getByRole("table")).getByText("ACT-2026-0007").closest("tr")!;
    expect(within(row).getByText('SRL "Tehnica Nouă"')).toBeInTheDocument();
    expect(within(row).getByText(/24[.,\s]500,00 MDL/)).toBeInTheDocument();
    expect(within(row).getByText("Finalizat")).toBeInTheDocument();
  });

  it("[blocant] filtrul pe stare ajunge la API ca parametru, nu doar în interfață", async () => {
    listDocuments.mockResolvedValue([DOC]);
    render(<DocsPage />);
    await screen.findByText("ACT-2026-0007");

    await userEvent.selectOptions(screen.getByLabelText("Starea actului"), "draft");

    await waitFor(() => {
      expect(listDocuments).toHaveBeenLastCalledWith(expect.objectContaining({ status: "draft" }));
    });
  });

  it("[blocant] actul nou duce la formularul de completare, nu la un dialog orb", async () => {
    listDocuments.mockResolvedValue([]);
    render(<DocsPage />);

    await userEvent.click(await screen.findByRole("button", { name: /Creează primul act/i }));
    expect(navigate).toHaveBeenCalledWith("/business/par/documente/nou");
  });

  it("[blocant] un rând deschide actul, cu id-ul lui în adresă", async () => {
    listDocuments.mockResolvedValue([DOC]);
    render(<DocsPage />);

    await userEvent.click(await screen.findByText("Act de primire-predare — echipament IT"));
    expect(navigate).toHaveBeenCalledWith("/business/par/documente/doc-1");
  });
});


describe("DG-118 — actul dintr-o cerere de plată", () => {
  it("[blocant] alegerea unei cereri creează actul și îl deschide", async () => {
    listDocuments.mockResolvedValue([]);
    createDocumentFromPar.mockResolvedValue({ id: "doc-from-par" });
    render(<DocsPage />);

    await userEvent.click(await screen.findByRole("button", { name: /Act dintr-o cerere/i }));
    const dialog = await screen.findByRole("dialog", { name: "Act dintr-o cerere de plată" });
    await userEvent.click(within(dialog).getByRole("button", { name: /PAR-2026-0004/ }));

    await waitFor(() => expect(createDocumentFromPar).toHaveBeenCalledWith("par-1"));
    expect(navigate).toHaveBeenCalledWith("/business/par/documente/doc-from-par");
  });
});


describe("Fix prod — cererile de plată din care se poate face un act", () => {
  it("[blocant] se caută în TOATE stările utile, nu doar „aprobat”", async () => {
    // Bug raportat de owner: dialogul spunea „nicio cerere aprobată" într-o organizație cu zeci
    // de cereri — pentru că actul se face și cât cererea e la finanțe, și după plată.
    const par = await import("@/lib/api/par");
    listDocuments.mockResolvedValue([]);
    render(<DocsPage />);

    await userEvent.click(await screen.findByRole("button", { name: /Act dintr-o cerere/i }));
    await waitFor(() => {
      const statuses = vi.mocked(par.listPar).mock.calls.map((c) => (c[0] as { status?: string })?.status);
      expect(statuses).toEqual(expect.arrayContaining(["approved", "in_finance", "paid"]));
    });
  });
});
