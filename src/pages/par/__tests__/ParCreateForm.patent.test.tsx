/**
 * Patenta de întreprinzător în formularul de cerere.
 *
 * De ce merită test: patenta se prelungește lunar, deci un beneficiar salvat luna trecută are
 * termenul trecut luna asta. Avertismentul trebuie să apară ACOLO unde omul completează, iar
 * datele să plece la server — un câmp care se afișează dar nu se salvează e mai rău decât
 * niciun câmp. Testăm ACȚIUNEA (§3.5.1quater): bifăm, scriem, salvăm, ne uităm în payload.
 *
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ParCreateForm } from "../ParCreateForm";
import * as parApi from "@/lib/api/par";
import type { ParRequest, ParVendor } from "@/lib/api/par";

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
    id: "par-1", tenantId: "t-1", requestNo: "PAR-2026-0100",
    dateOfRequest: new Date().toISOString(), requestedByUserId: "u-1",
    requestorTitle: null, departmentId: null, dateNeeded: null, projectId: null,
    budgetCodeId: null, budgetCodeNote: null, purpose: "execute_payment",
    chargeTo: "program", chargeBillingCode: null, endUse: null, vendorId: null,
    payeeName: null, payeeIdnp: null, payeeIban: null, payeeBank: null,
    attachmentsPresent: false, attachmentsNote: null, currency: "MDL",
    totalEstimatedCents: 0, status: "draft", submittedAt: null, approvedAt: null,
    paidAt: null, cancelledAt: null,
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  } as ParRequest;
}

/** Un beneficiar salvat acum câteva luni, cu patenta EXPIRATĂ între timp. */
const EXPIRED_VENDOR: ParVendor = {
  id: "v-exp", name: "Roitman Daria", idnp: "2008001007903",
  iban: "MD48ML000002259A19498121", bank: "BC Moldindconbank S.A.", active: true,
  isPatentHolder: true, patentSeries: "AA 0123456", patentValidUntil: "2020-01-31",
};

function mockApis(vendors: ParVendor[] = []) {
  vi.spyOn(parApi, "listDepartments").mockResolvedValue({ items: [] });
  vi.spyOn(parApi, "listProjects").mockResolvedValue({ items: [] });
  vi.spyOn(parApi, "listEvents").mockResolvedValue({ events: [] });
  vi.spyOn(parApi, "listBudgetCodes").mockResolvedValue({ items: [] });
  vi.spyOn(parApi, "listVendors").mockResolvedValue({ items: vendors });
  vi.spyOn(parApi, "listParTemplates").mockResolvedValue({ templates: [] });
  vi.spyOn(parApi, "createPar").mockResolvedValue(draftPar());
  vi.spyOn(parApi, "updatePar").mockResolvedValue(draftPar());
}

async function openManualPayee() {
  render(<ParCreateForm />);
  await screen.findByRole("button", { name: /adaugă articol/i });
  fireEvent.click(screen.getByRole("button", { name: /persoană fizică/i }));
  fireEvent.click(screen.getByRole("button", { name: /introdu manual/i }));
  await waitFor(() => expect(screen.getByLabelText(/Nume, Prenume/i)).toBeInTheDocument());
}

describe("ParCreateForm — patenta de întreprinzător", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    navigate.mockReset();
    mockApis();
  });

  it("apare DOAR la persoană fizică — o companie nu are patentă", async () => {
    render(<ParCreateForm />);
    await screen.findByRole("button", { name: /adaugă articol/i });
    fireEvent.click(screen.getByRole("button", { name: /introdu manual/i }));
    await waitFor(() => expect(screen.getByLabelText(/Denumire companie/i)).toBeInTheDocument());
    expect(screen.queryByLabelText(/patentei/i)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /persoană fizică/i }));
    expect(screen.getByLabelText(/baza patentei de întreprinzător/i)).toBeInTheDocument();
  });

  it("[blocant] un termen trecut e semnalat ca EXPIRAT, cu data lui", async () => {
    await openManualPayee();
    fireEvent.click(screen.getByLabelText(/baza patentei de întreprinzător/i));
    fireEvent.change(screen.getByLabelText(/Valabilă până la/i), { target: { value: "2020-01-31" } });

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toMatch(/EXPIRAT/);
    expect(alert.textContent).toContain("31.01.2020");
  });

  it("un termen viitor NU alarmează", async () => {
    await openManualPayee();
    fireEvent.click(screen.getByLabelText(/baza patentei de întreprinzător/i));
    fireEvent.change(screen.getByLabelText(/Valabilă până la/i), { target: { value: "2099-12-31" } });
    expect(screen.getByText(/Patentă valabilă până la 31\.12\.2099/)).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("patentă bifată fără termen → cere termenul, nu tace", async () => {
    await openManualPayee();
    fireEvent.click(screen.getByLabelText(/baza patentei de întreprinzător/i));
    expect(screen.getByText(/fără termen de valabilitate/i)).toBeInTheDocument();
  });

  it("[blocant] datele patentei chiar PLEACĂ la server, nu doar se afișează", async () => {
    await openManualPayee();
    fireEvent.change(screen.getByLabelText(/Nume, Prenume/i), { target: { value: "Roitman Daria" } });
    fireEvent.click(screen.getByLabelText(/baza patentei de întreprinzător/i));
    fireEvent.change(screen.getByLabelText(/Seria și nr\. patentei/i), { target: { value: "AA 0123456" } });
    fireEvent.change(screen.getByLabelText(/Valabilă până la/i), { target: { value: "2099-12-31" } });

    fireEvent.click(screen.getByRole("button", { name: /salvează ciornă/i }));
    await waitFor(() => expect(parApi.updatePar).toHaveBeenCalled());
    // Formularul face mai multe apeluri `updatePar` la salvare (antet, apoi alte secțiuni);
    // ne interesează că datele patentei ajung în UNUL dintre ele, nu în care anume.
    const payloads = vi.mocked(parApi.updatePar).mock.calls.map((c) => c[1]);
    expect(payloads).toContainEqual(
      expect.objectContaining({
        payee_is_patent_holder: true,
        payee_patent_series: "AA 0123456",
        payee_patent_valid_until: "2099-12-31",
      }),
    );
  });

  it("[blocant] alegerea unui beneficiar salvat aduce patenta LUI și avertizează dacă a expirat", async () => {
    vi.restoreAllMocks();
    mockApis([EXPIRED_VENDOR]);
    render(<ParCreateForm />);
    await screen.findByRole("button", { name: /adaugă articol/i });
    fireEvent.click(screen.getByRole("button", { name: /persoană fizică/i }));
    fireEvent.click(screen.getByRole("button", { name: /beneficiar salvat/i }));

    const select = await screen.findByRole("combobox", { name: /^Beneficiar salvat$/i });
    fireEvent.change(select, { target: { value: "v-exp" } });

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toMatch(/EXPIRAT/);
    expect(alert.textContent).toContain("31.01.2020");
    expect((screen.getByLabelText(/Seria și nr\. patentei/i) as HTMLInputElement).value).toBe("AA 0123456");
  });
});
