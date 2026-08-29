/**
 * După trimitere, aplicația întreabă dacă cererea devine șablon (cerere owner, 2026-08-29).
 * Momentul e ales intenționat: cererea tocmai a trecut validarea, deci e un model bun.
 *
 * Regulile verificate aici:
 *   · dialogul apare DUPĂ un submit reușit, cu un nume propus (nu gol);
 *   · „Salvează șablonul" cheamă API-ul cu id-ul cererii trimise, apoi duce la cerere;
 *   · „Nu, mulțumesc" nu salvează nimic, dar tot duce la cerere — trimiterea nu se blochează
 *     în dialog;
 *   · o ciornă care a PORNIT dintr-un șablon/o repetare nu mai e întrebată (modelul există).
 *
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ParCreateForm } from "../ParCreateForm";
import * as parApi from "@/lib/api/par";

const navigate = vi.fn();
vi.mock("@/router/HashRouter", () => ({
  useRouter: () => ({ path: "/business/par/draft-1/edit", navigate: (p: string) => navigate(p) }),
}));
vi.mock("@/hooks/useSession", () => ({
  useSession: () => ({
    data: { user: { id: "u-1", name: "Test User", email: "t@vector.md", role: "member" }, tenant: { id: "t-1", name: "ATIC" } },
  }),
}));
vi.mock("@/components/app/AppShell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

/** Ciornă completă: articole + utilizare finală + beneficiar cu IBAN valid → trece validarea. */
const draft = {
  id: "draft-1",
  tenantId: "t-1",
  requestNo: "PAR-2026-0002",
  dateOfRequest: "2026-08-29",
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
  createdAt: "2026-08-29",
  updatedAt: "2026-08-29",
  line_items: [
    {
      id: "li-1", tenantId: "t-1", parId: "draft-1", position: 1,
      description: "Materiale de birou", quantity: 10, unit: "buc",
      unitPriceCents: 15000, lineTotalCents: 150000,
      createdAt: "2026-08-29", updatedAt: "2026-08-29",
    },
  ],
  approvals: [],
  attachments: [],
  payment: null,
} as unknown as Awaited<ReturnType<typeof parApi.getPar>>;

function mockApis() {
  vi.spyOn(parApi, "listDepartments").mockResolvedValue({ items: [] } as never);
  vi.spyOn(parApi, "listProjects").mockResolvedValue({ items: [] } as never);
  vi.spyOn(parApi, "listEvents").mockResolvedValue({ events: [] } as never);
  vi.spyOn(parApi, "listBudgetCodes").mockResolvedValue({ items: [] } as never);
  vi.spyOn(parApi, "listVendors").mockResolvedValue({ items: [] } as never);
  vi.spyOn(parApi, "listParTemplates").mockResolvedValue({ templates: [] } as never);
  vi.spyOn(parApi, "getPar").mockResolvedValue(draft);
  vi.spyOn(parApi, "updatePar").mockResolvedValue(draft);
  vi.spyOn(parApi, "createVendor").mockResolvedValue({} as never);
  vi.spyOn(parApi, "submitPar").mockResolvedValue({ id: "draft-1", requestNo: "PAR-2026-0002" } as never);
}

async function submitTheDraft() {
  render(<ParCreateForm />);
  await screen.findByText(/Materiale de birou/);
  fireEvent.click(screen.getByRole("button", { name: /Trimite cererea pentru aprobare/i }));
}

describe("ParCreateForm — întrebarea „salvezi ca șablon?” după trimitere", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    navigate.mockReset();
    window.location.hash = "#/business/par/draft-1/edit";
    sessionStorage.clear();
    mockApis();
  });

  it("[blocant] întreabă după trimitere, cu un nume propus din cerere", async () => {
    await submitTheDraft();

    expect(await screen.findByRole("dialog", { name: /Salvezi cererea ca șablon/i })).toBeInTheDocument();
    const nameInput = screen.getByLabelText(/Numele șablonului/i) as HTMLInputElement;
    expect(nameInput.value).toBe("Materiale de birou");
    // Nu duce nicăieri până nu răspunde omul.
    expect(navigate).not.toHaveBeenCalled();
  });

  it("[blocant] „Salvează șablonul” salvează cererea trimisă, apoi deschide cererea", async () => {
    const save = vi.spyOn(parApi, "saveParTemplate").mockResolvedValue({ id: "tmpl-9" } as never);
    await submitTheDraft();
    await screen.findByRole("dialog", { name: /Salvezi cererea ca șablon/i });

    fireEvent.change(screen.getByLabelText(/Numele șablonului/i), { target: { value: "Papetărie lunară" } });
    fireEvent.click(screen.getByRole("button", { name: /Salvează șablonul/i }));

    await waitFor(() => expect(save).toHaveBeenCalledWith({ name: "Papetărie lunară", parId: "draft-1" }));
    await waitFor(() => expect(navigate).toHaveBeenCalledWith("/business/par/draft-1"));
  });

  it("„Nu, mulțumesc” nu salvează nimic și duce tot la cererea trimisă", async () => {
    const save = vi.spyOn(parApi, "saveParTemplate").mockResolvedValue({ id: "tmpl-9" } as never);
    await submitTheDraft();
    await screen.findByRole("dialog", { name: /Salvezi cererea ca șablon/i });

    fireEvent.click(screen.getByRole("button", { name: /Nu, mulțumesc/i }));

    await waitFor(() => expect(navigate).toHaveBeenCalledWith("/business/par/draft-1"));
    expect(save).not.toHaveBeenCalled();
  });

  it("nu întreabă dacă ciorna a pornit ea însăși dintr-un șablon / o repetare", async () => {
    sessionStorage.setItem("par.startedFromTemplate", "draft-1");
    await submitTheDraft();

    await waitFor(() => expect(navigate).toHaveBeenCalledWith("/business/par/draft-1"));
    expect(screen.queryByRole("dialog", { name: /Salvezi cererea ca șablon/i })).not.toBeInTheDocument();
  });
});
