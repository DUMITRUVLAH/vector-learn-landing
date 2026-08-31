/**
 * DG-109 — formularul de completare.
 *
 * Ce demonstrează testele, în ordinea valorii:
 *  1. formularul NU cere rechizite: alegi furnizorul și ele apar (din registru), iar către server
 *     pleacă doar id-ul lui — asta e diferența dintre 2 minute și 15;
 *  2. totalul se calculează din poziții și se trimite ca poziții, nu ca sumă „de încredere";
 *  3. ciorna se salvează singură;
 *  4. un act finalizat se deschide în citire — fără butoane care oricum ar primi 409.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { DocDetail } from "@/lib/api/docs";

const navigate = vi.fn();
let currentPath = "/business/par/documente/nou";

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

vi.mock("@/router/HashRouter", () => ({
  useRouter: () => ({ path: currentPath, navigate }),
  Link: ({ to, children, ...rest }: { to: string; children: React.ReactNode; [k: string]: unknown }) => (
    <a href={`#${to}`} {...rest}>
      {children}
    </a>
  ),
}));

const VENDOR = {
  id: "v1",
  name: 'SRL "Tehnica Nouă"',
  idnp: "1234567890123",
  iban: "MD48ML000002259A19498121",
  bank: "BC Moldindconbank SA",
  legalAddress: "mun. Chișinău, bd. Dacia 45",
};

const createVendor = vi.fn();

vi.mock("@/lib/api/par", () => ({
  listProjects: vi.fn().mockResolvedValue({ items: [{ id: "p1", name: "Digital Skills 2026" }] }),
  createVendor: (...a: unknown[]) => createVendor(...a),
}));

/** Panoul de furnizor nou vorbește direct cu API-ul (parsare + registru). */
const apiMock = vi.fn();
vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return { ...actual, api: (...a: unknown[]) => apiMock(...a) };
});

const listDocTemplates = vi.fn();
const getDocument = vi.fn();
const createDocument = vi.fn();
const updateDocument = vi.fn();
const finalizeDocument = vi.fn();
const searchParties = vi.fn();
const importPartiesFromPar = vi.fn();
const convertDocumentToPar = vi.fn();
const emailDocument = vi.fn();
const downloadDocumentPdf = vi.fn();

const ensureStoredPdf = vi.fn();
const fetchPrintable = vi.fn();

vi.mock("@/lib/docs/documentPdfClient", () => ({
  downloadDocumentPdf: (...a: unknown[]) => downloadDocumentPdf(...a),
  ensureStoredPdf: (...a: unknown[]) => ensureStoredPdf(...a),
  fetchPrintable: (...a: unknown[]) => fetchPrintable(...a),
}));
const getDocumentTrail = vi.fn();
const listDerivableKinds = vi.fn();
const deriveDocument = vi.fn();

vi.mock("@/lib/api/docs", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api/docs")>("@/lib/api/docs");
  return {
    ...actual,
    listDocTemplates: (...a: unknown[]) => listDocTemplates(...a),
    getDocument: (...a: unknown[]) => getDocument(...a),
    createDocument: (...a: unknown[]) => createDocument(...a),
    updateDocument: (...a: unknown[]) => updateDocument(...a),
    finalizeDocument: (...a: unknown[]) => finalizeDocument(...a),
    searchParties: (...a: unknown[]) => searchParties(...a),
    importPartiesFromPar: (...a: unknown[]) => importPartiesFromPar(...a),
    convertDocumentToPar: (...a: unknown[]) => convertDocumentToPar(...a),
    emailDocument: (...a: unknown[]) => emailDocument(...a),
    getDocumentTrail: (...a: unknown[]) => getDocumentTrail(...a),
    listDerivableKinds: (...a: unknown[]) => listDerivableKinds(...a),
    deriveDocument: (...a: unknown[]) => deriveDocument(...a),
  };
});

const { DocEditorPage } = await import("@/pages/business/docs/DocEditorPage");

const FINAL_DOC: DocDetail = {
  id: "doc-1",
  kind: "act_primire_predare",
  docNumber: "ACT-2026-0007",
  docDate: "2026-03-12T00:00:00.000Z",
  title: "Act de primire-predare — echipament",
  status: "final",
  projectId: null,
  counterpartyId: "v1",
  counterpartyName: 'SRL "Tehnica Nouă"',
  totalCents: 2450000,
  currency: "MDL",
  finalizedAt: "2026-03-12T10:00:00.000Z",
  cancelledAt: null,
  bodyHtml: "<p>Act</p>",
  bodyHash: "a".repeat(64),
  cancelReason: null,
  templateId: null,
  counterpartySnapshot: {},
  context: {},
  lines: [
    {
      id: "l1",
      position: 1,
      description: "Laptop Dell",
      unit: "buc",
      quantity: 2,
      unitPriceCents: 1225000,
      lineTotalCents: 2450000,
      vatPercent: 0,
    },
  ],
  audit: [],
};

beforeEach(() => {
  vi.clearAllMocks();
  currentPath = "/business/par/documente/nou";
  apiMock.mockResolvedValue({
    name: "SRL Alfa",
    idnp: "1002600012345",
    iban: "MD24AG000225100013104168",
    bank: "BC Moldova-Agroindbank SA",
    bic_swift: "AGRNMD2X",
    vat_code: null,
  });
  createVendor.mockResolvedValue({
    id: "v-new",
    name: "SRL Alfa",
    idnp: "1002600012345",
    iban: "MD24AG000225100013104168",
    bank: "BC Moldova-Agroindbank SA",
    legalAddress: null,
  });
  searchParties.mockResolvedValue({
    items: [
      {
        id: "v1",
        name: 'SRL "Tehnica Nouă"',
        idno: "1234567890123",
        iban: "MD48ML000002259A19498121",
        bank: "BC Moldindconbank SA",
        address: "mun. Chișinău, bd. Dacia 45",
        administrator: "Andrei Rusu",
        source: "registry",
      },
    ],
    total: 1,
  });
  createVendor.mockResolvedValue({ id: "v-new", name: "SRL Nou" });
  listDocTemplates.mockResolvedValue([
    { id: "tpl-1", name: "Act de primire-predare", kind: "act_primire_predare", category: null, isSystem: true, version: 1, placeholders: [], updatedAt: "" },
  ]);
  createDocument.mockResolvedValue({ ...FINAL_DOC, id: "doc-new", status: "draft", docNumber: null, missing: [] });
  getDocumentTrail.mockResolvedValue({ document: FINAL_DOC, basedOn: [], derived: [], paymentRequests: [] });
  listDerivableKinds.mockResolvedValue({ kinds: [] });
  updateDocument.mockResolvedValue({ ...FINAL_DOC, status: "draft", docNumber: null, missing: [] });
});

describe("DG-109 — completarea unui act", () => {
  it("[blocant] câmpurile furnizorului sunt LA VEDERE, nu ascunse după o căutare", async () => {
    // Cerința owner-ului: „să fie obvious, nu să apeși contraparte, să cauți și după să apară să
    // adaugi info". Deci: câmpurile există din prima, fără niciun click.
    render(<DocEditorPage />);

    expect(await screen.findByLabelText(/Denumirea furnizorului/)).toBeInTheDocument();
    expect(screen.getByLabelText("Cod fiscal (IDNO/IDNP)")).toBeInTheDocument();
    expect(screen.getByLabelText("IBAN")).toBeInTheDocument();
    expect(screen.getByLabelText("Banca")).toBeInTheDocument();
    // Și nicăieri cuvântul „contraparte" pe ecran.
    expect(screen.queryByText(/[Cc]ontrapart/)).toBeNull();
  });

  it("[blocant] actul nou pornește cu șablonul tipului, nu „fără șablon”", async () => {
    render(<DocEditorPage />);
    const select = await screen.findByLabelText("Șablon");
    await waitFor(() => expect((select as HTMLSelectElement).value).toBe("tpl-1"));
  });

  it("[blocant] alegerea din căutare completează toate rechizitele dintr-o dată", async () => {
    render(<DocEditorPage />);

    await userEvent.type(
      await screen.findByLabelText(/Caută în registru și în cererile de plată/),
      "Teh"
    );
    await waitFor(() => expect(searchParties).toHaveBeenCalledWith("Teh"));
    await userEvent.click(await screen.findByRole("button", { name: /Tehnica Nouă/ }));

    expect(screen.getByLabelText(/Denumirea furnizorului/)).toHaveValue('SRL "Tehnica Nouă"');
    expect(screen.getByLabelText("IBAN")).toHaveValue("MD48ML000002259A19498121");
    expect(screen.getByLabelText("Banca")).toHaveValue("BC Moldindconbank SA");
  });

  it("[blocant] căutarea găsește și beneficiarii care există doar pe cereri de plată", async () => {
    searchParties.mockResolvedValue({
      items: [
        { id: null, name: "II Plătit Cândva", idno: "2002", iban: "MD24AG000225100013104168", bank: null, address: null, administrator: null, source: "par" },
      ],
      total: 1,
    });
    render(<DocEditorPage />);

    await userEvent.type(await screen.findByLabelText(/Caută în registru/), "Plat");
    const option = await screen.findByRole("button", { name: /II Plătit Cândva/ });
    expect(within(option).getByText(/din cereri de plată/)).toBeInTheDocument();

    await userEvent.click(option);
    expect(screen.getByLabelText(/Denumirea furnizorului/)).toHaveValue("II Plătit Cândva");
  });

  it("[blocant] furnizorul scris de mână se salvează în registru la prima salvare", async () => {
    render(<DocEditorPage />);

    await userEvent.type(await screen.findByLabelText("Titlul actului"), "Act nou");
    await userEvent.type(screen.getByLabelText(/Denumirea furnizorului/), "SRL Nou");
    await userEvent.type(screen.getByLabelText("IBAN"), "MD48ML000002259A19498121");
    await userEvent.click(screen.getByRole("button", { name: "Salvează ciorna" }));

    await waitFor(() => expect(createVendor).toHaveBeenCalled());
    expect((createVendor.mock.calls[0][0] as { name: string }).name).toBe("SRL Nou");
  });

  it("[blocant] fără bifă, furnizorul NU intră în registru", async () => {
    render(<DocEditorPage />);
    await userEvent.type(await screen.findByLabelText("Titlul actului"), "Act nou");
    await userEvent.type(screen.getByLabelText(/Denumirea furnizorului/), "SRL Unic");
    await userEvent.click(screen.getByLabelText(/Salvează furnizorul în registru/));
    await userEvent.click(screen.getByRole("button", { name: "Salvează ciorna" }));

    await waitFor(() => expect(createDocument).toHaveBeenCalled());
    expect(createVendor).not.toHaveBeenCalled();
  });

  it("[blocant] datele furnizorului pleacă la server, nu doar rămân pe ecran", async () => {
    render(<DocEditorPage />);
    await userEvent.type(await screen.findByLabelText("Titlul actului"), "Act laptopuri");
    await userEvent.type(screen.getByLabelText(/Denumirea furnizorului/), "SRL Nou");
    await userEvent.type(screen.getByLabelText("Cod fiscal (IDNO/IDNP)"), "1002003004005");
    await userEvent.type(screen.getByLabelText("Denumirea poziției 1"), "Laptop Dell");
    await userEvent.clear(screen.getByLabelText("Cantitatea 1"));
    await userEvent.type(screen.getByLabelText("Cantitatea 1"), "2");
    await userEvent.type(screen.getByLabelText("Prețul unitar 1"), "12250,00");
    await userEvent.click(screen.getByRole("button", { name: "Salvează ciorna" }));

    await waitFor(() => expect(createDocument).toHaveBeenCalled());
    const payload = createDocument.mock.calls[0][0] as {
      counterparty: { kind: string; name: string; snapshot: Record<string, string> };
      lines: { description: string; quantity: number; unitPriceCents: number }[];
    };
    expect(payload.counterparty.name).toBe("SRL Nou");
    expect(payload.counterparty.snapshot.idno).toBe("1002003004005");
    expect(payload.lines).toEqual([
      { description: "Laptop Dell", unit: "buc", quantity: 2, unitPriceCents: 1225000 },
    ]);
  });

  it("[blocant] totalul se vede în timp real din poziții", async () => {
    render(<DocEditorPage />);
    await userEvent.type(await screen.findByLabelText("Denumirea poziției 1"), "Laptop");
    await userEvent.clear(screen.getByLabelText("Cantitatea 1"));
    await userEvent.type(screen.getByLabelText("Cantitatea 1"), "2");
    await userEvent.type(screen.getByLabelText("Prețul unitar 1"), "12250");

    expect(await screen.findByText(/24\.500,00 MDL/)).toBeInTheDocument();
  });

  it("[blocant] ce lipsește se scrie pe ecran, în cuvinte, nu la finalizare", async () => {
    createDocument.mockResolvedValue({
      ...FINAL_DOC,
      id: "doc-new",
      status: "draft",
      missing: ["contraparte.iban", "contraparte.banca"],
    });
    render(<DocEditorPage />);

    await userEvent.type(await screen.findByLabelText("Titlul actului"), "Act");
    await userEvent.click(screen.getByRole("button", { name: "Salvează ciorna" }));

    expect(await screen.findByText(/Mai lipsesc/)).toBeInTheDocument();
    expect(screen.getByText("IBAN furnizor")).toBeInTheDocument();
    expect(screen.getByText("Banca furnizorului")).toBeInTheDocument();
  });

  it("[blocant] un act finalizat se deschide în citire, fără câmpuri editabile", async () => {
    currentPath = "/business/par/documente/doc-1";
    getDocument.mockResolvedValue(FINAL_DOC);
    render(<DocEditorPage />);

    await waitFor(() => expect(getDocument).toHaveBeenCalledWith("doc-1"));
    expect(await screen.findByLabelText("Titlul actului")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Salvează ciorna" })).toBeDisabled();
    expect(screen.getByRole("button", { name: /Finalizează/ })).toBeDisabled();
  });

  it("[blocant] după finalizare rămâi pe act și vezi numărul primit", async () => {
    currentPath = "/business/par/documente/doc-1";
    // Prima citire = ciornă; a doua (după finalizare) = actul cu număr.
    getDocument
      .mockResolvedValueOnce({ ...FINAL_DOC, status: "draft", docNumber: null })
      .mockResolvedValue(FINAL_DOC);
    finalizeDocument.mockResolvedValue(FINAL_DOC);
    render(<DocEditorPage />);

    await waitFor(() => expect(getDocument).toHaveBeenCalled());
    await userEvent.click(await screen.findByRole("button", { name: /Finalizează/ }));

    await waitFor(() => expect(finalizeDocument).toHaveBeenCalledWith("doc-1"));
    // Rămânem pe act: numărul și acțiunile noi apar aici, nu în listă.
    expect(await screen.findByText(/Act finalizat: ACT-2026-0007/)).toBeInTheDocument();
    expect(navigate).not.toHaveBeenCalledWith("/business/par/documente");
  });

  it("[blocant] după finalizare actul se RECITEȘTE — răspunsul brut n-are jurnal și albea pagina", async () => {
    currentPath = "/business/par/documente/doc-1";
    getDocument.mockResolvedValue({ ...FINAL_DOC, status: "draft", docNumber: null });
    // Exact forma răspunsului serverului la finalize: rândul din tabel, fără `audit`/`lines`.
    finalizeDocument.mockResolvedValue({ id: "doc-1", status: "final", docNumber: "ACT-2026-0007" });
    render(<DocEditorPage />);

    await waitFor(() => expect(getDocument).toHaveBeenCalledTimes(1));
    await userEvent.click(await screen.findByRole("button", { name: /Finalizează/ }));

    await waitFor(() => expect(finalizeDocument).toHaveBeenCalled());
    // A doua citire = starea completă; fără ea, `doc.audit.length` arunca și pagina se albea.
    await waitFor(() => expect(getDocument).toHaveBeenCalledTimes(2));
  });

  it("[blocant] un refuz de finalizare arată exact ce lipsește", async () => {
    currentPath = "/business/par/documente/doc-1";
    getDocument.mockResolvedValue({ ...FINAL_DOC, status: "draft", docNumber: null });
    finalizeDocument.mockRejectedValue(
      Object.assign(new Error("incomplete"), {
        body: { error: "incomplete", missing: ["Cel puțin o poziție în act"] },
      })
    );
    render(<DocEditorPage />);

    await waitFor(() => expect(getDocument).toHaveBeenCalled());
    await userEvent.click(await screen.findByRole("button", { name: /Finalizează/ }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/Cel puțin o poziție în act/);
    expect(navigate).not.toHaveBeenCalledWith("/business/par/documente");
  });

  it("[normal] pozițiile se adaugă și se șterg", async () => {
    render(<DocEditorPage />);
    await userEvent.click(await screen.findByRole("button", { name: /Adaugă poziție/ }));
    expect(screen.getByLabelText("Denumirea poziției 2")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Șterge poziția 2" }));
    expect(screen.queryByLabelText("Denumirea poziției 2")).toBeNull();
  });

  it("[blocant] beneficiarii din cereri se pot aduce în registru dintr-o apăsare", async () => {
    importPartiesFromPar.mockResolvedValue({ imported: 7 });
    render(<DocEditorPage />);

    await userEvent.click(
      await screen.findByRole("button", { name: /Adu în registru toți beneficiarii/i })
    );
    await waitFor(() => expect(importPartiesFromPar).toHaveBeenCalled());
    expect(await screen.findByText(/7 beneficiari/)).toBeInTheDocument();
  });
});

describe("DG-117 — actul devine cerere de plată", () => {
  it("[blocant] butonul apare doar pe un act finalizat și duce la PAR-ul creat", async () => {
    currentPath = "/business/par/documente/doc-1";
    // Pe ciornă butonul nu are ce căuta: nu poți cere plata pentru un act nesemnat.
    getDocument.mockResolvedValue({ ...FINAL_DOC, status: "draft", docNumber: null });
    const draftView = render(<DocEditorPage />);
    await waitFor(() => expect(getDocument).toHaveBeenCalled());
    expect(screen.queryByRole("button", { name: /cerere de plată/i })).toBeNull();
    draftView.unmount();

    getDocument.mockResolvedValue(FINAL_DOC);
    convertDocumentToPar.mockResolvedValue({ parId: "par-9", requestNo: "PAR-2026-0009", attachmentAdded: true });
    render(<DocEditorPage />);

    await userEvent.click(await screen.findByRole("button", { name: /Transformă în cerere de plată/i }));
    await waitFor(() => expect(convertDocumentToPar).toHaveBeenCalledWith("doc-1"));
    expect(navigate).toHaveBeenCalledWith("/business/par/par-9");
  });

  it("[blocant] a doua cerere din același act se face doar după confirmare", async () => {
    currentPath = "/business/par/documente/doc-1";
    getDocument.mockResolvedValue(FINAL_DOC);
    convertDocumentToPar
      .mockRejectedValueOnce(
        Object.assign(new Error("already"), { body: { error: "already_converted", parId: "par-1" } })
      )
      .mockResolvedValueOnce({ parId: "par-2", requestNo: "PAR-2026-0010", attachmentAdded: true });
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<DocEditorPage />);

    await userEvent.click(await screen.findByRole("button", { name: /Transformă în cerere de plată/i }));
    await waitFor(() => expect(confirmSpy).toHaveBeenCalled());
    await waitFor(() => expect(convertDocumentToPar).toHaveBeenLastCalledWith("doc-1", true));
    expect(navigate).toHaveBeenCalledWith("/business/par/par-2");
    confirmSpy.mockRestore();
  });

  it("[blocant] dacă omul refuză confirmarea, nu se creează nimic", async () => {
    currentPath = "/business/par/documente/doc-1";
    getDocument.mockResolvedValue(FINAL_DOC);
    convertDocumentToPar.mockRejectedValue(
      Object.assign(new Error("already"), { body: { error: "already_converted", parId: "par-1" } })
    );
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<DocEditorPage />);

    await userEvent.click(await screen.findByRole("button", { name: /Transformă în cerere de plată/i }));
    await waitFor(() => expect(confirmSpy).toHaveBeenCalled());
    expect(convertDocumentToPar).toHaveBeenCalledTimes(1);
    expect(navigate).not.toHaveBeenCalledWith(expect.stringContaining("/business/par/"));
    confirmSpy.mockRestore();
  });
});


describe("DG-116 + DG-119 — actele derivate și traseul", () => {
  it("[blocant] traseul arată contractul-sursă și cererea de plată, cu linkuri reale", async () => {
    currentPath = "/business/par/documente/doc-1";
    getDocument.mockResolvedValue(FINAL_DOC);
    getDocumentTrail.mockResolvedValue({
      document: FINAL_DOC,
      basedOn: [
        { id: "ctr-1", kind: "contract_servicii", docNumber: "CTR-2026-0003", title: "Contract", status: "final", totalCents: 0, currency: "MDL" },
      ],
      derived: [],
      paymentRequests: [
        { id: "par-7", requestNo: "PAR-2026-0007", status: "approved", totalEstimatedCents: 2450000, currency: "MDL", paidAt: null, approvedAt: "2026-03-14T00:00:00.000Z" },
      ],
    });
    render(<DocEditorPage />);

    const trail = await screen.findByRole("region", { name: "Traseul actului" });
    expect(within(trail).getByText("CTR-2026-0003")).toHaveAttribute("href", "#/business/par/documente/ctr-1");
    expect(within(trail).getByText("PAR-2026-0007")).toHaveAttribute("href", "#/business/par/par-7");
    // Starea se spune omenește: „aprobată", nu „approved".
    expect(within(trail).getByText(/aprobată/)).toBeInTheDocument();
  });

  it("[blocant] alegerea unui tip derivat creează actul și te duce la el", async () => {
    currentPath = "/business/par/documente/doc-1";
    getDocument.mockResolvedValue(FINAL_DOC);
    listDerivableKinds.mockResolvedValue({ kinds: ["act_primire_predare", "proces_verbal"] });
    deriveDocument.mockResolvedValue({ ...FINAL_DOC, id: "doc-derived", status: "draft" });
    render(<DocEditorPage />);

    const select = await screen.findByLabelText(/Creează act pe baza acestuia/i);
    await userEvent.selectOptions(select, "proces_verbal");

    await waitFor(() => expect(deriveDocument).toHaveBeenCalledWith("doc-1", "proces_verbal"));
    expect(navigate).toHaveBeenCalledWith("/business/par/documente/doc-derived");
  });

  it("[normal] pe o ciornă nu se oferă derivare — n-are ce moșteni încă", async () => {
    currentPath = "/business/par/documente/doc-1";
    getDocument.mockResolvedValue({ ...FINAL_DOC, status: "draft", docNumber: null });
    render(<DocEditorPage />);
    await waitFor(() => expect(getDocument).toHaveBeenCalled());
    expect(listDerivableKinds).not.toHaveBeenCalled();
    expect(screen.queryByLabelText(/Creează act pe baza acestuia/i)).toBeNull();
  });
});


describe("DG-123 — jurnalul actului, în cuvinte", () => {
  it("[blocant] acțiunile apar traduse, nu ca nume tehnice", async () => {
    currentPath = "/business/par/documente/doc-1";
    getDocument.mockResolvedValue({
      ...FINAL_DOC,
      audit: [
        { id: "a1", action: "created", createdAt: "2026-03-12T09:00:00.000Z", details: {} },
        { id: "a2", action: "finalized", createdAt: "2026-03-12T10:00:00.000Z", details: {} },
        { id: "a3", action: "converted_to_par", createdAt: "2026-03-13T08:00:00.000Z", details: {} },
      ],
    });
    render(<DocEditorPage />);

    const journal = await screen.findByRole("region", { name: "Jurnalul actului" });
    expect(within(journal).getByText(/a creat actul/)).toBeInTheDocument();
    expect(within(journal).getByText(/a finalizat actul/)).toBeInTheDocument();
    expect(within(journal).getByText(/a transformat actul în cerere de plată/)).toBeInTheDocument();
    expect(within(journal).queryByText(/converted_to_par/)).toBeNull();
  });
});


describe("DG-114 — sigiliul, în interfață", () => {
  it("[blocant] actul sigilat își arată amprenta, cel rupt strigă", async () => {
    currentPath = "/business/par/documente/doc-1";
    getDocument.mockResolvedValue({
      ...FINAL_DOC,
      integrity: { sealed: true, valid: true, hash: "a".repeat(64) },
    });
    const ok = render(<DocEditorPage />);
    expect(await screen.findByText(/Act sigilat/)).toBeInTheDocument();
    ok.unmount();

    getDocument.mockResolvedValue({
      ...FINAL_DOC,
      integrity: { sealed: true, valid: false, hash: "a".repeat(64) },
    });
    render(<DocEditorPage />);
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/nu mai corespunde amprentei/);
  });
});


describe("DG-115 — trimiterea pe email, din interfață", () => {
  it("[blocant] livrarea oprită de mediu se spune ca atare, nu ca eroare", async () => {
    currentPath = "/business/par/documente/doc-1";
    getDocument.mockResolvedValue(FINAL_DOC);
    emailDocument.mockResolvedValue({
      sent: false,
      reason: "blocked",
      message: "Mediul acesta nu trimite e-mailuri reale (protecție anti-trimitere din teste).",
    });
    ensureStoredPdf.mockResolvedValue(true);
    const promptSpy = vi.spyOn(window, "prompt").mockReturnValue("furnizor@example.com");
    render(<DocEditorPage />);

    await userEvent.click(await screen.findByRole("button", { name: /Trimite pe email/i }));
    await waitFor(() => expect(emailDocument).toHaveBeenCalledWith("doc-1", "furnizor@example.com"));

    expect(await screen.findByText(/nu trimite e-mailuri reale/)).toBeInTheDocument();
    // Nu e o eroare roșie: livrarea a fost oprită deliberat, nu a eșuat.
    expect(screen.queryByRole("alert")).toBeNull();
    promptSpy.mockRestore();
  });

  it("[blocant] PDF-ul se generează ÎNAINTE de trimitere, ca actul să chiar ajungă atașat", async () => {
    currentPath = "/business/par/documente/doc-1";
    getDocument.mockResolvedValue(FINAL_DOC);
    ensureStoredPdf.mockResolvedValue(true);
    emailDocument.mockResolvedValue({ sent: true, to: "furnizor@example.com" });
    const promptSpy = vi.spyOn(window, "prompt").mockReturnValue("furnizor@example.com");
    render(<DocEditorPage />);

    await userEvent.click(await screen.findByRole("button", { name: /Trimite pe email/i }));
    await waitFor(() => expect(ensureStoredPdf).toHaveBeenCalledWith("doc-1"));
    // Ordinea contează: mai întâi actul, apoi plicul.
    expect(ensureStoredPdf.mock.invocationCallOrder[0]).toBeLessThan(
      emailDocument.mock.invocationCallOrder[0]
    );
    promptSpy.mockRestore();
  });

  it("[blocant] trimiterea reușită confirmă destinatarul", async () => {
    currentPath = "/business/par/documente/doc-1";
    getDocument.mockResolvedValue(FINAL_DOC);
    emailDocument.mockResolvedValue({ sent: true, to: "furnizor@example.com" });
    ensureStoredPdf.mockResolvedValue(true);
    const promptSpy = vi.spyOn(window, "prompt").mockReturnValue("furnizor@example.com");
    render(<DocEditorPage />);

    await userEvent.click(await screen.findByRole("button", { name: /Trimite pe email/i }));
    expect(await screen.findByText(/a plecat către furnizor@example.com/)).toBeInTheDocument();
    promptSpy.mockRestore();
  });

  it("[normal] pe o ciornă nu se oferă trimiterea — se trimite ce e semnat", async () => {
    currentPath = "/business/par/documente/doc-1";
    getDocument.mockResolvedValue({ ...FINAL_DOC, status: "draft", docNumber: null });
    render(<DocEditorPage />);
    await waitFor(() => expect(getDocument).toHaveBeenCalled());
    expect(screen.queryByRole("button", { name: /Trimite pe email/i })).toBeNull();
  });
});


describe("Fix prod — PDF-ul se face în browser, contrapartea se poate adăuga oricând", () => {
  it("[blocant] „Descarcă PDF” generează fișierul, nu deschide o pagină HTML", async () => {
    currentPath = "/business/par/documente/doc-1";
    getDocument.mockResolvedValue(FINAL_DOC);
    downloadDocumentPdf.mockResolvedValue(true);
    render(<DocEditorPage />);

    // E buton, nu link: un <a> către API întorcea HTML pe producție (chromium lipsește pe Vercel).
    const btn = await screen.findByRole("button", { name: /Descarcă PDF/i });
    await userEvent.click(btn);
    await waitFor(() => expect(downloadDocumentPdf).toHaveBeenCalledWith("doc-1"));
  });

  it("[blocant] eșecul randării spune ce să faci, nu lasă butonul mut", async () => {
    currentPath = "/business/par/documente/doc-1";
    getDocument.mockResolvedValue(FINAL_DOC);
    downloadDocumentPdf.mockRejectedValue(new Error("canvas failed"));
    render(<DocEditorPage />);

    await userEvent.click(await screen.findByRole("button", { name: /Descarcă PDF/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/nu a putut fi generat/);
  });


});

/**
 * Previzualizarea — cerința owner-ului: „trebuie să fie previzualizează".
 *
 * Ce demonstrează, în ordinea valorii:
 *  1. butonul CHEAMĂ serverul și afișează foaia (nu doar deschide un dialog gol — §3.5.1quater:
 *     se testează acțiunea, nu afișarea controlului);
 *  2. ciorna nesalvată se salvează ÎNAINTE, altfel previzualizarea ar arăta varianta veche;
 *  3. actul finalizat se previzualizează fără să încerce o salvare (ar primi 409);
 *  4. HTML-ul intră în `<iframe>`, cu marginile paginii — nu injectat în pagina aplicației.
 */
describe("Previzualizarea actului", () => {
  const PRINTABLE = {
    html: '<!doctype html><html><head><style>body{margin:0}</style></head><body><h1>Act de primire-predare</h1></body></html>',
    fileName: "ACT-2026-0007.pdf",
    hasStoredPdf: false,
    status: "draft",
  };

  it("[blocant] „Previzualizează” cere foaia de la server și o arată în iframe", async () => {
    currentPath = "/business/par/documente/doc-1";
    getDocument.mockResolvedValue({ ...FINAL_DOC, status: "draft", docNumber: null });
    fetchPrintable.mockResolvedValue(PRINTABLE);
    render(<DocEditorPage />);

    await userEvent.click(await screen.findByRole("button", { name: /Previzualizează/i }));

    await waitFor(() => expect(fetchPrintable).toHaveBeenCalledWith("doc-1"));
    const frame = await screen.findByTitle("Previzualizarea actului");
    expect(frame).toBeInTheDocument();
    const srcDoc = frame.getAttribute("srcdoc") ?? "";
    expect(srcDoc).toContain("Act de primire-predare");
    // Marginile foii sunt adăugate pe ecran: `@page` nu se aplică nici în iframe, nici la PDF.
    expect(srcDoc).toContain("padding:18mm 16mm 20mm 16mm");
  });

  it("[blocant] ciorna nesalvată se salvează ÎNAINTE de previzualizare — altfel arată varianta veche", async () => {
    currentPath = "/business/par/documente/doc-1";
    getDocument.mockResolvedValue({ ...FINAL_DOC, status: "draft", docNumber: null });
    const order: string[] = [];
    updateDocument.mockImplementation(async () => {
      order.push("save");
      return { ...FINAL_DOC, status: "draft", docNumber: null, missing: [] };
    });
    fetchPrintable.mockImplementation(async () => {
      order.push("print");
      return PRINTABLE;
    });
    render(<DocEditorPage />);

    await userEvent.type(await screen.findByLabelText("Titlul actului"), "!");
    await userEvent.click(screen.getByRole("button", { name: /Previzualizează/i }));

    await waitFor(() => expect(order).toContain("print"));
    expect(order[0]).toBe("save");
  });

  it("[blocant] actul finalizat se previzualizează fără să încerce o salvare", async () => {
    currentPath = "/business/par/documente/doc-1";
    getDocument.mockResolvedValue(FINAL_DOC);
    fetchPrintable.mockResolvedValue({ ...PRINTABLE, status: "final" });
    render(<DocEditorPage />);

    await userEvent.click(await screen.findByRole("button", { name: /Previzualizează/i }));

    await waitFor(() => expect(fetchPrintable).toHaveBeenCalledWith("doc-1"));
    expect(updateDocument).not.toHaveBeenCalled();
  });

  it("[blocant] din previzualizare descarci PDF-ul, fără să închizi dialogul", async () => {
    currentPath = "/business/par/documente/doc-1";
    getDocument.mockResolvedValue(FINAL_DOC);
    fetchPrintable.mockResolvedValue({ ...PRINTABLE, status: "final" });
    downloadDocumentPdf.mockResolvedValue(true);
    render(<DocEditorPage />);

    await userEvent.click(await screen.findByRole("button", { name: /Previzualizează/i }));
    const dialog = await screen.findByRole("dialog");
    await userEvent.click(within(dialog).getByRole("button", { name: /Descarcă PDF/i }));

    await waitFor(() => expect(downloadDocumentPdf).toHaveBeenCalledWith("doc-1"));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("[blocant] dacă foaia nu se poate face, dialogul nu rămâne gol — spune ce s-a întâmplat", async () => {
    currentPath = "/business/par/documente/doc-1";
    getDocument.mockResolvedValue(FINAL_DOC);
    fetchPrintable.mockRejectedValue(new Error("print failed"));
    render(<DocEditorPage />);

    await userEvent.click(await screen.findByRole("button", { name: /Previzualizează/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/Previzualizarea nu a putut fi generată/);
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
