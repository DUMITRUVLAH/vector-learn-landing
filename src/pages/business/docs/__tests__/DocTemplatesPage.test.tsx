/**
 * DG-104 — editorul de șabloane.
 *
 * Testele urmăresc rezultatul, nu mecanica editorului: că bara de instrumente e accesibilă (fiecare
 * buton cu nume în română, altfel un om care navighează cu tastatura n-are ce apăsa), că vederea
 * sursă e o portiță reală (se poate corecta HTML direct), și — cel mai important — că salvarea
 * trimite corpul și tipul actului la API. Un editor care arată bine dar nu salvează nu e nimic.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("@/hooks/useBusinessSession", () => ({
  useBusinessSession: () => ({
    status: "authenticated",
    data: {
      user: { name: "Ana Jurist", role: "owner" },
      tenant: { name: "ATIC", slug: "atic", appKind: "business" },
    },
    logout: vi.fn(),
    refresh: vi.fn(),
    error: null,
  }),
}));

vi.mock("@/lib/api/par", () => ({
  listVendors: vi.fn().mockResolvedValue({
    items: [{ id: "v1", name: 'SRL "Tehnica Nouă"' }],
  }),
}));

vi.mock("@/router/HashRouter", () => ({
  useRouter: () => ({ path: "/business/docs/templates", navigate: vi.fn() }),
  Link: ({ to, children, ...rest }: { to: string; children: React.ReactNode; [k: string]: unknown }) => (
    <a href={`#${to}`} {...rest}>
      {children}
    </a>
  ),
}));


const listDocTemplates = vi.fn();
const cloneDocTemplate = vi.fn();
const listTemplateVersions = vi.fn();
const restoreTemplateVersion = vi.fn();
const previewDocTemplate = vi.fn();

vi.mock("@/lib/api/docs", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api/docs")>("@/lib/api/docs");
  return {
    ...actual,
    listDocTemplates: (...a: unknown[]) => listDocTemplates(...a),
    cloneDocTemplate: (...a: unknown[]) => cloneDocTemplate(...a),
    listTemplateVersions: (...a: unknown[]) => listTemplateVersions(...a),
    restoreTemplateVersion: (...a: unknown[]) => restoreTemplateVersion(...a),
    previewDocTemplate: (...a: unknown[]) => previewDocTemplate(...a),
  };
});

const listTemplates = vi.fn();
const getTemplate = vi.fn();
const createTemplate = vi.fn();
const updateTemplate = vi.fn();

vi.mock("@/lib/api/docmerge", () => ({
  listTemplates: (...a: unknown[]) => listTemplates(...a),
  getTemplate: (...a: unknown[]) => getTemplate(...a),
  createTemplate: (...a: unknown[]) => createTemplate(...a),
  updateTemplate: (...a: unknown[]) => updateTemplate(...a),
}));

const { DocTemplatesPage } = await import("@/pages/business/docs/DocTemplatesPage");

beforeEach(() => {
  vi.clearAllMocks();
  listDocTemplates.mockResolvedValue([]);
  createTemplate.mockResolvedValue({ id: "tpl-new" });
  updateTemplate.mockResolvedValue({ id: "tpl-1" });
});

describe("DG-104 — șabloanele se scriu în aplicație", () => {
  it("[blocant] fără șabloane, ecranul cheamă la primul, nu arată o listă goală", async () => {
    render(<DocTemplatesPage />);

    expect(await screen.findByText("Niciun șablon încă")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Creează primul șablon/i })).toBeInTheDocument();
  });

  it("[blocant] bara de instrumente are nume în română pe fiecare buton", async () => {
    render(<DocTemplatesPage />);
    await userEvent.click(await screen.findByRole("button", { name: /Creează primul șablon/i }));

    // Editorul se încarcă lazy (chunk separat) — de asta se așteaptă primul buton.
    expect(await screen.findByRole("button", { name: "Îngroșat" })).toBeInTheDocument();
    for (const label of [
      "Îngroșat",
      "Cursiv",
      "Subliniat",
      "Titlu mare",
      "Listă cu puncte",
      "Tabel",
      "Vedere sursă HTML",
    ]) {
      expect(screen.getByRole("button", { name: label })).toBeInTheDocument();
    }
  });

  it("[blocant] salvarea trimite corpul și tipul actului la API", async () => {
    render(<DocTemplatesPage />);
    await userEvent.click(await screen.findByRole("button", { name: /Creează primul șablon/i }));

    await userEvent.type(screen.getByLabelText("Denumirea șablonului"), "Contract de servicii");
    await userEvent.selectOptions(screen.getByLabelText("Tipul actului"), "contract_servicii");

    // Vederea sursă: portița prin care se corectează HTML direct.
    await userEvent.click(await screen.findByRole("button", { name: "Vedere sursă HTML" }));
    const source = screen.getByLabelText("Sursa HTML a șablonului");
    // fireEvent, nu userEvent.type: în userEvent `{{` are înțeles special (taste), deci un câmp
    // de șablon scris cu acolade ar ajunge trunchiat — exact bug-ul pe care testul îl păzește.
    fireEvent.change(source, { target: { value: "<p>Prestator: {{noi.denumire}}</p>" } });

    await userEvent.click(screen.getByRole("button", { name: /Salvează șablonul/i }));

    await waitFor(() => {
      expect(createTemplate).toHaveBeenCalledWith({
        name: "Contract de servicii",
        bodyHtml: "<p>Prestator: {{noi.denumire}}</p>",
        kind: "contract_servicii",
      });
    });
  });

  it("[blocant] un șablon existent se deschide cu corpul lui și se salvează pe același id", async () => {
    listDocTemplates.mockResolvedValue([
      { id: "tpl-1", name: "Act de primire-predare", placeholders: ["contraparte.iban"], kind: "act_primire_predare", category: "Acte de predare", isSystem: false, version: 1, updatedAt: "" },
    ]);
    getTemplate.mockResolvedValue({
      id: "tpl-1",
      name: "Act de primire-predare",
      bodyHtml: "<h1>ACT</h1>",
      placeholders: ["contraparte.iban"],
      sourceFormat: "html",
      updatedAt: "",
      tenantId: "t",
      createdAt: "",
      kind: "act_primire_predare",
    });
    render(<DocTemplatesPage />);

    await userEvent.click(await screen.findByText("Act de primire-predare"));
    await waitFor(() => expect(getTemplate).toHaveBeenCalledWith("tpl-1"));

    await userEvent.click(await screen.findByRole("button", { name: "Vedere sursă HTML" }));
    expect(screen.getByLabelText("Sursa HTML a șablonului")).toHaveValue("<h1>ACT</h1>");

    await userEvent.click(screen.getByRole("button", { name: /Salvează șablonul/i }));
    await waitFor(() => {
      expect(updateTemplate).toHaveBeenCalledWith(
        "tpl-1",
        expect.objectContaining({ name: "Act de primire-predare", bodyHtml: "<h1>ACT</h1>" })
      );
    });
  });

  it("[normal] lista arată tipul actului și câte câmpuri are șablonul", async () => {
    listDocTemplates.mockResolvedValue([
      { id: "tpl-1", name: "Act de primire-predare", placeholders: ["a", "b"], kind: "act_primire_predare", category: null, isSystem: false, version: 1, updatedAt: "" },
    ]);
    render(<DocTemplatesPage />);
    expect(await screen.findByText(/Act de primire-predare · 2 câmpuri/)).toBeInTheDocument();
  });
});


describe("DG-107 — previzualizare și istoric", () => {
  const TPL = {
    id: "tpl-1",
    name: "Act propriu",
    placeholders: ["contraparte.iban"],
    kind: "act_primire_predare",
    category: null,
    isSystem: false,
    version: 3,
    updatedAt: "",
  };

  async function openEditor() {
    listDocTemplates.mockResolvedValue([TPL]);
    getTemplate.mockResolvedValue({
      ...TPL,
      bodyHtml: "<p>{{contraparte.iban}}</p>",
      tenantId: "t",
      createdAt: "",
      sourceFormat: "html",
    });
    render(<DocTemplatesPage />);
    await userEvent.click(await screen.findByText("Act propriu"));
    await waitFor(() => expect(getTemplate).toHaveBeenCalled());
  }

  it("[blocant] previzualizarea cu un furnizor real cere serverului contextul acelui furnizor", async () => {
    previewDocTemplate.mockResolvedValue({ html: "<p>MD48ML000002259A19498121</p>" });
    await openEditor();

    await userEvent.click(await screen.findByRole("button", { name: /Previzualizează/i }));
    await waitFor(() => expect(previewDocTemplate).toHaveBeenCalledWith("tpl-1", null));

    await userEvent.selectOptions(await screen.findByLabelText(/Cu datele furnizorului/i), "v1");
    await waitFor(() => expect(previewDocTemplate).toHaveBeenLastCalledWith("tpl-1", "v1"));

    // Randarea se face în iframe izolat (sandbox), nu injectată în pagină.
    expect(await screen.findByTitle("Previzualizarea actului")).toHaveAttribute("sandbox", "");
  });

  it("[blocant] istoricul listează versiunile, iar revenirea cere serverului versiunea aleasă", async () => {
    listTemplateVersions.mockResolvedValue([
      { id: "v3", version: 3, name: "Act propriu", createdAt: "2026-03-12T10:00:00.000Z" },
      { id: "v2", version: 2, name: "Act propriu", createdAt: "2026-03-01T10:00:00.000Z" },
    ]);
    restoreTemplateVersion.mockResolvedValue({ version: 4, restoredFrom: 2 });
    await openEditor();

    await userEvent.click(await screen.findByRole("button", { name: /Istoric versiuni/i }));
    expect(await screen.findByText(/Versiunea 2/)).toBeInTheDocument();

    const rows = screen.getAllByRole("button", { name: /Revino la ea/i });
    await userEvent.click(rows[1]); // a doua = versiunea 2
    await waitFor(() => expect(restoreTemplateVersion).toHaveBeenCalledWith("tpl-1", 2));
  });
});
