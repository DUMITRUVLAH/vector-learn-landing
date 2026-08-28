/**
 * Implicitul de module la nivel de RUTĂ, nu doar de meniu.
 *
 * Ascunderea din navigație e cosmetică: cine scrie adresa în bară intră oricum. Testele
 * astea cer chiar randarea paginii pe o rută de modul oprit și verifică ce vede omul —
 * ecranul „Modul indisponibil", nu conținutul modulului.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { useEnabledModules, moduleForPath, type ModuleKey } from "@/hooks/useEnabledModules";
import { BusinessGuardPage } from "@/components/business/BusinessGuardPage";

let currentPath = "/business/fin/invoices";
const navigate = vi.fn();

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
  useRouter: () => ({ path: currentPath, navigate }),
}));

const mockUseEnabledModules = vi.mocked(useEnabledModules);

function setEnabled(keys: ModuleKey[], status: "loading" | "resolved" = "resolved") {
  mockUseEnabledModules.mockReturnValue({
    enabled: keys,
    isEnabled: (key: ModuleKey) => keys.includes(key),
    status,
  });
}

function renderAt(path: string) {
  currentPath = path;
  return render(
    <BusinessGuardPage>
      <div data-testid="content">Conținutul modulului</div>
    </BusinessGuardPage>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("moduleForPath", () => {
  it("leagă fiecare rută de modulul ei, cu ITPark înaintea lui FinDesk", () => {
    expect(moduleForPath("/business/fin/itpark/contracts")).toBe("itpark");
    expect(moduleForPath("/business/itpark")).toBe("itpark");
    expect(moduleForPath("/business/fin/invoices")).toBe("findesk");
    expect(moduleForPath("/business/docmerge/jobs")).toBe("docmerge");
    expect(moduleForPath("/business/par/123")).toBe("par");
  });

  it("nu păzește rutele care nu aparțin niciunui modul", () => {
    for (const path of ["/business", "/business/dashboard", "/business/settings", "/business/platform"]) {
      expect(moduleForPath(path)).toBeNull();
    }
  });
});

describe("gating-ul modulelor pe rută", () => {
  it("PAR merge din start, fără nicio setare — e implicitul produsului", () => {
    setEnabled(["par"]);
    renderAt("/business/par");
    expect(screen.getByTestId("content")).toBeInTheDocument();
  });

  it("blochează FinDesk pentru o organizație care nu-l are activat", () => {
    setEnabled(["par"]);
    renderAt("/business/fin/invoices");
    expect(screen.queryByTestId("content")).not.toBeInTheDocument();
    expect(screen.getByText("Modul indisponibil")).toBeInTheDocument();
  });

  it("îl lasă să intre imediat ce proprietarul i-a aprins modulul", () => {
    setEnabled(["par", "findesk"]);
    renderAt("/business/fin/invoices");
    expect(screen.getByTestId("content")).toBeInTheDocument();
  });

  it("nu blochează tabloul de bord, care nu ține de niciun modul", () => {
    setEnabled(["par"]);
    renderAt("/business/dashboard");
    expect(screen.getByTestId("content")).toBeInTheDocument();
  });

  it("nu clipește cu ecranul de blocare cât timp starea modulelor se încarcă", () => {
    setEnabled(["par"], "loading");
    renderAt("/business/fin/invoices");
    expect(screen.getByTestId("content")).toBeInTheDocument();
  });
});
