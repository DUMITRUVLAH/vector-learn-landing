/**
 * CRM — interfața pentru oferte și contracte.
 *
 * Ce verificăm aici e promisiunea comercială a ecranului: omul vede TOTALUL
 * înainte de a apăsa. Oferta e singurul document care pleacă din firmă cu un
 * preț pe el; dacă suma apare abia în PDF, greșeala ajunge deja la client.
 *
 * Al doilea lucru: CRM-ul nu rescrie editorul de acte. După creare, omul e dus
 * în ecranul de acte al FinFlow, unde actul se finalizează și se trimite.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";

beforeEach(() => {
  vi.clearAllMocks();
  window.location.hash = "";
});

vi.mock("@/hooks/useBusinessSession", () => ({
  useBusinessSession: () => ({
    status: "authenticated",
    data: {
      user: { id: "user-1", name: "Andreea Admin", role: "owner" },
      tenant: { name: "Test FinDesk", slug: "test", appKind: "business" },
    },
    logout: vi.fn(),
    refresh: vi.fn(),
    error: null,
  }),
}));

vi.mock("@/hooks/useTeamMembers", () => ({
  useTeamMembers: () => ({ members: [], loading: false, error: null }),
}));

vi.mock("@/router/HashRouter", () => ({
  useRouter: () => ({ path: "/business/crm/documente", navigate: vi.fn() }),
  Link: ({ to, children, ...rest }: { to: string; children: React.ReactNode; [key: string]: unknown }) => (
    <a href={`#${to}`} {...rest}>
      {children}
    </a>
  ),
}));

const listCrmProducts = vi.fn();
vi.mock("@/lib/api/crm", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api/crm")>("@/lib/api/crm");
  return { ...actual, listCrmProducts: (...a: unknown[]) => listCrmProducts(...a) };
});

const listCrmDocuments = vi.fn();
const createCrmDocument = vi.fn();
vi.mock("@/lib/api/crmDocuments", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api/crmDocuments")>("@/lib/api/crmDocuments");
  return {
    ...actual,
    listCrmDocuments: (...a: unknown[]) => listCrmDocuments(...a),
    createCrmDocument: (...a: unknown[]) => createCrmDocument(...a),
  };
});

const { NewDocumentDialog } = await import("@/components/crm/NewDocumentDialog");
const { CrmDocumentsPage } = await import("@/pages/business/crm/CrmDocumentsPage");

const PRODUCTS = [
  {
    id: "p1",
    name: "Instalare panouri 10 kW",
    sku: null,
    description: null,
    unit: "buc",
    listPriceCents: 15_000_00,
    vatPercent: "20.00",
    currency: "MDL",
    category: null,
    isActive: true,
    orderIndex: 0,
  },
  {
    id: "p2",
    name: "Invertor hibrid",
    sku: null,
    description: null,
    unit: "buc",
    listPriceCents: 3_000_00,
    vatPercent: "20.00",
    currency: "MDL",
    category: null,
    isActive: true,
    orderIndex: 1,
  },
];

// ─── Dialogul de act nou ──────────────────────────────────────────────────────

describe("Act nou dintr-un lead", () => {
  beforeEach(() => {
    listCrmProducts.mockResolvedValue({ items: PRODUCTS });
  });

  function open() {
    return render(
      <NewDocumentDialog leadId="lead-1" leadName="Agro Nord SRL" onClose={vi.fn()} onCreated={vi.fn()} />
    );
  }

  it("[blocant] totalul se vede ÎNAINTE de a crea actul", async () => {
    open();
    fireEvent.click(await screen.findByRole("button", { name: /adaugă produs/i }));
    // 1 × 15.000,00 din catalog.
    expect(await screen.findByText(/15 000,00 MDL|15.000,00 MDL/)).toBeTruthy();
  });

  it("totalul urmează cantitatea, nu rămâne la prețul unitar", async () => {
    open();
    fireEvent.click(await screen.findByRole("button", { name: /adaugă produs/i }));
    fireEvent.change(screen.getByLabelText(/^cant\.$/i), { target: { value: "3" } });
    await waitFor(() => expect(screen.getByText(/45 000,00 MDL|45.000,00 MDL/)).toBeTruthy());
  });

  it("un preț negociat scris de om învinge prețul din catalog, și la total", async () => {
    open();
    fireEvent.click(await screen.findByRole("button", { name: /adaugă produs/i }));
    fireEvent.change(screen.getByLabelText(/^preț$/i), { target: { value: "12500,50" } });
    await waitFor(() => expect(screen.getByText(/12 500,50 MDL|12.500,50 MDL/)).toBeTruthy());
  });

  it("se pot adăuga poziții scrise de mână, pentru ce nu e în catalog", async () => {
    open();
    fireEvent.click(await screen.findByRole("button", { name: /adaugă rând/i }));
    fireEvent.change(screen.getByLabelText(/descriere/i), { target: { value: "Transport" } });
    fireEvent.change(screen.getByLabelText(/^preț$/i), { target: { value: "500" } });

    createCrmDocument.mockResolvedValue({ id: "doc-1" });
    fireEvent.click(screen.getByRole("button", { name: /creează ciorna/i }));
    await waitFor(() => expect(createCrmDocument).toHaveBeenCalled());
    expect(createCrmDocument.mock.calls[0][0].extraLines).toEqual([
      { description: "Transport", quantity: 1, unitPriceCents: 50_000 },
    ]);
  });

  it("[blocant] după creare, omul ajunge în editorul de acte — nu rămâne în dialog", async () => {
    // CRM-ul nu rescrie finalizarea, numărul, PDF-ul și trimiterea pe email:
    // toate există deja în ecranul de acte al FinFlow.
    createCrmDocument.mockResolvedValue({ id: "doc-42" });
    open();
    fireEvent.click(await screen.findByRole("button", { name: /creează ciorna/i }));
    await waitFor(() => expect(window.location.hash).toContain("doc-42"));
  });

  it("„în baza” apare doar la contract, nu la ofertă — o ofertă nu se face în baza nimănui", async () => {
    open();
    expect(screen.queryByLabelText(/în baza/i)).toBeNull();
    fireEvent.change(screen.getByLabelText(/tipul actului/i), { target: { value: "contract_servicii" } });
    expect(await screen.findByLabelText(/în baza/i)).toBeTruthy();
  });

  it("catalogul gol nu blochează ecranul — se pot scrie pozițiile de mână", async () => {
    listCrmProducts.mockResolvedValue({ items: [] });
    open();
    expect(await screen.findByText(/catalogul de produse e gol/i)).toBeTruthy();
    expect(screen.getByRole("button", { name: /adaugă rând/i })).toBeTruthy();
  });

  it("eroarea de la server se arată, nu se pierde", async () => {
    createCrmDocument.mockRejectedValue(new Error("Produsele alese sunt în monede diferite (MDL, EUR)."));
    open();
    fireEvent.click(await screen.findByRole("button", { name: /creează ciorna/i }));
    expect(await screen.findByText(/monede diferite/i)).toBeTruthy();
  });
});

// ─── Lista de acte ────────────────────────────────────────────────────────────

const DOCS = [
  {
    id: "d1",
    kind: "oferta_comerciala",
    docNumber: "12",
    docDate: "2026-09-01T00:00:00.000Z",
    title: "Ofertă comercială — Agro Nord SRL",
    status: "sent",
    totalCents: 15_000_00,
    currency: "MDL",
    counterpartyId: "lead-1",
    counterpartyName: "Agro Nord SRL",
    finalizedAt: "2026-09-01T00:00:00.000Z",
    cancelledAt: null,
  },
  {
    id: "d2",
    kind: "contract_servicii",
    docNumber: null,
    docDate: "2026-09-10T00:00:00.000Z",
    title: "Contract — Vitis SRL",
    status: "draft",
    totalCents: 8_000_00,
    currency: "MDL",
    counterpartyId: "lead-2",
    counterpartyName: "Vitis SRL",
    finalizedAt: null,
    cancelledAt: null,
  },
];

describe("Lista de oferte și contracte", () => {
  it("arată actele cu client, stare și valoare", async () => {
    listCrmDocuments.mockResolvedValue({ items: DOCS });
    render(<CrmDocumentsPage />);

    // Starea apare și ca opțiune de filtru, deci o căutăm în TABEL, nu oriunde.
    const table = await screen.findByRole("table", { name: /oferte și contracte/i });
    expect(within(table).getByText("Agro Nord SRL")).toBeTruthy();
    expect(within(table).getByText("Trimis")).toBeTruthy();
    expect(within(table).getByText(/15 000,00 MDL|15.000,00 MDL/)).toBeTruthy();
  });

  it("filtrul pe stare separă ciornele de ce a plecat deja la client", async () => {
    listCrmDocuments.mockResolvedValue({ items: DOCS });
    render(<CrmDocumentsPage />);
    await screen.findByText("Agro Nord SRL");

    fireEvent.change(screen.getByLabelText(/stare/i), { target: { value: "draft" } });
    await waitFor(() => expect(screen.queryByText("Agro Nord SRL")).toBeNull());
    expect(screen.getByText("Vitis SRL")).toBeTruthy();
  });

  it("actul se deschide în editorul de acte, nu într-un ecran paralel", async () => {
    listCrmDocuments.mockResolvedValue({ items: DOCS });
    render(<CrmDocumentsPage />);

    const link = await screen.findByRole("link", { name: /nr\. 12/i });
    expect(link.getAttribute("href")).toContain("/business/par/documente/d1");
  });

  it("fără acte, ecranul spune de unde se pornește unul", async () => {
    listCrmDocuments.mockResolvedValue({ items: [] });
    render(<CrmDocumentsPage />);
    expect(await screen.findByText(/niciun act încă/i)).toBeTruthy();
    expect(screen.getByText(/fișa unui lead/i)).toBeTruthy();
  });
});
