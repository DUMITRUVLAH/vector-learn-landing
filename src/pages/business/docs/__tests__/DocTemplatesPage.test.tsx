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

vi.mock("@/lib/api/docs", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api/docs")>("@/lib/api/docs");
  return {
    ...actual,
    listDocTemplates: (...a: unknown[]) => listDocTemplates(...a),
    cloneDocTemplate: (...a: unknown[]) => cloneDocTemplate(...a),
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
