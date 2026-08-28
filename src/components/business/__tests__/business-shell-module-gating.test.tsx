/**
 * PLATFORM-001 — meniul clientului respectă comutatoarele din Consola Platformă.
 *
 * Ce dovedesc testele astea: un modul oprit de proprietar chiar DISPARE din navigația
 * clientului, iar când starea modulelor nu poate fi citită deloc rămâne implicitul
 * produsului — PAR, pe care îl are orice organizație. A doua parte e regresia care contează:
 * o eroare de rețea nu are voie nici să golească meniul, nici să arate module pe care
 * serverul le refuză oricum cu 403.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { useParRoles } from "@/hooks/useParRoles";
import { useEnabledModules, DEFAULT_MODULE_KEYS, type ModuleKey } from "@/hooks/useEnabledModules";
import { BusinessShell } from "@/components/business/BusinessShell";

vi.mock("@/hooks/useParRoles");
vi.mock("@/hooks/useEnabledModules", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/hooks/useEnabledModules")>();
  return { ...actual, useEnabledModules: vi.fn() };
});
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
vi.mock("@/router/HashRouter", () => ({
  Link: ({ children, to, ...rest }: { children: React.ReactNode; to: string; [key: string]: unknown }) => (
    <a href={`#${to}`} {...rest}>
      {children}
    </a>
  ),
  useRouter: () => ({ path: "/business/dashboard", navigate: vi.fn() }),
}));
vi.mock("@/components/app/NotificationBell", () => ({ NotificationBell: () => null }));

const mockUseParRoles = vi.mocked(useParRoles);
const mockUseEnabledModules = vi.mocked(useEnabledModules);

function setEnabled(keys: ModuleKey[]) {
  mockUseEnabledModules.mockReturnValue({
    enabled: keys,
    isEnabled: (key: ModuleKey) => keys.includes(key),
    status: "resolved",
  });
}

function renderShell() {
  return render(
    <BusinessShell pageTitle="Test">
      <div data-testid="content">Content</div>
    </BusinessShell>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockUseParRoles.mockReturnValue({ status: "resolved", roles: ["par_admin"] });
});

describe("gating-ul modulelor în navigația clientului", () => {
  it("ascunde secțiunea PAR când modulul e oprit, chiar dacă utilizatorul are rol PAR", async () => {
    setEnabled(["findesk", "itpark", "docmerge"]);
    renderShell();
    await waitFor(() => {
      expect(screen.queryByText("PAR — Cereri de plată")).not.toBeInTheDocument();
    });
    // FinDesk rămâne — oprirea unui modul nu are voie să atingă altul.
    expect(await screen.findByText("FinDesk — Finanțe")).toBeInTheDocument();
  });

  it("ascunde secțiunea FinDesk când modulul e oprit", async () => {
    setEnabled(["par", "itpark"]);
    renderShell();
    await waitFor(() => {
      expect(screen.queryByText("FinDesk — Finanțe")).not.toBeInTheDocument();
    });
    expect(await screen.findByText("PAR — Cereri de plată")).toBeInTheDocument();
  });

  it("un workspace DOAR cu PAR primește meniul PAR complet, nu cele trei rânduri dintr-o secțiune", async () => {
    // Bug raportat de owner: în stânga apăreau 3 rânduri PAR, iar restul meniului (coada de
    // finanțe, folderele, administrarea) apărea abia după ce intrai într-o cerere.
    setEnabled(["par"]);
    mockUseParRoles.mockReturnValue({ status: "resolved", roles: ["par_admin", "approver", "finance"] });
    renderShell();
    // Shell-ul randează și raftul desktop, și sertarul mobil — deci fiecare rând apare de 2 ori.
    expect((await screen.findAllByText("Cereri de plată")).length).toBeGreaterThan(0);
    expect((await screen.findAllByText("Coadă finanțe")).length).toBeGreaterThan(0);
    expect((await screen.findAllByText("Foldere proiecte")).length).toBeGreaterThan(0);
    expect((await screen.findAllByText("Administrare PAR")).length).toBeGreaterThan(0);
    // Nu există alt modul spre care să te întorci, deci butonul n-are ce căuta acolo.
    expect(screen.queryByLabelText("Înapoi la toate modulele")).not.toBeInTheDocument();
    // Tabloul de bord rămâne accesibil din meniu.
    expect((await screen.findAllByText("Dashboard")).length).toBeGreaterThan(0);
  });

  it("cu mai multe module active meniul rămâne pe secțiuni, cu PAR pliabil", async () => {
    setEnabled(["par", "findesk"]);
    mockUseParRoles.mockReturnValue({ status: "resolved", roles: ["par_admin"] });
    renderShell();
    expect(await screen.findByText("PAR — Cereri de plată")).toBeInTheDocument();
    expect(await screen.findByText("FinDesk — Finanțe")).toBeInTheDocument();
    expect(screen.queryByText("Coadă finanțe")).not.toBeInTheDocument();
  });

  it("când nu se poate citi starea modulelor, rămâne implicitul: PAR în meniu, restul nu", async () => {
    // Exact ce întoarce hook-ul real la eroare de rețea / tabelă lipsă.
    setEnabled([...DEFAULT_MODULE_KEYS]);
    renderShell();
    // PAR singur = meniul PAR complet (fără antetul de secțiune pliabilă).
    expect((await screen.findAllByText("Cereri de plată")).length).toBeGreaterThan(0);
    expect(screen.queryByText("FinDesk — Finanțe")).not.toBeInTheDocument();
  });
});
