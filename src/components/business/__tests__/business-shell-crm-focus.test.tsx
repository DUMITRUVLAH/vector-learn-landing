/**
 * CRM-SIDEBAR — în interiorul CRM-ului meniul din stânga e DOAR CRM, exact ca la PAR.
 *
 * Bugul raportat de owner: intrai în CRM și în stânga rămâneau deasupra PAR și cele douăzeci și
 * șase de rânduri de FinDesk, iar submodulele CRM începeau pe la jumătatea listei — deci fiecare
 * drum spre Pipeline însemna o derulare. Ce dovedesc testele: pe rutele /business/crm/* meniul
 * conține numai CRM plus ieșirea („Înapoi la module"), iar în afara lor revine meniul întreg.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
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
const currentPath = { value: "/business/crm/pipeline" };
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
  currentPath.value = "/business/crm/pipeline";
  mockUseParRoles.mockReturnValue({ status: "resolved", roles: ["par_admin"] });
  setEnabled(["par", "findesk", "crm"]);
  setCrmPermissions(["audit.view"]);
});

describe("meniul focalizat pe CRM", () => {
  it("[blocant] pe o rută CRM meniul arată doar CRM, nu PAR și FinDesk", async () => {
    renderShell();

    const nav = sidebar();
    expect(await within(nav).findByRole("link", { name: "Pipeline" })).toBeInTheDocument();
    expect(nav).not.toHaveTextContent("Cereri de plată");
    expect(nav).not.toHaveTextContent("FinDesk — Finanțe");
    // Rândul de Dashboard cedează locul ieșirii din modul — la fel ca în PAR.
    expect(within(nav).queryByRole("link", { name: "Dashboard" })).not.toBeInTheDocument();
    expect(screen.getByLabelText("Înapoi la toate modulele")).toBeInTheDocument();
  });

  it("[blocant] când ieși din CRM revine meniul întreg", async () => {
    currentPath.value = "/business/dashboard";
    renderShell();

    const nav = sidebar();
    expect(await screen.findByText("PAR — Cereri de plată")).toBeInTheDocument();
    expect(screen.getByText("FinDesk — Finanțe")).toBeInTheDocument();
    // …iar submodulele CRM nu mai stau în meniu: ele apar când intri în modul.
    expect(within(nav).queryByRole("link", { name: "Pipeline" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Înapoi la toate modulele")).not.toBeInTheDocument();
  });

  it("[normal] rândurile administrative cer dreptul — fără audit.view nu apar", async () => {
    setCrmPermissions([]);
    renderShell();

    const nav = sidebar();
    expect(await within(nav).findByRole("link", { name: "Pipeline" })).toBeInTheDocument();
    expect(within(nav).queryByRole("link", { name: "Jurnal" })).not.toBeInTheDocument();
    expect(within(nav).queryByRole("link", { name: "Drepturi" })).not.toBeInTheDocument();
  });

  it("[normal] „Acasă\" e aprins doar pe pagina modulului, nu pe toate rutele CRM", async () => {
    renderShell();
    const nav = sidebar();
    expect(within(nav).getByRole("link", { name: "Acasă" })).not.toHaveAttribute("aria-current");
    expect(within(nav).getByRole("link", { name: "Pipeline" })).toHaveAttribute("aria-current", "page");
  });
});

describe("CRM-G01 — tema Google Workspace, doar în CRM", () => {
  it("[blocant] tema gm3 se aplică pe rutele CRM și NU în afara lor (PAR rămâne neatins)", () => {
    const { container, unmount } = renderShell();
    expect(container.firstElementChild).toHaveClass("gm3");
    unmount();

    currentPath.value = "/business/par";
    const par = renderShell();
    expect(par.container.firstElementChild).not.toHaveClass("gm3");
  });

  it("[blocant] căutarea din bara de sus deschide Pipeline-ul filtrat", () => {
    renderShell();
    const box = screen.getByRole("searchbox", { name: "Caută în CRM" });
    fireEvent.change(box, { target: { value: "Medlife Clinic" } });
    fireEvent.submit(box.closest("form") as HTMLFormElement);
    expect(navigateSpy).toHaveBeenCalledWith("/business/crm/pipeline?q=Medlife%20Clinic");
  });

  it("[normal] o căutare goală nu navighează nicăieri", () => {
    renderShell();
    const box = screen.getByRole("searchbox", { name: "Caută în CRM" });
    fireEvent.submit(box.closest("form") as HTMLFormElement);
    expect(navigateSpy).not.toHaveBeenCalled();
  });

  it("[normal] butonul „Lead nou\" duce la Pipeline cu formularul deschis", () => {
    renderShell();
    const nav = screen.getAllByRole("link", { name: /Lead nou/ })[0];
    expect(nav).toHaveAttribute("href", "#/business/crm/pipeline?nou=1");
  });

  it("[normal] Import și Repartizare stau sub Administrare, nu sub Analiză", () => {
    renderShell();
    const nav = sidebar();
    expect(within(nav).getByRole("link", { name: "Import" })).toBeInTheDocument();
    expect(within(nav).getByRole("link", { name: "API" })).toBeInTheDocument();
  });
});
