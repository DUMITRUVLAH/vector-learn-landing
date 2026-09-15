/**
 * CRM → API: ecranul cheilor de acces (cerința 64), partea de interfață.
 *
 * Ce apără testele:
 *  1. **cheia proaspătă se vede o singură dată și ecranul o SPUNE** — dacă omul o pierde, nu are
 *     de unde s-o mai ia, iar un ecran care lasă asta de înțeles produce bilete de suport;
 *  2. lista nu poartă niciodată valoarea cheii, doar prefixul;
 *  3. revocarea cere confirmare (integrațiile se opresc pe loc) și dispare pentru cheile deja
 *     revocate;
 *  4. instrucțiunea de conectare e pe ecran — o listă de chei fără exemplu de conectare e o
 *     funcție pe care o folosește doar cine a scris-o.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import type { ApiKeyRow } from "@/lib/api/apiKeys";

const listApiKeys = vi.fn();
const createApiKey = vi.fn();
const revokeApiKey = vi.fn();

vi.mock("@/lib/api/apiKeys", () => ({
  listApiKeys: (...a: unknown[]) => listApiKeys(...a),
  createApiKey: (...a: unknown[]) => createApiKey(...a),
  revokeApiKey: (...a: unknown[]) => revokeApiKey(...a),
}));

vi.mock("@/hooks/useBusinessSession", () => ({
  useBusinessSession: () => ({
    status: "authenticated",
    data: { user: { id: "user-1", name: "Admin", role: "owner" }, tenant: { name: "Test", slug: "test", appKind: "business" } },
    logout: vi.fn(),
    refresh: vi.fn(),
    error: null,
  }),
}));

vi.mock("@/hooks/useCrmPermissions", () => ({
  useCrmPermissions: () => ({ can: () => true, permissions: [], role: "admin", loading: false }),
}));

vi.mock("@/router/HashRouter", () => ({
  useRouter: () => ({ path: "/business/crm/api", navigate: vi.fn() }),
  Link: ({ to, children, ...rest }: { to: string; children: React.ReactNode; [k: string]: unknown }) => (
    <a href={`#${to}`} {...rest}>
      {children}
    </a>
  ),
}));

const { CrmApiPage } = await import("@/pages/business/crm/CrmApiPage");

const KEY: ApiKeyRow = {
  id: "key-1",
  name: "Power BI",
  prefix: "fk_7Hq2",
  createdAt: "2026-09-01T10:00:00.000Z",
  lastUsedAt: "2026-09-14T08:30:00.000Z",
  revokedAt: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  listApiKeys.mockResolvedValue([KEY]);
  createApiKey.mockResolvedValue({ ...KEY, id: "key-2", name: "Nouă", key: "fk_ABCDEFGHIJKLMNOP" });
  revokeApiKey.mockResolvedValue({ ok: true });
});

describe("Ecranul de chei API", () => {
  it("[blocant] lista arată prefixul, niciodată cheia întreagă", async () => {
    render(<CrmApiPage />);
    expect(await screen.findByText("Power BI")).toBeInTheDocument();
    expect(screen.getByText(/fk_7Hq2/)).toBeInTheDocument();
    expect(screen.getByText("Activă")).toBeInTheDocument();
  });

  it("[blocant] cheia nouă apare O DATĂ, cu avertismentul că nu se mai poate vedea", async () => {
    render(<CrmApiPage />);
    await screen.findByText("Power BI");

    fireEvent.click(screen.getAllByRole("button", { name: /Cheie nouă/ })[0]);
    fireEvent.change(screen.getByLabelText("Numele cheii"), { target: { value: "Raport vânzări" } });
    fireEvent.click(screen.getByRole("button", { name: "Creează" }));

    await waitFor(() => expect(createApiKey).toHaveBeenCalledWith("Raport vânzări"));
    expect(await screen.findByText("fk_ABCDEFGHIJKLMNOP")).toBeInTheDocument();
    expect(screen.getByText(/nu se mai poate vedea niciodată/i)).toBeInTheDocument();

    // După „Am copiat-o", valoarea dispare din ecran — nu rămâne agățată într-o filă deschisă.
    fireEvent.click(screen.getByRole("button", { name: "Am copiat-o" }));
    await waitFor(() => expect(screen.queryByText("fk_ABCDEFGHIJKLMNOP")).not.toBeInTheDocument());
  });

  it("[blocant] revocarea cere confirmare — integrațiile se opresc pe loc", async () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<CrmApiPage />);
    await screen.findByText("Power BI");

    fireEvent.click(screen.getByRole("button", { name: /Revocă cheia Power BI/ }));
    expect(confirmSpy).toHaveBeenCalled();
    expect(revokeApiKey).not.toHaveBeenCalled();

    confirmSpy.mockReturnValue(true);
    fireEvent.click(screen.getByRole("button", { name: /Revocă cheia Power BI/ }));
    await waitFor(() => expect(revokeApiKey).toHaveBeenCalledWith("key-1"));
    confirmSpy.mockRestore();
  });

  it("[blocant] cheia revocată nu mai are buton de revocare", async () => {
    listApiKeys.mockResolvedValue([{ ...KEY, revokedAt: "2026-09-10T10:00:00.000Z" }]);
    render(<CrmApiPage />);
    await screen.findByText("Revocată");
    expect(screen.queryByRole("button", { name: /Revocă cheia/ })).not.toBeInTheDocument();
  });

  it("[blocant] ecranul spune cum se conectează Power BI și unde e specificația", async () => {
    render(<CrmApiPage />);
    await screen.findByText("Power BI");

    expect(screen.getByText(/api\/public\/v1\/openapi\.json/)).toBeInTheDocument();
    expect(screen.getByText(/doar de citire/i)).toBeInTheDocument();
    // Antetul apare în două locuri (exemplul curl și instrucțiunea Power BI) — ambele sunt bune.
    expect(screen.getAllByText(/X-API-Key/).length).toBeGreaterThan(0);
    expect(screen.getByText(/updatedSince/)).toBeInTheDocument();
  });

  it("[normal] fără nicio cheie, ecranul explică la ce folosește una", async () => {
    listApiKeys.mockResolvedValue([]);
    render(<CrmApiPage />);
    expect(await screen.findByText("Nicio cheie încă")).toBeInTheDocument();
    expect(screen.getByText(/Nu poate scrie nimic/)).toBeInTheDocument();
  });
});
