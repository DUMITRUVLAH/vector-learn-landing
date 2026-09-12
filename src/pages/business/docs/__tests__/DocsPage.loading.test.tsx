/**
 * „Acte" — ce se întâmplă când lista NU se încarcă.
 *
 * Raport de la un utilizator: pagina rămâne la „Se încarcă actele…" și documentele nu apar.
 * Testele existente acopereau doar calea fericită (`mockResolvedValue`), deci nimic nu apăra:
 *   1. o încărcare picată arăta un text generic, fără motiv și fără ieșire (doar reload de pagină);
 *   2. pe eroare se randa SIMULTAN și golul „Niciun act încă" — omul citea „nu avem acte",
 *      nu „încărcarea a picat";
 *   3. căutarea trimitea o cerere pe literă, fără gardă de cursă: răspunsul unei căutări vechi
 *      putea ajunge ultimul și suprascria rezultatul celei noi.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ApiError } from "@/lib/api";
import type { DocListItem } from "@/lib/api/docs";

vi.mock("@/hooks/useBusinessSession", () => ({
  useBusinessSession: () => ({
    status: "authenticated",
    data: {
      user: { name: "Ana Contabil", role: "admin" },
      tenant: { name: "ATIC", slug: "atic", appKind: "business" },
    },
    logout: vi.fn(),
    refresh: vi.fn(),
    error: null,
  }),
}));

vi.mock("@/router/HashRouter", () => ({
  useRouter: () => ({ path: "/business/par/documente", navigate: vi.fn() }),
  Link: ({ to, children, ...rest }: { to: string; children: React.ReactNode; [k: string]: unknown }) => (
    <a href={`#${to}`} {...rest}>{children}</a>
  ),
}));

vi.mock("@/lib/docs/documentPdfClient", () => ({ downloadDocumentPdf: vi.fn() }));
vi.mock("@/lib/api/par", () => ({ listPar: vi.fn().mockResolvedValue({ requests: [], total: 0 }) }));
vi.mock("@/lib/api/docmerge", () => ({ listTemplates: vi.fn().mockResolvedValue([]) }));

const listDocuments = vi.fn();

vi.mock("@/lib/api/docs", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api/docs")>("@/lib/api/docs");
  return { ...actual, listDocuments: (...a: unknown[]) => listDocuments(...a) };
});

const { DocsPage } = await import("@/pages/business/docs/DocsPage");

function doc(id: string, title: string): DocListItem {
  return {
    id, kind: "act_primire_predare", docNumber: `ACT-${id}`,
    docDate: "2026-03-12T00:00:00.000Z", title, status: "final",
    projectId: null, counterpartyId: null, counterpartyName: "SRL Alfa",
    totalCents: 1000, currency: "MDL",
    finalizedAt: "2026-03-12T10:00:00.000Z", cancelledAt: null,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  window.location.hash = "#/business/par/documente";
});

describe("„Acte” — încărcarea care nu reușește", () => {
  it("[blocant] spune motivul real și oferă „Reîncearcă”, nu doar un text generic", async () => {
    listDocuments.mockRejectedValueOnce(new ApiError(0, "request_timeout"));
    render(<DocsPage />);

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/serverul nu a răspuns la timp/i);
    // Spinner-ul nu mai rămâne pe ecran după ce cererea a picat.
    expect(screen.queryByText(/Se încarcă actele/i)).not.toBeInTheDocument();

    // A doua încercare reușește → lista apare, bannerul dispare.
    listDocuments.mockResolvedValueOnce([doc("d1", "Act de primire-predare")]);
    await userEvent.click(screen.getByRole("button", { name: /Reîncearcă/i }));

    expect(await screen.findByText("ACT-d1")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("pe eroare NU mai minte cu „Niciun act încă”", async () => {
    listDocuments.mockRejectedValue(new ApiError(500, "db_unavailable"));
    render(<DocsPage />);

    await screen.findByRole("alert");
    expect(screen.queryByText("Niciun act încă")).not.toBeInTheDocument();
  });

  it("sesiunea expirată se numește pe nume, nu „nu am putut încărca”", async () => {
    listDocuments.mockRejectedValue(new ApiError(401, "unauthenticated"));
    render(<DocsPage />);

    expect(await screen.findByRole("alert")).toHaveTextContent(/sesiunea a expirat/i);
  });

  it("[blocant] un răspuns întârziat al unei căutări vechi nu suprascrie rezultatul nou", async () => {
    // Prima încărcare (fără filtru) se întoarce lent; căutarea de după se întoarce repede.
    let releaseFirst: (v: DocListItem[]) => void = () => {};
    listDocuments.mockImplementationOnce(
      () => new Promise<DocListItem[]>((resolve) => { releaseFirst = resolve; })
    );
    render(<DocsPage />);

    listDocuments.mockResolvedValue([doc("nou", "Contract de prestări servicii")]);
    await userEvent.type(screen.getByLabelText(/Caută după titlu/i), "contract");
    expect(await screen.findByText("ACT-nou")).toBeInTheDocument();

    // Răspunsul vechi ajunge ACUM — nu are dreptul să înlocuiască lista filtrată.
    releaseFirst([doc("vechi", "Act vechi, nefiltrat")]);
    await waitFor(() => expect(screen.getByText("ACT-nou")).toBeInTheDocument());
    expect(screen.queryByText("ACT-vechi")).not.toBeInTheDocument();
  });

  it("căutarea nu mai trimite o cerere pe literă (debounce)", async () => {
    listDocuments.mockResolvedValue([]);
    render(<DocsPage />);
    await screen.findByText("Niciun act încă");
    const callsAfterMount = listDocuments.mock.calls.length;

    await userEvent.type(screen.getByLabelText(/Caută după titlu/i), "contract");
    await waitFor(() =>
      expect(listDocuments).toHaveBeenLastCalledWith(expect.objectContaining({ q: "contract" }))
    );
    // 8 litere → o singură cerere în plus, nu opt.
    expect(listDocuments.mock.calls.length - callsAfterMount).toBeLessThanOrEqual(2);
  });
});
