/**
 * Completarea de după semnare, din COADA de finanțe.
 *
 * Owner, 23.09.2026: „eu nu văd la coada finanțe să pot editez ceva". Controalele existau doar pe
 * fișa cererii — corect, dar inutil pentru cine lucrează din listă. Testele de aici apără exact
 * drumul scurt: butonul e pe rând, modala se deschide, iar la server pleacă DOAR ce s-a schimbat.
 *
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import ParFinanceQueue from "../ParFinanceQueue";
import * as parApi from "@/lib/api/par";
import type { ParFinanceQueueItem } from "@/lib/api/par";

vi.mock("@/router/HashRouter", () => ({
  useRouter: () => ({ path: "/business/par/finance", navigate: vi.fn() }),
}));
vi.mock("@/components/app/AppShell", () => ({
  AppShell: ({ children, actions }: { children: React.ReactNode; actions?: React.ReactNode }) => (
    <div data-testid="app-shell">{actions}{children}</div>
  ),
}));
vi.mock("@/components/par/ParStatusChip", () => ({
  ParStatusChip: ({ status }: { status: string }) => <span>{status}</span>,
}));

function item(overrides: Partial<ParFinanceQueueItem> = {}): ParFinanceQueueItem {
  return {
    id: "par-fin-amend",
    tenantId: "tenant-1",
    requestNo: "PAR-2026-0042",
    dateOfRequest: new Date().toISOString(),
    requestedByUserId: "user-requestor",
    requestorTitle: null,
    departmentId: null,
    dateNeeded: null,
    payerId: "payer-1",
    projectId: "proj-1",
    budgetCodeId: "bc-1",
    budgetCodeNote: null,
    purpose: "execute_payment",
    chargeTo: "program",
    chargeBillingCode: null,
    endUse: "Consultanță",
    vendorId: null,
    payeeName: "Furnizor SRL",
    payeeIdnp: "2008001007903",
    payeeIban: "MD48ML000002259A19498121",
    payeeBank: "Moldindconbank",
    attachmentsPresent: false,
    attachmentsNote: null,
    currency: "MDL",
    totalEstimatedCents: 700000,
    status: "in_finance",
    submittedAt: null,
    approvedAt: new Date().toISOString(),
    paidAt: null,
    cancelledAt: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    above_micro_threshold: true,
    payment: null,
    budgetCodeLabel: "6-1-01 — Traduceri",
    ...overrides,
  } as ParFinanceQueueItem;
}

describe("Coada de finanțe — completarea de după semnare", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(parApi, "getFinanceQueue").mockResolvedValue({ items: [item()], total: 1 });
    vi.spyOn(parApi, "listBudgetCodes").mockResolvedValue({
      items: [
        { id: "bc-1", payerId: "payer-1", projectId: "proj-1", code: "6-1-01", name: "Traduceri", active: true },
        { id: "bc-2", payerId: "payer-1", projectId: null, code: "6-2-03", name: "Administrativ", active: true },
      ],
    });
  });

  it("[blocant] rândul din coadă are „Completează”, nu doar fișa cererii", async () => {
    render(<ParFinanceQueue />);
    const btn = await screen.findAllByRole("button", { name: /Completează cererea PAR-2026-0042/i });
    expect(btn.length).toBeGreaterThan(0);
  });

  it("[blocant] salvează descrierea și trimite DOAR câmpul schimbat", async () => {
    const update = vi.spyOn(parApi, "updatePar").mockResolvedValue({} as never);
    render(<ParFinanceQueue />);

    fireEvent.click((await screen.findAllByRole("button", { name: /Completează cererea PAR-2026-0042/i }))[0]);
    await screen.findByText("Completează cererea");

    fireEvent.change(screen.getByLabelText("Descrierea utilizării finale"), {
      target: { value: "Traduceri pentru atelierul din septembrie." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Salvează" }));

    await waitFor(() => expect(update).toHaveBeenCalled());
    const [id, payload] = update.mock.calls[0];
    expect(id).toBe("par-fin-amend");
    expect(payload).toEqual({ end_use: "Traduceri pentru atelierul din septembrie." });
    // Banii nu pleacă de aici nici din greșeală.
    expect(Object.keys(payload)).not.toContain("currency");
    expect(Object.keys(payload)).not.toContain("payee_iban");
    expect(Object.keys(payload)).not.toContain("total_estimated_cents");
  });

  it("[blocant] schimbarea liniei de buget pleacă la server cu id-ul noului cod", async () => {
    const update = vi.spyOn(parApi, "updatePar").mockResolvedValue({} as never);
    render(<ParFinanceQueue />);

    fireEvent.click((await screen.findAllByRole("button", { name: /Completează cererea PAR-2026-0042/i }))[0]);
    await screen.findByText("Completează cererea");

    const combo = screen.getByLabelText("Linia de buget");
    fireEvent.change(combo, { target: { value: "6-2-03" } });
    fireEvent.click(await screen.findByText("6-2-03"));
    fireEvent.click(screen.getByRole("button", { name: "Salvează" }));

    await waitFor(() => expect(update).toHaveBeenCalledWith("par-fin-amend", { budget_code_id: "bc-2" }));
  });

  it("[normal] o salvare fără nicio schimbare nu scrie nimic — jurnalul nu se umple degeaba", async () => {
    const update = vi.spyOn(parApi, "updatePar").mockResolvedValue({} as never);
    render(<ParFinanceQueue />);

    fireEvent.click((await screen.findAllByRole("button", { name: /Completează cererea PAR-2026-0042/i }))[0]);
    await screen.findByText("Completează cererea");
    fireEvent.click(screen.getByRole("button", { name: "Salvează" }));

    await waitFor(() => expect(screen.queryByText("Completează cererea")).not.toBeInTheDocument());
    expect(update).not.toHaveBeenCalled();
  });

  it("[normal] în arhivă nu se mai completează", async () => {
    vi.spyOn(parApi, "getFinanceQueue").mockImplementation(async (opts?: { archived?: boolean }) => ({
      items: [item({ status: "paid", payeeName: opts?.archived ? "ARHIVAT SRL" : "Furnizor SRL" })],
      total: 1,
      activeCount: 1,
      archivedCount: 1,
    }));
    render(<ParFinanceQueue />);
    await screen.findByText("Furnizor SRL");

    fireEvent.click(screen.getByRole("tab", { name: /arhivate/i }));
    await screen.findByText("ARHIVAT SRL");

    expect(screen.queryByRole("button", { name: /Completează cererea/i })).not.toBeInTheDocument();
  });
});
