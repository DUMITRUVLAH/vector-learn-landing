/**
 * @vitest-environment jsdom
 *
 * „Lista de furnizori mai bine ca tabel, în UI ca la cereri/inbox" (owner, 2026-09-12).
 *
 * Cardurile puneau fiecare cifră în altă poziție, deci comparația dintre doi furnizori cerea citit,
 * nu privit. Testele cer comportamentul tabelului: rânduri cu coloane aliniate, sortare din capul
 * coloanei (la server, nu în memorie) și rândul care deschide fișa.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import ParVendors from "../ParVendors";

const navigate = vi.fn();

vi.mock("@/router/HashRouter", () => ({
  useRouter: () => ({ path: "/business/par/vendors", navigate }),
  Link: ({ children, to, onClick }: { children: React.ReactNode; to: string; onClick?: (e: React.MouseEvent) => void }) => (
    <a href={to} onClick={onClick}>{children}</a>
  ),
}));

vi.mock("@/components/business/BusinessShell", () => ({
  BusinessShell: ({ children, actions }: { children: React.ReactNode; actions?: React.ReactNode }) => (
    <div>
      {actions}
      {children}
    </div>
  ),
}));

vi.mock("@/lib/api/par", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/par")>();
  return { ...actual, getParMe: vi.fn().mockResolvedValue({ roles: ["par_admin"] }) };
});


vi.mock("@/lib/api/parVendorProfile", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/parVendorProfile")>();
  return {
    ...actual,
    listVendorDirectory: vi.fn().mockResolvedValue({
      vendors: [
        {
          id: "v-1",
          name: "WILDBERRIES GROUP SRL",
          idnp: "1020600003167",
          relationship: "active",
          blockedReason: null,
          categories: [{ id: "c-1", name: "Catering" }],
          ratingAvg: null,
          ratingCount: 0,
          paidCents: 0,
          requestCount: 1,
          lastPaidAt: null,
        },
        {
          id: "v-2",
          name: "Absolut Print SRL",
          idnp: "1012600015202",
          relationship: "preferred",
          blockedReason: null,
          categories: [],
          ratingAvg: 4.5,
          ratingCount: 2,
          paidCents: 7690475,
          requestCount: 9,
          lastPaidAt: new Date().toISOString(),
        },
      ],
    }),
    listVendorCategories: vi.fn().mockResolvedValue({ categories: [] }),
  };
});

beforeEach(() => {
  vi.clearAllMocks();
  navigate.mockClear();
});

describe("registrul de furnizori — tabel, ca la cereri", () => {
  it("afișează furnizorii ca rânduri de tabel, cu cifrele pe coloane", async () => {
    render(<ParVendors />);

    const row = (await screen.findByText("Absolut Print SRL")).closest("tr")!;
    expect(within(row).getByText("Cod fiscal 1012600015202")).toBeInTheDocument();
    expect(within(row).getByText("Preferat")).toBeInTheDocument();
    expect(within(row).getByText("9")).toBeInTheDocument();
    expect(within(row).getByText("Plătit azi")).toBeInTheDocument();
    // Furnizorul fără note nu arată zero stele — arată că n-a fost evaluat.
    const other = screen.getByText("WILDBERRIES GROUP SRL").closest("tr")!;
    expect(within(other).getByText("Neevaluat")).toBeInTheDocument();
  });

  it("capul de coloană sortează la server, nu în memorie", async () => {
    const api = await import("@/lib/api/parVendorProfile");
    render(<ParVendors />);
    await screen.findByText("Absolut Print SRL");

    fireEvent.click(screen.getByRole("button", { name: "Sortează după Plătit" }));

    await waitFor(() =>
      expect(vi.mocked(api.listVendorDirectory)).toHaveBeenLastCalledWith(
        expect.objectContaining({ sort: "paid" })
      )
    );
  });

  it("rândul deschide fișa furnizorului", async () => {
    render(<ParVendors />);
    const row = (await screen.findByText("Absolut Print SRL")).closest("tr")!;

    fireEvent.click(row);

    expect(navigate).toHaveBeenCalledWith("/business/par/vendors/v-2");
  });
});
