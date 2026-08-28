/**
 * Urgency flag (owner request, 2026-08-28) — ParCreateForm "Urgent" toggle.
 *
 * Tests, by ACTION (§3.5.1quater), not just render:
 *   - the toggle reveals the reason/date/note fields when switched on
 *   - submitting urgent=on without a reason is BLOCKED client-side (submitPar never called)
 *   - submitting urgent=on with reason="other" and no note is BLOCKED client-side
 *   - filling every required urgent field lets the request submit
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
    currency: "MDL",
    totalEstimatedCents: 150000,
    isUrgent: false,
    urgentReason: null,
    urgentReasonNote: null,
    urgentDueDate: null,
    status: "draft",
    submittedAt: null,
    approvedAt: null,
    paidAt: null,
    cancelledAt: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  } as ParRequest;
}

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

/** Umple ce e nevoie ca cererea să fie altfel valabilă (articol + beneficiar + utilizare finală),
 *  cu un IBAN moldovenesc valid — ca niciun avertisment de rechizite să nu ceară un al doilea clic. */
async function fillBaseRequest() {
  render(<ParCreateForm />);
  await screen.findByRole("button", { name: /adaugă articol/i });

  fireEvent.change(screen.getByLabelText(/Descriere \/ Specificații/i), { target: { value: "Traducere" } });
  fireEvent.change(screen.getByLabelText(/^Preț\/u/i), { target: { value: "1500" } });
  fireEvent.click(screen.getByRole("button", { name: /adaugă articol/i }));
  await waitFor(() => expect(parApi.addLineItem).toHaveBeenCalled());

  fireEvent.click(screen.getByRole("button", { name: /introdu manual/i }));
  await waitFor(() => expect(screen.getByLabelText(/Denumire companie/i)).toBeInTheDocument());
  fireEvent.change(screen.getByLabelText(/Denumire companie/i), { target: { value: "Bordei Viorica" } });
  fireEvent.change(screen.getByLabelText(/^IBAN/i), { target: { value: "MD48ML000002259A19498121" } });
  const endUse = document.getElementById("endUse") as HTMLTextAreaElement;
  fireEvent.change(endUse, { target: { value: "Traducere documente" } });
}

describe("ParCreateForm — cerere urgentă", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    navigate.mockReset();
    mockApis();
  });

  it("toggle-ul dezvăluie motivul / termenul limită / notă când e activat", async () => {
    await fillBaseRequest();

    expect(screen.queryByLabelText(/Motivul urgenței/i)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("switch", { name: /marchează cererea ca urgentă/i }));

    expect(screen.getByLabelText(/Motivul urgenței/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Termen limită plată/i)).toBeInTheDocument();
  });

  it("[blocant] urgent=pornit fără motiv → trimiterea e blocată, submitPar nu e chemat", async () => {
    await fillBaseRequest();
    fireEvent.click(screen.getByRole("switch", { name: /marchează cererea ca urgentă/i }));

    fireEvent.click(screen.getByRole("button", { name: /trimite cererea pentru aprobare/i }));

    await waitFor(() => expect(screen.getAllByText(/alege un motiv pentru urgență/i).length).toBeGreaterThan(0));
    expect(parApi.submitPar).not.toHaveBeenCalled();
  });

  it("[blocant] motiv „Alt motiv” fără notă → trimiterea e blocată", async () => {
    await fillBaseRequest();
    fireEvent.click(screen.getByRole("switch", { name: /marchează cererea ca urgentă/i }));
    fireEvent.change(screen.getByLabelText(/Motivul urgenței/i), { target: { value: "other" } });
    fireEvent.change(screen.getByLabelText(/Termen limită plată/i), { target: { value: "2026-09-15" } });

    fireEvent.click(screen.getByRole("button", { name: /trimite cererea pentru aprobare/i }));

    await waitFor(() => expect(screen.getAllByText(/detaliază motivul/i).length).toBeGreaterThan(0));
    expect(parApi.submitPar).not.toHaveBeenCalled();
  });

  it("[blocant] cu motiv + termen completate, cererea urgentă chiar pleacă", async () => {
    await fillBaseRequest();
    fireEvent.click(screen.getByRole("switch", { name: /marchează cererea ca urgentă/i }));
    fireEvent.change(screen.getByLabelText(/Motivul urgenței/i), { target: { value: "contract_deadline" } });
    fireEvent.change(screen.getByLabelText(/Termen limită plată/i), { target: { value: "2026-09-15" } });

    fireEvent.click(screen.getByRole("button", { name: /trimite cererea pentru aprobare/i }));

    await waitFor(() => expect(parApi.submitPar).toHaveBeenCalledTimes(1));
    expect(parApi.updatePar).toHaveBeenCalledWith(
      "par-1",
      expect.objectContaining({
        is_urgent: true,
        urgent_reason: "contract_deadline",
      }),
    );
  });
});
