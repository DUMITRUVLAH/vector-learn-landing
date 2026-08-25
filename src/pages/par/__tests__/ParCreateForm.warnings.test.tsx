/**
 * Rechizitele beneficiarului: ATENȚIONĂM, NU BLOCĂM (decizie owner, 2026-08-21).
 *
 * „Lasă să dea niște atenționări dacă nu corespunde, dar să lase într-un final să dea PAR-ul și
 * să meargă mai departe." Testele de aici verifică exact acest contract, prin ACȚIUNE (§3.5.1quater):
 * apăsăm butonul de trimitere de două ori și ne uităm dacă `submitPar` chiar a fost chemat.
 *
 * Riscul pe care îl acoperă: e ușor ca un refactor viitor să pună la loc IBAN-ul în `fieldErrors`
 * și să reintroducă zidul, fără ca nimeni să observe — formularul ar arăta la fel, doar că butonul
 * n-ar mai face nimic.
 *
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ParCreateForm } from "../ParCreateForm";
import * as parApi from "@/lib/api/par";
import type { ParRequest } from "@/lib/api/par";

const navigate = vi.fn();
vi.mock("@/router/HashRouter", () => ({
  useRouter: () => ({ path: "/business/par/new", navigate }),
}));
vi.mock("@/hooks/useSession", () => ({
  useSession: () => ({
    data: {
      user: { id: "u-1", name: "Test User", email: "t@vector.md", role: "member" },
      tenant: { id: "t-1", name: "ATIC" },
    },
  }),
}));
vi.mock("@/components/app/AppShell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

function draftPar(): ParRequest {
  return {
    id: "par-1",
    tenantId: "t-1",
    requestNo: "PAR-2026-0099",
    dateOfRequest: new Date().toISOString(),
    requestedByUserId: "u-1",
    requestorTitle: null,
    departmentId: null,
    dateNeeded: null,
    projectId: null,
    budgetCodeId: null,
    budgetCodeNote: null,
    purpose: "execute_payment",
    chargeTo: "program",
    chargeBillingCode: null,
    endUse: "Servicii de traducere",
    vendorId: null,
    payeeName: null,
    payeeIdnp: null,
    payeeIban: null,
    payeeBank: null,
    attachmentsPresent: false,
    attachmentsNote: null,
    currency: "EUR",
    totalEstimatedCents: 150000,
    status: "draft",
    submittedAt: null,
    approvedAt: null,
    paidAt: null,
    cancelledAt: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  } as ParRequest;
}

/** Ciornă cu un articol deja adăugat — ca să nu pice pe validările CHIAR blocante. */
function mockApis() {
  vi.spyOn(parApi, "listDepartments").mockResolvedValue({ items: [] });
  vi.spyOn(parApi, "listProjects").mockResolvedValue({ items: [] });
  vi.spyOn(parApi, "listEvents").mockResolvedValue({ events: [] });
  vi.spyOn(parApi, "listBudgetCodes").mockResolvedValue({ items: [] });
  vi.spyOn(parApi, "listVendors").mockResolvedValue({ items: [] });
  vi.spyOn(parApi, "listParTemplates").mockResolvedValue({ templates: [] });
  vi.spyOn(parApi, "createPar").mockResolvedValue(draftPar());
  vi.spyOn(parApi, "updatePar").mockResolvedValue(draftPar());
  vi.spyOn(parApi, "createVendor").mockResolvedValue({ id: "v-1" } as never);
  vi.spyOn(parApi, "submitPar").mockResolvedValue({
    ...draftPar(),
    status: "pending_approval",
  } as never);
  vi.spyOn(parApi, "addLineItem").mockResolvedValue({
    line_item: {
      id: "li-1",
      parId: "par-1",
      position: 1,
      description: "Traducere",
      quantity: 1,
      unit: "servicii",
      unitPriceCents: 150000,
      lineTotalCents: 150000,
    },
    par_total_estimated_cents: 150000,
    above_micro_threshold: false,
  } as never);
}

/** Umple formularul cu un beneficiar al cărui IBAN NU trece verificarea. */
async function fillWithSuspiciousIban() {
  render(<ParCreateForm />);
  await screen.findByRole("button", { name: /adaugă articol/i });

  fireEvent.change(screen.getByLabelText(/Descriere \/ Specificații/i), { target: { value: "Traducere" } });
  fireEvent.change(screen.getByLabelText(/^Preț\/u/i), { target: { value: "1500" } });
  fireEvent.click(screen.getByRole("button", { name: /adaugă articol/i }));
  await waitFor(() => expect(parApi.addLineItem).toHaveBeenCalled());

  fireEvent.click(screen.getByRole("button", { name: /introdu manual/i }));
  await waitFor(() => expect(screen.getByLabelText(/Denumire companie/i)).toBeInTheDocument());
  fireEvent.change(screen.getByLabelText(/Denumire companie/i), { target: { value: "Bordei Viorica" } });
  // Checksum stricat: exact genul de valoare pe care validatorul o semnalează.
  fireEvent.change(screen.getByLabelText(/^IBAN/i), { target: { value: "EE172200221068653841" } });
  // „Utilizare finală → Descriere" — luat după id, ca să nu se confunde cu „Descriere /
  // Specificații" (articol) sau „Descriere atașamente".
  const endUse = document.getElementById("endUse") as HTMLTextAreaElement;
  fireEvent.change(endUse, { target: { value: "Traducere documente" } });
}

describe("ParCreateForm — atenționări care nu blochează", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    navigate.mockReset();
    mockApis();
  });

  it("[blocant] un IBAN care nu trece verificarea e semnalat, apoi cererea PLEACĂ la a doua apăsare", async () => {
    await fillWithSuspiciousIban();
    const submitBtn = screen.getByRole("button", { name: /trimite cererea pentru aprobare/i });

    // Prima apăsare: doar avertizează. NU trimite.
    fireEvent.click(submitBtn);
    await waitFor(() => expect(screen.getByText(/apasă din nou/i)).toBeInTheDocument());
    expect(parApi.submitPar).not.toHaveBeenCalled();

    // A doua apăsare: trimite, exact ca la o cerere fără semnale.
    fireEvent.click(submitBtn);
    await waitFor(() => expect(parApi.submitPar).toHaveBeenCalledTimes(1));
  });

  it("avertismentul e AFIȘAT, nu ascuns — omul vede ce anume nu corespunde", async () => {
    await fillWithSuspiciousIban();
    // Mesajul apare lângă câmp fără să fie nevoie de vreo apăsare.
    await waitFor(() =>
      expect(screen.getAllByText(/cifrele de control nu se potrivesc/i).length).toBeGreaterThan(0)
    );
  });
});
