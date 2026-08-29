/**
 * „Repetă” direct din LISTA de cereri (cerere owner, 2026-08-29): „de dorit direct din lista de
 * paruri, nu neapărat să intru la el, și dacă îl repet atunci să se deschidă noul par”.
 *
 * Deci: buton pe rând → duplicare pe server → navigare la COPIE, în formular (`/edit`).
 * Butonul nu trebuie să declanșeze și deschiderea cererii vechi (rândul întreg e clicabil).
 *
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ParDashboard } from "../ParDashboard";
import * as parApi from "@/lib/api/par";
import type { ParRequest } from "@/lib/api/par";

const navigate = vi.fn();
vi.mock("@/router/HashRouter", () => ({
  useRouter: () => ({ path: "/business/par", navigate: (p: string) => navigate(p) }),
}));
vi.mock("@/components/app/AppShell", () => ({
  AppShell: ({ children, pageTitle, actions }: { children: React.ReactNode; pageTitle?: React.ReactNode; actions?: React.ReactNode }) => (
    <div>{pageTitle ? <h1>{pageTitle}</h1> : null}{actions}{children}</div>
  ),
}));

const row = {
  id: "par-7",
  tenantId: "t-1",
  requestNo: "PAR-2026-0007",
  dateOfRequest: new Date().toISOString(),
  requestedByUserId: "u-1",
  payerId: null,
  requestorTitle: null,
  requestorCode: null,
  departmentId: null,
  dateNeeded: null,
  projectId: null,
  budgetCodeId: null,
  budgetCodeNote: null,
  purpose: "execute_payment",
  chargeTo: "program",
  chargeBillingCode: null,
  endUse: null,
  vendorId: null,
  payeeName: "Chirie SRL",
  payeeIdnp: null,
  payeeIban: null,
  payeeBank: null,
  attachmentsPresent: false,
  attachmentsNote: null,
  currency: "MDL",
  totalEstimatedCents: 500000,
  above_micro_threshold: false,
  status: "paid",
  submittedAt: null,
  approvedAt: null,
  paidAt: null,
  cancelledAt: null,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
} as unknown as ParRequest & { above_micro_threshold: boolean };

describe("ParDashboard — „Repetă” din listă", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    navigate.mockReset();
    vi.spyOn(parApi, "listPar").mockResolvedValue({ requests: [row], total: 1 } as never);
  });

  it("[blocant] fiecare rând are „Repetă” — copia se deschide în formular, nu cererea veche", async () => {
    const dup = vi.spyOn(parApi, "duplicatePar").mockResolvedValue({ par: { id: "par-copy" } } as never);
    render(<ParDashboard />);

    const btn = await screen.findByRole("button", { name: /Repetă cererea PAR-2026-0007/i });
    fireEvent.click(btn);

    await waitFor(() => expect(dup).toHaveBeenCalledWith("par-7"));
    await waitFor(() => expect(navigate).toHaveBeenCalledWith("/business/par/par-copy/edit"));
    // Rândul e clicabil; butonul NU trebuie să ducă și la cererea sursă.
    expect(navigate).not.toHaveBeenCalledWith("/business/par/par-7");
  });

  it("o eroare de duplicare se spune, nu se pierde", async () => {
    vi.spyOn(parApi, "duplicatePar").mockRejectedValue(new Error("boom"));
    render(<ParDashboard />);

    fireEvent.click(await screen.findByRole("button", { name: /Repetă cererea PAR-2026-0007/i }));

    expect(await screen.findByText(/Nu am putut repeta cererea/i)).toBeInTheDocument();
    expect(navigate).not.toHaveBeenCalled();
  });
});
