/**
 * Cum ÎNCEPE și cum SE ÎNCHEIE o cerere (cerere owner, 2026-08-29):
 *
 *   1. La deschiderea formularului gol, aplicația întreabă întâi cum pornim — de la zero,
 *      dintr-un șablon salvat sau repetând o cerere anterioară. Până acum pornea tăcut de la
 *      zero, deși șabloanele existau: nimeni nu le vedea.
 *   2. Întrebarea apare doar dacă există din ce alege. Fără șabloane și fără cereri anterioare
 *      ar fi un click în plus, degeaba.
 *   3. Pornirea dintr-un șablon / repetarea deschid CIORNA NOUĂ în formular (`/edit`), nu pagina
 *      de vizualizare — pasul următor e completarea.
 *   4. După trimitere, aplicația întreabă dacă cererea devine șablon.
 *
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ParCreateForm } from "../ParCreateForm";
import * as parApi from "@/lib/api/par";

const navigate = vi.fn();
vi.mock("@/router/HashRouter", () => ({
  useRouter: () => ({ path: "/business/par/new", navigate: (p: string) => navigate(p) }),
}));
vi.mock("@/hooks/useSession", () => ({
  useSession: () => ({
    data: { user: { id: "u-1", name: "Test User", email: "t@vector.md", role: "member" }, tenant: { id: "t-1", name: "ATIC" } },
  }),
}));
vi.mock("@/components/app/AppShell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

const template = {
  id: "tmpl-1",
  tenantId: "t-1",
  name: "Chirie birou lunară",
  createdByUserId: "u-1",
  snapshot: { purpose: "execute_payment", lineItems: [] },
  createdAt: "2026-08-01",
  updatedAt: "2026-08-01",
} as unknown as parApi.ParTemplate;

const previous = {
  id: "par-9",
  requestNo: "PAR-2026-0009",
  payeeName: "Chirie SRL",
  totalEstimatedCents: 500000,
  currency: "MDL",
  status: "paid",
  createdAt: "2026-08-10",
} as unknown as parApi.ParListRow;

function mockConfigApis() {
  vi.spyOn(parApi, "listDepartments").mockResolvedValue({ items: [] } as never);
  vi.spyOn(parApi, "listProjects").mockResolvedValue({ items: [] } as never);
  vi.spyOn(parApi, "listEvents").mockResolvedValue({ events: [] } as never);
  vi.spyOn(parApi, "listBudgetCodes").mockResolvedValue({ items: [] } as never);
  vi.spyOn(parApi, "listVendors").mockResolvedValue({ items: [] } as never);
}

describe("ParCreateForm — cum începe cererea", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    navigate.mockReset();
    window.location.hash = "#/business/par/new";
    sessionStorage.clear();
    mockConfigApis();
  });

  it("[blocant] întreabă cum pornim când există șabloane sau cereri anterioare", async () => {
    vi.spyOn(parApi, "listParTemplates").mockResolvedValue({ templates: [template] } as never);
    vi.spyOn(parApi, "listPar").mockResolvedValue({ requests: [previous], total: 1 } as never);

    render(<ParCreateForm />);

    expect(await screen.findByRole("dialog", { name: /Cum începem cererea/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Începe de la zero/i })).toBeInTheDocument();
    expect(screen.getByText("Chirie birou lunară")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Repetă cererea PAR-2026-0009/i })).toBeInTheDocument();
  });

  it("„Începe de la zero” închide întrebarea și lasă formularul gol", async () => {
    vi.spyOn(parApi, "listParTemplates").mockResolvedValue({ templates: [template] } as never);
    vi.spyOn(parApi, "listPar").mockResolvedValue({ requests: [], total: 0 } as never);

    render(<ParCreateForm />);
    fireEvent.click(await screen.findByRole("button", { name: /Începe de la zero/i }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(await screen.findByRole("button", { name: /adaugă articol/i })).toBeInTheDocument();
    expect(navigate).not.toHaveBeenCalled();
  });

  it("nu întreabă nimic dacă nu există nici șabloane, nici cereri anterioare", async () => {
    vi.spyOn(parApi, "listParTemplates").mockResolvedValue({ templates: [] } as never);
    vi.spyOn(parApi, "listPar").mockResolvedValue({ requests: [], total: 0 } as never);

    render(<ParCreateForm />);
    await screen.findByRole("button", { name: /adaugă articol/i });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("ciornele NU se propun la repetare (o ciornă nu e un model)", async () => {
    vi.spyOn(parApi, "listParTemplates").mockResolvedValue({ templates: [] } as never);
    vi.spyOn(parApi, "listPar").mockResolvedValue({
      requests: [{ ...previous, id: "par-draft", requestNo: "PAR-2026-0010", status: "draft" }],
      total: 1,
    } as never);

    render(<ParCreateForm />);
    await screen.findByRole("button", { name: /adaugă articol/i });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("[blocant] pornirea din șablon deschide ciorna nouă în FORMULAR (/edit)", async () => {
    vi.spyOn(parApi, "listParTemplates").mockResolvedValue({ templates: [template] } as never);
    vi.spyOn(parApi, "listPar").mockResolvedValue({ requests: [], total: 0 } as never);
    const instantiate = vi
      .spyOn(parApi, "instantiateParTemplate")
      .mockResolvedValue({ par: { id: "par-new" }, line_items: [] } as never);

    render(<ParCreateForm />);
    fireEvent.click(await screen.findByRole("button", { name: /Chirie birou lunară/i }));

    await waitFor(() => expect(instantiate).toHaveBeenCalledWith("tmpl-1"));
    await waitFor(() => expect(navigate).toHaveBeenCalledWith("/business/par/par-new/edit"));
  });

  it("[blocant] „Repetă” duplică cererea și deschide COPIA în formular", async () => {
    vi.spyOn(parApi, "listParTemplates").mockResolvedValue({ templates: [] } as never);
    vi.spyOn(parApi, "listPar").mockResolvedValue({ requests: [previous], total: 1 } as never);
    const dup = vi.spyOn(parApi, "duplicatePar").mockResolvedValue({ par: { id: "par-copy" } } as never);

    render(<ParCreateForm />);
    fireEvent.click(await screen.findByRole("button", { name: /Repetă cererea PAR-2026-0009/i }));

    await waitFor(() => expect(dup).toHaveBeenCalledWith("par-9"));
    await waitFor(() => expect(navigate).toHaveBeenCalledWith("/business/par/par-copy/edit"));
  });
});
