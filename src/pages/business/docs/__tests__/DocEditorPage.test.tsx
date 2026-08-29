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
let currentPath = "/business/docs/nou";

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
  listVendors: vi.fn().mockResolvedValue({ items: [VENDOR] }),
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

vi.mock("@/lib/api/docs", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api/docs")>("@/lib/api/docs");
  return {
    ...actual,
    listDocTemplates: (...a: unknown[]) => listDocTemplates(...a),
    getDocument: (...a: unknown[]) => getDocument(...a),
    createDocument: (...a: unknown[]) => createDocument(...a),
    updateDocument: (...a: unknown[]) => updateDocument(...a),
    finalizeDocument: (...a: unknown[]) => finalizeDocument(...a),
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
  currentPath = "/business/docs/nou";
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
  listDocTemplates.mockResolvedValue([
    { id: "tpl-1", name: "Act de primire-predare", kind: "act_primire_predare", category: null, isSystem: true, version: 1, placeholders: [], updatedAt: "" },
  ]);
  createDocument.mockResolvedValue({ ...FINAL_DOC, id: "doc-new", status: "draft", docNumber: null, missing: [] });
  updateDocument.mockResolvedValue({ ...FINAL_DOC, status: "draft", docNumber: null, missing: [] });
});

describe("DG-109 — completarea unui act", () => {
  it("[blocant] furnizorul ales își arată rechizitele, iar formularul nu le cere tastate", async () => {
    render(<DocEditorPage />);

    const search = await screen.findByLabelText("Contrapartea");
    await userEvent.type(search, "Teh");
    await userEvent.click(await screen.findByRole("button", { name: /Tehnica Nouă/ }));

    // Rechizitele apar — dar ca informație, nu ca formular de completat.
    expect(await screen.findByText("MD48ML000002259A19498121")).toBeInTheDocument();
    expect(screen.getByText("1234567890123")).toBeInTheDocument();
    expect(screen.queryByLabelText(/IBAN/i), "nu există câmp de IBAN de completat").toBeNull();
  });

  it("[blocant] către server pleacă id-ul furnizorului și pozițiile, nu rechizitele și nu totalul", async () => {
    render(<DocEditorPage />);

    await userEvent.type(await screen.findByLabelText("Titlul actului"), "Act laptopuri");
    await userEvent.type(screen.getByLabelText("Contrapartea"), "Teh");
    await userEvent.click(await screen.findByRole("button", { name: /Tehnica Nouă/ }));
    await userEvent.type(screen.getByLabelText("Denumirea poziției 1"), "Laptop Dell");
    await userEvent.clear(screen.getByLabelText("Cantitatea 1"));
    await userEvent.type(screen.getByLabelText("Cantitatea 1"), "2");
    await userEvent.type(screen.getByLabelText("Prețul unitar 1"), "12250,00");

    await userEvent.click(screen.getByRole("button", { name: "Salvează ciorna" }));

    await waitFor(() => expect(createDocument).toHaveBeenCalled());
    const payload = createDocument.mock.calls[0][0] as {
      counterparty: { kind: string; id: string };
      lines: { description: string; quantity: number; unitPriceCents: number }[];
      totalCents?: number;
    };
    expect(payload.counterparty).toEqual({ kind: "vendor", id: "v1" });
    expect(payload.lines).toEqual([
      { description: "Laptop Dell", unit: "buc", quantity: 2, unitPriceCents: 1225000 },
    ]);
    expect(payload.totalCents, "totalul e treaba serverului").toBeUndefined();
    expect(JSON.stringify(payload)).not.toContain("MD48ML000002259A19498121");
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
    expect(screen.getByText("IBAN contraparte")).toBeInTheDocument();
    expect(screen.getByText("Banca contrapărții")).toBeInTheDocument();
  });

  it("[blocant] un act finalizat se deschide în citire, fără câmpuri editabile", async () => {
    currentPath = "/business/docs/doc-1";
    getDocument.mockResolvedValue(FINAL_DOC);
    render(<DocEditorPage />);

    await waitFor(() => expect(getDocument).toHaveBeenCalledWith("doc-1"));
    expect(await screen.findByLabelText("Titlul actului")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Salvează ciorna" })).toBeDisabled();
    expect(screen.getByRole("button", { name: /Finalizează/ })).toBeDisabled();
  });

  it("[blocant] finalizarea cere serverului actul curent și duce înapoi în registru", async () => {
    currentPath = "/business/docs/doc-1";
    getDocument.mockResolvedValue({ ...FINAL_DOC, status: "draft", docNumber: null });
    finalizeDocument.mockResolvedValue(FINAL_DOC);
    render(<DocEditorPage />);

    await waitFor(() => expect(getDocument).toHaveBeenCalled());
    await userEvent.click(await screen.findByRole("button", { name: /Finalizează/ }));

    await waitFor(() => expect(finalizeDocument).toHaveBeenCalledWith("doc-1"));
    expect(navigate).toHaveBeenCalledWith("/business/docs");
  });

  it("[blocant] un refuz de finalizare arată exact ce lipsește", async () => {
    currentPath = "/business/docs/doc-1";
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
    expect(navigate).not.toHaveBeenCalledWith("/business/docs");
  });

  it("[normal] pozițiile se adaugă și se șterg", async () => {
    render(<DocEditorPage />);
    await userEvent.click(await screen.findByRole("button", { name: /Adaugă poziție/ }));
    expect(screen.getByLabelText("Denumirea poziției 2")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Șterge poziția 2" }));
    expect(screen.queryByLabelText("Denumirea poziției 2")).toBeNull();
  });
});

describe("DG-110 — furnizor nou fără să ieși din act", () => {
  it("[blocant] „Adaugă furnizor nou” apare când căutarea nu găsește nimic", async () => {
    render(<DocEditorPage />);
    await userEvent.type(await screen.findByLabelText("Contrapartea"), "Zzz");
    expect(await screen.findByRole("button", { name: /Adaugă furnizor nou/i })).toBeInTheDocument();
  });

  it("[blocant] rechizitele lipite se despart prin server, iar furnizorul salvat intră în act", async () => {
    render(<DocEditorPage />);
    await userEvent.type(await screen.findByLabelText("Contrapartea"), "Alfa");
    await userEvent.click(await screen.findByRole("button", { name: /Adaugă furnizor nou/i }));

    const panel = await screen.findByRole("region", { name: "Furnizor nou" });
    // Denumirea tastată în căutare se preia — nu se scrie de două ori.
    expect(within(panel).getByLabelText("Denumirea")).toHaveValue("Alfa");

    await userEvent.type(
      within(panel).getByLabelText("Rechizite lipite"),
      "SRL Alfa c.f. 1002600012345"
    );
    await userEvent.click(within(panel).getByRole("button", { name: /Despica rechizitele/i }));

    await waitFor(() => expect(apiMock).toHaveBeenCalledWith(
      "/api/par/vendors/actions/parse-requisites",
      expect.objectContaining({ method: "POST" })
    ));
    await waitFor(() =>
      expect(within(panel).getByLabelText("Cod fiscal (IDNO/IDNP)")).toHaveValue("1002600012345")
    );

    await userEvent.click(within(panel).getByRole("button", { name: /Salvează furnizorul/i }));
    await waitFor(() => expect(createVendor).toHaveBeenCalled());

    // Furnizorul nou e selectat imediat: rechizitele lui apar în act, fără reîncărcare.
    expect(await screen.findByText("MD24AG000225100013104168")).toBeInTheDocument();
  });

  it("[blocant] registrul indisponibil NU se raportează ca firmă inexistentă", async () => {
    apiMock.mockImplementation(async (url: string) => {
      if (url.includes("parse-requisites")) return {};
      throw new Error("registry down");
    });
    render(<DocEditorPage />);
    await userEvent.type(await screen.findByLabelText("Contrapartea"), "Zzz");
    await userEvent.click(await screen.findByRole("button", { name: /Adaugă furnizor nou/i }));

    const panel = await screen.findByRole("region", { name: "Furnizor nou" });
    await userEvent.type(within(panel).getByLabelText("Cod fiscal (IDNO/IDNP)"), "1002600012345");
    await userEvent.click(within(panel).getByRole("button", { name: /Verifică/i }));

    expect(await within(panel).findByText(/Registrul nu a răspuns/)).toBeInTheDocument();
    expect(within(panel).queryByText(/nu există/i)).toBeNull();
  });
});
