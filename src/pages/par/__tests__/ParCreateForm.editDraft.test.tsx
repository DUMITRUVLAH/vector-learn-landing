/**
 * O ciornă salvată trebuie să se poată TRIMITE după ce e redeschisă.
 *
 * Bug prins de parcursul 02 din scripts/e2e-par-journeys.mjs (2026-08-26): la încărcarea unei
 * ciorne existente, formularul aducea articolele (se vedeau în tabel) dar NU și totalul —
 * `totalCents` rămânea 0. Validarea de trimitere se uită la total, așa că apăsând „Trimite pentru
 * aprobare" utilizatorul primea „Adaugă cel puțin un articol în secțiunea «Articole»" pe o ciornă
 * care avea articole. Rezultatul: „salvez acum, trimit mâine" era un drum înfundat.
 *
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ParCreateForm } from "../ParCreateForm";
import * as parApi from "@/lib/api/par";

vi.mock("@/router/HashRouter", () => ({
  useRouter: () => ({ path: "/business/par/draft-1/edit", navigate: vi.fn() }),
}));
vi.mock("@/hooks/useSession", () => ({
  useSession: () => ({
    data: { user: { id: "u-1", name: "Sirbu Cristina", email: "t@vector.md", role: "member" }, tenant: { id: "t-1", name: "ATIC" } },
  }),
}));
vi.mock("@/components/app/AppShell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

/** Ciornă cu UN articol de 1.500,00 MDL — exact cazul din parcurs. */
const draft = {
  id: "draft-1",
  tenantId: "t-1",
  requestNo: "PAR-2026-0002",
  dateOfRequest: "2026-08-26",
  requestedByUserId: "u-1",
  payerId: null,
  requestorTitle: "Specialist achiziții",
  requestorCode: null,
  departmentId: null,
  dateNeeded: null,
  projectId: null,
  budgetCodeId: null,
  budgetCodeNote: null,
  purpose: "execute_payment",
  chargeTo: "program",
  chargeBillingCode: null,
  endUse: "Materiale necesare biroului de proiect.",
  vendorId: null,
  payeeName: "Papetăria SRL",
  payeeIdnp: "2002600012345",
  payeeIban: "MD24AG000225100013104168",
  payeeBank: "MAIB",
  attachmentsPresent: false,
  attachmentsNote: null,
  currency: "MDL",
  totalEstimatedCents: 150000,
  status: "draft",
  submittedAt: null,
  approvedAt: null,
  paidAt: null,
  cancelledAt: null,
  createdAt: "2026-08-26",
  updatedAt: "2026-08-26",
  line_items: [
    {
      id: "li-1", tenantId: "t-1", parId: "draft-1", position: 1,
      description: "Materiale de birou", quantity: 10, unit: "buc",
      unitPriceCents: 15000, lineTotalCents: 150000,
      createdAt: "2026-08-26", updatedAt: "2026-08-26",
    },
  ],
  approvals: [],
  attachments: [],
  payment: null,
} as unknown as Awaited<ReturnType<typeof parApi.getPar>>;

function mockConfigApis() {
  vi.spyOn(parApi, "listDepartments").mockResolvedValue({ items: [] } as never);
  vi.spyOn(parApi, "listProjects").mockResolvedValue({ items: [] } as never);
  vi.spyOn(parApi, "listEvents").mockResolvedValue({ events: [] } as never);
  vi.spyOn(parApi, "listBudgetCodes").mockResolvedValue({ items: [] } as never);
  vi.spyOn(parApi, "listVendors").mockResolvedValue({ items: [] } as never);
  vi.spyOn(parApi, "listParTemplates").mockResolvedValue({ templates: [] } as never);
}

describe("ParCreateForm — redeschiderea unei ciorne salvate", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    window.location.hash = "#/business/par/draft-1/edit";
    mockConfigApis();
    vi.spyOn(parApi, "getPar").mockResolvedValue(draft);
  });

  it("aduce articolele ȘI totalul lor, nu 0", async () => {
    render(<ParCreateForm />);
    expect(await screen.findByText(/Materiale de birou/)).toBeInTheDocument();
    // Totalul afișat vine din server (150000 bani = 1.500,00), nu din starea goală a formularului.
    await waitFor(() => {
      const totalTexts = screen.getAllByText(/1[.\s]500/);
      expect(totalTexts.length).toBeGreaterThan(0);
    });
  });

  it("poate fi trimisă — nu mai cere „adaugă cel puțin un articol”", async () => {
    const submitSpy = vi.spyOn(parApi, "submitPar").mockResolvedValue({ id: "draft-1" } as never);
    vi.spyOn(parApi, "updatePar").mockResolvedValue(draft);
    vi.spyOn(parApi, "createVendor").mockResolvedValue({} as never);
    render(<ParCreateForm />);
    await screen.findByText(/Materiale de birou/);

    fireEvent.click(screen.getByRole("button", { name: /Trimite cererea pentru aprobare/i }));

    await waitFor(() => {
      expect(screen.queryByText(/Adaugă cel puțin un articol/i)).not.toBeInTheDocument();
    });
    await waitFor(() => expect(submitSpy).toHaveBeenCalledWith("draft-1"));
  });
});
