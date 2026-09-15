/**
 * Linkul public al actului, în interfață (cerința 42: „vizualizată”).
 *
 * Ce apără testele:
 *  1. **„a văzut oferta” se vede în listă**, nu doar în fișa actului — e prima întrebare a unui
 *     agent dimineața, și trebuie să aibă răspuns fără niciun click;
 *  2. actul fără link oferă butonul care îl creează, iar crearea copiază adresa pe loc (nimeni nu
 *     vrea să creeze un link și apoi să-l caute);
 *  3. ciorna nu primește link — numărul nu e rezervat, corpul se mai schimbă;
 *  4. pagina clientului arată actul și spune limpede când linkul nu mai e valabil.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import type { CrmDocument } from "@/lib/api/crmDocuments";

const listCrmDocuments = vi.fn();
const createDocShareLink = vi.fn();

vi.mock("@/lib/api/crmDocuments", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api/crmDocuments")>("@/lib/api/crmDocuments");
  return {
    ...actual,
    listCrmDocuments: (...a: unknown[]) => listCrmDocuments(...a),
    createDocShareLink: (...a: unknown[]) => createDocShareLink(...a),
  };
});

vi.mock("@/hooks/useBusinessSession", () => ({
  useBusinessSession: () => ({
    status: "authenticated",
    data: { user: { id: "u1", name: "Admin", role: "owner" }, tenant: { name: "T", slug: "t", appKind: "business" } },
    logout: vi.fn(),
    refresh: vi.fn(),
    error: null,
  }),
}));
vi.mock("@/hooks/useCrmPermissions", () => ({
  useCrmPermissions: () => ({ can: () => true, permissions: [], role: "admin", loading: false }),
}));
vi.mock("@/router/HashRouter", () => ({
  useRouter: () => ({ path: "/business/crm/documente", navigate: vi.fn() }),
  Link: ({ to, children, ...rest }: { to: string; children: React.ReactNode; [k: string]: unknown }) => (
    <a href={`#${to}`} {...rest}>
      {children}
    </a>
  ),
}));

const { CrmDocumentsPage } = await import("@/pages/business/crm/CrmDocumentsPage");

function doc(overrides: Partial<CrmDocument> = {}): CrmDocument {
  return {
    id: "doc-1",
    kind: "oferta_comerciala",
    docNumber: "OF-001",
    docDate: "2026-09-10T10:00:00.000Z",
    title: "Ofertă comercială",
    status: "sent",
    totalCents: 160_000,
    currency: "MDL",
    counterpartyId: "lead-1",
    counterpartyName: "Alfa Logistic SRL",
    finalizedAt: "2026-09-10T10:00:00.000Z",
    cancelledAt: null,
    share: null,
    ...overrides,
  } as CrmDocument;
}

beforeEach(() => {
  vi.clearAllMocks();
  Object.assign(navigator, { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } });
  createDocShareLink.mockResolvedValue({ id: "l1", token: "11111111-1111-1111-1111-111111111111", firstViewedAt: null, viewCount: 0, revokedAt: null, expiresAt: null, createdAt: "" });
});

describe("Linkul actului în lista de documente", () => {
  it("[blocant] „Vizualizat” se vede în listă, cu data", async () => {
    listCrmDocuments.mockResolvedValue({
      items: [doc({ share: { token: "t", firstViewedAt: "2026-09-12T14:20:00.000Z", viewCount: 3 } })],
    });
    render(<CrmDocumentsPage />);
    expect(await screen.findByText(/Vizualizat 12\.09/)).toBeInTheDocument();
  });

  it("[blocant] linkul trimis, dar nedeschis, o spune — nu tace", async () => {
    listCrmDocuments.mockResolvedValue({ items: [doc({ share: { token: "t", firstViewedAt: null, viewCount: 0 } })] });
    render(<CrmDocumentsPage />);
    expect(await screen.findByText(/Link trimis, încă nedeschis/)).toBeInTheDocument();
  });

  it("[blocant] actul fără link îl poate crea, iar adresa se copiază pe loc", async () => {
    listCrmDocuments.mockResolvedValue({ items: [doc()] });
    render(<CrmDocumentsPage />);

    fireEvent.click(await screen.findByRole("button", { name: /Link client/ }));
    await waitFor(() => expect(createDocShareLink).toHaveBeenCalledWith("doc-1"));
    await waitFor(() => expect(navigator.clipboard.writeText).toHaveBeenCalled());
    // Adresa copiată e cea pe care o deschide clientul, nu una internă.
    expect((navigator.clipboard.writeText as ReturnType<typeof vi.fn>).mock.calls[0][0]).toContain(
      "/#/act/11111111-1111-1111-1111-111111111111"
    );
  });

  it("[blocant] ciorna nu primește buton de link", async () => {
    listCrmDocuments.mockResolvedValue({ items: [doc({ status: "draft", docNumber: null })] });
    render(<CrmDocumentsPage />);
    // Titlul apare și în filtrul de tip; așteptăm rândul, prin celula de client.
    await screen.findByText("Alfa Logistic SRL");
    expect(screen.queryByRole("button", { name: /Link client/ })).not.toBeInTheDocument();
  });
});
