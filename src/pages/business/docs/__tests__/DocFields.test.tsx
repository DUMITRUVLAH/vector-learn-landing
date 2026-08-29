/**
 * DG-105 — inserarea câmpurilor fără să știi sintaxa.
 *
 * Ce contează, în ordinea valorii:
 *  1. un câmp ales din panou ajunge în șablon exact ca `{{grup.camp}}` — altfel randarea nu-l vede;
 *  2. numele sunt grupate pe sursă, ca să nu existe niciodată un `{{iban}}` fără stăpân;
 *  3. căutarea găsește câmpul după cum îl numește omul („iban"), nu doar după numele tehnic.
 * Cipul se salvează cu `data-field` ȘI cu `{{...}}` înăuntru: primul ca să-l poți redeschide în
 * editor, al doilea ca actul generat să aibă valoarea, nu acoladele.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { searchFields, fieldLabel, ALL_FIELDS } from "@/lib/docs/fieldCatalog";

describe("DG-105 — catalogul de câmpuri", () => {
  it("[blocant] fiecare câmp poartă sursa în nume (fără {{iban}} fără stăpân)", () => {
    for (const f of ALL_FIELDS) {
      expect(f.name, `câmpul ${f.name} nu are grup`).toMatch(/^[a-z_]+\.[a-z_]+$/);
    }
    expect(ALL_FIELDS.map((f) => f.name)).toContain("contraparte.iban");
    expect(ALL_FIELDS.map((f) => f.name)).toContain("noi.iban");
  });

  it("[blocant] căutarea găsește câmpul după cuvântul pe care îl folosește omul", () => {
    const byWord = searchFields("iban").map((f) => f.name);
    expect(byWord).toContain("contraparte.iban");
    expect(byWord).toContain("noi.iban");

    const byLabel = searchFields("cod fiscal").map((f) => f.name);
    expect(byLabel).toContain("contraparte.idno");
  });

  it("[blocant] căutarea ignoră diacriticele și potrivește pe cuvinte", () => {
    expect(searchFields("suma litere").map((f) => f.name)).toContain("total.in_litere");
    expect(searchFields("administrator furnizorului").map((f) => f.name)).toContain(
      "contraparte.administrator"
    );
  });

  it("[normal] o căutare fără potriviri întoarce lista goală, nu tot catalogul", () => {
    expect(searchFields("zzz")).toEqual([]);
  });

  it("[normal] eticheta unui câmp necunoscut nu aruncă, se arată ca atare", () => {
    expect(fieldLabel("contraparte.iban")).toBe("IBAN furnizor");
    expect(fieldLabel("ceva.inexistent")).toBe("ceva.inexistent");
  });
});

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
const createTemplate = vi.fn();

vi.mock("@/lib/api/docmerge", () => ({
  listTemplates: (...a: unknown[]) => listTemplates(...a),
  getTemplate: vi.fn(),
  createTemplate: (...a: unknown[]) => createTemplate(...a),
  updateTemplate: vi.fn(),
}));

const { DocTemplatesPage } = await import("@/pages/business/docs/DocTemplatesPage");

beforeEach(() => {
  vi.clearAllMocks();
  listDocTemplates.mockResolvedValue([]);
  listTemplates.mockResolvedValue([]);
  createTemplate.mockResolvedValue({ id: "tpl-new" });
});

describe("DG-105 — câmpul ales din panou ajunge în șablon", () => {
  it("[blocant] un click pe câmpul IBAN contraparte salvează {{contraparte.iban}} în corp", async () => {
    render(<DocTemplatesPage />);
    await userEvent.click(await screen.findByRole("button", { name: /Creează primul șablon/i }));
    await userEvent.type(await screen.findByLabelText("Denumirea șablonului"), "Act");

    // Panoul lateral e mereu vizibil — nu trebuie să știi de „/" ca să inserezi un câmp.
    await userEvent.click(await screen.findByRole("button", { name: "IBAN furnizor" }));
    await userEvent.click(screen.getByRole("button", { name: /Salvează șablonul/i }));

    await waitFor(() => expect(createTemplate).toHaveBeenCalled());
    const body = (createTemplate.mock.calls[0][0] as { bodyHtml: string }).bodyHtml;
    // Ambele forme, din motive diferite: data-field ca să-l poți redeschide, {{...}} ca actul
    // generat să conțină valoarea, nu acoladele.
    expect(body).toContain('data-field="contraparte.iban"');
    expect(body).toContain("{{contraparte.iban}}");
  });

  it("[blocant] panoul lateral arată câmpurile grupate pe sursă", async () => {
    render(<DocTemplatesPage />);
    await userEvent.click(await screen.findByRole("button", { name: /Creează primul șablon/i }));

    const panel = await screen.findByRole("complementary", { name: "Câmpuri de inserat" });
    expect(panel).toHaveTextContent("Organizația noastră");
    expect(panel).toHaveTextContent("Furnizorul / beneficiarul");
    expect(panel).toHaveTextContent("Sume");
    expect(panel).toHaveTextContent("Suma în litere");
  });
});
