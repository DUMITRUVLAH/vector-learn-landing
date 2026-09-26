/**
 * Coada de finanțe — bara de pictograme spune ce face, la survolare.
 *
 * Owner, 26.09.2026 (captură de pe coada de finanțe): „când faci hover pe butoane să poți vedea
 * la ce acțiune se referă". Butoanele aveau `title`, deci pe hârtie aveau tooltip — în practică
 * ajutorul venea după 1–2 secunde, într-o casetă de sistem, iar omul de la finanțe ghicea între
 * cinci pictograme identice ca formă. Din cinci butoane, unul mută bani.
 *
 * Testul rulează ACȚIUNEA, nu doar afișarea (CLAUDE.md §3.5.1quater): survolează fiecare buton
 * al rândului și cere textul în pagină. Pe codul dinainte (doar `title`) pică — `title` e un
 * atribut, nu text randat.
 *
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
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
    id: "par-fin-tip",
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

/** Survolează butonul găsit după numele lui accesibil și întoarce textul apărut. */
async function hover(accessibleName: RegExp) {
  const btn = (await screen.findAllByRole("button", { name: accessibleName }))[0];
  fireEvent.pointerEnter(btn.parentElement!);
}

describe("Coada de finanțe — explicația pictogramelor", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(parApi, "getFinanceQueue").mockResolvedValue({ items: [item()], total: 1 });
    vi.spyOn(parApi, "listBudgetCodes").mockResolvedValue({ items: [] });
  });

  it("[blocant] plata — cea mai scumpă greșeală de click — își scrie numele la survolare", async () => {
    render(<ParFinanceQueue />);
    await hover(/Înregistrează plata pentru PAR-2026-0042/i);
    expect((await screen.findAllByText("Înregistrează plata")).length).toBeGreaterThan(0);
  });

  it("[blocant] arhivarea spune că scoate cererea din listă și că e reversibilă", async () => {
    render(<ParFinanceQueue />);
    await hover(/Arhivează cererea PAR-2026-0042/i);
    expect(
      (await screen.findAllByText("Arhivează — scoate cererea din lista de lucru (reversibil)")).length,
    ).toBeGreaterThan(0);
  });

  it("[blocant] secțiunea 16 și completarea nu se mai deosebesc ghicind", async () => {
    render(<ParFinanceQueue />);
    await hover(/Completează secțiunea 16 pentru PAR-2026-0042/i);
    expect((await screen.findAllByText("Secțiunea 16 — PAR BL, primit de, alocat la")).length).toBeGreaterThan(0);

    await hover(/Completează cererea PAR-2026-0042/i);
    expect(
      (await screen.findAllByText("Completează — linia de buget, descrierea, actele adiționale")).length,
    ).toBeGreaterThan(0);
  });

  it("[blocant] dosarul complet — pictograma de folder își spune numele", async () => {
    render(<ParFinanceQueue />);
    await hover(/Descarcă dosarul complet PDF pentru PAR-2026-0042/i);
    expect((await screen.findAllByText("Descarcă dosarul complet (PDF)")).length).toBeGreaterThan(0);
  });

  it("[normal] fără survolare, etichetele nu stau în pagină", async () => {
    render(<ParFinanceQueue />);
    await screen.findAllByRole("button", { name: /Înregistrează plata pentru PAR-2026-0042/i });
    expect(screen.queryByText("Înregistrează plata")).not.toBeInTheDocument();
    expect(screen.queryByText("Descarcă dosarul complet (PDF)")).not.toBeInTheDocument();
  });
});
