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
import { ApiError } from "@/lib/api";
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
    expect(screen.getByText(/Termenul patentei: valabilă până la 31\.12\.2099/)).toBeInTheDocument();
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
    fireEvent.click(screen.getByRole("button", { name: /beneficiari salvați/i }));

    // Lista se filtrează live și se alege direct din ea — nu mai există dropdown de deschis.
    fireEvent.click(await screen.findByRole("option", { name: /Roitman Daria/i }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toMatch(/EXPIRAT/);
    expect(alert.textContent).toContain("31.01.2020");
    expect((screen.getByLabelText(/Seria și nr\. patentei/i) as HTMLInputElement).value).toBe("AA 0123456");
  });
});

/**
 * Owner, 23.09.2026: „La atașarea patentei trebuie bifă sau confirmare că s-a încărcat — acum pui,
 * dar nu e clar dacă s-a pus sau nu." Testăm ACȚIUNEA: fișierul ales pleacă la server, bifa apare
 * DOAR după confirmare, iar „Deschide" deschide exact copia salvată.
 */
describe("ParCreateForm — copia patentei (bifă de încărcare)", () => {
  const PATENT_FILE = new File(["%PDF-1.7 patenta"], "patenta Boghean.pdf", { type: "application/pdf" });

  beforeEach(() => {
    vi.restoreAllMocks();
    navigate.mockReset();
    mockApis();
    vi.spyOn(parApi, "readPayeeDocument").mockResolvedValue({
      kind: "patenta", name: null, idnp: null, address: null, iban: null, bank: null, bic: null,
      patentSeries: "AP 2022613060671", patentValidUntil: "2099-01-01", payeeType: "fizic",
      filled: ["patentSeries", "patentValidUntil"], isStub: false,
    });
  });

  async function pickPatentFile() {
    await openManualPayee();
    fireEvent.click(screen.getByLabelText(/baza patentei de întreprinzător/i));
    expect(screen.getByText(/Nicio copie a patentei încărcată/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Încarcă patenta/i }));
    fireEvent.change(screen.getByLabelText(/Alege actul beneficiarului/i), { target: { files: [PATENT_FILE] } });
  }

  it("[blocant] bifa apare abia după ce serverul confirmă, cu numele fișierului, și se deschide", async () => {
    let confirm!: (v: parApi.ParPatentFileInfo) => void;
    const upload = vi.spyOn(parApi, "uploadPayeePatent").mockImplementation(
      () => new Promise((resolve) => { confirm = resolve; }),
    );
    const open = vi.spyOn(window, "open").mockReturnValue(null);

    await pickPatentFile();
    // Cât urcă: rând de progres, NU bifă — un „încărcat" afișat înainte ar minți.
    expect(await screen.findByText(/Se încarcă patenta|Pregătesc încărcarea|Verific fișierul/i)).toBeInTheDocument();
    expect(screen.queryByText("Patenta e încărcată")).not.toBeInTheDocument();
    await waitFor(() => expect(upload).toHaveBeenCalled());
    expect(upload.mock.calls[0][0]).toBe("par-1");
    expect(upload.mock.calls[0][1]).toBe(PATENT_FILE);

    confirm({
      payeePatentFileName: "patenta Boghean.pdf",
      payeePatentFileMime: "application/pdf",
      payeePatentFileSize: 245_000,
      payeePatentFileUploadedAt: "2026-09-23T10:00:00.000Z",
    });
    expect(await screen.findByText("Patenta e încărcată")).toBeInTheDocument();
    expect(screen.getByText(/patenta Boghean\.pdf · 239 KB · încărcată pe 23\.09\.2026/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Înlocuiește patenta/i })).toBeInTheDocument();
    // Seria și termenul citite din act ajung în câmpuri, iar mesajul stă lângă ele.
    await waitFor(() =>
      expect((screen.getByLabelText(/Seria și nr\. patentei/i) as HTMLInputElement).value).toBe("AP 2022613060671"),
    );

    fireEvent.click(screen.getByRole("button", { name: /Deschide patenta/i }));
    expect(open).toHaveBeenCalledWith("/api/par/par-1/payee-patent", "_blank", "noopener,noreferrer");
  });

  it("[blocant] dacă salvarea pică, NU apare bifa — apare motivul și „Reîncearcă” urcă același fișier", async () => {
    const upload = vi.spyOn(parApi, "uploadPayeePatent")
      .mockRejectedValueOnce(new ApiError(0, "network_error", "Conexiunea nu a putut fi făcută — cererea nu a ajuns la server."))
      .mockResolvedValueOnce({
        payeePatentFileName: "patenta Boghean.pdf", payeePatentFileMime: "application/pdf",
        payeePatentFileSize: 1000, payeePatentFileUploadedAt: "2026-09-23T10:00:00.000Z",
      });
    await pickPatentFile();
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toMatch(/Copia patentei NU s-a salvat/);
    expect(alert.textContent).toMatch(/Conexiunea nu a putut fi făcută/);
    expect(screen.queryByText("Patenta e încărcată")).not.toBeInTheDocument();
    // Nicio altă stare verde care să contrazică roșul: termenul e scris ca TERMEN.
    expect(screen.queryByText(/^Patentă valabilă/)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Reîncearcă/i }));
    expect(await screen.findByText("Patenta e încărcată")).toBeInTheDocument();
    expect(upload).toHaveBeenCalledTimes(2);
    expect(upload.mock.calls[1][1]).toBe(PATENT_FILE);
    expect(screen.queryByText(/Copia patentei NU s-a salvat/)).not.toBeInTheDocument();
  });

  /**
   * Incidentul din 23.09.2026 (prod, PAR din workspace-ul owner-ului): la alegerea patentei,
   * crearea ciornei a primit 400 pentru ANTET, iar patenta a ieșit „NU s-a salvat" — fără nicio
   * legătură cu fișierul. Un antet refuzat nu mai blochează fișierul: ciorna se face cu antetul
   * minim, patenta urcă, iar antetul se corectează la salvare.
   */
  it("[blocant] un antet refuzat (400) nu mai blochează salvarea patentei", async () => {
    const createPar = vi.mocked(parApi.createPar);
    createPar.mockReset();
    createPar
      .mockRejectedValueOnce(new ApiError(400, "payer_not_found"))
      .mockResolvedValueOnce({ ...draftPar(), id: "par-min" } as ParRequest);
    const upload = vi.spyOn(parApi, "uploadPayeePatent").mockResolvedValue({
      payeePatentFileName: "patenta.pdf", payeePatentFileMime: "application/pdf",
      payeePatentFileSize: 1000, payeePatentFileUploadedAt: "2026-09-23T10:00:00.000Z",
    });

    await pickPatentFile();
    expect(await screen.findByText("Patenta e încărcată")).toBeInTheDocument();
    expect(createPar).toHaveBeenCalledTimes(2);
    // A doua încercare poartă doar antetul minim — nimic din ce a refuzat serverul.
    expect(Object.keys(createPar.mock.calls[1][0]).sort()).toEqual(["charge_to", "purpose"]);
    expect(upload.mock.calls[0][0]).toBe("par-min");
  });

  it("dacă nici ciorna minimă nu se poate crea, motivul e spus omenește, nu ca un cod", async () => {
    const createPar = vi.mocked(parApi.createPar);
    createPar.mockReset();
    createPar.mockRejectedValue(new ApiError(400, "payer_not_found"));
    const upload = vi.spyOn(parApi, "uploadPayeePatent");

    await pickPatentFile();
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toMatch(/Plătitorul ales nu mai e activ/);
    expect(alert.textContent).not.toMatch(/payer_not_found/);
    expect(upload).not.toHaveBeenCalled();
  });

  it("un Word nu se păstrează ca patentă — spune asta, nu tace", async () => {
    const upload = vi.spyOn(parApi, "uploadPayeePatent");
    await openManualPayee();
    fireEvent.click(screen.getByLabelText(/baza patentei de întreprinzător/i));
    fireEvent.click(screen.getByRole("button", { name: /Încarcă patenta/i }));
    const docx = new File(["PK"], "patenta.docx", {
      type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    });
    fireEvent.change(screen.getByLabelText(/Alege actul beneficiarului/i), { target: { files: [docx] } });
    expect((await screen.findByRole("alert")).textContent).toMatch(/doar ca PDF sau imagine/);
    expect(upload).not.toHaveBeenCalled();
  });

  it("[blocant] beneficiarul salvat vine cu patenta lui: se vede, se deschide din registru, se preia la salvare", async () => {
    vi.restoreAllMocks();
    mockApis([{
      id: "v-pat", name: "Boghean Natalia", idnp: "2005036037383", iban: "MD49MO2259ASV55555555555",
      bank: null, active: true, isPatentHolder: true, patentSeries: "AP 2022613060671",
      patentValidUntil: "2099-01-01", patentFileName: "patenta Natalia.pdf", patentFileSize: 120_000,
      patentFileUploadedAt: "2026-09-01T09:00:00.000Z",
    }]);
    const open = vi.spyOn(window, "open").mockReturnValue(null);
    render(<ParCreateForm />);
    await screen.findByRole("button", { name: /adaugă articol/i });
    fireEvent.click(screen.getByRole("button", { name: /persoană fizică/i }));
    fireEvent.click(screen.getByRole("button", { name: /beneficiari salvați/i }));

    const option = await screen.findByRole("option", { name: /Boghean Natalia/i });
    expect(option.textContent).toMatch(/patentă salvată/);
    fireEvent.click(option);

    expect(await screen.findByText("Patenta e salvată la beneficiar")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Deschide patenta/i }));
    expect(open).toHaveBeenCalledWith("/api/par/vendors/v-pat/patent", "_blank", "noopener,noreferrer");

    fireEvent.click(screen.getByRole("button", { name: /salvează ciornă/i }));
    await waitFor(() => expect(parApi.updatePar).toHaveBeenCalled());
    const payloads = vi.mocked(parApi.updatePar).mock.calls.map((c) => c[1]);
    expect(payloads).toContainEqual(expect.objectContaining({ payee_patent_file: { from_vendor: "v-pat" } }));
  });

  it("„Scoate copia patentei” lasă cererea fără copie la salvare", async () => {
    vi.spyOn(parApi, "uploadPayeePatent").mockResolvedValue({
      payeePatentFileName: "patenta.pdf", payeePatentFileMime: "application/pdf",
      payeePatentFileSize: 1000, payeePatentFileUploadedAt: "2026-09-23T10:00:00.000Z",
    });
    await pickPatentFile();
    await screen.findByText("Patenta e încărcată");

    fireEvent.click(screen.getByRole("button", { name: /Scoate copia patentei/i }));
    expect(screen.queryByText("Patenta e încărcată")).not.toBeInTheDocument();
    vi.mocked(parApi.updatePar).mockClear();
    fireEvent.click(screen.getByRole("button", { name: /salvează ciornă/i }));
    await waitFor(() => expect(parApi.updatePar).toHaveBeenCalled());
    const payloads = vi.mocked(parApi.updatePar).mock.calls.map((c) => c[1]);
    expect(payloads).toContainEqual(expect.objectContaining({ payee_patent_file: "none" }));
  });
});
