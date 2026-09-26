/**
 * NAV-01..04 — FinDesk are meniu propriu, grupat; contractele și facturile apar și în CRM.
 *
 * Owner-ul a cerut (2026-09-26): IT Park, salarizare, calendar fiscal, reconciliere și TVA grupate
 * la un loc; factura și e-Factura comasate într-un modul; contractele și facturile în CRM.
 * Decizia completă: backlog/findesk/NAV-REORG.md.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { useParRoles } from "@/hooks/useParRoles";
import { useEnabledModules, type ModuleKey } from "@/hooks/useEnabledModules";
import { useCrmPermissions } from "@/hooks/useCrmPermissions";
import { BusinessShell } from "@/components/business/BusinessShell";

vi.mock("@/hooks/useParRoles");
vi.mock("@/hooks/useEnabledModules", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/hooks/useEnabledModules")>();
  return { ...actual, useEnabledModules: vi.fn() };
});
vi.mock("@/hooks/useCrmPermissions", () => ({ useCrmPermissions: vi.fn() }));
vi.mock("@/hooks/useBusinessSession", () => ({
  useBusinessSession: () => ({
    status: "authenticated",
    data: {
      user: { id: "u1", email: "a@b.com", name: "Test User", role: "admin" },
      tenant: { id: "t1", name: "Org", slug: "org", appKind: "business" },
    },
    error: null,
    logout: vi.fn(),
    refresh: vi.fn(),
  }),
}));
const currentPath = { value: "/business/fin/calendar" };
const navigateSpy = vi.fn();
vi.mock("@/router/HashRouter", () => ({
  Link: ({ children, to, ...rest }: { children: React.ReactNode; to: string; [key: string]: unknown }) => (
    <a href={`#${to}`} {...rest}>
      {children}
    </a>
  ),
  useRouter: () => ({ path: currentPath.value, navigate: navigateSpy }),
}));
vi.mock("@/components/app/NotificationBell", () => ({ NotificationBell: () => null }));

const mockUseParRoles = vi.mocked(useParRoles);
const mockUseEnabledModules = vi.mocked(useEnabledModules);
const mockUseCrmPermissions = vi.mocked(useCrmPermissions);

function setEnabled(keys: ModuleKey[]) {
  mockUseEnabledModules.mockReturnValue({
    enabled: keys,
    isEnabled: (key: ModuleKey) => keys.includes(key),
    status: "resolved",
  });
}

function setCrmPermissions(permissions: string[]) {
  mockUseCrmPermissions.mockReturnValue({
    permissions: permissions as never[],
    role: "admin",
    loading: false,
    can: (p) => permissions.includes(p),
  });
}

function renderShell() {
  return render(
    <BusinessShell pageTitle="Test">
      <div data-testid="content">Content</div>
    </BusinessShell>,
  );
}

/** Raftul din stânga. Bara de jos (mobil) poartă aceleași etichete, deci scopăm căutarea. */
const sidebar = () => screen.getByRole("navigation", { name: "Meniu FinFlow" });

beforeEach(() => {
  vi.clearAllMocks();
  currentPath.value = "/business/fin/calendar";
  mockUseParRoles.mockReturnValue({ status: "resolved", roles: ["par_admin"] });
  setEnabled(["par", "findesk", "crm", "itpark"]);
  setCrmPermissions(["audit.view"]);
});

const sectionOf = (label: string) => screen.getByRole("button", { name: label });

describe("NAV-01 — meniul FinDesk, grupat", () => {
  it("[blocant] pe o rută FinDesk meniul arată doar FinDesk, pe grupe, cu ieșire spre module", async () => {
    renderShell();
    const nav = sidebar();
    expect(await within(nav).findByRole("link", { name: "Calendar fiscal" })).toBeInTheDocument();
    // PAR nu mai stă deasupra: în modul, celelalte module sunt zgomot.
    expect(nav).not.toHaveTextContent("Cereri de plată");
    expect(screen.getByLabelText("Înapoi la toate modulele")).toBeInTheDocument();
    for (const section of ["Facturare", "Cheltuieli", "Bancă", "Fiscal & conformitate", "Contabilitate & rapoarte"]) {
      expect(sectionOf(section)).toBeInTheDocument();
    }
  });

  it("[blocant] IT Park, Salarizare, Calendar fiscal, Reconciliere și TVA stau în aceeași grupă", async () => {
    renderShell();
    const group = sectionOf("Fiscal & conformitate").parentElement as HTMLElement;
    for (const label of ["TVA & declarații", "Reconciliere & TVA import", "Salarizare", "Calendar fiscal", "Rezidenți IT Park"]) {
      expect(within(group).getByRole("link", { name: label })).toBeInTheDocument();
    }
  });

  it("[blocant] factura și e-Factura sunt un singur rând, aprins și pe fila e-Factura", async () => {
    currentPath.value = "/business/fin/einvoices";
    renderShell();
    const nav = sidebar();
    expect(within(nav).queryByRole("link", { name: "e-Factura" })).not.toBeInTheDocument();
    expect(within(nav).queryByRole("link", { name: "Cont de plată" })).not.toBeInTheDocument();
    expect(within(nav).getByRole("link", { name: "Facturi" })).toHaveAttribute("aria-current", "page");
  });

  it("[blocant] cu CRM pornit, Contractele nu mai stau în FinDesk", async () => {
    renderShell();
    expect(within(sidebar()).queryByRole("link", { name: "Contracte" })).not.toBeInTheDocument();
  });

  it("[normal] fără CRM, Contractele rămân în FinDesk — nu dispar din produs", async () => {
    setEnabled(["findesk"]);
    renderShell();
    expect(within(sidebar()).getByRole("link", { name: "Contracte" })).toBeInTheDocument();
  });

  it("[normal] fără modulul IT Park, rândul lui nu apare", async () => {
    setEnabled(["par", "findesk"]);
    renderShell();
    expect(within(sidebar()).queryByRole("link", { name: "Rezidenți IT Park" })).not.toBeInTheDocument();
  });
});

describe("NAV-04 — contractele și facturile în CRM", () => {
  it("[blocant] meniul CRM are Contracte și Facturi când FinDesk e pornit", async () => {
    currentPath.value = "/business/crm/contracte";
    renderShell();
    const nav = sidebar();
    expect(within(nav).getByRole("link", { name: "Contracte" })).toHaveAttribute("aria-current", "page");
    expect(within(nav).getByRole("link", { name: "Facturi" })).toBeInTheDocument();
    // Meniul rămâne al CRM-ului: nu sari în FinDesk ca să emiți o factură.
    expect(within(nav).getByRole("link", { name: "Pipeline" })).toBeInTheDocument();
  });

  it("[normal] fără FinDesk, CRM-ul nu arată rânduri de facturare", async () => {
    currentPath.value = "/business/crm/pipeline";
    setEnabled(["crm"]);
    renderShell();
    expect(within(sidebar()).queryByRole("link", { name: "Facturi" })).not.toBeInTheDocument();
  });
});

describe("meniul mobil", () => {
  it("[blocant] fila ITPark duce la ruta care există", async () => {
    currentPath.value = "/business/dashboard";
    setEnabled(["findesk", "itpark"]);
    renderShell();
    const mobile = screen.getByRole("navigation", { name: "Navigare mobilă Business Suite" });
    expect(within(mobile).getByRole("link", { name: "ITPark" })).toHaveAttribute("href", "#/business/fin/itpark");
  });
});
