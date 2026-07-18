/**
 * VM3-03: formularul de creare — feedback Violeta 2026-07-16
 *   1. [blocant] "Data necesară" pre-completată automat = data cererii + 10 zile;
 *      se recalculează la schimbarea datei cererii; editarea manuală oprește sincronizarea.
 *   2. UM are sugestii (datalist) cu "bucăți" / "servicii" — rămâne text liber.
 *   3. Proiect fără evenimente → câmpul Eveniment NU dispare mut, apare hint.
 *
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { ParCreateForm } from "../ParCreateForm";
import { plusDays } from "@/lib/par/dates";
import * as parApi from "@/lib/api/par";
import type { ParRequest } from "@/lib/api/par";

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock("@/router/HashRouter", () => ({
  useRouter: () => ({ path: "/business/par/new", navigate: vi.fn() }),
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
    id: "par-draft-1",
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
    endUse: null,
    vendorId: null,
    payeeName: null,
    payeeIdnp: null,
    payeeIban: null,
    payeeBank: null,
    attachmentsPresent: false,
    attachmentsNote: null,
    currency: "MDL",
    totalEstimatedCents: 0,
    status: "draft",
    submittedAt: null,
    approvedAt: null,
    paidAt: null,
    cancelledAt: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  } as ParRequest;
}

function mockConfigApis(opts: { projects?: { id: string; name: string; active: boolean }[]; events?: { id: string; projectId: string | null; name: string; active: boolean }[] } = {}) {
  vi.spyOn(parApi, "listDepartments").mockResolvedValue({ items: [] });
  vi.spyOn(parApi, "listProjects").mockResolvedValue({
    items: (opts.projects ?? []) as never,
  });
  vi.spyOn(parApi, "listEvents").mockResolvedValue({
    events: (opts.events ?? []) as never,
  });
  vi.spyOn(parApi, "listBudgetCodes").mockResolvedValue({ items: [] });
  vi.spyOn(parApi, "listVendors").mockResolvedValue({ items: [] });
  vi.spyOn(parApi, "listParTemplates").mockResolvedValue({ templates: [] });
  vi.spyOn(parApi, "createPar").mockResolvedValue(draftPar());
  vi.spyOn(parApi, "updatePar").mockResolvedValue(draftPar());
}

const iso = (d: Date) => d.toISOString().slice(0, 10);

// ─── plusDays unit ────────────────────────────────────────────────────────────

describe("VM3-03 plusDays", () => {
  it("[blocant] adaugă 10 zile corect, inclusiv peste sfârșit de lună/an", () => {
    expect(plusDays("2026-07-16", 10)).toBe("2026-07-26");
    expect(plusDays("2026-07-25", 10)).toBe("2026-08-04");
    expect(plusDays("2026-12-28", 10)).toBe("2027-01-07");
    // 2028 e an bisect
    expect(plusDays("2028-02-24", 10)).toBe("2028-03-05");
  });

  it("input invalid → rămâne neschimbat (nu aruncă)", () => {
    expect(plusDays("", 10)).toBe("");
    expect(plusDays("nu-e-data", 10)).toBe("nu-e-data");
  });
});

// ─── Component behaviour ──────────────────────────────────────────────────────

describe("ParCreateForm — VM3-03 (feedback Violeta)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("nu creează ciornă la deschidere; Salvează ciornă o persistă explicit", async () => {
    mockConfigApis();
    render(<ParCreateForm />);
    await screen.findByLabelText(/data estimativă de plată/i);
    expect(parApi.createPar).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: /salvează ciornă/i }));
    await waitFor(() => expect(parApi.createPar).toHaveBeenCalledTimes(1));
    await screen.findByText(/a fost salvată în Cererile mele/i);
  });

  it("[blocant] data necesară e pre-completată cu data cererii + 10 zile", async () => {
    mockConfigApis();
    render(<ParCreateForm />);

    const dn = (await screen.findByLabelText(/data necesară/i)) as HTMLInputElement;
    const expected = plusDays(iso(new Date()), 10);
    expect(dn.value).toBe(expected);
  });

  it("[blocant] schimbarea datei cererii recalculează +10; editarea manuală oprește sincronizarea", async () => {
    mockConfigApis();
    render(<ParCreateForm />);

    const dor = (await screen.findByLabelText(/data cererii/i)) as HTMLInputElement;
    const dn = (await screen.findByLabelText(/data necesară/i)) as HTMLInputElement;

    // 1. schimb data cererii → data necesară urmează (+10)
    fireEvent.change(dor, { target: { value: "2026-07-01" } });
    await waitFor(() => expect(dn.value).toBe("2026-07-11"));

    // 2. editez manual data necesară
    fireEvent.change(dn, { target: { value: "2026-07-20" } });
    expect(dn.value).toBe("2026-07-20");

    // 3. schimb iar data cererii → data necesară NU se mai suprascrie
    fireEvent.change(dor, { target: { value: "2026-07-05" } });
    await waitFor(() => expect(dor.value).toBe("2026-07-05"));
    expect(dn.value).toBe("2026-07-20");
  });

  it("UM are datalist cu sugestii, inclusiv 'bucăți' și 'servicii'", async () => {
    mockConfigApis();
    const { container } = render(<ParCreateForm />);

    await screen.findByLabelText(/data necesară/i);
    const dl = container.querySelector("datalist#um-suggestions");
    expect(dl).not.toBeNull();
    const values = Array.from(dl!.querySelectorAll("option")).map((o) => o.getAttribute("value"));
    expect(values).toContain("bucăți");
    expect(values).toContain("servicii");
    // input-ul rămâne text liber, legat de datalist
    const um = screen.getByLabelText("UM") as HTMLInputElement;
    expect(um.getAttribute("list")).toBe("um-suggestions");
  });

  it("[blocant] proiect selectat FĂRĂ evenimente → hint vizibil în loc să dispară câmpul", async () => {
    mockConfigApis({
      projects: [{ id: "p-1", name: "Digital Safeguard", active: true }],
      events: [], // niciun eveniment
    });
    render(<ParCreateForm />);

    const proj = (await screen.findByLabelText(/proiect/i)) as HTMLSelectElement;
    await waitFor(() =>
      expect(screen.getByRole("option", { name: "Digital Safeguard" })).toBeInTheDocument()
    );
    fireEvent.change(proj, { target: { value: "p-1" } });

    await waitFor(() => {
      expect(screen.getByText(/niciun eveniment pentru acest proiect/i)).toBeInTheDocument();
    });
    // non-admin → text informativ, nu link spre admin
    expect(screen.queryByRole("link", { name: /adaugă în admin/i })).not.toBeInTheDocument();
    expect(screen.getByText(/project managerul le adaugă/i)).toBeInTheDocument();
  });

  it("arată evenimente numai după selectarea proiectului și păstrează scope-ul proiectului", async () => {
    mockConfigApis({
      projects: [
        { id: "p-1", name: "Digital Safeguard", active: true },
        { id: "p-2", name: "Alt proiect", active: true },
      ],
      events: [
        { id: "e-1", projectId: "p-1", name: "Conferința anuală", active: true },
        { id: "e-2", projectId: "p-2", name: "Eveniment străin", active: true },
      ],
    });
    render(<ParCreateForm />);

    const proj = (await screen.findByLabelText(/proiect/i)) as HTMLSelectElement;
    await waitFor(() =>
      expect(screen.getByRole("option", { name: "Digital Safeguard" })).toBeInTheDocument()
    );
    // Nu alegem din greșeală un eveniment al altui proiect înainte de a selecta proiectul.
    expect(screen.queryByLabelText("Eveniment")).not.toBeInTheDocument();

    fireEvent.change(proj, { target: { value: "p-1" } });

    await waitFor(() => {
      expect(screen.getByLabelText("Eveniment")).toBeInTheDocument();
    });
    expect(screen.getByRole("option", { name: "Conferința anuală" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "Eveniment străin" })).not.toBeInTheDocument();
    expect(screen.queryByText(/niciun eveniment pentru acest proiect/i)).not.toBeInTheDocument();
  });
});
