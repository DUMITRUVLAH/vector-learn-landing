/**
 * Secțiunea 13 („Documente") și numerotarea articolelor — cele două reclamații din 16.09.2026.
 *
 * 1. Tipul se alegea o singură dată, în capul secțiunii, pentru TOT lotul de fișiere: cine urca
 *    dintr-o dată contractul, actul de primire și buletinul primea trei rânduri „Contract" și
 *    nicio cale de îndreptare în afară de ștergere + reîncărcare.
 * 2. La ștergerea unui articol, numerotarea rămânea cu lacune („4, 5, 8, 9").
 *
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ParCreateForm } from "../ParCreateForm";
import * as parApi from "@/lib/api/par";

vi.mock("@/router/HashRouter", () => ({
  useRouter: () => ({ path: "/business/par/draft-9/edit", navigate: vi.fn() }),
}));
vi.mock("@/hooks/useSession", () => ({
  useSession: () => ({
    data: { user: { id: "u-1", name: "Sirbu Cristina", email: "t@vector.md", role: "member" }, tenant: { id: "t-1", name: "ATIC" } },
  }),
}));
vi.mock("@/components/app/AppShell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

function line(id: string, position: number, description: string) {
  return {
    id, tenantId: "t-1", parId: "draft-9", position, description,
    quantity: 1, unit: "buc", unitPriceCents: 10000, lineTotalCents: 10000,
    createdAt: "2026-09-16", updatedAt: "2026-09-16",
  };
}

/** Lotul urcat dintr-o singură fereastră: toate trei au primit tipul ales atunci. */
const attachments = [
  { id: "att-1", fileName: "contract.pdf", kind: "contract", kindOther: null, uploadedBy: "u-1", createdAt: "2026-09-16" },
  { id: "att-2", fileName: "act-primire.pdf", kind: "contract", kindOther: null, uploadedBy: "u-1", createdAt: "2026-09-16" },
  { id: "att-3", fileName: "buletin.pdf", kind: "contract", kindOther: null, uploadedBy: "u-1", createdAt: "2026-09-16" },
];

const draft = {
  id: "draft-9",
  tenantId: "t-1",
  requestNo: "PAR-2026-0009",
  dateOfRequest: "2026-09-16",
  requestedByUserId: "u-1",
  payerId: null,
  requestorTitle: "Specialist achiziții",
  purpose: "execute_payment",
  chargeTo: "program",
  endUse: "Abonamente pentru echipa de comunicare.",
  payeeName: "Mailchimp",
  payeeIban: "MD24AG000225100013104168",
  attachmentsPresent: true,
  attachmentsNote: null,
  currency: "MDL",
  totalEstimatedCents: 30000,
  status: "draft",
  createdAt: "2026-09-16",
  updatedAt: "2026-09-16",
  line_items: [
    line("li-1", 1, "Mailchimp — abonament"),
    line("li-2", 2, "Canva — abonament"),
    line("li-3", 3, "Zoom — abonament"),
  ],
  approvals: [],
  attachments,
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

describe("Secțiunea 13 — tipul se schimbă la fiecare fișier", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    window.location.hash = "#/business/par/draft-9/edit";
    mockConfigApis();
    vi.spyOn(parApi, "getPar").mockResolvedValue(draft);
  });

  it("[blocant] fiecare fișier are propriul selector de tip, iar schimbarea se salvează", async () => {
    const spy = vi.spyOn(parApi, "updateAttachmentKind").mockResolvedValue({
      ...attachments[1], kind: "act_of_receipt",
    } as never);
    render(<ParCreateForm />);

    const select = await screen.findByLabelText("Tip document pentru act-primire.pdf");
    fireEvent.change(select, { target: { value: "act_of_receipt" } });

    await waitFor(() =>
      expect(spy).toHaveBeenCalledWith("draft-9", "att-2", { kind: "act_of_receipt" })
    );
    // Celelalte fișiere rămân pe tipul lor — se corectează rândul, nu tot lotul.
    expect((await screen.findByLabelText("Tip document pentru contract.pdf") as HTMLSelectElement).value).toBe("contract");
  });

  it("[blocant] „Altul” cere numele documentului și îl salvează la ieșirea din câmp", async () => {
    const spy = vi.spyOn(parApi, "updateAttachmentKind").mockResolvedValue({
      ...attachments[2], kind: "other", kindOther: "Buletin de identitate",
    } as never);
    render(<ParCreateForm />);

    const select = await screen.findByLabelText("Tip document pentru buletin.pdf");
    fireEvent.change(select, { target: { value: "other" } });
    // Fără nume nu se salvează nimic: „Alt document" e exact eticheta goală din reclamație.
    expect(spy).not.toHaveBeenCalled();

    const name = await screen.findByLabelText("Ce document este buletin.pdf");
    fireEvent.change(name, { target: { value: "Buletin de identitate" } });
    fireEvent.blur(name);

    await waitFor(() =>
      expect(spy).toHaveBeenCalledWith("draft-9", "att-3", { kind: "other", kind_other: "Buletin de identitate" })
    );
  });
});

describe("Secțiunea 10 — numerotarea după ștergerea unui articol", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    window.location.hash = "#/business/par/draft-9/edit";
    mockConfigApis();
    vi.spyOn(parApi, "getPar").mockResolvedValue(draft);
  });

  it("[blocant] rândurile rămase se renumerotează 1..n, fără lacune", async () => {
    vi.spyOn(parApi, "deleteLineItem").mockResolvedValue({
      ok: true,
      par_total_estimated_cents: 20000,
      above_micro_threshold: false,
      line_items: [{ id: "li-1", position: 1 }, { id: "li-3", position: 2 }],
    });
    render(<ParCreateForm />);
    await screen.findByText("Canva — abonament");

    fireEvent.click(screen.getByRole("button", { name: "Șterge rândul 2" }));

    await waitFor(() => expect(screen.queryByText("Canva — abonament")).not.toBeInTheDocument());
    const row = screen.getByText("Zoom — abonament").closest("tr")!;
    expect(row.querySelector("td")!.textContent).toBe("2");
  });
});
